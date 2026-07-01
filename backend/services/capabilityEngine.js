const { cosineSimilarity } = require("./embeddingService");

const PRODUCTION_KEYWORDS = [
  "production", "deployed", "monitoring", "inference", "serving",
  "evaluation", "a/b testing", "scale", "live", "launched",
  "ci/cd", "deployment", "kubernetes", "docker", "microservices",
  "api", "rest", "graphql", "database", "pipeline", "mlops"
];

const CAREER_LEVELS = [
  "intern", "junior", "associate", "senior", "lead", "principal",
  "staff", "distinguished", "fellow", "director", "vp", "chief",
  "cto", "ceo"
];

function scoreCapability(candidate, jdEmbedding, jdSignals) {
  const reasons = [];
  let score = 0;
  const maxScore = 100;

  const profile = candidate.profile || {};
  const skills = candidate.skills || [];
  const careerHistory = candidate.career_history || [];
  const candidateEmbedding = candidate.embedding;
  const redrob = candidate.redrob_signals || {};
  const assessmentScores = redrob.skill_assessment_scores || {};

  let semanticScore = 0;
  if (candidateEmbedding && jdEmbedding) {
    const similarity = cosineSimilarity(candidateEmbedding, jdEmbedding);
    semanticScore = Math.max(0, (similarity + 1) / 2) * 100;
  }
  score += semanticScore * 0.4;
  if (semanticScore > 70) {
    reasons.push(`Strong semantic match (${Math.round(semanticScore)}%) with job requirements`);
  } else if (semanticScore > 40) {
    reasons.push(`Moderate semantic match (${Math.round(semanticScore)}%) with job requirements`);
  } else {
    reasons.push(`Weak semantic match (${Math.round(semanticScore)}%) with job requirements`);
  }

  const jdTechSignals = (jdSignals?.technicalSignals || []).map(s => s.toLowerCase());
  const candidateSkillNames = skills.map(s => s.name.toLowerCase());
  let matchedSkills = 0;
  for (const required of jdTechSignals) {
    if (candidateSkillNames.some(s => s.includes(required) || required.includes(s))) {
      matchedSkills++;
    }
  }
  const skillMatchRatio = jdTechSignals.length > 0 ? matchedSkills / jdTechSignals.length : 0;
  const skillScore = skillMatchRatio * 100;
  score += skillScore * 0.25;
  if (skillMatchRatio > 0.5) {
    reasons.push(`Matches ${matchedSkills}/${jdTechSignals.length} required technical skills`);
  } else {
    reasons.push(`Matches only ${matchedSkills}/${jdTechSignals.length} required technical skills`);
  }

  const allText = [
    profile.summary || "",
    ...careerHistory.map(h => h.description || "")
  ].join(" ").toLowerCase();
  const prodMatches = PRODUCTION_KEYWORDS.filter(k => allText.includes(k));
  const prodScore = Math.min((prodMatches.length / 5) * 100, 100);
  score += prodScore * 0.15;
  if (prodMatches.length >= 3) {
    reasons.push(`Strong production experience (${prodMatches.length} signals detected)`);
  } else if (prodMatches.length > 0) {
    reasons.push(`Some production experience (${prodMatches.length} signals)`);
  } else {
    reasons.push(`No production experience signals detected`);
  }

  let progressionScore = 50;
  if (careerHistory.length >= 2) {
    let levels = careerHistory.map(h => {
      const title = (h.title || "").toLowerCase();
      for (let i = 0; i < CAREER_LEVELS.length; i++) {
        if (title.includes(CAREER_LEVELS[i])) return i;
      }
      return -1;
    }).filter(l => l >= 0);

    if (levels.length >= 2) {
      let progressed = 0;
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] > levels[i - 1]) progressed++;
      }
      progressionScore = Math.min(50 + (progressed / (levels.length - 1)) * 50, 100);
    }
  }
  score += progressionScore * 0.10;
  if (progressionScore > 70) {
    reasons.push(`Strong career progression trajectory`);
  }

  let assessmentScore = 50;
  if (Object.keys(assessmentScores).length > 0) {
    const scores = Object.values(assessmentScores);
    const avgAssessment = scores.reduce((a, b) => a + b, 0) / scores.length;
    assessmentScore = avgAssessment;
    reasons.push(`Assessment scores available (avg: ${Math.round(avgAssessment)})`);
  }
  score += assessmentScore * 0.10;

  // Years experience bonus
  const expYears = profile.years_of_experience || 0;
  if (expYears >= 3 && expYears <= 15) {
    score += 5;
  }

  return {
    score: Math.min(Math.round(score), 100),
    reasons
  };
}

module.exports = { scoreCapability };
