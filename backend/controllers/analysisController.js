const pool = require("../db");
const scoringService = require("../services/scoringService");
const scoringServiceV2 = require("../services/scoringServiceV2");
const embeddingService = require("../services/embeddingService");
const parserService = require("../services/parserService");
const aiAnalysisService = require("../services/aiAnalysisService");

/**
 * Compares all uploaded candidates against the active/specified JD,
 * generates scores/ranks, updates PostgreSQL, and returns results.
 *
 * Phase 5: when USE_AI_SCORING=true and an embedding provider is available,
 * the v2 scorer blends a semantic-similarity component (0.5 weight) into
 * the final score. The chosen algorithm is recorded on the screening_session
 * row (algorithm_version = 'v1' | 'v2') so downstream reads can adapt.
 */
async function analyzeCandidates(req, res) {
  try {
    const { jobId } = req.body;
    const userId = req.user.id;
    console.log(`[analysis] analyzeCandidates user=${userId} jobId=${jobId || "latest"}`);

    // 1. Fetch Job Description
    let jobQuery = "SELECT * FROM jobs WHERE user_id = $1 ORDER BY id DESC LIMIT 1";
    let queryParams = [userId];
    if (jobId) {
      jobQuery = "SELECT * FROM jobs WHERE id = $1 AND user_id = $2";
      queryParams = [jobId, userId];
    }

    const jobRes = await pool.query(jobQuery, queryParams);
    if (jobRes.rows.length === 0) {
      return res.status(404).json({ error: "No job descriptions found. Please upload a JD first." });
    }
    const job = jobRes.rows[0];
    const jdText = job.description;
    console.log(`[analysis]   job=${job.id} title="${job.title}" desc_len=${jdText.length}`);

    // 2. Fetch Job skills
    const jdSkillsRes = await pool.query("SELECT skill_name FROM job_skills WHERE job_id = $1", [job.id]);
    const jdSkills = jdSkillsRes.rows.map(r => r.skill_name);

    // 3. Fetch candidates uploaded by this HR account that are not already part of an older session.
    const candRes = await pool.query(
      "SELECT * FROM candidates WHERE user_id = $1 AND session_id IS NULL",
      [userId]
    );
    const dbCandidates = candRes.rows;
    console.log(`[analysis]   unscreened candidates=${dbCandidates.length}`);

    if (dbCandidates.length === 0) {
      return res.status(400).json({ error: "No new candidates found. Please upload resumes first." });
    }

    // 4. Load full candidate model lists
    const candidatesList = [];
    for (const cand of dbCandidates) {
      const skillsRes = await pool.query("SELECT skill_name FROM skills WHERE candidate_id = $1", [cand.id]);
      const skills = skillsRes.rows.map(r => r.skill_name);

      candidatesList.push({
        id: cand.id,
        name: cand.name,
        email: cand.email,
        experience: cand.experience,
        education: typeof cand.education === "string" ? JSON.parse(cand.education) : cand.education,
        history: typeof cand.history === "string" ? JSON.parse(cand.history) : cand.history,
        role: cand.role,
        location: cand.location,
        summary: cand.summary,
        resume_path: cand.resume_path,
        raw_text: cand.raw_text,
        skills
      });
    }

    // 5. Choose scoring engine.
    //    USE_AI_SCORING=true requires the embedding provider to actually be
    //    available; otherwise we silently fall back to v1 so the system
    //    never advertises AI scoring it can't deliver.
    const useV2 = process.env.USE_AI_SCORING === "true" && isEmbedProviderAvailable();
    if (process.env.USE_AI_SCORING === "true" && !useV2) {
      console.warn("[scoring] USE_AI_SCORING=true but embed provider unavailable — falling back to v1");
    }
    let ranked;
    let algorithmVersion = "v1";
    let v2Evaluations = []; // for persistence

    if (useV2) {
      try {
        const jdSkillsForV2 = scoringServiceV2.extractJdSkills(jdText);
        const targetExpForV2 = scoringServiceV2.extractJdExperience(jdText);

        // Compute per-candidate semantic score in parallel. A missing embedding
        // for one candidate is fine — its weight is redistributed to the
        // remaining components. The whole batch only falls back to v1 if the
        // embedding provider itself is unavailable.
        const jobVec = await embeddingService.getJobEmbedding(job.id);
        if (!jobVec) {
          console.warn(`[scoring] no JD embedding for job ${job.id}; running v2 without semantic component`);
        } else {
          console.log(`[scoring] v2 path: job ${job.id} embedding found (${jobVec.length}-d)`);
        }

        const candidateVectors = await Promise.all(
          candidatesList.map((c) => embeddingService.getCandidateEmbedding(c.id))
        );
        const withEmbed = candidateVectors.filter((v) => v).length;
        console.log(`[scoring] v2 path: ${withEmbed}/${candidatesList.length} candidates have embeddings`);

        v2Evaluations = candidatesList.map((cand, idx) => {
          const candVec = candidateVectors[idx];
          let semantic = null;
          if (candVec && jobVec) {
            const sim = embeddingService.cosineSimilarity(candVec, jobVec);
            if (sim != null) semantic = Math.round(((sim + 1) / 2) * 100);
          }
          return scoringServiceV2.scoreCandidateV2({
            candidate: cand,
            jdText,
            jdSkills: jdSkillsForV2,
            targetExp: targetExpForV2,
            candidateSkills: cand.skills,
            semanticScore: semantic,
          });
        });

        ranked = v2Evaluations
          .map((evaln, idx) => ({ ...candidatesList[idx], ...evaln }))
          .sort((a, b) => b.score - a.score)
          .map((c, idx) => ({ ...c, rank: idx + 1 }));

        algorithmVersion = "v2";
      } catch (v2err) {
        // Defensive: if embeddings table is missing or pgvector misconfigured,
        // don't take down the whole analyze flow — fall back to v1.
        console.error(`[scoring] v2 path failed, falling back to v1:`, v2err.message);
        ranked = scoringService.rankCandidates(candidatesList, jdText);
        v2Evaluations = [];
      }
    } else {
      ranked = scoringService.rankCandidates(candidatesList, jdText);
    }

    // 6. Persist session row with algorithm version tag.
    const sessionResult = await pool.query(
      `INSERT INTO screening_sessions
         (user_id, job_id, title, candidate_count, top_score, algorithm_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, created_at, algorithm_version`,
      [userId, job.id, job.title, ranked.length, ranked[0]?.score || 0, algorithmVersion]
    );
    const session = sessionResult.rows[0];
    console.log(`[analysis]   created session=${session.id} algo=${algorithmVersion} candidates=${ranked.length} top_score=${ranked[0]?.score || 0}`);

    // 7. Update candidate scores/ranks.
    for (const cand of ranked) {
      await pool.query(
        "UPDATE candidates SET score = $1, rank = $2, session_id = $3 WHERE id = $4 AND user_id = $5",
        [cand.score, cand.rank, session.id, cand.id, userId]
      );
    }

    // 8. For v2 runs, persist component scores into candidate_analysis.
    if (algorithmVersion === "v2") {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        for (let i = 0; i < ranked.length; i++) {
          await scoringServiceV2.persistAnalysis(client, ranked[i].id, job.id, v2Evaluations[i]);
        }
        await client.query("COMMIT");
        console.log(`[scoring]   persisted candidate_analysis rows=${ranked.length}`);
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        console.error(`[scoring] failed to persist candidate_analysis:`, err.message);
      } finally {
        client.release();
      }
    }

    // 9. Phase 8: bump candidate_status from "Applied" -> "Screened" for the
    //    newly-analyzed batch. Does not overwrite Hired/Rejected/etc.
    const screenedIds = ranked.map((c) => c.id);
    const statusRes = await pool.query(
      `UPDATE candidate_status
          SET status = 'Screened', updated_at = NOW()
        WHERE candidate_id = ANY($1::int[])
          AND status = 'Applied'
        RETURNING candidate_id`,
      [screenedIds]
    );
    if (statusRes.rows.length > 0) {
      console.log(`[status]   promoted ${statusRes.rows.length} candidates to 'Screened' (session=${session.id})`);
    }

    console.log(`[analysis] analyzeCandidates user=${userId} -> 200 session=${session.id} algo=${algorithmVersion}`);

    return res.status(200).json({
      message: "Screening analysis completed successfully.",
      sessionId: session.id,
      jobId: job.id,
      jobTitle: job.title,
      algorithmVersion: session.algorithm_version,
      results: ranked
    });

  } catch (err) {
    console.error("[analysis] analyzeCandidates error:", err);
    return res.status(500).json({ error: "Server error performing analysis." });
  }
}

