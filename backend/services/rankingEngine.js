const pool = require("../db");
const honeypotDetection = require("./honeypotDetection");
const capabilityEngine = require("./capabilityEngine");
const founderFitEngine = require("./founderFitEngine");
const hireabilityEngine = require("./hireabilityEngine");
const trustEngine = require("./trustEngine");
const confidenceEngine = require("./confidenceEngine");

const CHUNK_SIZE = 1000;

async function rankCandidates(jdId, weights) {
  weights = weights || { capability: 40, founderFit: 20, hireability: 20, trust: 15 };

  const jdResult = await pool.query("SELECT * FROM jd_analyses WHERE id = $1", [jdId]);
  if (jdResult.rows.length === 0) throw new Error("JD analysis not found");
  const jd = jdResult.rows[0];
  const jdEmbedding = jd.embedding;

  const jdSignals = {
    technicalSignals: jd.technical_signals || [],
    founderSignals: jd.founder_signals || [],
    hireabilitySignals: jd.hireability_signals || [],
    negativeSignals: jd.negative_signals || []
  };

  const totalResult = await pool.query("SELECT COUNT(*) as c FROM candidates");
  const totalCandidates = parseInt(totalResult.rows[0].c);
  console.log(`Ranking ${totalCandidates} candidates...`);

  let honeypotCount = 0;
  let scoredCount = 0;
  const allScores = [];
  const totalWeight = weights.capability + weights.founderFit + weights.hireability + weights.trust;

  for (let offset = 0; offset < totalCandidates; offset += CHUNK_SIZE) {
    const chunk = await pool.query(
      "SELECT id, candidate_id, profile, skills, career_history, education, certifications, languages, redrob_signals, embedding FROM candidates ORDER BY id LIMIT $1 OFFSET $2",
      [CHUNK_SIZE, offset]
    );

    for (const candidate of chunk.rows) {
      const honeypot = honeypotDetection.detectHoneypot(candidate);
      const isHoneypot = honeypot.isSuspicious;
      if (isHoneypot) honeypotCount++;

      const capability = capabilityEngine.scoreCapability(candidate, jdEmbedding, jdSignals);
      const founderFit = founderFitEngine.scoreFounderFit(candidate);
      const hireability = hireabilityEngine.scoreHireability(candidate, jdSignals);
      const trust = trustEngine.scoreTrust(candidate);

      const penalized = isHoneypot ? 0.1 : 1.0;
      const overallScore = (
        capability.score * (weights.capability / totalWeight) +
        founderFit.score * (weights.founderFit / totalWeight) +
        hireability.score * (weights.hireability / totalWeight) +
        trust.score * (weights.trust / totalWeight)
      ) * penalized;

      const confidence = confidenceEngine.scoreConfidence(candidate);

      const features = {
        capability: { score: capability.score, reasons: capability.reasons },
        founderFit: { score: founderFit.score, reasons: founderFit.reasons },
        hireability: { score: hireability.score, reasons: hireability.reasons },
        trust: { score: trust.score, reasons: trust.reasons }
      };

      allScores.push({
        id: candidate.id,
        candidate_id: candidate.candidate_id,
        is_honeypot: isHoneypot,
        honeypot_confidence: honeypot.confidence,
        honeypot_reasons: honeypot.reasons,
        capability_score: capability.score,
        founder_fit_score: founderFit.score,
        hireability_score: hireability.score,
        trust_score: trust.score,
        overall_score: Math.round(overallScore * 100) / 100,
        confidence_score: confidence,
        features
      });

      scoredCount++;
    }

    process.stdout.write(`\rScored ${scoredCount}/${totalCandidates}...`);
  }
  process.stdout.write("\n");

  console.log("Writing scores to database...");
  const updateClient = await pool.connect();
  try {
    await updateClient.query("BEGIN");
    for (let i = 0; i < allScores.length; i += 100) {
      const batch = allScores.slice(i, i + 100);
      for (const s of batch) {
        await updateClient.query(
          `UPDATE candidates SET is_honeypot=$1, honeypot_confidence=$2,
           honeypot_reasons=$3, capability_score=$4,
           founder_fit_score=$5, hireability_score=$6, trust_score=$7, overall_score=$8,
           confidence_score=$9, rank=0, reasoning=NULL, features=$10 WHERE id=$11`,
          [s.is_honeypot, s.honeypot_confidence,
           JSON.stringify(s.honeypot_reasons || []), s.capability_score,
           s.founder_fit_score, s.hireability_score, s.trust_score,
           s.overall_score, s.confidence_score,
           JSON.stringify(s.features || {}), s.id]
        );
      }
    }
    await updateClient.query("COMMIT");
  } catch (err) {
    await updateClient.query("ROLLBACK");
    console.error("Score update error:", err.message);
    throw err;
  } finally {
    updateClient.release();
  }

  const nonHoneypot = allScores.filter(s => !s.is_honeypot)
    .sort((a, b) => b.overall_score - a.overall_score);

  const rankClient = await pool.connect();
  try {
    await rankClient.query("BEGIN");
    for (let i = 0; i < nonHoneypot.length; i += 100) {
      const batch = nonHoneypot.slice(i, i + 100);
      const cases = batch.map((s, j) => `WHEN ${s.id} THEN ${i + j + 1}`).join(" ");
      const ids = batch.map(s => s.id).join(",");
      await rankClient.query(`UPDATE candidates SET rank = CASE id ${cases} END WHERE id IN (${ids})`);
    }
    await rankClient.query("COMMIT");
  } catch (err) {
    await rankClient.query("ROLLBACK");
    console.error("Rank update error:", err.message);
  } finally {
    rankClient.release();
  }

  const topExplained = nonHoneypot.slice(0, 500);
  const explainClient = await pool.connect();
  try {
    await explainClient.query("BEGIN");
    for (const s of topExplained) {
      const reasoning = generateReasoning(s);
      await explainClient.query("UPDATE candidates SET reasoning=$1 WHERE id=$2", [reasoning, s.id]);
    }
    await explainClient.query("COMMIT");
  } catch (err) {
    await explainClient.query("ROLLBACK");
  } finally {
    explainClient.release();
  }

  const session = await pool.query(
    `INSERT INTO ranking_sessions (jd_id, jd_title, weights, candidate_count, top_score)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [jdId, jd.title || "Untitled JD", JSON.stringify(weights), totalCandidates, nonHoneypot[0]?.overall_score || 0]
  );

  console.log(`Ranking complete. ${honeypotCount} honeypots. Top score: ${nonHoneypot[0]?.overall_score}`);

  return {
    sessionId: session.rows[0].id,
    totalCandidates,
    honeypotCount,
    topScore: nonHoneypot[0]?.overall_score || 0,
    topCandidates: topExplained.map(s => ({
      candidate_id: s.candidate_id,
      rank: nonHoneypot.indexOf(s) + 1,
      score: s.overall_score,
      reasoning: generateReasoning(s)
    }))
  };
}

const EXPLANATION_TEMPLATES = {
  capabilityHigh: [
    "This candidate's technical profile aligns well with the role requirements, showing relevant depth in the needed skill areas",
    "Direct experience in the core technical domains sought for this position, with demonstrated proficiency in key areas",
    "Strong technical foundation matching what this role demands, with practical experience applying relevant technologies"
  ],
  capabilityVeryHigh: [
    "Exceptional technical match — the candidate's skill profile closely mirrors the core requirements of this role, with depth across multiple relevant areas",
    "Outstanding technical alignment: hands-on experience with the exact technology stack and methodologies this position requires",
    "Technically exceptional candidate whose expertise directly maps to the role's primary requirements, with evidence of applied knowledge"
  ],
  capabilityLow: [
    "The candidate's technical background shows only partial alignment with the role requirements, with gaps in several key skill areas",
    "Technical skill set does not fully match what this position requires; gaps exist in core technologies and methodologies sought"
  ],
  capabilityModerate: [
    "Moderate technical alignment — the candidate has some relevant skills but lacks depth in several areas critical for this role",
    "Relevant technical foundation but missing key specializations that would make this a strong capability match"
  ],
  founderHigh: [
    "This candidate brings meaningful startup and founder experience, having held leadership roles in early-stage environments",
    "Demonstrated founder or founding-team track record with ownership and initiative signals that indicate entrepreneurial aptitude",
    "Strong founder-adjacent background with evidence of building and taking ownership in resource-constrained environments"
  ],
  founderVeryHigh: [
    "Exceptional founder/startup profile — this candidate has held founding or C-level roles at early-stage companies with clear ownership and team-building track record",
    "Outstanding entrepreneurial background: founder or founding-team member with demonstrated experience building products, teams, and businesses from early stages"
  ],
  founderNone: [
    "Limited evidence of startup or founder-mentality signals in the career history",
    "No significant startup or early-stage company experience evident from the profile",
    "The candidate's background is primarily in established organizations with limited founder-style ownership signals"
  ],
  hireabilityHigh: [
    "Strong availability signals — the candidate appears to be actively looking and available within a reasonable timeframe",
    "Good recruiter engagement and availability indicators suggest this candidate is accessible for new opportunities",
    "Positive hiring signals including platform activity and availability that indicate recruiter responsiveness"
  ],
  hireabilityVeryHigh: [
    "Immediately available with strong hiring signals — short notice period and active platform engagement suggest quick start capability",
    "Excellent availability: the candidate shows strong recruiter engagement signals and appears ready for a timely move"
  ],
  hireabilityLow: [
    "Availability concerns — the candidate's profile suggests a longer notice period or limited current engagement with the job market",
    "Weak availability signals: potential notice period constraints or limited recruiter engagement may delay hiring",
    "Lower hiring urgency indicated by platform inactivity or extended notice period requirements"
  ],
  hireabilityModerate: [
    "Some availability signals but not indicating immediate readiness — may require notice period negotiations",
    "Moderate hiring signals suggest the candidate is open but not immediately available for a quick transition"
  ],
  trustHigh: [
    "Trusted profile with consistent career evidence and verifiable progression across roles",
    "Strong career narrative with coherent progression and credible experience signals"
  ],
  trustVeryHigh: [
    "Highly credible profile with verified credentials, consistent career trajectory, and strong validation signals",
    "Exceptional trust signals: clear career progression, verifiable achievements, and coherent professional narrative"
  ],
  trustLow: [
    "Limited career evidence or validation signals backing the claimed experience level",
    "The profile shows weaker career evidence, making it harder to verify the depth of claimed expertise"
  ],
  noticePeriodShort: [
    "Short notice period increases hiring likelihood and reduces time-to-offer risk",
    "Quick availability makes this candidate attractive for roles requiring fast start dates"
  ],
  noticePeriodLong: [
    "Longer notice period may delay start date and requires planning for transition timing",
    "Extended availability timeline could be a consideration for roles needing immediate starts"
  ],
  leadershipPresent: [
    "Evidence of leadership and mentoring capability from team-building or management experience",
    "Demonstrated ability to lead and grow teams, indicating readiness for senior individual contributor or management track"
  ],
  leadershipMissing: [
    "Limited evidence of team leadership or mentoring experience in the career history",
    "The profile lacks clear signals of leadership or cross-functional collaboration at scale"
  ]
};

function pickTemplate(templates) {
  return templates[Math.floor(Math.random() * templates.length)];
}

function generateReasoning(s) {
  const parts = [];

  const highParts = [];

  if (s.capability_score >= 85) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.capabilityVeryHigh));
  } else if (s.capability_score >= 65) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.capabilityHigh));
  }

  if (s.founder_fit_score >= 75) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.founderVeryHigh));
  } else if (s.founder_fit_score >= 55) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.founderHigh));
  }

  if (s.hireability_score >= 85) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.hireabilityVeryHigh));
  } else if (s.hireability_score >= 65) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.hireabilityHigh));
  }

  if (s.trust_score >= 80) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.trustVeryHigh));
  } else if (s.trust_score >= 65) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.trustHigh));
  }

  if (highParts.length > 0) {
    parts.push(highParts.slice(0, 2).join(". "));
  }

  const lowParts = [];
  if (s.capability_score < 55) {
    lowParts.push(pickTemplate(EXPLANATION_TEMPLATES.capabilityModerate));
  } else if (s.capability_score < 40) {
    lowParts.push(pickTemplate(EXPLANATION_TEMPLATES.capabilityLow));
  }

  if (s.founder_fit_score < 40) {
    lowParts.push(pickTemplate(EXPLANATION_TEMPLATES.founderNone));
  }

  if (s.hireability_score < 40) {
    lowParts.push(pickTemplate(EXPLANATION_TEMPLATES.hireabilityLow));
  } else if (s.hireability_score < 60) {
    lowParts.push(pickTemplate(EXPLANATION_TEMPLATES.hireabilityModerate));
  }

  if (s.trust_score < 50) {
    lowParts.push(pickTemplate(EXPLANATION_TEMPLATES.trustLow));
  }

  if (s.hireability_score >= 60 && s.hireability_score < 75) {
    lowParts.push(pickTemplate(EXPLANATION_TEMPLATES.noticePeriodLong));
  } else if (s.hireability_score >= 85) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.noticePeriodShort));
  }

  if (s.founder_fit_score >= 50 || s.trust_score >= 70) {
    highParts.push(pickTemplate(EXPLANATION_TEMPLATES.leadershipPresent));
  } else if (s.capability_score >= 70 && s.founder_fit_score < 35) {
    lowParts.push(pickTemplate(EXPLANATION_TEMPLATES.leadershipMissing));
  }

  if (s.is_honeypot) {
    lowParts.push("Flagged for suspicious or inconsistent profile signals requiring additional verification");
  }

  if (lowParts.length > 0) {
    parts.push(lowParts.slice(0, 2).join(". "));
  }

  if (parts.length === 0) {
    return "Profile shows limited signals aligned with this role's requirements";
  }

  return parts.join(" ");
}

async function reRankWithWeights(sessionId, weights) {
  const session = await pool.query("SELECT * FROM ranking_sessions WHERE id = $1", [sessionId]);
  if (session.rows.length === 0) throw new Error("Session not found");

  await pool.query("UPDATE ranking_sessions SET weights = $1 WHERE id = $2",
    [JSON.stringify(weights), sessionId]);

  const totalWeight = weights.capability + weights.founderFit + weights.hireability + weights.trust;
  const candidates = await pool.query(
    "SELECT id, is_honeypot, capability_score, founder_fit_score, hireability_score, trust_score FROM candidates"
  );

  const updateClient = await pool.connect();
  try {
    await updateClient.query("BEGIN");
    for (const c of candidates.rows) {
      const penalized = c.is_honeypot ? 0.1 : 1.0;
      const score = (
        c.capability_score * (weights.capability / totalWeight) +
        c.founder_fit_score * (weights.founderFit / totalWeight) +
        c.hireability_score * (weights.hireability / totalWeight) +
        c.trust_score * (weights.trust / totalWeight)
      ) * penalized;
      await updateClient.query("UPDATE candidates SET overall_score=$1 WHERE id=$2",
        [Math.round(score * 100) / 100, c.id]);
    }
    await updateClient.query("COMMIT");
  } catch (err) {
    await updateClient.query("ROLLBACK");
  } finally {
    updateClient.release();
  }

  const nonHoneypot = candidates.rows
    .filter(c => !c.is_honeypot)
    .map(c => ({
      id: c.id,
      score: (
        c.capability_score * (weights.capability / totalWeight) +
        c.founder_fit_score * (weights.founderFit / totalWeight) +
        c.hireability_score * (weights.hireability / totalWeight) +
        c.trust_score * (weights.trust / totalWeight)
      )
    }))
    .sort((a, b) => b.score - a.score);

  const rankClient = await pool.connect();
  try {
    await rankClient.query("BEGIN");
    for (let i = 0; i < nonHoneypot.length; i++) {
      await rankClient.query("UPDATE candidates SET rank=$1 WHERE id=$2", [i + 1, nonHoneypot[i].id]);
    }
    await rankClient.query("COMMIT");
  } catch (err) {
    await rankClient.query("ROLLBACK");
  } finally {
    rankClient.release();
  }

  const topExplained = nonHoneypot.slice(0, 500);
  const idMap = {};
  for (const c of candidates.rows) idMap[c.id] = c.candidate_id;

  return {
    sessionId,
    totalCandidates: candidates.rows.length,
    topScore: nonHoneypot[0]?.score || 0,
    topCandidates: topExplained.map(s => ({
      candidate_id: idMap[s.id] || "",
      rank: nonHoneypot.indexOf(s) + 1,
      score: Math.round(s.score * 100) / 100,
      reasoning: ""
    }))
  };
}

async function exportCsv(jdTitle) {
  const result = await pool.query(
    `SELECT candidate_id, profile->>'anonymized_name' as name, rank, overall_score as score, reasoning
     FROM candidates WHERE is_honeypot = false AND rank > 0
     ORDER BY rank ASC LIMIT 500`
  );

  let csv = "name,rank,score,reasoning\n";
  for (const row of result.rows) {
    const name = (row.name || row.candidate_id).replace(/"/g, '""');
    const reasoning = (row.reasoning || "").replace(/"/g, '""');
    csv += `"${name}",${row.rank},${row.score},"${reasoning}"\n`;
  }
  return { csv, jdTitle: jdTitle || "rankings" };
}

module.exports = { rankCandidates, reRankWithWeights, exportCsv };
