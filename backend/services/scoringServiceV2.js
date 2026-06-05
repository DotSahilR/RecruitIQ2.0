/**
 * Scoring Service v2 (Phase 5).
 *
 * Blends a semantic-embedding component into the deterministic v1 score.
 * Per architecture decision, scoring is a weighted sum of independent
 * components, each normalized to 0-100:
 *
 *   final = 0.5*semantic + 0.2*skills + 0.2*experience + 0.1*education
 *
 * If the semantic component is unavailable (no embeddings for either side),
 * the 0.5 weight is redistributed across the remaining components so the
 * score still spans 0-100:
 *
 *   final = 0.4*skills + 0.4*experience + 0.2*education
 *
 * This file deliberately re-uses the same skill/experience extraction
 * helpers as scoringService.js (v1) to keep the regex baseline identical.
 */

const { SKILLS_POOL } = require("./parserService");
const embeddingService = require("./embeddingService");

function extractJdSkills(jdText) {
  const skills = [];
  for (const s of SKILLS_POOL) {
    const escaped = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, "i");
    if (regex.test(jdText)) {
      skills.push(s);
    }
  }
  return skills;
}

function extractJdExperience(jdText) {
  const expRegex = /(\d+)\+?\s*(?:years?|yrs?|years of exp)/i;
  const match = jdText.match(expRegex);
  if (match) return parseInt(match[1], 10);
  return 5;
}

function skillsComponent(candidateSkills, jdSkills) {
  if (!Array.isArray(jdSkills) || jdSkills.length === 0) return 0;
  const candSet = new Set((candidateSkills || []).map((s) => String(s).toLowerCase()));
  const matching = jdSkills.filter((s) => candSet.has(String(s).toLowerCase())).length;
  return Math.round((matching / jdSkills.length) * 100);
}

function experienceComponent(candidate, targetExp) {
  const years = Number(candidate.experience) || 0;
  const target = Math.max(1, Number(targetExp) || 5);
  if (years >= target) return 100;
  return Math.round((years / target) * 100);
}

/**
 * Education component — a small heuristic.
 * - 100: any mention of PhD / Doctorate / Master / MBA in summary or role.
 * - 80:  has structured education rows OR mentions Bachelor / B.S. / B.Tech.
 * - 40:  nothing parseable (baseline credit for being a real candidate).
 */
function educationComponent(candidate) {
  const fullText = `${candidate.summary || ""} ${candidate.role || ""}`.toLowerCase();
  if (/\b(phd|doctorate|master|m\.s\.|m\.a\.|mba)\b/i.test(fullText)) return 100;
  if (/\b(bachelor|b\.s\.|b\.a\.|b\.tech|undergraduate)\b/i.test(fullText)) return 80;

  let hasStructuredEdu = false;
  const ed = candidate.education;
  if (Array.isArray(ed) && ed.length > 0) {
    hasStructuredEdu = ed.some(
      (e) => (e && (e.institution || e.degree || e.field_of_study || e.fieldOfStudy))
    );
  } else if (typeof ed === "string") {
    try {
      const parsed = JSON.parse(ed);
      hasStructuredEdu = Array.isArray(parsed) && parsed.length > 0;
    } catch (_) { /* not JSON */ }
  }
  return hasStructuredEdu ? 80 : 40;
}

/**
 * Score one candidate.
 * @param {object} input
 * @param {object} input.candidate        candidate row + skills + raw_text
 * @param {string} input.jdText           full job description text
 * @param {string[]} input.jdSkills       required skills
 * @param {number} input.targetExp        years of experience required
 * @param {string[]} input.candidateSkills
 * @param {number|null} input.semanticScore  0-100, or null if unavailable
 * @returns {object}
 */
function scoreCandidateV2(input) {
  const candidate = input.candidate;
  const jdText = input.jdText;
  const jdSkills = input.jdSkills || [];
  const candidateSkills = input.candidateSkills || candidate.skills || [];
  const targetExp = input.targetExp;
  const semanticScore = typeof input.semanticScore === "number" ? input.semanticScore : null;
  const hasSemantic = semanticScore != null;

  const skill = skillsComponent(candidateSkills, jdSkills);
  const exp = experienceComponent(candidate, targetExp);
  const edu = educationComponent(candidate);

  const weights = hasSemantic
    ? { semantic: 0.5, skills: 0.2, experience: 0.2, education: 0.1 }
    : { semantic: 0, skills: 0.4, experience: 0.4, education: 0.2 };

  const semantic = hasSemantic ? semanticScore : 0;
  const overall = Math.round(
    semantic * weights.semantic +
    skill * weights.skills +
    exp * weights.experience +
    edu * weights.education
  );

  const candSet = new Set(candidateSkills.map((s) => String(s).toLowerCase()));
  const matchingSkills = jdSkills.filter((s) => candSet.has(String(s).toLowerCase()));
  const missingSkills = jdSkills.filter((s) => !candSet.has(String(s).toLowerCase()));

  console.log(`[scoring] v2 candidate=${candidate.id} name="${candidate.name}" semantic=${hasSemantic ? semanticScore : "n/a"} skills=${skill} exp=${exp} edu=${edu} -> total=${overall}`);

  return {
    score: overall,
    components: { semantic, skills: skill, experience: exp, education: edu },
    weights,
    algorithmVersion: "v2",
    matchingSkills,
    missingSkills,
    breakdown: [
      {
        label: "Semantic match (AI)",
        value: hasSemantic ? semantic : "n/a",
        weight: weights.semantic,
      },
      { label: "Skills match", value: skill, weight: weights.skills },
      { label: "Experience fit", value: exp, weight: weights.experience },
      { label: "Education", value: edu, weight: weights.education },
    ],
  };
}

/**
 * Compute and persist the v2 component scores into candidate_analysis
 * (UPSERT on UNIQUE(candidate_id, job_id)). Idempotent — re-runs overwrite.
 */
async function persistAnalysis(client, candidateId, jobId, evaluation) {
  const c = evaluation.components || {};
  await client.query(
    `INSERT INTO candidate_analysis
       (candidate_id, job_id, semantic_score, skill_score, experience_score,
        education_score, final_score, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (candidate_id, job_id) DO UPDATE
       SET semantic_score   = EXCLUDED.semantic_score,
           skill_score      = EXCLUDED.skill_score,
           experience_score = EXCLUDED.experience_score,
           education_score  = EXCLUDED.education_score,
           final_score      = EXCLUDED.final_score,
           updated_at       = NOW()`,
    [
      candidateId,
      jobId,
      c.semantic ?? null,
      c.skills ?? null,
      c.experience ?? null,
      c.education ?? null,
      evaluation.score,
    ]
  );
}

module.exports = {
  extractJdSkills,
  extractJdExperience,
  scoreCandidateV2,
  persistAnalysis,
};
