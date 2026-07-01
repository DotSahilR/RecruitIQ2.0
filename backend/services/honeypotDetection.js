function detectHoneypot(candidate) {
  const reasons = [];
  let suspicionScore = 0;

  const careerHistory = candidate.career_history || [];
  const skills = candidate.skills || [];
  const profile = candidate.profile || {};

  for (let i = 0; i < careerHistory.length; i++) {
    for (let j = i + 1; j < careerHistory.length; j++) {
      const a = careerHistory[i];
      const b = careerHistory[j];
      if (a.start_date && b.start_date && a.end_date && b.end_date) {
        const aStart = new Date(a.start_date);
        const aEnd = new Date(a.end_date);
        const bStart = new Date(b.start_date);
        const bEnd = new Date(b.end_date);

        if (aStart <= bEnd && bStart <= aEnd) {
          // Overlapping is OK if one is current
          if (!a.is_current && !b.is_current) {
            suspicionScore += 15;
            reasons.push(`Overlapping non-current roles: ${a.title} at ${a.company} and ${b.title} at ${b.company}`);
          }
        }
      }
    }
  }

  const totalExpYears = profile.years_of_experience || 0;
  for (const skill of skills) {
    const skillMonths = skill.duration_months || 0;
    if (skillMonths > 0 && totalExpYears > 0) {
      if (skillMonths / 12 > totalExpYears + 2) {
        suspicionScore += 10;
        reasons.push(`Skill "${skill.name}" duration (${Math.round(skillMonths / 12)}yrs) exceeds total experience (${totalExpYears}yrs)`);
      }
    }
  }

  const titleLevels = ["intern", "junior", "associate", "senior", "lead", "principal", "director", "vp", "chief", "ceo", "cto"];
  let highestLevelIdx = -1;
  for (const role of careerHistory) {
    const title = (role.title || "").toLowerCase();
    let levelIdx = -1;
    for (let i = 0; i < titleLevels.length; i++) {
      if (title.includes(titleLevels[i])) {
        levelIdx = Math.max(levelIdx, i);
      }
    }
    if (levelIdx >= 0) {
      if (levelIdx < highestLevelIdx - 1) {
        suspicionScore += 8;
        reasons.push(`Unrealistic career regression: going from higher to lower seniority (${role.title})`);
      }
      highestLevelIdx = Math.max(highestLevelIdx, levelIdx);
    }
  }

  const skillNames = skills.map(s => s.name.toLowerCase());
  const contradictoryPairs = [
    ["entry level", "architect"],
    ["fresher", "senior"],
    ["intern", "manager"]
  ];
  for (const [a, b] of contradictoryPairs) {
    if (skillNames.some(s => s.includes(a)) && skillNames.some(s => s.includes(b))) {
      suspicionScore += 5;
      reasons.push(`Contradictory skill levels: "${a}" and "${b}"`);
    }
  }

  if (totalExpYears > 30 && careerHistory.length < 3) {
    suspicionScore += 10;
    reasons.push(`Unrealistic experience (${totalExpYears}yrs) with only ${careerHistory.length} roles`);
  }

  const expertSkills = skills.filter(s => s.proficiency === "expert");
  if (expertSkills.length > 15) {
    suspicionScore += 5;
    reasons.push(`Too many expert-level skills (${expertSkills.length})`);
  }

  if (careerHistory.length >= 5 && totalExpYears > 0) {
    const yearsPerRole = totalExpYears / careerHistory.length;
    if (yearsPerRole < 0.5) {
      suspicionScore += 8;
      reasons.push(`Suspicious job-hopping: ${careerHistory.length} roles in ${totalExpYears} years`);
    }
  }

  if (careerHistory.length >= 2 && totalExpYears < 5) {
    const hasJunior = careerHistory.some(h => (h.title || "").toLowerCase().includes("intern") || (h.title || "").toLowerCase().includes("junior"));
    const hasSenior = careerHistory.some(h => (h.title || "").toLowerCase().includes("senior") || (h.title || "").toLowerCase().includes("lead") || (h.title || "").toLowerCase().includes("principal"));
    const hasExecutive = careerHistory.some(h => (h.title || "").toLowerCase().includes("vp") || (h.title || "").toLowerCase().includes("director") || (h.title || "").toLowerCase().includes("chief") || (h.title || "").toLowerCase().includes("cto"));
    if (hasJunior && hasExecutive && totalExpYears < 4) {
      suspicionScore += 10;
      reasons.push(`Unrealistic career progression: intern/junior to executive in ${totalExpYears} years`);
    }
    if (hasJunior && hasSenior && totalExpYears < 2) {
      suspicionScore += 5;
    }
  }

  const isSuspicious = suspicionScore >= 20;

  return {
    isSuspicious,
    confidence: Math.min(suspicionScore, 100) / 100,
    reasons,
    suspicionScore
  };
}

module.exports = { detectHoneypot };
