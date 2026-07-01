const pool = require("../db");
const rankingEngine = require("../services/rankingEngine");

(async () => {
  await pool.initPromise;

  const jdResult = await pool.query("SELECT id, title FROM jd_analyses ORDER BY id LIMIT 1");
  const jdId = jdResult.rows[0].id;
  console.log("Using JD:", jdId, jdResult.rows[0].title);

  const start = Date.now();
  const result = await rankingEngine.rankCandidates(jdId, {
    capability: 40, founderFit: 20, hireability: 20, trust: 15
  });
  const elapsed = ((Date.now() - start) / 1000).toFixed(0);
  console.log("\nRanking complete in", elapsed, "s");
  console.log("Ranked:", result.totalCandidates - result.honeypotCount);
  console.log("Honeypots:", result.honeypotCount);
  console.log("Top score:", result.topScore);

  // Quick validation queries
  const founderStats = await pool.query(
    "SELECT MIN(founder_fit_score) as min, MAX(founder_fit_score) as max, AVG(founder_fit_score) as avg FROM candidates WHERE is_honeypot = false AND rank > 0"
  );
  console.log("\n=== FOUNDER FIT (NEW) ===");
  console.log("Min:", founderStats.rows[0].min, "Max:", founderStats.rows[0].max, "Avg:", parseFloat(founderStats.rows[0].avg).toFixed(2));

  const founderDist = await pool.query(
    `SELECT CASE WHEN founder_fit_score >= 80 THEN '80-100' WHEN founder_fit_score >= 60 THEN '60-80' WHEN founder_fit_score >= 40 THEN '40-60' WHEN founder_fit_score >= 20 THEN '20-40' ELSE '0-20' END as bucket, COUNT(*) as count FROM candidates WHERE is_honeypot = false AND rank > 0 GROUP BY bucket ORDER BY bucket`
  );
  console.log("Distribution:");
  founderDist.rows.forEach(r => console.log("  " + r.bucket + ": " + r.count));

  // Top 20
  const top20 = await pool.query(
    `SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score, hireability_score, trust_score, reasoning, profile->>'anonymized_name' as name FROM candidates WHERE is_honeypot = false AND rank > 0 ORDER BY rank ASC LIMIT 20`
  );
  console.log("\n=== TOP 20 ===");
  top20.rows.forEach(c => console.log(
    "#" + c.rank, c.candidate_id,
    "S:", c.overall_score,
    "C:", c.capability_score, "F:", c.founder_fit_score,
    "H:", c.hireability_score, "T:", c.trust_score
  ));

  // Sample explanations
  const ex = await pool.query(
    "SELECT candidate_id, rank, overall_score, reasoning FROM candidates WHERE is_honeypot = false AND reasoning IS NOT NULL ORDER BY rank ASC LIMIT 5"
  );
  console.log("\n=== SAMPLE EXPLANATIONS ===");
  ex.rows.forEach(c => console.log("#" + c.rank, c.candidate_id + ":", c.reasoning));

  // Honeypot reasons
  const hr = await pool.query(
    "SELECT COUNT(*) FROM candidates WHERE is_honeypot = true AND honeypot_reasons IS NOT NULL AND honeypot_reasons != '[]'::jsonb"
  );
  const hr2 = await pool.query(
    "SELECT candidate_id, honeypot_confidence, honeypot_reasons FROM candidates WHERE is_honeypot = true AND honeypot_reasons IS NOT NULL AND honeypot_reasons != '[]'::jsonb ORDER BY honeypot_confidence DESC LIMIT 5"
  );
  console.log("\n=== HONEYPOT REASONS ===");
  console.log("Candidates with non-empty reasons:", hr.rows[0].count);
  hr2.rows.forEach(c => {
    const reasons = typeof c.honeypot_reasons === 'string' ? JSON.parse(c.honeypot_reasons) : c.honeypot_reasons;
    console.log("  " + c.candidate_id + " (conf: " + c.honeypot_confidence + "):", (reasons || []).join("; "));
  });

  await pool.end();
})();
