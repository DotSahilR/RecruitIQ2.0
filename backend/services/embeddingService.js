const pool = require("../db");

let pipeline = null;
let modelLoaded = false;
const EMBED_BATCH_SIZE = 32;

function buildCandidateText(candidate) {
  const profile = candidate.profile || {};
  const skills = (candidate.skills || []).map(s => s.name).join(", ");
  const careerDesc = (candidate.career_history || [])
    .map(h => `${h.title} at ${h.company}: ${h.description || ""}`)
    .join(" ");
  return `${profile.headline || ""} ${profile.summary || ""} ${skills} ${careerDesc}`.trim();
}

async function getPipeline() {
  if (pipeline) return pipeline;
  try {
    const { pipeline: p } = await import("@xenova/transformers");
    console.log("Loading embedding model (all-MiniLM-L6-v2)...");
    pipeline = await p("feature-extraction", "Xenova/all-MiniLM-L6-v2");
    modelLoaded = true;
    console.log("Embedding model loaded.");
    return pipeline;
  } catch (err) {
    console.error("Failed to load embedding model:", err.message);
    return null;
  }
}

async function generateEmbedding(text) {
  const pipe = await getPipeline();
  if (!pipe) return null;
  try {
    const result = await pipe(text, { pooling: "mean", normalize: true });
    return Array.from(result.data);
  } catch (err) {
    console.error("Embedding generation error:", err.message);
    return null;
  }
}

async function generateEmbeddingsBatch(texts) {
  const pipe = await getPipeline();
  if (!pipe || texts.length === 0) return texts.map(() => null);
  try {
    const result = await pipe(texts, { pooling: "mean", normalize: true });
    const data = result.data;
    const dim = result.dims[result.dims.length - 1];
    const embeddings = [];
    for (let i = 0; i < texts.length; i++) {
      embeddings.push(Array.from(data.slice(i * dim, (i + 1) * dim)));
    }
    return embeddings;
  } catch (err) {
    console.error("Batch embedding error:", err.message);
    return texts.map(() => null);
  }
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

async function generateAllEmbeddings() {
  const pipe = await getPipeline();
  if (!pipe) {
    console.warn("Embedding model unavailable. Skipping embedding generation.");
    return;
  }

  const check = await pool.query(
    "SELECT COUNT(*) as count FROM candidates WHERE embedding IS NULL"
  );

  if (parseInt(check.rows[0].count) === 0) {
    console.log("All candidates already have embeddings.");
    return;
  }

  console.log("Generating embeddings for all candidates...");
  let total = 0;

  while (true) {
    const batch = await pool.query(
      "SELECT id, candidate_id, profile, skills, career_history FROM candidates WHERE embedding IS NULL ORDER BY id LIMIT $1",
      [EMBED_BATCH_SIZE]
    );

    if (batch.rows.length === 0) break;

    const texts = batch.rows.map(r => buildCandidateText(r));
    const ids = batch.rows.map(r => r.id);
    const embeddings = await generateEmbeddingsBatch(texts);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (let i = 0; i < ids.length; i++) {
        if (embeddings[i]) {
          await client.query(
            "UPDATE candidates SET embedding = $1, embedding_model = $2 WHERE id = $3",
            [embeddings[i], "all-MiniLM-L6-v2", ids[i]]
          );
          total++;
        }
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("Batch update error:", err.message);
    } finally {
      client.release();
    }

    process.stdout.write(`\rEmbedded ${total} candidates...`);
  }

  process.stdout.write("\n");
  console.log(`Generated embeddings for ${total} candidates.`);
}

async function generateJdEmbedding(jdText) {
  return await generateEmbedding(jdText);
}

module.exports = {
  generateEmbedding,
  generateAllEmbeddings,
  generateJdEmbedding,
  cosineSimilarity,
  buildCandidateText,
  getPipeline
};
