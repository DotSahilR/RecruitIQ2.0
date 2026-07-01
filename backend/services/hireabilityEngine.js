function scoreHireability(candidate, jdSignals) {
  const reasons = [];
  let score = 20;

  const profile = candidate.profile || {};
  const redrob = candidate.redrob_signals || {};
  const careerHistory = candidate.career_history || [];

  const openToWork = redrob.open_to_work_flag;
  if (openToWork === true) {
    score += 25;
    reasons.push("Actively open to work");
  } else if (openToWork === false) {
    score -= 5;
    reasons.push("Not currently open to work");
  } else {
    score += 10;
  }

  if (redrob.last_active_date) {
    const lastActive = new Date(redrob.last_active_date);
    const now = new Date();
    const daysSinceActive = (now - lastActive) / (1000 * 60 * 60 * 24);
    if (daysSinceActive < 7) {
      score += 18;
      reasons.push("Active within the week");
    } else if (daysSinceActive < 30) {
      score += 12;
      reasons.push("Recently active on platform");
    } else if (daysSinceActive < 90) {
      score += 5;
      reasons.push("Active within 3 months");
    } else {
      score -= 8;
      reasons.push("Not recently active on platform");
    }
  }

  const responseRate = redrob.recruiter_response_rate;
  if (responseRate !== null && responseRate !== undefined) {
    if (responseRate >= 0.8) {
      score += 15;
      reasons.push("High recruiter response rate");
    } else if (responseRate >= 0.6) {
      score += 10;
    } else if (responseRate >= 0.3) {
      score += 5;
    } else {
      score -= 5;
      reasons.push("Low recruiter response rate");
    }
  }

  const interviewRate = redrob.interview_completion_rate;
  if (interviewRate !== null && interviewRate !== undefined) {
    if (interviewRate >= 0.8) {
      score += 12;
      reasons.push("High interview completion rate");
    } else if (interviewRate >= 0.5) {
      score += 6;
    } else {
      score -= 5;
      reasons.push("Low interview completion rate");
    }
  }

  const offerRate = redrob.offer_acceptance_rate;
  if (offerRate !== null && offerRate !== undefined && offerRate >= 0) {
    if (offerRate >= 0.8) {
      score += 10;
      reasons.push("High offer acceptance rate");
    } else if (offerRate >= 0.5) {
      score += 5;
    } else {
      score -= 5;
    }
  }

  const noticePeriod = redrob.notice_period_days;
  if (noticePeriod !== null && noticePeriod !== undefined) {
    if (noticePeriod <= 15) {
      score += 25;
      reasons.push("Available within 2 weeks");
    } else if (noticePeriod <= 30) {
      score += 20;
      reasons.push("Available within 30 days");
    } else if (noticePeriod <= 45) {
      score += 10;
      reasons.push("Available within 45 days");
    } else if (noticePeriod <= 60) {
      score += 5;
      reasons.push("Available within 60 days");
    } else if (noticePeriod <= 90) {
      score += 0;
      reasons.push(`Notice period of ${noticePeriod} days`);
    } else {
      score -= 15;
      reasons.push(`Long notice period (${noticePeriod} days)`);
    }
  }

  if (redrob.willing_to_relocate === true) {
    score += 5;
    reasons.push("Willing to relocate");
  }

  const tenureMonths = [];
  for (const h of careerHistory) {
    if (h.start_date && h.end_date) {
      const start = new Date(h.start_date);
      const end = h.is_current ? new Date() : new Date(h.end_date);
      const months = (end - start) / (1000 * 60 * 60 * 24 * 30.44);
      if (months >= 3) tenureMonths.push(months);
    }
  }
  if (tenureMonths.length > 0) {
    const avgTenure = tenureMonths.reduce((a, b) => a + b, 0) / tenureMonths.length;
    const avgTenureYears = avgTenure / 12;
    if (avgTenureYears >= 3) {
      score += 10;
      reasons.push(`Stable career history (avg ${Math.round(avgTenureYears * 10) / 10}yr tenure)`);
    } else if (avgTenureYears >= 1.5) {
      score += 5;
    } else if (avgTenureYears < 0.8 && tenureMonths.length >= 3) {
      score -= 8;
      reasons.push("Job-hopping pattern detected");
    }
  }

  const sortedRoles = careerHistory
    .filter(h => h.start_date && h.end_date && !h.is_current)
    .sort((a, b) => new Date(b.end_date) - new Date(a.end_date));
  for (let i = 0; i < sortedRoles.length - 1; i++) {
    const gap = (new Date(sortedRoles[i].start_date) - new Date(sortedRoles[i + 1].end_date)) / (1000 * 60 * 60 * 24);
    if (gap > 180) {
      score -= 5;
      if (i === 0) reasons.push("Recent employment gap detected");
    }
  }

  const saves = redrob.saved_by_recruiters_30d || 0;
  const views = redrob.profile_views_received_30d || 0;
  const searches = redrob.search_appearance_30d || 0;

  if (saves > 10) {
    score += 5;
    reasons.push(`High recruiter demand (saved ${saves}x)`);
  } else if (saves > 3) {
    score += 3;
  }
  if (views > 50) {
    score += 3;
  } else if (views > 15) {
    score += 1;
  }
  if (searches > 20) {
    score += 2;
  }

  return {
    score: Math.max(0, Math.min(Math.round(score), 100)),
    reasons
  };
}

module.exports = { scoreHireability };
