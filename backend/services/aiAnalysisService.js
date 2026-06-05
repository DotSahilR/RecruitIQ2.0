/**
 * AI Analysis Service (Phase 6 + 9).
 *
 * Generates and caches per-(candidate, job) explanations and interview
 * questions. Results persist to the `candidate_analysis` table (UPSERT)
 * so subsequent views are instant.
 *
 * Flow:
 *   1. Read existing candidate_analysis row (if any).
 *   2. If cached + not refreshing + has explanation → return it.
 *   3. Otherwise call aiProvider.generateExplanation / generateInterviewQuestions.
 *   4. UPSERT both into candidate_analysis, return the new payload.
 *
 * The service never throws on AI failure — it logs and returns a graceful
 * "ai-not-configured" / "ai-failed" response so the candidate page can
 * still render with a "Generate when ready" button.
 */

const pool = require("../db");
const aiProvider = require("./aiProvider");

const VALID_RECOMMENDATIONS = ["Strong fit", "Possible fit", "Weak fit", "Not a fit"];

function _coerceStringArray(v, max = 10) {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => String(x == null ? "" : x).trim())
    .filter(Boolean)
    .slice(0, max);
}

function _coerceQuestions(v) {
  if (!v || typeof v !== "object") return null;
  return {
    technical: _coerceStringArray(v.technical, 10),
    behavioral: _coerceStringArray(v.behavioral, 10),
    riskAreas: _coerceStringArray(v.riskAreas, 10),
  };
}

async function _loadCandidateContext(candidateId, userId) {
  const r = await pool.query(
    `SELECT c.id, c.name, c.email, c.role, c.location, c.experience, c.summary,
            c.raw_text, c.score,
            cp.phone, cp.linkedin_url, cp.github_url, cp.summary AS profile_summary
       FROM candidates c
       LEFT JOIN candidate_profiles cp ON cp.candidate_id = c.id
      WHERE c.id = $1 AND c.user_id = $2`,
    [candidateId, userId]
  );
  if (r.rows.length === 0) return null;
  const c = r.rows[0];
  const skillsRes = await pool.query(
    "SELECT skill_name FROM skills WHERE candidate_id = $1",
    [candidateId]
  );
  return {
    ...c,
    skills: skillsRes.rows.map((row) => row.skill_name),
  };
}

async function _loadJobContext(jobId, userId) {
  const r = await pool.query(
    "SELECT id, title, description FROM jobs WHERE id = $1 AND user_id = $2",
    [jobId, userId]
  );
  return r.rows[0] || null;
}

async function _loadAnalysisRow(candidateId, jobId) {
  const r = await pool.query(
    `SELECT strengths, weaknesses, explanation, recommendation,
            interview_questions, final_score, updated_at
       FROM candidate_analysis
      WHERE candidate_id = $1 AND job_id = $2`,
    [candidateId, jobId]
  );
  return r.rows[0] || null;
}

function _rowToPayload(row) {
  if (!row) return null;
  return {
    strengths: row.strengths || [],
    weaknesses: row.weaknesses || [],
    explanation: row.explanation || "",
    recommendation: row.recommendation || null,
    interviewQuestions: row.interview_questions || null,
    finalScore: row.final_score ?? null,
    updatedAt: row.updated_at || null,
  };
}

function _buildDeterministicFallback(candidate) {
  // Used when AI is unavailable — gives the candidate page something useful
  // to render instead of an empty box.
  return {
    strengths: (candidate.skills || []).slice(0, 4),
    weaknesses: candidate.experience
      ? []
      : ["Experience level unclear from resume"],
    explanation: candidate.summary
      ? String(candidate.summary).slice(0, 280)
      : "AI explanation unavailable — see resume excerpt and score breakdown for context.",
    recommendation: "Possible fit",
  };
}

/**
 * @param {number} candidateId
 * @param {number} jobId
 * @param {number} userId
 * @param {object} [opts]
 * @param {boolean} [opts.refresh]   when true, ignore cache
 * @returns {Promise<object>}        result payload (see shape below)
 */