function isEmbedProviderAvailable() {
  try {
    const ai = require("../services/aiProvider");
    return Boolean(ai && ai.isEmbedAvailable && ai.isEmbedAvailable());
  } catch (_) {
    return false;
  }
}

/**
 * Fetches already scored and ranked candidates.
 * For v2 sessions, pull the stored breakdown from candidate_analysis (faster
 * and reflects what was actually shown to the user at analyze time).
 */
async function getResults(req, res) {
  try {
    const userId = req.user.id;
    const requestedSessionId = req.query.sessionId ? parseInt(req.query.sessionId, 10) : null;
    console.log(`[analysis] getResults user=${userId} sessionId=${requestedSessionId || "latest"}`);

    if (req.query.sessionId && isNaN(requestedSessionId)) {
      return res.status(400).json({ error: "Invalid session ID." });
    }

    let sessionRes;
    if (requestedSessionId) {
      sessionRes = await pool.query(
        "SELECT * FROM screening_sessions WHERE id = $1 AND user_id = $2",
        [requestedSessionId, userId]
      );
    } else {
      sessionRes = await pool.query(
        "SELECT * FROM screening_sessions WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1",
        [userId]
      );
    }

    if (sessionRes.rows.length === 0) {
      return res.status(200).json({ jobTitle: "No Job Profile Screened", results: [] });
    }

    const session = sessionRes.rows[0];
    const isV2 = session.algorithm_version === "v2";

    // 1. Get latest job for comparison
    const jobRes = await pool.query(
      "SELECT * FROM jobs WHERE id = $1 AND user_id = $2",
      [session.job_id, userId]
    );
    if (jobRes.rows.length === 0) {
      return res.status(200).json({ results: [] });
    }
    const job = jobRes.rows[0];
    const jdText = job.description;
    const jdSkillsRes = await pool.query("SELECT skill_name FROM job_skills WHERE job_id = $1", [job.id]);
    const jdSkills = jdSkillsRes.rows.map(r => r.skill_name);

    // 2. Fetch candidates sorted by score/rank
    const candRes = await pool.query(
      "SELECT * FROM candidates WHERE user_id = $1 AND session_id = $2 ORDER BY score DESC, rank ASC",
      [userId, session.id]
    );
    const dbCandidates = candRes.rows;

    // For v2 sessions, bulk-fetch the persisted analysis rows.
    const analysisByCandidate = new Map();
    if (isV2 && dbCandidates.length > 0) {
      const candIds = dbCandidates.map((c) => c.id);
      const aRes = await pool.query(
        `SELECT candidate_id, semantic_score, skill_score, experience_score,
                education_score, final_score
           FROM candidate_analysis
          WHERE job_id = $1 AND candidate_id = ANY($2::int[])`,
        [job.id, candIds]
      );
      for (const row of aRes.rows) {
        analysisByCandidate.set(row.candidate_id, row);
      }
    }

    const candidatesList = [];
    for (const cand of dbCandidates) {
      const skillsRes = await pool.query("SELECT skill_name FROM skills WHERE candidate_id = $1", [cand.id]);
      const skills = skillsRes.rows.map(r => r.skill_name);

      const candidateSkillsSet = new Set(skills.map(s => s.toLowerCase()));
      const matchingSkills = jdSkills.filter(s => candidateSkillsSet.has(s.toLowerCase()));
      const missingSkills = jdSkills.filter(s => !candidateSkillsSet.has(s.toLowerCase()));

      let breakdown;
      if (isV2) {
        const a = analysisByCandidate.get(cand.id);
        if (a) {
          const hasSemantic = a.semantic_score != null;
          const weights = hasSemantic
            ? { semantic: 0.5, skills: 0.2, experience: 0.2, education: 0.1 }
            : { semantic: 0, skills: 0.4, experience: 0.4, education: 0.2 };
          breakdown = [
            { label: "Semantic match (AI)", value: hasSemantic ? a.semantic_score : "n/a", weight: weights.semantic },
            { label: "Skills match", value: a.skill_score ?? 0, weight: weights.skills },
            { label: "Experience fit", value: a.experience_score ?? 0, weight: weights.experience },
            { label: "Education", value: a.education_score ?? 0, weight: weights.education },
          ];
        } else {
          breakdown = [];
        }
      } else {
        const candWithSkills = { ...cand, skills };
        breakdown = scoringService.scoreCandidate(
          candWithSkills,
          cand.raw_text || `${cand.name} ${cand.role || ""} ${cand.summary || ""}`,
          jdText,
          jdSkills,
          scoringService.extractJdExperience(jdText)
        ).breakdown;
      }

      candidatesList.push({
        id: String(cand.id),
        rank: cand.rank || 1,
        name: cand.name,
        email: cand.email,
        experience: cand.experience,
        education: typeof cand.education === "string" ? JSON.parse(cand.education) : cand.education,
        history: typeof cand.history === "string" ? JSON.parse(cand.history) : cand.history,
        role: cand.role,
        location: cand.location,
        summary: cand.summary,
        resume_path: cand.resume_path,
        rawText: cand.raw_text,
        displayText: parserService.formatResumeText(cand.raw_text || cand.summary || ""),
        score: cand.score,
        matchingSkills,
        missingSkills,
        breakdown
      });
    }

    return res.status(200).json({
      sessionId: session.id,
      jobTitle: job.title,
      algorithmVersion: session.algorithm_version || "v1",
      results: candidatesList
    });
    console.log(`[analysis] getResults user=${userId} -> 200 results=${candidatesList.length} algo=${session.algorithm_version || "v1"}`);

  } catch (err) {
    console.error("[analysis] getResults error:", err);
    return res.status(500).json({ error: "Server error fetching screening results." });
  }
}

