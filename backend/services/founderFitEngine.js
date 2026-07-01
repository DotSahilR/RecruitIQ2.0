const OWNERSHIP_KEYWORDS = [
  "built", "launched", "created", "owned", "designed", "led",
  "founded", "co-founded", "established", "spearheaded", "drove",
  "architected", "developed from scratch", "bootstrapped"
];

const PRODUCT_THINKING_KEYWORDS = [
  "marketplace", "recommendation", "matching", "search", "ranking",
  "platform", "product", "user experience", "ux", "user research",
  "a/b testing", "growth", "conversion", "retention", "engagement",
  "product-market fit", "customer", "pmf", "kpi", "metric"
];

const SCRAPPY_KEYWORDS = [
  "full stack", "fullstack", "cross-functional", "wore many hats",
  "end-to-end", "independent", "self-starter", "autonomous",
  "fast-paced", "lean", "agile", "iterative", "scrappy"
];

const FUNDING_KEYWORDS = [
  "raised", "funding", "series", "seed round", "venture",
  "investor", "investment", "yc", "accelerator", "incubator",
  "pitch", "pitched", "venture-backed", "bootstrapped"
];

const EXIT_KEYWORDS = [
  "acquired", "exit", "acquisition", "ipo", "went public",
  "sold the company", "merged", "liquidity"
];

const TEAM_BUILDING_KEYWORDS = [
  "hired", "built a team", "scaled the team", "managed",
  "mentored", "led a team", "team building", "recruited",
  "grew the team", "headcount", "managed a team of"
];

const BUSINESS_IMPACT_KEYWORDS = [
  "revenue", "arr", "mrr", "profit", "profitable", "unit economics",
  "p&l", "business development", "sales", "grew revenue",
  "cost reduction", "efficiency", "margin", "roi"
];

const QUANTIFIED_IMPACT_PATTERNS = [
  /\d+x\s*/i, /\d+%\s*(growth|increase|improve|reduction|lift)/i,
  /\d+[kKmMbB]\s*(users|customers|revenue|downloads)/i
];

function scoreCompanySize(str) {
  const s = String(str).trim();
  if (s === "1-10") return 100;
  if (s === "11-50" || s === "1-50") return 95;
  if (s === "51-200") return 80;
  if (s === "201-500" || s === "501-1000") return 40;
  if (s === "1001-5000" || s === "5001-10000" || s === "10001+") return 10;
  if (/^\d+-\d+$/.test(s)) {
    const maxVal = parseInt(s.split("-")[1]);
    if (maxVal <= 10) return 100;
    if (maxVal <= 50) return 95;
    if (maxVal <= 200) return 80;
    if (maxVal <= 1000) return 40;
    return 10;
  }
  return 50;
}

function isSmallCompany(size) {
  const s = String(size).trim();
  if (s === "1-10" || s === "11-50" || s === "1-50" || s === "51-200") return true;
  if (/^\d+-\d+$/.test(s)) {
    const maxVal = parseInt(s.split("-")[1]);
    return maxVal <= 200;
  }
  return false;
}

