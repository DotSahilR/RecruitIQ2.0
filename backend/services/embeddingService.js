/**
 * Embedding Service (Phase 4).
 *
 * Bridges between the AI provider (Voyage today) and the pgvector-backed
 * `embeddings` table. Also exposes similarity helpers used by the v2 scorer.
 *
 * Public surface:
 *   - embedCandidate(candidateId, text)        — generate + persist
 *   - embedJobDescription(jobId, text)        — generate + persist
 *   - getCandidateEmbedding(candidateId)       — fetch (or null)
 *   - getJobEmbedding(jobId)                   — fetch (or null)
 *   - cosineSimilarity(a, b)                   — raw [-1, 1]
 *   - semanticScore(candidateId, jobId)        — 0-100 (or null)
 *
 * Every method is safe to call — failures are logged and return null/false
 * rather than throwing, so callers (background workers, controllers) don't
 * need try/catch around embedding calls.
 */

const pool = require("../db");
const aiProvider = require("./aiProvider");

const EMBED_MODEL = process.env.VOYAGE_MODEL || "voyage-3-lite";
const VECTOR_DIM = parseInt(process.env.EMBED_DIM || "512", 10);

function formatVector(vec) {
  if (!Array.isArray(vec) || vec.length === 0) return null;
  return "[" + vec.map((n) => Number(n).toFixed(6)).join(",") + "]";
}

