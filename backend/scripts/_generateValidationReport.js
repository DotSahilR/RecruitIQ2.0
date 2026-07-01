const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'recruitiq_hackathon', password: '', port: 5432 });

(async () => {
  // 1. Overall stats
  const stats = await pool.query(
    `SELECT MIN(overall_score) as min, MAX(overall_score) as max,
            AVG(overall_score) as avg,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY overall_score) as median,
            COUNT(*) as total_ranked
     FROM candidates WHERE is_honeypot = false AND rank > 0`
  );
  console.log('=== OVERALL RANKING STATS ===');
  console.log('Total ranked:', stats.rows[0].total_ranked);
  console.log('Score range:', parseFloat(stats.rows[0].min).toFixed(2), '-', parseFloat(stats.rows[0].max).toFixed(2));
  console.log('Avg:', parseFloat(stats.rows[0].avg).toFixed(2), '| Median:', parseFloat(stats.rows[0].median).toFixed(2));

  // 2. Top 20 detailed
  const top20 = await pool.query(
    `SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score,
            hireability_score, trust_score, reasoning,
            profile->>'anonymized_name' as name
     FROM candidates
     WHERE is_honeypot = false AND rank > 0
     ORDER BY rank ASC LIMIT 20`
  );
  console.log('\n=== TOP 20 CANDIDATES ===');
  top20.rows.forEach(c => console.log(
    '#' + c.rank, c.candidate_id, c.name,
    '| S:', c.overall_score,
    '| C:', c.capability_score, 'F:', c.founder_fit_score,
    'H:', c.hireability_score, 'T:', c.trust_score,
    '|', c.reasoning ? c.reasoning.substring(0, 120) : ''
  ));

  // 3. Score distribution
  const dist = await pool.query(
    `SELECT
       CASE
         WHEN overall_score >= 80 THEN '80-100'
         WHEN overall_score >= 70 THEN '70-80'
         WHEN overall_score >= 60 THEN '60-70'
         WHEN overall_score >= 50 THEN '50-60'
         WHEN overall_score >= 40 THEN '40-50'
         WHEN overall_score >= 30 THEN '30-40'
         ELSE '0-30'
       END as bucket,
       COUNT(*) as count
     FROM candidates WHERE is_honeypot = false AND rank > 0
     GROUP BY bucket ORDER BY bucket`
  );
  console.log('\n=== SCORE DISTRIBUTION ===');
  dist.rows.forEach(r => console.log(r.bucket + ': ' + r.count));

  // 4. Honeypot stats
  const hp = await pool.query(
    'SELECT COUNT(*) as total, AVG(honeypot_confidence) as avg_conf FROM candidates WHERE is_honeypot = true'
  );
  const hpByConf = await pool.query(
    `SELECT
       CASE
         WHEN honeypot_confidence >= 80 THEN '80-100'
         WHEN honeypot_confidence >= 60 THEN '60-80'
         WHEN honeypot_confidence >= 40 THEN '40-60'
         ELSE '0-40'
       END as bucket,
       COUNT(*) as count
     FROM candidates WHERE is_honeypot = true GROUP BY bucket ORDER BY bucket`
  );
  const hpReasons = await pool.query(
    `SELECT candidate_id, honeypot_confidence, honeypot_reasons
     FROM candidates WHERE is_honeypot = true AND honeypot_reasons IS NOT NULL
     ORDER BY honeypot_confidence DESC LIMIT 10`
  );
  console.log('\n=== HONEYPOT STATS ===');
  console.log('Total honeypots:', hp.rows[0].total, '| Avg confidence:', parseFloat(hp.rows[0].avg_conf).toFixed(2));
  hpByConf.rows.forEach(r => console.log('Confidence ' + r.bucket + ': ' + r.count));
  console.log('Top honeypots by confidence:');
  hpReasons.rows.forEach((r, i) => {
    const reasons = typeof r.honeypot_reasons === 'string'
      ? JSON.parse(r.honeypot_reasons) : r.honeypot_reasons;
    console.log('  ' + (i+1) + '. ' + r.candidate_id + ' (conf: ' + r.honeypot_confidence + '): ' + (reasons || []).join('; '));
  });

  // 5. Founder Fit distribution
  const ff = await pool.query(
    `SELECT
       CASE
         WHEN founder_fit_score >= 80 THEN '80-100'
         WHEN founder_fit_score >= 60 THEN '60-80'
         WHEN founder_fit_score >= 40 THEN '40-60'
         WHEN founder_fit_score >= 20 THEN '20-40'
         ELSE '0-20'
       END as bucket,
       COUNT(*) as count
     FROM candidates WHERE is_honeypot = false AND rank > 0
     GROUP BY bucket ORDER BY bucket`
  );
  const ffStats = await pool.query(
    `SELECT MIN(founder_fit_score) as min, MAX(founder_fit_score) as max,
            AVG(founder_fit_score) as avg,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY founder_fit_score) as median
     FROM candidates WHERE is_honeypot = false AND rank > 0`
  );
  console.log('\n=== FOUNDER FIT SCORE DISTRIBUTION ===');
  ff.rows.forEach(r => console.log(r.bucket + ': ' + r.count));
  console.log('Stats: min=' + parseFloat(ffStats.rows[0].min).toFixed(2) +
    ' max=' + parseFloat(ffStats.rows[0].max).toFixed(2) +
    ' avg=' + parseFloat(ffStats.rows[0].avg).toFixed(2) +
    ' median=' + parseFloat(ffStats.rows[0].median).toFixed(2));

  // 6. Hireability distribution
  const ha = await pool.query(
    `SELECT
       CASE
         WHEN hireability_score >= 80 THEN '80-100'
         WHEN hireability_score >= 60 THEN '60-80'
         WHEN hireability_score >= 40 THEN '40-60'
         WHEN hireability_score >= 20 THEN '20-40'
         ELSE '0-20'
       END as bucket,
       COUNT(*) as count
     FROM candidates WHERE is_honeypot = false AND rank > 0
     GROUP BY bucket ORDER BY bucket`
  );
  const haStats = await pool.query(
    `SELECT MIN(hireability_score) as min, MAX(hireability_score) as max,
            AVG(hireability_score) as avg,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY hireability_score) as median
     FROM candidates WHERE is_honeypot = false AND rank > 0`
  );
  console.log('\n=== HIREABILITY SCORE DISTRIBUTION ===');
  ha.rows.forEach(r => console.log(r.bucket + ': ' + r.count));
  console.log('Stats: min=' + parseFloat(haStats.rows[0].min).toFixed(2) +
    ' max=' + parseFloat(haStats.rows[0].max).toFixed(2) +
    ' avg=' + parseFloat(haStats.rows[0].avg).toFixed(2) +
    ' median=' + parseFloat(haStats.rows[0].median).toFixed(2));

  // 7. Trust distribution
  const tr = await pool.query(
    `SELECT
       CASE
         WHEN trust_score >= 80 THEN '80-100'
         WHEN trust_score >= 60 THEN '60-80'
         WHEN trust_score >= 40 THEN '40-60'
         WHEN trust_score >= 20 THEN '20-40'
         ELSE '0-20'
       END as bucket,
       COUNT(*) as count
     FROM candidates WHERE is_honeypot = false AND rank > 0
     GROUP BY bucket ORDER BY bucket`
  );
  const trStats = await pool.query(
    `SELECT MIN(trust_score) as min, MAX(trust_score) as max,
            AVG(trust_score) as avg,
            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY trust_score) as median
     FROM candidates WHERE is_honeypot = false AND rank > 0`
  );
  console.log('\n=== TRUST SCORE DISTRIBUTION ===');
  tr.rows.forEach(r => console.log(r.bucket + ': ' + r.count));
  console.log('Stats: min=' + parseFloat(trStats.rows[0].min).toFixed(2) +
    ' max=' + parseFloat(trStats.rows[0].max).toFixed(2) +
    ' avg=' + parseFloat(trStats.rows[0].avg).toFixed(2) +
    ' median=' + parseFloat(trStats.rows[0].median).toFixed(2));

  // 8. False positives: top 1000 but capability < 40
  const fp = await pool.query(
    `SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score,
            hireability_score, trust_score, reasoning,
            profile->>'anonymized_name' as name
     FROM candidates
     WHERE is_honeypot = false AND rank > 0 AND rank <= 1000 AND capability_score < 40
     ORDER BY rank ASC LIMIT 20`
  );
  console.log('\n=== FALSE POSITIVES (top 1000, capability < 40) ===');
  if (fp.rows.length === 0) console.log('None found -- good sign!');
  else fp.rows.forEach(c => console.log(
    '#' + c.rank, c.candidate_id, c.name,
    '| S:', c.overall_score, 'C:', c.capability_score,
    'F:', c.founder_fit_score, 'H:', c.hireability_score, 'T:', c.trust_score,
    '|', c.reasoning ? c.reasoning.substring(0, 100) : ''
  ));

  // 9. False negatives: bottom 1000 but capability >= 60
  const maxRankQ = await pool.query(
    'SELECT MAX(rank) as mr FROM candidates WHERE is_honeypot = false AND rank > 0'
  );
  const mr = parseInt(maxRankQ.rows[0].mr);
  const fn = await pool.query(
    `SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score,
            hireability_score, trust_score, reasoning,
            profile->>'anonymized_name' as name
     FROM candidates
     WHERE is_honeypot = false AND rank > 0
       AND rank > $1 - 1000 AND capability_score >= 60
     ORDER BY rank DESC LIMIT 20`,
    [mr]
  );
  console.log('\n=== FALSE NEGATIVES (bottom 1000 with capability >= 60) ===');
  if (fn.rows.length === 0) console.log('None found -- good sign!');
  else fn.rows.forEach(c => console.log(
    '#' + c.rank, c.candidate_id, c.name,
    '| S:', c.overall_score, 'C:', c.capability_score,
    'F:', c.founder_fit_score, 'H:', c.hireability_score, 'T:', c.trust_score,
    '|', c.reasoning ? c.reasoning.substring(0, 100) : ''
  ));

  // 10. Bottom 20
  const bottom = await pool.query(
    `SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score,
            hireability_score, trust_score, reasoning,
            profile->>'anonymized_name' as name
     FROM candidates
     WHERE is_honeypot = false AND rank > 0
     ORDER BY rank DESC LIMIT 20`
  );
  console.log('\n=== BOTTOM 20 CANDIDATES ===');
  bottom.rows.forEach(c => console.log(
    '#' + c.rank, c.candidate_id, c.name,
    '| S:', c.overall_score,
    '| C:', c.capability_score, 'F:', c.founder_fit_score,
    'H:', c.hireability_score, 'T:', c.trust_score,
    '|', c.reasoning ? c.reasoning.substring(0, 120) : ''
  ));

  // 11. High capability low hireability in top 5000
  const hl = await pool.query(
    `SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score,
            hireability_score, trust_score, reasoning,
            profile->>'anonymized_name' as name
     FROM candidates
     WHERE is_honeypot = false AND rank > 0 AND rank <= 5000 AND hireability_score < 30
     ORDER BY rank ASC LIMIT 10`
  );
  console.log('\n=== TOP 5000 WITH LOW HIREABILITY (<30) ===');
  if (hl.rows.length === 0) console.log('None found');
  else hl.rows.forEach(c => console.log(
    '#' + c.rank, c.candidate_id, c.name,
    '| S:', c.overall_score, 'C:', c.capability_score,
    'F:', c.founder_fit_score, 'H:', c.hireability_score, 'T:', c.trust_score,
    '|', c.reasoning ? c.reasoning.substring(0, 100) : ''
  ));

  // 12. High hireability low capability in bottom 5000
  const lh = await pool.query(
    `SELECT candidate_id, rank, overall_score, capability_score, founder_fit_score,
            hireability_score, trust_score, reasoning,
            profile->>'anonymized_name' as name
     FROM candidates
     WHERE is_honeypot = false AND rank > 0
       AND rank > $1 - 5000 AND capability_score < 30
     ORDER BY rank DESC LIMIT 10`,
    [mr]
  );
  console.log('\n=== BOTTOM 5000 WITH LOW CAPABILITY (<30) ===');
  if (lh.rows.length === 0) console.log('None found');
  else lh.rows.forEach(c => console.log(
    '#' + c.rank, c.candidate_id, c.name,
    '| S:', c.overall_score, 'C:', c.capability_score,
    'F:', c.founder_fit_score, 'H:', c.hireability_score, 'T:', c.trust_score,
    '|', c.reasoning ? c.reasoning.substring(0, 100) : ''
  ));

  await pool.end();
})();