/**
 * Fetches details of a single candidate by ID.
 */
async function getCandidateById(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    console.log(`[analysis] getCandidateById user=${userId} id=${id}`);

    const numericId = parseInt(id, 10);
    if (isNaN(numericId)) {
      return res.status(404).json({ error: "Candidate not found." });
    }

    const candRes = await pool.query(
      "SELECT * FROM candidates WHERE id = $1 AND user_id = $2",
      [numericId, userId]
    );
    if (candRes.rows.length === 0) {
      return res.status(404).json({ error: "Candidate not found." });
    }
    const cand = candRes.rows[0];

    const skillsRes = await pool.query("SELECT skill_name FROM skills WHERE candidate_id = $1", [cand.id]);
    const skills = skillsRes.rows.map(r => r.skill_name);

    const jobRes = await pool.query(`
      SELECT jobs.*
      FROM jobs
      JOIN screening_sessions ON screening_sessions.job_id = jobs.id
      WHERE screening_sessions.id = $1 AND jobs.user_id = $2
      LIMIT 1
    `, [cand.session_id, userId]);
    let matchingSkills = [];
    let missingSkills = [];
    let evaluation = { breakdown: [] };

    if (jobRes.rows.length > 0) {
      const job = jobRes.rows[0];
      const jdSkillsRes = await pool.query("SELECT skill_name FROM job_skills WHERE job_id = $1", [job.id]);
      const jdSkills = jdSkillsRes.rows.map(r => r.skill_name);

      const candidateSkillsSet = new Set(skills.map(s => s.toLowerCase()));
      matchingSkills = jdSkills.filter(s => candidateSkillsSet.has(s.toLowerCase()));
      missingSkills = jdSkills.filter(s => !candidateSkillsSet.has(s.toLowerCase()));

      // Look up the screening session to know which algorithm version.
      const sessRes = await pool.query(
        "SELECT algorithm_version FROM screening_sessions WHERE id = $1",
        [cand.session_id]
      );
      const isV2 = sessRes.rows[0]?.algorithm_version === "v2";

      if (isV2) {
        const aRes = await pool.query(
          `SELECT semantic_score, skill_score, experience_score, education_score
             FROM candidate_analysis
            WHERE candidate_id = $1 AND job_id = $2`,
          [cand.id, job.id]
        );
        const a = aRes.rows[0];
        if (a) {
          const hasSemantic = a.semantic_score != null;
          const weights = hasSemantic
            ? { semantic: 0.5, skills: 0.2, experience: 0.2, education: 0.1 }
            : { semantic: 0, skills: 0.4, experience: 0.4, education: 0.2 };
          evaluation = {
            breakdown: [
              { label: "Semantic match (AI)", value: hasSemantic ? a.semantic_score : "n/a", weight: weights.semantic },
              { label: "Skills match", value: a.skill_score ?? 0, weight: weights.skills },
              { label: "Experience fit", value: a.experience_score ?? 0, weight: weights.experience },
              { label: "Education", value: a.education_score ?? 0, weight: weights.education },
            ],
          };
        }
      } else {
        const candWithSkills = { ...cand, skills };
        evaluation = scoringService.scoreCandidate(
          candWithSkills,
          cand.raw_text || `${cand.name} ${cand.role || ""} ${cand.summary || ""}`,
          job.description,
          jdSkills,
          scoringService.extractJdExperience(job.description)
        );
      }
    }

    const candidateDetails = {
      id: String(cand.id),
      rank: cand.rank || 1,
      name: cand.name,
      email: cand.email,
      experience: cand.experience,
      education: typeof cand.education === "string" ? JSON.parse(cand.education) : cand.education,
      history: typeof cand.history === "string" ? JSON.parse(cand.history) : cand.history,
      role: cand.role,
        location: cand.location,
      summary: cand.summary,
      resume_path: cand.resume_path,
      rawText: cand.raw_text,
      displayText: parserService.formatResumeText(cand.raw_text || cand.summary || ""),
      mimeType: cand.mime_type || null,
      originalName: cand.original_name || null,
      hasFile: !!cand.resume_path,
      score: cand.score,
      matchingSkills,
      missingSkills,
      breakdown: evaluation.breakdown
    };

    return res.status(200).json(candidateDetails);

  } catch (err) {
    console.error("[analysis] getCandidateById error:", err);
    return res.status(500).json({ error: "Server error fetching candidate details." });
  }
}