async function getOrGenerateAnalysis(candidateId, jobId, userId, opts = {}) {
  const refresh = Boolean(opts.refresh);
  console.log(
    `[ai-analysis] getOrGenerateAnalysis user=${userId} candidate=${candidateId} job=${jobId} refresh=${refresh}`
  );

  const cand = await _loadCandidateContext(candidateId, userId);
  if (!cand) return { ok: false, error: "candidate-not-found" };

  const job = await _loadJobContext(jobId, userId);
  if (!job) return { ok: false, error: "job-not-found" };

  // Cache hit path.
  const cached = await _loadAnalysisRow(candidateId, jobId);
  if (cached && !refresh && cached.explanation) {
    console.log(`[ai-analysis]   cache hit (updated ${cached.updated_at?.toISOString?.() || "unknown"})`);
    return { ok: true, fromCache: true, aiUsed: false, payload: _rowToPayload(cached) };
  }

  // AI unavailable path — fall back to a deterministic stub.
  if (!aiProvider.isAvailable()) {
    console.log(`[ai-analysis]   ai-not-configured, returning deterministic stub`);
    const fallback = _buildDeterministicFallback(cand);
    return {
      ok: true,
      fromCache: false,
      aiUsed: false,
      available: false,
      payload: { ...fallback, interviewQuestions: null, finalScore: cached?.final_score ?? null, updatedAt: null },
    };
  }

  // Live generation.
  const aiCandidate = {
    name: cand.name,
    role: cand.role,
    experience: cand.experience,
    skills: cand.skills,
    summary: cand.profile_summary || cand.summary,
    raw_text: cand.raw_text,
  };
  const score = cached?.final_score ?? cand.score ?? null;

  let explanation = null;
  let interviewQuestions = null;
  const errors = [];

  try {
    explanation = await aiProvider.generateExplanation(aiCandidate, job, score);
  } catch (err) {
    errors.push(`explanation:${err.message || err}`);
  }

  try {
    interviewQuestions = await aiProvider.generateInterviewQuestions(aiCandidate, job);
  } catch (err) {
    errors.push(`questions:${err.message || err}`);
  }

  if (!explanation) {
    console.warn(`[ai-analysis]   AI returned no explanation — using fallback. errors=${errors.join("|")}`);
    explanation = _buildDeterministicFallback(cand);
  } else {
    // Sanitize the AI's response.
    if (explanation.recommendation && !VALID_RECOMMENDATIONS.includes(explanation.recommendation)) {
      explanation.recommendation = "Possible fit";
    }
  }

  const strengths = _coerceStringArray(explanation.strengths, 6);
  const weaknesses = _coerceStringArray(explanation.weaknesses, 6);
  const explanationText = String(explanation.explanation || "").slice(0, 4000);
  const recommendation = VALID_RECOMMENDATIONS.includes(explanation.recommendation)
    ? explanation.recommendation
    : "Possible fit";
  const questions = _coerceQuestions(interviewQuestions);

  await pool.query(
    `INSERT INTO candidate_analysis
       (candidate_id, job_id, strengths, weaknesses, explanation,
        recommendation, interview_questions, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (candidate_id, job_id) DO UPDATE
       SET strengths           = EXCLUDED.strengths,
           weaknesses          = EXCLUDED.weaknesses,
           explanation         = EXCLUDED.explanation,
           recommendation      = EXCLUDED.recommendation,
           interview_questions = EXCLUDED.interview_questions,
           updated_at          = NOW()`,
    [
      candidateId,
      jobId,
      JSON.stringify(strengths),
      JSON.stringify(weaknesses),
      explanationText,
      recommendation,
      questions ? JSON.stringify(questions) : null,
    ]
  );

  console.log(
    `[ai-analysis]   generated explanation (${explanationText.length} chars) ` +
    `+ ${questions ? "interview questions" : "no questions"} for candidate=${candidateId} job=${jobId}`
  );

  return {
    ok: true,
    fromCache: false,
    aiUsed: true,
    available: true,
    payload: {
      strengths,
      weaknesses,
      explanation: explanationText,
      recommendation,
      interviewQuestions: questions,
      finalScore: cached?.final_score ?? null,
      updatedAt: new Date().toISOString(),
    },
  };
}

module.exports = {
  getOrGenerateAnalysis,
  VALID_RECOMMENDATIONS,
};
