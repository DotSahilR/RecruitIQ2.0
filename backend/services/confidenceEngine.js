function scoreConfidence(candidate) {
  let score = 50;

  const profile = candidate.profile || {};
  const skills = candidate.skills || [];
  const careerHistory = candidate.career_history || [];
  const redrob = candidate.redrob_signals || {};

  const completeness = redrob.profile_completeness_score || 0;
  score += (completeness / 100) * 15;

  const hasSummary = (profile.summary || "").length > 0;
  const hasHeadline = (profile.headline || "").length > 0;
  const educationCount = (candidate.education || []).length;

  if (hasSummary) score += 5;
  if (hasHeadline) score += 3;

  const careerDepth = Math.min(careerHistory.length / 5, 1) * 10;
  score += careerDepth;

  const skillDepth = Math.min(skills.length / 15, 1) * 10;
  score += skillDepth;

  if (educationCount > 0) score += 5;

  // assessment availability
  const assessments = redrob.skill_assessment_scores || {};
  const assessmentKeys = Object.keys(assessments);
  if (assessmentKeys.length > 0) {
    score += Math.min(assessmentKeys.length / 5, 1) * 10;
  }

  const saves = redrob.saved_by_recruiters_30d || 0;
  const views = redrob.profile_views_received_30d || 0;
  if (saves > 0 && views > 0) {
    score += 5;
  }

  if (redrob.verified_email) score += 3;
  if (redrob.verified_phone) score += 2;

  const responseRate = redrob.recruiter_response_rate || 0;
  const interviewRate = redrob.interview_completion_rate || 0;
  if (responseRate > 0.5 && interviewRate > 0.5) {
    score += 5;
  }

  const certifications = candidate.certifications || [];
  if (certifications.length > 0) {
    score += 5;
  }

  const languages = candidate.languages || [];
  if (languages.length > 1) {
    score += 2;
  }

  return Math.min(Math.round(score), 100);
}

module.exports = { scoreConfidence };
