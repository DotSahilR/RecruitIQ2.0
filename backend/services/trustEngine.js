function scoreTrust(candidate) {
  const reasons = [];
  let score = 40;

  const profile = candidate.profile || {};
  const skills = candidate.skills || [];
  const careerHistory = candidate.career_history || [];
  const education = candidate.education || [];
  const certifications = candidate.certifications || [];
  const redrob = candidate.redrob_signals || {};

  const careerText = careerHistory.map(h => (h.description || "").toLowerCase()).join(" ");
  const careerTitles = careerHistory.map(h => (h.title || "").toLowerCase()).join(" ");
  const allEvidence = careerText + " " + careerTitles;

  let evidenceScore = 0;
  let evidenceCount = 0;
  let contradictionCount = 0;
  for (const skill of skills) {
    const skillName = skill.name.toLowerCase();
    const hasEvidence = allEvidence.includes(skillName) || allEvidence.includes(skillName.replace(" ", ""));
    if (hasEvidence) {
      evidenceCount++;
    }
  }
  const evidenceRatio = skills.length > 0 ? evidenceCount / skills.length : 0;
  evidenceScore = evidenceRatio * 100;
  score += evidenceScore * 0.40;

  if (evidenceRatio >= 0.7) {
    reasons.push(`Strong career evidence supporting ${Math.round(evidenceRatio * 100)}% of claimed skills`);
  } else if (evidenceRatio >= 0.4) {
    reasons.push(`Moderate career evidence for claimed skills`);
  } else {
    reasons.push(`Limited career evidence for claimed skills`);
  }

  const assessmentScores = redrob.skill_assessment_scores || {};
  if (Object.keys(assessmentScores).length > 0) {
    const scores = Object.values(assessmentScores);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const assessmentCredit = (avgScore / 100) * 15;
    score += assessmentCredit;
    if (avgScore >= 70) {
      reasons.push(`Verified skills via assessments (avg ${Math.round(avgScore)}%)`);
    }
  }
  if (certifications.length > 0) {
    const certBonus = Math.min(certifications.length * 2, 8);
    score += certBonus;
    if (certifications.length >= 2) {
      reasons.push(`${certifications.length} professional certifications`);
    }
  }

  let consistencyDeduction = 0;

  if (!profile.summary && skills.length > 5) {
    consistencyDeduction += 5;
    reasons.push("No profile summary despite listing many skills");
  }

  const eduFields = education.map(e => (e.field_of_study || "").toLowerCase()).join(" ");
  const techFields = ["computer science", "engineering", "mathematics", "physics", "statistics", "data science", "information technology"];
  const hasRelevantEdu = techFields.some(f => eduFields.includes(f));
  if (!hasRelevantEdu && education.length > 0) {
    consistencyDeduction += 3;
  }

  if (careerHistory.length >= 2) {
    for (let i = 1; i < careerHistory.length; i++) {
      const prevEnd = careerHistory[i - 1].end_date;
      const currStart = careerHistory[i].start_date;
      if (prevEnd && currStart) {
        const gap = (new Date(currStart) - new Date(prevEnd)) / (1000 * 60 * 60 * 24 * 365);
        if (gap > 1.5 && !careerHistory[i - 1].is_current) {
          consistencyDeduction += 3;
          reasons.push(`Employment gap of ${Math.round(gap * 10) / 10} years`);
        }
      }
    }
  }

  const allTitles = careerTitles;
  const hasSeniorTitle = allTitles.includes("senior") || allTitles.includes("lead") || allTitles.includes("principal");
  const hasManagementTitle = allTitles.includes("manager") || allTitles.includes("head") || allTitles.includes("director");
  if (hasSeniorTitle && careerHistory.length < 2) {
    consistencyDeduction += 3;
    reasons.push("Senior title with minimal career history");
  }

  score -= consistencyDeduction;

  const saves = redrob.saved_by_recruiters_30d || 0;
  const searches = redrob.search_appearance_30d || 0;
  const views = redrob.profile_views_received_30d || 0;

  if (saves > 20) {
    score += 12;
    reasons.push(`High recruiter demand (saved ${saves}x in 30d)`);
  } else if (saves > 10) {
    score += 8;
    reasons.push(`Strong recruiter interest (saved ${saves}x)`);
  } else if (saves > 3) {
    score += 4;
  }

  if (searches > 20) {
    score += 5;
    reasons.push(`Frequently appears in searches (${searches}x)`);
  } else if (searches > 5) {
    score += 2;
  }

  if (views > 50) {
    score += 3;
  } else if (views > 20) {
    score += 1;
  }

  // Profile completeness bonus
  const completeness = redrob.profile_completeness_score || 0;
  if (completeness > 80) {
    score += 3;
    reasons.push("High profile completeness");
  }

  return {
    score: Math.max(0, Math.min(Math.round(score), 100)),
    reasons
  };
}

module.exports = { scoreTrust };
