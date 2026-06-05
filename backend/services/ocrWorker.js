const pool = require("../db");
const ocrService = require("./ocrService");
const parserService = require("./parserService");
const aiExtractionService = require("./aiExtractionService");
const embeddingService = require("./embeddingService");

const POLL_INTERVAL_MS = 5000;
const MAX_ATTEMPTS = 3;

let running = false;
let timer = null;

/**
 * Atomically claim the next queued OCR job.
 * `FOR UPDATE SKIP LOCKED` makes this safe even if multiple workers run
 * (single-process today, but future-proof for horizontal scaling).
 */
async function claimNextJob() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`
      SELECT id, candidate_id, file_path, attempts
      FROM ocr_jobs
      WHERE status = 'queued' AND attempts < $1
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `, [MAX_ATTEMPTS]);

    if (rows.length === 0) {
      await client.query("COMMIT");
      return null;
    }

    const job = rows[0];
    await client.query(
      `UPDATE ocr_jobs
         SET status = 'running', started_at = NOW(), attempts = attempts + 1
       WHERE id = $1`,
      [job.id]
    );
    await client.query("COMMIT");
    return job;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Apply OCR output to the candidate row + candidate_profiles.
 * Re-parses metadata so skills/experience get filled in from OCR'd text.
 */
async function persistOcrResult(candidateId, ocrText) {
  const cleanText = parserService.sanitizeText(ocrText);
  console.log(`[ocr] persistOcrResult start candidate=${candidateId} text_len=${cleanText.length}`);

  // We need the original filename to re-run parseResumeText. Fetch from resume_path.
  const { rows: candRows } = await pool.query(
    "SELECT id, user_id, resume_path FROM candidates WHERE id = $1",
    [candidateId]
  );
  if (candRows.length === 0) {
    throw new Error(`Candidate ${candidateId} disappeared mid-OCR`);
  }
  const cand = candRows[0];
  const fileName = cand.resume_path ? cand.resume_path.split(/[\\/]/).pop() : `candidate-${candidateId}.pdf`;

  const parsed = parserService.parseResumeText(cleanText, fileName);

  // Update candidate row with freshly extracted fields. We do NOT touch
  // session_id / score / rank — those belong to the analyze flow.
  await pool.query(
    `UPDATE candidates
       SET name = COALESCE(NULLIF($1, ''), name),
           email = COALESCE(NULLIF($2, ''), email),
           experience = COALESCE($3, experience),
           role = COALESCE(NULLIF($4, ''), role),
           location = COALESCE(NULLIF($5, ''), location),
           summary = $6,
           raw_text = $7
     WHERE id = $8`,
    [
      parsed.name,
      parsed.email,
      parsed.experience,
      parsed.role,
      parsed.location,
      parsed.summary,
      cleanText,
      candidateId,
    ]
  );

  // Refresh skills (delete + reinsert) so OCR-discovered skills replace placeholders.
  await pool.query("DELETE FROM skills WHERE candidate_id = $1", [candidateId]);
  for (const skill of parsed.skills) {
    await pool.query(
      "INSERT INTO skills (candidate_id, skill_name) VALUES ($1, $2)",
      [candidateId, skill]
    );
  }
  if (parsed.skills.length > 0) {
    console.log(`[ocr]   candidate=${candidateId} re-inserted ${parsed.skills.length} skills`);
  }

  // Mark the profile row as OCR-sourced.
  await pool.query(
    `UPDATE candidate_profiles
        SET extraction_method = 'ocr',
            location = COALESCE(NULLIF($1, ''), location),
            "current_role" = COALESCE(NULLIF($2, ''), "current_role"),
            summary = $3
      WHERE candidate_id = $4`,
    [parsed.location, parsed.role, parsed.summary, candidateId]
  );
  console.log(`[ocr] persistOcrResult done candidate=${candidateId}`);
}

/**
 * Process a single OCR job from end to end.
 */