function parseVector(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const trimmed = value.replace(/^\s*\[/, "").replace(/\]\s*$/, "");
    if (!trimmed) return null;
    const parts = trimmed.split(",").map((n) => Number(n));
    if (parts.some((n) => Number.isNaN(n))) return null;
    return parts;
  }
  return null;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) {
    return null;
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

function rawTextToEmbeddingInput(text) {
  if (!text) return null;
  const trimmed = String(text).trim();
  if (trimmed.length < 20) return null;
  return trimmed.slice(0, 20000);
}

/**
 * Build a richer embedding input from structured parsed data + raw text.
 * Structured fields are prepended so the embedder sees the headline role/skills
 * first, then the full resume body. Callers can pass parsed=null to embed
 * raw text only.
 */
function buildEmbeddingText(parsed, rawText) {
  const parts = [];
  if (parsed && typeof parsed === "object") {
    if (parsed.role) parts.push(String(parsed.role));
    if (parsed.summary) parts.push(String(parsed.summary));
    if (Array.isArray(parsed.skills) && parsed.skills.length) {
      parts.push("Skills: " + parsed.skills.join(", "));
    }
    if (parsed.experience) {
      parts.push(`${parsed.experience} years of experience`);
    }
    if (parsed.location) parts.push("Location: " + String(parsed.location));
    if (parsed.name) parts.push("Name: " + String(parsed.name));
  }
  const cleanRaw = rawText ? String(rawText).trim() : "";
  if (cleanRaw.length > 100) parts.push(cleanRaw.slice(0, 18000));
  return parts.join("\n").trim();
}

async function storeEmbedding({ candidateId, jobId, kind, vector, model }) {
  const formatted = formatVector(vector);
  if (!formatted) return false;
  if (kind === "resume" && candidateId == null) return false;
  if (kind === "jd" && jobId == null) return false;

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO embeddings (candidate_id, job_id, kind, vector, model)
       VALUES ($1, $2, $3, $4::vector, $5)
       ON CONFLICT DO NOTHING`,
      [candidateId, jobId, kind, formatted, model]
    );
    // Partial unique indexes mean ON CONFLICT cannot name a target; for true
    // UPSERT we do an explicit UPDATE if the INSERT was a no-op.
    if (kind === "resume") {
      await client.query(
        `UPDATE embeddings
            SET vector = $1::vector, model = $2, created_at = NOW()
          WHERE candidate_id = $3 AND kind = $4 AND job_id IS NULL`,
        [formatted, model, candidateId, kind]
      );
    } else {
      await client.query(
        `UPDATE embeddings
            SET vector = $1::vector, model = $2, created_at = NOW()
          WHERE job_id = $3 AND kind = $4 AND candidate_id IS NULL`,
        [formatted, model, jobId, kind]
      );
    }
    return true;
  } finally {
    client.release();
  }
}

async function embedCandidate(candidateId, text) {
  if (!aiProvider.isEmbedAvailable()) {
    return { embedded: false, error: "embed-not-configured" };
  }
  const input = rawTextToEmbeddingInput(text);
  if (!input) return { embedded: false, error: "insufficient-text" };

  const t0 = Date.now();
  const vector = await aiProvider.generateEmbedding(input);
  if (!Array.isArray(vector)) {
    console.log(`[embed] candidate=${candidateId} -> skip (no vector from ${aiProvider.embedName})`);
    return { embedded: false, error: "embedder-returned-no-vector" };
  }
  if (vector.length !== VECTOR_DIM) {
    console.log(`[embed] candidate=${candidateId} -> skip (dim ${vector.length} != ${VECTOR_DIM})`);
    return { embedded: false, error: `dim-mismatch:${vector.length}!=${VECTOR_DIM}` };
  }

  try {
    await storeEmbedding({
      candidateId,
      jobId: null,
      kind: "resume",
      vector,
      model: EMBED_MODEL,
    });
    console.log(`[embed] candidate=${candidateId} -> stored (${VECTOR_DIM}-d via ${EMBED_MODEL}, ${Date.now() - t0}ms)`);
    return { embedded: true };
  } catch (err) {
    console.error(`[embed] failed to store candidate ${candidateId}:`, err.message);
    return { embedded: false, error: err.message };
  }
}

async function embedJobDescription(jobId, text) {
  if (!aiProvider.isEmbedAvailable()) {
    return { embedded: false, error: "embed-not-configured" };
  }
  const input = rawTextToEmbeddingInput(text);
  if (!input) return { embedded: false, error: "insufficient-text" };

  const t0 = Date.now();
  const vector = await aiProvider.generateEmbedding(input);
  if (!Array.isArray(vector)) {
    console.log(`[embed] job=${jobId} -> skip (no vector from ${aiProvider.embedName})`);
    return { embedded: false, error: "embedder-returned-no-vector" };
  }
  if (vector.length !== VECTOR_DIM) {
    console.log(`[embed] job=${jobId} -> skip (dim ${vector.length} != ${VECTOR_DIM})`);
    return { embedded: false, error: `dim-mismatch:${vector.length}!=${VECTOR_DIM}` };
  }

  try {
    await storeEmbedding({
      candidateId: null,
      jobId,
      kind: "jd",
      vector,
      model: EMBED_MODEL,
    });
    console.log(`[embed] job=${jobId} -> stored (${VECTOR_DIM}-d via ${EMBED_MODEL}, ${Date.now() - t0}ms)`);
    return { embedded: true };
  } catch (err) {
    console.error(`[embed] failed to store job ${jobId}:`, err.message);
    return { embedded: false, error: err.message };
  }
}

async function getCandidateEmbedding(candidateId) {
  const { rows } = await pool.query(
    `SELECT vector FROM embeddings
      WHERE candidate_id = $1 AND kind = 'resume' AND job_id IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [candidateId]
  );
  return rows[0] ? parseVector(rows[0].vector) : null;
}

async function getJobEmbedding(jobId) {
  const { rows } = await pool.query(
    `SELECT vector FROM embeddings
      WHERE job_id = $1 AND kind = 'jd' AND candidate_id IS NULL
      ORDER BY created_at DESC LIMIT 1`,
    [jobId]
  );
  return rows[0] ? parseVector(rows[0].vector) : null;
}

async function semanticScore(candidateId, jobId) {
  const [candVec, jobVec] = await Promise.all([
    getCandidateEmbedding(candidateId),
    getJobEmbedding(jobId),
  ]);
  if (!candVec || !jobVec) return null;
  const sim = cosineSimilarity(candVec, jobVec);
  if (sim == null) return null;
  // Map [-1, 1] → [0, 100]
  return Math.round(((sim + 1) / 2) * 100);
}

module.exports = {
  EMBED_MODEL,
  VECTOR_DIM,
  formatVector,
  parseVector,
  cosineSimilarity,
  buildEmbeddingText,
  embedCandidate,
  embedJobDescription,
  getCandidateEmbedding,
  getJobEmbedding,
  semanticScore,
};