async function getSessions(req, res) {
  try {
    console.log(`[analysis] getSessions user=${req.user.id}`);
    const result = await pool.query(`
      SELECT
        screening_sessions.id,
        screening_sessions.title,
        screening_sessions.candidate_count,
        screening_sessions.top_score,
        screening_sessions.created_at,
        screening_sessions.algorithm_version,
        jobs.title AS job_title
      FROM screening_sessions
      LEFT JOIN jobs ON jobs.id = screening_sessions.job_id
      WHERE screening_sessions.user_id = $1
      ORDER BY screening_sessions.created_at DESC, screening_sessions.id DESC
    `, [req.user.id]);

    return res.status(200).json({
      sessions: result.rows.map((row) => ({
        id: row.id,
        title: row.title || row.job_title || "Screening session",
        candidateCount: row.candidate_count || 0,
        topScore: Math.round(row.top_score || 0),
        createdAt: row.created_at,
        algorithmVersion: row.algorithm_version || "v1",
      })),
    });
  } catch (err) {
    console.error("[analysis] getSessions error:", err);
    return res.status(500).json({ error: "Server error fetching screening sessions." });
  }
}

async function getOcrStatus(req, res) {
  try {
    const userId = req.user.id;
    const raw = String(req.query.ids || "").trim();
    const ids = raw
      ? raw.split(",").map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n))
      : null;
    console.log(`[analysis] getOcrStatus user=${userId} ids=${ids ? ids.join(",") : "all-active"}`);

    let result;
    if (ids && ids.length > 0) {
      result = await pool.query(
        `SELECT j.candidate_id, j.status, j.attempts, j.error, j.completed_at
           FROM ocr_jobs j
           JOIN candidates c ON c.id = j.candidate_id
          WHERE c.user_id = $1 AND j.candidate_id = ANY($2::int[])
          ORDER BY j.id DESC`,
        [userId, ids]
      );
    } else {
      result = await pool.query(
        `SELECT j.candidate_id, j.status, j.attempts, j.error, j.completed_at
           FROM ocr_jobs j
           JOIN candidates c ON c.id = j.candidate_id
          WHERE c.user_id = $1 AND j.status IN ('queued','running','failed')
          ORDER BY j.id DESC`,
        [userId]
      );
    }

    return res.status(200).json({
      jobs: result.rows.map((r) => ({
        candidateId: r.candidate_id,
        status: r.status,
        attempts: r.attempts,
        error: r.error,
        completedAt: r.completed_at,
      })),
    });
  } catch (err) {
    console.error("[analysis] getOcrStatus error:", err);
    return res.status(500).json({ error: "Server error fetching OCR status." });
  }
}

