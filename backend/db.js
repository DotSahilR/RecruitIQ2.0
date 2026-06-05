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
      database: process.env.DB_DATABASE || "resume_screening",
      password: process.env.DB_PASSWORD || "",
      port: parseInt(process.env.DB_PORT || "5432"),
    });

pool.on("error", (err) => {
  console.error("Unexpected error on idle PostgreSQL client:", err.message);
});

// Automatically create tables on startup
const initDb = async () => {
  try {
    // Check connection first
    await pool.query("SELECT NOW()");
    console.log("✅ Connected to PostgreSQL successfully.");

    // Create users table (HR accounts)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create jobs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(255),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create screening_sessions table (links user + job + timestamp)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screening_sessions (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        job_id INT REFERENCES jobs(id) ON DELETE CASCADE,
        title VARCHAR(255),
        candidate_count INT DEFAULT 0,
        top_score FLOAT DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create candidates table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidates (
        id SERIAL PRIMARY KEY,
        user_id INT REFERENCES users(id) ON DELETE CASCADE,
        session_id INT REFERENCES screening_sessions(id) ON DELETE CASCADE,
        name VARCHAR(255),
        email VARCHAR(255),
        experience INT,
        education JSONB,
        history JSONB,
        score FLOAT DEFAULT 0.0,
        rank INT DEFAULT 0,
        resume_path TEXT,
        raw_text TEXT,
        role VARCHAR(255),
        location VARCHAR(255),
        summary TEXT
      );
    `);

    // Keep older local databases compatible if tables already existed before auth.
    await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE CASCADE");
    await pool.query("ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS user_id INT REFERENCES users(id) ON DELETE CASCADE");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS session_id INT REFERENCES screening_sessions(id) ON DELETE CASCADE");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS raw_text TEXT");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120)");
    await pool.query("ALTER TABLE candidates ADD COLUMN IF NOT EXISTS original_name VARCHAR(255)");

    // Create skills table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS skills (
        id SERIAL PRIMARY KEY,
        candidate_id INT REFERENCES candidates(id) ON DELETE CASCADE,
        skill_name VARCHAR(100)
      );
    `);

    // Create job_skills table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS job_skills (
        id SERIAL PRIMARY KEY,
        job_id INT REFERENCES jobs(id) ON DELETE CASCADE,
        skill_name VARCHAR(100)
      );
    `);

    // ─────────────────────────────────────────────────────────────────
    // RecruitIQ v2: Phase 1 schema additions
    // ─────────────────────────────────────────────────────────────────

    // Tag each screening session with the scoring algorithm used.
    // 'v1' = original deterministic engine. 'v2' = semantic + AI engine (Phase 5).
    await pool.query(
      "ALTER TABLE screening_sessions ADD COLUMN IF NOT EXISTS algorithm_version VARCHAR(8) DEFAULT 'v1'"
    );

    // Structured candidate profile data (extracted by AI or regex parser).
    // NOTE: "current_role" is quoted because CURRENT_ROLE is a reserved SQL keyword.
    // Any hand-written SQL that touches this column must quote it too.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_profiles (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER UNIQUE REFERENCES candidates(id) ON DELETE CASCADE,
        phone TEXT,
        linkedin_url TEXT,
        github_url TEXT,
        location TEXT,
        "current_role" TEXT,
        summary TEXT,
        extraction_method TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_candidate_profiles_candidate ON candidate_profiles(candidate_id)"
    );

    // Structured work history (one row per role).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS work_experience (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
        company TEXT,
        role TEXT,
        start_date DATE,
        end_date DATE,
        description TEXT
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_work_experience_candidate ON work_experience(candidate_id)"
    );

    // Structured education (one row per degree).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS education (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
        institution TEXT,
        degree TEXT,
        field_of_study TEXT,
        graduation_year INTEGER
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_education_candidate ON education(candidate_id)"
    );

    // Recruiter notes (free-form per candidate, scoped to the HR user who wrote it).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recruiter_notes (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        note TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_recruiter_notes_candidate ON recruiter_notes(candidate_id, created_at DESC)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_recruiter_notes_user ON recruiter_notes(user_id)"
    );

    // Pipeline status per candidate (one row per candidate, latest stage only).
    // Constrained enum — no free-text statuses.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_status (
        candidate_id INTEGER PRIMARY KEY REFERENCES candidates(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL DEFAULT 'Applied'
          CHECK (status IN ('Applied','Screened','Shortlisted','Interview','Offer','Hired','Rejected')),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // AI-generated analysis per (candidate, job) pair.
    // UNIQUE(candidate_id, job_id) so explanations/interview-Qs can be UPSERTed.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS candidate_analysis (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
        job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
        semantic_score INTEGER,
        skill_score INTEGER,
        experience_score INTEGER,
        education_score INTEGER,
        final_score INTEGER,
        strengths JSONB,
        weaknesses JSONB,
        explanation TEXT,
        recommendation TEXT,
        interview_questions JSONB,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE (candidate_id, job_id)
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_candidate_analysis_pair ON candidate_analysis(candidate_id, job_id)"
    );

    // ─────────────────────────────────────────────────────────────────
    // RecruitIQ v2: Phase 2 OCR queue
    // ─────────────────────────────────────────────────────────────────

    // OCR job queue (Postgres-backed; survives restarts, no Redis needed).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ocr_jobs (
        id SERIAL PRIMARY KEY,
        candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued','running','done','failed')),
        attempts INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        started_at TIMESTAMP,
        completed_at TIMESTAMP
      );
    `);
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_ocr_jobs_status ON ocr_jobs(status, created_at)"
    );
    await pool.query(
      "CREATE INDEX IF NOT EXISTS idx_ocr_jobs_candidate ON ocr_jobs(candidate_id)"
    );

    // ─────────────────────────────────────────────────────────────────
    // RecruitIQ v2: Phase 4 — pgvector embeddings
    // ─────────────────────────────────────────────────────────────────
    //
    // Embeddings live in a single table for both resumes and JDs (kind column
    // discriminates). candidate_id and job_id are nullable on opposite rows;
    // partial unique indexes below enforce "one resume-embed per candidate" and
    // "one jd-embed per job" without the NULLable-column footgun.
    //
    // Vector dim is hardcoded to 512 (voyage-3-lite). If you switch embedding
    // model, run:
    //   ALTER TABLE embeddings ALTER COLUMN vector TYPE vector(<new_dim>) USING vector;
    // and update EMBED_DIM in .env to match.
    try {
      await pool.query("CREATE EXTENSION IF NOT EXISTS vector");

      await pool.query(`
        CREATE TABLE IF NOT EXISTS embeddings (
          id SERIAL PRIMARY KEY,
          candidate_id INTEGER REFERENCES candidates(id) ON DELETE CASCADE,
          job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
          kind VARCHAR(20) NOT NULL CHECK (kind IN ('resume','jd')),
          vector vector(512) NOT NULL,
          model VARCHAR(64) NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);

      // Partial unique indexes (one row per (candidate|job, kind) pair).
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_embeddings_resume
           ON embeddings (candidate_id, kind) WHERE job_id IS NULL`
      );
      await pool.query(
        `CREATE UNIQUE INDEX IF NOT EXISTS uq_embeddings_jd
           ON embeddings (job_id, kind) WHERE candidate_id IS NULL`
      );

      // HNSW index for fast cosine-similarity lookups. HNSW is preferred over
      // ivfflat here because it doesn't need pre-existing rows to train.
      await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_embeddings_vector
           ON embeddings USING hnsw (vector vector_cosine_ops)`
      );
    } catch (err) {
      // Soft-fail: keep the rest of initDb running. Embedding service will
      // log per-call errors at runtime.
      console.warn("\u26a0\ufe0f  [pgvector] embeddings table NOT created:", err.message);
      console.warn("[pgvector] Install the pgvector extension or use a managed Postgres that has it.");
      console.warn("[pgvector] Phase 4 will be a no-op; v2 scoring will fall back to v1.\n");
    }

    console.log("✅ PostgreSQL database tables initialized successfully.");
    console.log("🔐 JWT auth is enabled. All screening routes require an HR login.");
    console.log("🧬 v2 schema ready: candidate_profiles, work_experience, education, recruiter_notes, candidate_status, candidate_analysis, ocr_jobs.");

    // One-time backfill: replace generic "Target Spec Role" job titles with
    // the first meaningful line of each job's description. Idempotent.
    try {
      const backfillRes = await pool.query(
        `UPDATE jobs
            SET title = COALESCE(
              NULLIF(
                REGEXP_REPLACE(
                  SUBSTRING(description FROM '^[[:space:]]*([^\r\n]{4,80})'),
                  '^[[:space:]]+', ''
                ),
                ''
              ),
              title
            )
          WHERE title IN ('Target Spec Role', 'Untitled role')
            AND description IS NOT NULL
            AND LENGTH(description) > 0
        RETURNING id, title`
      );
      if (backfillRes.rows.length > 0) {
        console.log(`[backfill] updated ${backfillRes.rows.length} generic job title(s).`);
        await pool.query(
          "UPDATE screening_sessions ss SET title = j.title FROM jobs j WHERE ss.job_id = j.id AND ss.title = 'Target Spec Role'"
        );
      }
    } catch (err) {
      console.warn("[backfill] job title cleanup skipped:", err.message);
    }

  } catch (err) {
    console.error("\n==========================================================================");
    console.error("❌ POSTGRESQL CONNECTION ERROR!");
    console.error(`Reason: ${err.message}`);
    console.error("\n👉 HOW TO RESOLVE THIS:");
    console.error("1. Make sure your local PostgreSQL server is running.");
    console.error("2. Connect via pgAdmin or psql and create the database:");
    console.error("   CREATE DATABASE resume_screening;");
    console.error("3. If you have custom credentials, create a 'backend/.env' file and configure them:");
    console.error("   DB_USER=postgres");
    console.error("   DB_PASSWORD=your_password");
    console.error("   DB_HOST=localhost");
    console.error("   DB_PORT=5432");
    console.error("==========================================================================\n");
  }
};

// Fire initialization
initDb();

module.exports = pool;
