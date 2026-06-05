const { SKILLS_POOL } = require("./parserService");

const CORE_KEYWORDS = [
  "agile", "cicd", "docker", "git", "rest", "api", "scrum", 
  "scale", "performance", "architecture", "testing", "cloud",
  "microservices", "database", "ci/cd", "security", "optimization",
  "automation", "integration", "frontend", "backend", "full stack",
  "ai", "llm", "support", "deployment", "responsive", "monitoring"
];

/**
 * Extract skills required by a job description.
 */
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

/**
 * Extract target experience years from JD text (default is 5).
 */
function extractJdExperience(jdText) {
  const expRegex = /(\d+)\+?\s*(?:years?|yrs?|years of exp)/i;
  const match = jdText.match(expRegex);
  if (match) {
    return parseInt(match[1]);
  }
  return 5; // Default fallback target of 5 years
}

/**
 * Score a single candidate against a job specification.
 */
function scoreCandidate(candidate, resumeText, jdText, jdSkills, targetExp) {
  // 1. Skill Match Score (50%)
  const candidateSkillsSet = new Set(candidate.skills.map(s => s.toLowerCase()));
  const matchingSkills = jdSkills.filter(s => candidateSkillsSet.has(s.toLowerCase()));
  const missingSkills = jdSkills.filter(s => !candidateSkillsSet.has(s.toLowerCase()));
  
  const skillScore = jdSkills.length > 0
    ? Math.round((matchingSkills.length / jdSkills.length) * 100)
    : 0;

  // 2. Experience Fit Score (30%)
  // Candidates with >= targetExp get 100%. Others get a proportional score.
  const experienceScore = candidate.experience >= targetExp 
    ? 100 
    : Math.round((candidate.experience / targetExp) * 100);

  // 3. Keyword Match Score (20%)
  const jdKeywords = CORE_KEYWORDS.filter(k => jdText.toLowerCase().includes(k));
  const candidateKeywords = CORE_KEYWORDS.filter(k => resumeText.toLowerCase().includes(k) || candidate.skills.some(s => s.toLowerCase() === k));
  const matchingKeywords = candidateKeywords.filter(k => jdKeywords.includes(k));

  const keywordScore = jdKeywords.length > 0
    ? Math.round((matchingKeywords.length / jdKeywords.length) * 100)
    : 100;

  // Calculate Weighted Overall Score
  const overallScore = Math.round((skillScore * 0.5) + (experienceScore * 0.3) + (keywordScore * 0.2));

  const breakdown = [
    { label: "Skills match", value: skillScore },
    { label: "Experience fit", value: experienceScore },
    { label: "Keyword relevance", value: keywordScore }
  ];

  return {
    score: overallScore,
    matchingSkills,
    missingSkills,
    breakdown
  };
}

/**
 * Score and rank a list of candidates against a job description.
 */
function rankCandidates(candidatesList, jdText) {
  const jdSkills = extractJdSkills(jdText);
  const targetExp = extractJdExperience(jdText);
  console.log(`[scoring] rankCandidates v1 candidates=${candidatesList.length} jdSkills=${jdSkills.length} targetExp=${targetExp}y`);

  // Score each candidate
  const scored = candidatesList.map(cand => {
    const resumeText = cand.raw_text || `${cand.name} ${cand.role || ""} ${cand.summary || ""} ${cand.skills.join(" ")}`;

    const evaluation = scoreCandidate(cand, resumeText, jdText, jdSkills, targetExp);

    return {
      ...cand,
      ...evaluation
    };
  });

  // Sort by score in descending order
  scored.sort((a, b) => b.score - a.score);

  // Assign ranks
  const ranked = scored.map((cand, idx) => ({
    ...cand,
    rank: idx + 1
  }));
  console.log(`[scoring] rankCandidates v1 done top_score=${ranked[0]?.score || 0} bottom_score=${ranked[ranked.length - 1]?.score || 0}`);
  return ranked;
}

module.exports = {
  extractJdSkills,
  extractJdExperience,
  scoreCandidate,
  rankCandidates
};
