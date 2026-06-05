const pool = require("../db");
const parserService = require("../services/parserService");
const aiExtractionService = require("../services/aiExtractionService");
const embeddingService = require("../services/embeddingService");

/**
 * Handles resume uploads (single or multiple).
 * For text-extractable resumes, parses immediately. For scanned/image PDFs
 * (pdf-parse returns <50 chars), inserts the candidate with placeholder text
 * and queues an OCR job for the background worker.
 *
 * After the HTTP response is sent, AI extraction (Phase 3) runs in the
 * background to enrich candidates. Failures there are non-fatal — the
 * deterministic regex output already sits in the DB.
 */
async function uploadResumes(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "No files uploaded." });
    }
    console.log(`[resume] uploadResumes user=${req.user.id} files=${req.files.length}`);

    const savedCandidates = [];
    const enhancementQueue = []; // [{ id, rawText, regexParsed }] — processed post-response
    const failedFiles = [];

    for (const file of req.files) {
      try {
        const filePath = file.path;
        const originalName = file.originalname;

        // Extract raw text + detect whether OCR will be needed. If extraction
        // throws (corrupt file, unsupported sub-format, etc.) we still keep
        // the candidate so the user can view the original file as-uploaded.
        let rawText = "";
        let method = "unparseable";
        let needsOcr = false;
        try {
          const extracted = await parserService.extractText(filePath);
          rawText = extracted.text;
          method = extracted.method;
          needsOcr = method === "pdf-empty";
        } catch (parseErr) {
          console.warn(`[resume]   extractText failed for ${originalName}: ${parseErr.message} — keeping file on disk for inline viewing`);
        }

        // Parse what we can from the (possibly empty) text + filename fallbacks.
        const parsed = parserService.parseResumeText(needsOcr ? "" : rawText, originalName);
        const summaryText = needsOcr
          ? "OCR in progress — scanned PDF detected. Re-run analysis once extraction completes."
          : parsed.summary;

        // Insert candidate row.
        const insertQuery = `
          INSERT INTO candidates
          (user_id, name, email, experience, education, history, score, rank, resume_path, raw_text, role, location, summary, mime_type, original_name)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
          RETURNING id
        `;

        const result = await pool.query(insertQuery, [
          req.user.id,
          parsed.name,
          parsed.email,
          parsed.experience,
          JSON.stringify(parsed.education),
          JSON.stringify(parsed.history),
          0.0,
          0,
          filePath,
          needsOcr ? "" : rawText,
          parsed.role,
          parsed.location,
          summaryText,
          file.mimetype || null,
          originalName,
        ]);

        const candidateId = result.rows[0].id;
        console.log(`[resume]   saved candidate=${candidateId} name="${parsed.name}" email=${parsed.email || "-"} method=${method} ocr_pending=${needsOcr}`);

        // Insert skills (will be re-populated by OCR worker + AI extraction layer).
        if (!needsOcr) {
          for (const skill of parsed.skills) {
            await pool.query(
              "INSERT INTO skills (candidate_id, skill_name) VALUES ($1, $2)",
              [candidateId, skill]
            );
          }
          if (parsed.skills.length > 0) {
            console.log(`[resume]   inserted ${parsed.skills.length} skills for candidate=${candidateId}`);
          }
        }

        // Always create a candidate_profiles row tracking how we got the text.
        // extraction_method values: 'pdf' | 'docx' | 'txt' | 'doc' | 'pending-ocr' | 'ocr'
        await pool.query(
          `INSERT INTO candidate_profiles
             (candidate_id, location, "current_role", summary, extraction_method)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (candidate_id) DO UPDATE
             SET location = EXCLUDED.location,
                 "current_role" = EXCLUDED."current_role",
                 summary = EXCLUDED.summary,
                 extraction_method = EXCLUDED.extraction_method`,
          [
            candidateId,
            parsed.location || null,
            parsed.role || null,
            summaryText,
            needsOcr ? "pending-ocr" : method,
          ]
        );

        // Initialize the pipeline status row (Phase 8). New candidate → "Applied".
        await pool.query(
          `INSERT INTO candidate_status (candidate_id, status, updated_at)
             VALUES ($1, 'Applied', NOW())
           ON CONFLICT (candidate_id) DO UPDATE
             SET status = 'Applied', updated_at = NOW()`,
          [candidateId]
        );

        // Queue OCR for scanned PDFs. The OCR worker handles AI enhancement
        // itself after extracting text, so we only queue AI here for text-PDFs.
        if (needsOcr) {
          await pool.query(
            "INSERT INTO ocr_jobs (candidate_id, file_path) VALUES ($1, $2)",
            [candidateId, filePath]
          );
          console.log(`[resume]   queued OCR for candidate=${candidateId}`);
        } else if (method !== "unparseable" && rawText) {
          enhancementQueue.push({ id: candidateId, rawText, regexParsed: parsed });
        }

        savedCandidates.push({
          id: candidateId,
          ...parsed,
          summary: summaryText,
          extractionMethod: needsOcr ? "pending-ocr" : method,
          ocrPending: needsOcr,
        });

      } catch (fileErr) {
        console.error(`[resume]   failed file=${file.originalname}:`, fileErr.message);
        failedFiles.push(`${file.originalname}: ${fileErr.message}`);
      }
    }

    if (savedCandidates.length === 0) {
      console.log(`[resume] uploadResumes user=${req.user.id} -> 400 (all files failed)`);
      return res.status(400).json({
        error: "No candidates were created. The uploaded file text could not be parsed.",
        failedFiles,
      });
    }

    const pendingOcrIds = savedCandidates.filter((c) => c.ocrPending).map((c) => c.id);
    console.log(`[resume] uploadResumes user=${req.user.id} -> 201 saved=${savedCandidates.length} pendingOcr=${pendingOcrIds.length} failed=${failedFiles.length}`);

    res.status(201).json({
      message: `Successfully processed ${savedCandidates.length} resume(s).${
        pendingOcrIds.length ? ` ${pendingOcrIds.length} queued for OCR.` : ""
      }`,
      candidates: savedCandidates,
      pendingOcrIds,
      failedFiles,
    });

    // Fire-and-forget AI enhancement after responding. Runs serially to stay
    // within Groq free-tier rate limits. Failures are swallowed inside the
    // service — they never affect the upload result. After AI completes (or
    // is skipped), generate a semantic embedding for v2 scoring.
    if (enhancementQueue.length > 0) {
      setImmediate(async () => {
        for (const { id, rawText, regexParsed } of enhancementQueue) {
          try {
            const aiOut = await aiExtractionService.enhanceCandidate(id, rawText, regexParsed);
            if (aiOut.enhanced) {
              console.log(`[ai-extract] ✓ candidate ${id} enhanced`);
            } else if (aiOut.error && aiOut.error !== "ai-not-configured") {
              console.log(`[ai-extract] skipped candidate ${id}: ${aiOut.error}`);
            }

            // Embedding always runs (independent of AI extraction). It uses
            // the structured parse + raw text to build a richer input.
            const embedInput = embeddingService.buildEmbeddingText(regexParsed, rawText);
            const embOut = await embeddingService.embedCandidate(id, embedInput);
            if (embOut.embedded) {
              console.log(`[embed] ✓ candidate ${id} embedded (${embeddingService.VECTOR_DIM}-d)`);
            } else if (embOut.error && embOut.error !== "embed-not-configured") {
              console.log(`[embed] skipped candidate ${id}: ${embOut.error}`);
            }
          } catch (err) {
            console.error(`[post-upload] background error for candidate ${id}:`, err.message);
          }
        }
      });
    }

  } catch (err) {
    console.error("[resume] uploadResumes error:", err);
    return res.status(500).json({ error: "Server error processing resume uploads." });
  }
}

module.exports = {
  uploadResumes
};