async function processJob(job) {
  try {
    console.log(`[ocr] running job #${job.id} candidate=${job.candidate_id} (attempt ${job.attempts + 1}/${MAX_ATTEMPTS})`);
    const text = await ocrService.runOcrOnPdf(job.file_path);

    if (!text || text.length < 20) {
      throw new Error("OCR produced no usable text (file may be blank or unreadable)");
    }

    await persistOcrResult(job.candidate_id, text);

    await pool.query(
      "UPDATE ocr_jobs SET status = 'done', completed_at = NOW(), error = NULL WHERE id = $1",
      [job.id]
    );
    console.log(`[ocr] ✓ job #${job.id} complete (${text.length} chars extracted)`);

    // After OCR, fire AI enhancement (Phase 3). Same fire-and-forget pattern as
    // the upload controller — failure is logged but does not undo the OCR result.
    const cleanText = parserService.sanitizeText(text);
    const { rows: candRows } = await pool.query(
      "SELECT resume_path FROM candidates WHERE id = $1",
      [job.candidate_id]
    );
    const fileName = candRows[0]?.resume_path
      ? candRows[0].resume_path.split(/[\\/]/).pop()
      : `candidate-${job.candidate_id}.pdf`;
    const regexParsed = parserService.parseResumeText(cleanText, fileName);

    aiExtractionService
      .enhanceCandidate(job.candidate_id, cleanText, regexParsed)
      .then((aiOut) => {
        if (aiOut.enhanced) {
          console.log(`[ai-extract] ✓ post-OCR enhancement done for candidate ${job.candidate_id}`);
        } else if (aiOut.error && aiOut.error !== "ai-not-configured") {
          console.log(`[ai-extract] post-OCR skipped candidate ${job.candidate_id}: ${aiOut.error}`);
        }

        // Embedding runs after AI (or independently if AI is unavailable).
        const embedInput = embeddingService.buildEmbeddingText(regexParsed, cleanText);
        return embeddingService.embedCandidate(job.candidate_id, embedInput);
      })
      .then((embOut) => {
        if (embOut.embedded) {
          console.log(`[embed] ✓ post-OCR embedding done for candidate ${job.candidate_id}`);
        } else if (embOut.error && embOut.error !== "embed-not-configured") {
          console.log(`[embed] post-OCR skipped candidate ${job.candidate_id}: ${embOut.error}`);
        }
      })
      .catch((err) => {
        console.error(`[post-ocr] background error for candidate ${job.candidate_id}:`, err.message);
      });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error(`[ocr] ✗ job #${job.id} failed: ${message}`);

    // If we've blown the retry budget, mark failed; otherwise return to queue.
    const shouldRetry = job.attempts + 1 < MAX_ATTEMPTS;
    await pool.query(
      `UPDATE ocr_jobs
         SET status = $1, error = $2, completed_at = CASE WHEN $1 = 'failed' THEN NOW() ELSE completed_at END
       WHERE id = $3`,
      [shouldRetry ? "queued" : "failed", message, job.id]
    );
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    // Drain — keep grabbing jobs until the queue is empty, then sleep.
    let job;
    let drained = 0;
    while ((job = await claimNextJob())) {
      await processJob(job);
      drained++;
    }
    if (drained > 0) {
      console.log(`[ocr] tick drained=${drained} job(s)`);
    }
  } catch (err) {
    console.error("[ocr] worker tick error:", err.message || err);
  } finally {
    running = false;
  }
}

function start() {
  if (timer) return;
  console.log(`[ocr] worker started (poll interval ${POLL_INTERVAL_MS}ms, max attempts ${MAX_ATTEMPTS})`);
  // First tick immediately so jobs queued during a restart get picked up fast.
  tick().catch(() => {});
  timer = setInterval(() => {
    tick().catch(() => {});
  }, POLL_INTERVAL_MS);
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  return ocrService.shutdownOcr();
}

module.exports = { start, stop, tick };