/**
 * Phase 6 + 9 — AI explanation + interview questions for a (candidate, job) pair.
 * GET /api/candidates/:id/analysis?jobId=X[&refresh=true]
 *
 * Cached in candidate_analysis (UPSERT). Refresh flag forces a regeneration.
 * If AI is not configured, returns a deterministic stub with available:false
 * so the frontend can render a "Generate when ready" button.
 */
async function getAnalysis(req, res) {
  try {
    const candidateId = parseInt(req.params.id, 10);
    const jobId = parseInt(req.query.jobId, 10);
    const refresh = req.query.refresh === "true" || req.query.refresh === "1";
    if (Number.isNaN(candidateId) || Number.isNaN(jobId)) {
      return res.status(400).json({ error: "Invalid candidate or job ID." });
    }

    const out = await aiAnalysisService.getOrGenerateAnalysis(
      candidateId, jobId, req.user.id, { refresh }
    );

    if (!out.ok) {
      if (out.error === "candidate-not-found") {
        return res.status(404).json({ error: "Candidate not found." });
      }
      if (out.error === "job-not-found") {
        return res.status(404).json({ error: "Job not found." });
      }
      return res.status(500).json({ error: "Server error fetching analysis." });
    }

    return res.status(200).json({
      available: out.available !== false,
      fromCache: out.fromCache,
      aiUsed: out.aiUsed,
      ...out.payload,
    });
  } catch (err) {
    console.error("[analysis] getAnalysis error:", err);
    return res.status(500).json({ error: "Server error fetching analysis." });
  }
}

module.exports = {
  analyzeCandidates,
  getResults,
  getCandidateById,
  getSessions,
  getOcrStatus,
  getAnalysis,
};
