const fs = require("fs");
const path = require("path");
const readline = require("readline");
const pool = require("../db");

const BATCH_SIZE = 500;
const MAX_CANDIDATES = parseInt(process.env.MAX_CANDIDATES || "0");

function getDatasetPath() {
  const envPath = process.env.DATASET_PATH;
  if (envPath) return path.resolve(__dirname, "..", envPath);

  const jsonlPath = path.resolve(__dirname, "../../dataset/candidates.jsonl");
  const jsonPath = path.resolve(__dirname, "../../dataset/candidates.json");

  if (fs.existsSync(jsonlPath)) return jsonlPath;
  if (fs.existsSync(jsonPath)) return jsonPath;
  return null;
}

async function loadDataset() {
  const datasetPath = getDatasetPath();
  if (!datasetPath) {
    console.error("No dataset file found. Check dataset/ directory.");
    return 0;
  }

  console.log(`Loading dataset from: ${datasetPath}`);
  const isJsonl = datasetPath.endsWith(".jsonl");
  let totalLoaded = 0;

  if (isJsonl) {
    totalLoaded = await loadJsonl(datasetPath);
  } else {
    totalLoaded = await loadJson(datasetPath);
  }

  console.log(`Loaded ${totalLoaded} candidates into database.`);
  return totalLoaded;
}

async function loadJsonl(filePath) {
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let batch = [];
  let total = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (MAX_CANDIDATES > 0 && total >= MAX_CANDIDATES) break;
    try {
      const candidate = JSON.parse(line);
      batch.push(candidate);
    } catch (e) {
      console.warn("Skipping malformed JSON line");
    }

    if (batch.length >= BATCH_SIZE) {
      await insertBatch(batch);
      total += batch.length;
      process.stdout.write(`\rLoaded ${total} candidates...`);
      batch = [];
    }
  }

  if (batch.length > 0) {
    await insertBatch(batch);
    total += batch.length;
  }

  process.stdout.write("\n");
  return total;
}

async function loadJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const candidates = JSON.parse(raw);
  let total = 0;

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    await insertBatch(batch);
    total += batch.length;
    process.stdout.write(`\rLoaded ${total} candidates...`);
  }

  process.stdout.write("\n");
  return total;
}

async function insertBatch(candidates) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const c of candidates) {
      await client.query(
        `INSERT INTO candidates (
          candidate_id, profile, career_history, education, skills,
          certifications, languages, redrob_signals
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (candidate_id) DO UPDATE SET
          profile = EXCLUDED.profile,
          career_history = EXCLUDED.career_history,
          education = EXCLUDED.education,
          skills = EXCLUDED.skills,
          certifications = EXCLUDED.certifications,
          languages = EXCLUDED.languages,
          redrob_signals = EXCLUDED.redrob_signals`,
        [
          c.candidate_id,
          JSON.stringify(c.profile || {}),
          JSON.stringify(c.career_history || []),
          JSON.stringify(c.education || []),
          JSON.stringify(c.skills || []),
          JSON.stringify(c.certifications || []),
          JSON.stringify(c.languages || []),
          JSON.stringify(c.redrob_signals || {})
        ]
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Batch insert error:", err.message);
  } finally {
    client.release();
  }
}

module.exports = { loadDataset };