function scoreFounderFit(candidate) {
  const reasons = [];
  let score = 0;

  const profile = candidate.profile || {};
  const careerHistory = candidate.career_history || [];
  const skills = candidate.skills || [];

  const allDescriptions = careerHistory.map(h => (h.description || "").toLowerCase());
  const allText = allDescriptions.join(" ");
  const allTitles = careerHistory.map(h => (h.title || "").toLowerCase()).join(" ");
  const allCombined = allText + " " + allTitles;

  const companySizes = careerHistory.map(h => h.company_size).filter(Boolean);
  const titleLower = careerHistory.map(h => (h.title || "").toLowerCase());

  const hasSeniorOrLeadTitle = titleLower.some(t =>
    t.includes("senior") || t.includes("lead") || t.includes("principal") ||
    t.includes("staff") || t.includes("head") || t.includes("architect")
  );

  const hasMlEngineerTitle = titleLower.some(t =>
    t.includes("ml engineer") || t.includes("machine learning") ||
    t.includes("data scientist") || t.includes("applied scientist")
  );

  let startupScore = 0;

  let smallCompanyCount = 0;
  let smallCompanyRatio = 0;
  if (companySizes.length > 0) {
    const sizeScores = companySizes.map(s => scoreCompanySize(s));
    startupScore = sizeScores.reduce((a, b) => a + b, 0) / sizeScores.length;

    smallCompanyCount = companySizes.filter(s => isSmallCompany(s)).length;
    smallCompanyRatio = smallCompanyCount / companySizes.length;

    if (smallCompanyCount >= 3 && smallCompanyRatio >= 0.5) {
      startupScore = Math.min(startupScore + 25, 100);
    } else if (smallCompanyCount >= 2) {
      startupScore = Math.min(startupScore + 15, 100);
    } else if (smallCompanyCount >= 1 && smallCompanyRatio >= 0.5) {
      startupScore = Math.min(startupScore + 5, 100);
    }
  }

  const hasStartupMentions = allCombined.includes("startup") ||
    allCombined.includes("venture") || allCombined.includes("seed") ||
    allCombined.includes("early-stage");
  if (hasStartupMentions) {
    startupScore = Math.max(startupScore, 60);
    if (companySizes.length > 0 && smallCompanyRatio >= 0.3) {
      startupScore = Math.min(startupScore + 10, 100);
    }
  }

  if (hasSeniorOrLeadTitle && hasMlEngineerTitle) {
    const atSmall = companySizes.some(s => isSmallCompany(s));
    if (atSmall) {
      startupScore = Math.max(startupScore, 65);
    }
  }

  score += startupScore * 0.35;
  if (startupScore >= 75) {
    reasons.push("Substantial early-stage or startup experience across multiple roles");
  } else if (startupScore >= 55) {
    reasons.push("Significant small-company or startup exposure");
  } else if (startupScore >= 40) {
    reasons.push("Some startup or small-company experience");
  }

  let ownershipScore = 0;
  const ownershipMatches = OWNERSHIP_KEYWORDS.filter(k => allCombined.includes(k));
  ownershipScore = Math.min((ownershipMatches.length / 4) * 100, 100);
  score += ownershipScore * 0.25;
  if (ownershipMatches.length >= 4) {
    reasons.push("Strong ownership language and initiative throughout career");
  } else if (ownershipMatches.length >= 2) {
    reasons.push("Demonstrates ownership and initiative");
  }

  let productScore = 0;
  const productMatches = PRODUCT_THINKING_KEYWORDS.filter(k => allCombined.includes(k));
  productScore = Math.min((productMatches.length / 4) * 100, 100);
  score += productScore * 0.20;
  if (productMatches.length >= 4) {
    reasons.push("Strong product and user-centric mindset");
  } else if (productMatches.length >= 2) {
    reasons.push("Product-aware with user focus");
  }

  let scrappyScore = 0;
  const scrappyMatches = SCRAPPY_KEYWORDS.filter(k => allCombined.includes(k));
  scrappyScore = Math.min((scrappyMatches.length / 3) * 100, 100);
  score += scrappyScore * 0.15;

  let journeySignals = 0;
  const fundingMatches = FUNDING_KEYWORDS.filter(k => allCombined.includes(k));
  if (fundingMatches.length >= 2) journeySignals += 25;
  else if (fundingMatches.length >= 1) journeySignals += 15;

  const exitMatches = EXIT_KEYWORDS.filter(k => allCombined.includes(k));
  if (exitMatches.length >= 1) journeySignals += 20;

  const teamMatches = TEAM_BUILDING_KEYWORDS.filter(k => allCombined.includes(k));
  if (teamMatches.length >= 3) journeySignals += 30;
  else if (teamMatches.length >= 1) journeySignals += 15;

  const businessMatches = BUSINESS_IMPACT_KEYWORDS.filter(k => allText.includes(k));
  if (businessMatches.length >= 2) journeySignals += 25;
  else if (businessMatches.length >= 1) journeySignals += 15;

  const journeyScore = Math.min(journeySignals, 100);
  score += journeyScore * 0.05;

  if (teamMatches.length >= 2) {
    reasons.push("Built and led teams");
  }
  if (fundingMatches.length >= 2) {
    reasons.push("Experience with fundraising or investor process");
  }

  let mentalityBonus = 0;

  if (companySizes.filter(s => isSmallCompany(s)).length >= 2 && hasSeniorOrLeadTitle) {
    mentalityBonus += 8;
  }

  if (ownershipMatches.length >= 3 && hasStartupMentions) {
    mentalityBonus += 5;
  }

  const uniqueRoles = new Set(careerHistory.map(h => h.title));
  if (productMatches.length >= 3 && uniqueRoles.size >= 3) {
    mentalityBonus += 5;
  }

  // Quantified impact
  const hasQuantifiedImpact = QUANTIFIED_IMPACT_PATTERNS.some(p => p.test(allText));
  if (hasQuantifiedImpact) {
    mentalityBonus += 3;
  }

  score += Math.min(mentalityBonus, 15);

  if (mentalityBonus >= 10) {
    reasons.push("Exhibits founder-like ownership and breadth across roles");
  }

  const finalScore = Math.min(Math.round(score), 100);

  return {
    score: finalScore,
    reasons: reasons.length > 0 ? reasons : ["Limited founder/startup fit signals"]
  };
}

module.exports = { scoreFounderFit };
