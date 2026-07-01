const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'recruitiq_hackathon', password: '', port: 5432 });

(async () => {
  // Overall
  const stats = await pool.query(
    "SELECT MIN(overall_score), MAX(overall_score), AVG(overall_score), PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY overall_score) as median, COUNT(*) FROM candidates WHERE is_honeypot = false AND rank > 0"
  );
  console.log("=== OVERALL ===");
  console.log("Range:", stats.rows[0].min, "-", stats.rows[0].max, "| Avg:", parseFloat(stats.rows[0].avg).toFixed(2), "| Median:", parseFloat(stats.rows[0].median).toFixed(2));

  // Score distribution
  const dist = await pool.query(`
    SELECT CASE WHEN overall_score >= 80 THEN '80-100' WHEN overall_score >= 70 THEN '70-80' WHEN overall_score >= 60 THEN '60-70' WHEN overall_score >= 50 THEN '50-60' WHEN overall_score >= 40 THEN '40-50' WHEN overall_score >= 30 THEN '30-40' ELSE '0-30' END as bucket, COUNT(*) as count FROM candidates WHERE is_honeypot = false AND rank > 0 GROUP BY bucket ORDER BY bucket
  `);
  console.log("\n=== SCORE DISTRIBUTION ===");
  dist.rows.forEach(r => console.log(r.bucket + ": " + r.count));

  // Founder fit distribution
  const ff = await pool.query(`
    SELECT CASE WHEN founder_fit_score >= 80 THEN '80-100' WHEN founder_fit_score >= 60 THEN '60-80' WHEN founder_fit_score >= 40 THEN '40-60' WHEN founder_fit_score >= 20 THEN '20-40' ELSE '0-20' END as bucket, COUNT(*) as count FROM candidates WHERE is_honeypot = false AND rank > 0 GROUP BY bucket ORDER BY bucket
  `);
  console.log("\n=== FOUNDER FIT ===");
  ff.rows.forEach(r => console.log(r.bucket + ": " + r.count));

  // Sample varied explanations from different rank tiers
  const ex = await pool.query(`
    SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score, hireability_score, trust_score, reasoning
    FROM candidates WHERE is_honeypot = false AND reasoning IS NOT NULL
    ORDER BY rank ASC LIMIT 5
  `);
  console.log("\n=== TOP 5 EXPLANATIONS ===");
  ex.rows.forEach(c => console.log("#" + c.rank, c.candidate_id, "| C:" + c.capability_score, "F:" + c.founder_fit_score, "H:" + c.hireability_score, "T:" + c.trust_score, "\n  " + c.reasoning + "\n"));

  // Also check some from rank 100-105 range (lower in top 500)
  const ex2 = await pool.query(`
    SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score, hireability_score, trust_score, reasoning
    FROM candidates WHERE is_honeypot = false AND reasoning IS NOT NULL
    ORDER BY rank ASC OFFSET 100 LIMIT 3
  `);
  console.log("=== RANK 101-103 EXPLANATIONS ===");
  ex2.rows.forEach(c => console.log("#" + c.rank, c.candidate_id, "| C:" + c.capability_score, "F:" + c.founder_fit_score, "H:" + c.hireability_score, "T:" + c.trust_score, "\n  " + c.reasoning + "\n"));

  // Check from rank 400-405
  const ex3 = await pool.query(`
    SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score, hireability_score, trust_score, reasoning
    FROM candidates WHERE is_honeypot = false AND reasoning IS NOT NULL
    ORDER BY rank ASC OFFSET 400 LIMIT 3
  `);
  console.log("=== RANK 401-403 EXPLANATIONS ===");
  ex3.rows.forEach(c => console.log("#" + c.rank, c.candidate_id, "| C:" + c.capability_score, "F:" + c.founder_fit_score, "H:" + c.hireability_score, "T:" + c.trust_score, "\n  " + c.reasoning + "\n"));

  // Honeypot reasons sample
  const hr = await pool.query(`
    SELECT candidate_id, honeypot_confidence, honeypot_reasons
    FROM candidates WHERE is_honeypot = true AND honeypot_reasons != '[]'::jsonb
    ORDER BY honeypot_confidence DESC LIMIT 5
  `);
  console.log("=== HONEYPOT REASONS (top 5) ===");
  hr.rows.forEach(c => {
    const reasons = typeof c.honeypot_reasons === 'string' ? JSON.parse(c.honeypot_reasons) : c.honeypot_reasons;
    console.log(c.candidate_id, "conf:", c.honeypot_confidence);
    (reasons || []).slice(0, 3).forEach(r => console.log("  - " + r));
    if ((reasons || []).length > 3) console.log("  + " + ((reasons || []).length - 3) + " more");
  });

  // Count total with explanations
  const exCount = await pool.query("SELECT COUNT(*) FROM candidates WHERE reasoning IS NOT NULL");
  console.log("\nTotal candidates with explanations:", exCount.rows[0].count);

  await pool.end();
})();
