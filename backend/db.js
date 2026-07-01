const { Pool } = require("pg");
require("dotenv").config();

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.PGSSL === "disable" ? false : { rejectUnauthorized: false },
    })
  : new Pool({
      user: process.env.DB_USER || "postgres",
      host: process.env.DB_HOST || "localhost",
      database: process.env.DB_DATABASE || "recruitiq_hackathon",
      password: process.env.DB_PASSWORD || "",
      port: parseInt(process.env.DB_PORT || "5432"),
    });

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

const initDb = async () => {
  const client = await pool.connect();
  try {
    await client.query("SELECT NOW()");
    console.log("Connected to PostgreSQL successfully.");

    await client.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        id SERIAL PRIMARY KEY,
        candidate_id VARCHAR(20) UNIQUE NOT NULL,
        profile JSONB NOT NULL,
        career_history JSONB DEFAULT '[]',
        education JSONB DEFAULT '[]',
        skills JSONB DEFAULT '[]',
        certifications JSONB DEFAULT '[]',
        languages JSONB DEFAULT '[]',
        redrob_signals JSONB DEFAULT '{}',
        embedding FLOAT[],
        embedding_model VARCHAR(64),
        is_honeypot BOOLEAN DEFAULT false,
        honeypot_confidence FLOAT DEFAULT 0,
        honeypot_reasons JSONB DEFAULT '[]',
        capability_score FLOAT DEFAULT 0,
        founder_fit_score FLOAT DEFAULT 0,
        hireability_score FLOAT DEFAULT 0,
        trust_score FLOAT DEFAULT 0,
        overall_score FLOAT DEFAULT 0,
        confidence_score FLOAT DEFAULT 0,
        rank INT DEFAULT 0,
        reasoning TEXT,
        features JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await client.query("CREATE INDEX IF NOT EXISTS idx_candidates_candidate_id ON candidates(candidate_id)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_candidates_overall_score ON candidates(overall_score DESC)");
    await client.query("CREATE INDEX IF NOT EXISTS idx_candidates_honeypot ON candidates(is_honeypot)");

    await client.query(`
      CREATE TABLE IF NOT EXISTS jd_analyses (
        id SERIAL PRIMARY KEY,
        title TEXT,
        description TEXT NOT NULL,
        embedding FLOAT[],
        embedding_model VARCHAR(64),
        technical_signals JSONB DEFAULT '[]',
        founder_signals JSONB DEFAULT '[]',
        hireability_signals JSONB DEFAULT '[]',
        negative_signals JSONB DEFAULT '[]',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS ranking_sessions (
        id SERIAL PRIMARY KEY,
        jd_id INT REFERENCES jd_analyses(id) ON DELETE CASCADE,
        jd_title TEXT,
        weights JSONB DEFAULT '{"capability": 40, "founderFit": 20, "hireability": 20, "trust": 15}',
        candidate_count INT DEFAULT 0,
        top_score FLOAT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    console.log("Database tables initialized successfully.");
  } catch (err) {
    console.error("Database initialization error:", err.message);
    console.error("Make sure PostgreSQL is running and the database exists:");
    console.error("  CREATE DATABASE recruitiq_hackathon;");
    throw err;
  } finally {
    client.release();
  }
};

const initPromise = initDb();

module.exports = pool;
module.exports.initPromise = initPromise;
