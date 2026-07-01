const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'recruitiq_hackathon', password: '', port: 5432 });

(async () => {
  // Honeypot confidence distribution
  const hc = await pool.query(`
    SELECT CASE
      WHEN honeypot_confidence >= 0.9 THEN '0.9+'
      WHEN honeypot_confidence >= 0.7 THEN '0.7-0.9'
      WHEN honeypot_confidence >= 0.5 THEN '0.5-0.7'
      WHEN honeypot_confidence >= 0.3 THEN '0.3-0.5'
      ELSE '0-0.3'
    END as bucket,
    COUNT(*) as count
    FROM candidates WHERE is_honeypot = true GROUP BY bucket ORDER BY bucket
  `);
  console.log('=== HONEYPOT CONFIDENCE DISTRIBUTION ===');
  hc.rows.forEach(r => console.log(r.bucket + ': ' + r.count));

  const minConf = await pool.query('SELECT MIN(honeypot_confidence) FROM candidates WHERE is_honeypot = true');
  const maxConf = await pool.query('SELECT MAX(honeypot_confidence) FROM candidates WHERE is_honeypot = true');
  console.log('Min confidence:', minConf.rows[0].min, 'Max confidence:', maxConf.rows[0].max);

  // Sample highest-confidence honeypots
  const sample = await pool.query(`
    SELECT candidate_id, profile->>'anonymized_name' as name,
           profile->>'headline' as headline,
           profile->>'years_of_experience' as years_exp,
           honeypot_confidence, honeypot_reasons, skills, career_history
    FROM candidates WHERE honeypot_confidence >= 0.8 LIMIT 5
  `);
  sample.rows.forEach(c => {
    const skills = typeof c.skills === 'string' ? JSON.parse(c.skills) : c.skills || [];
    const career = typeof c.career_history === 'string' ? JSON.parse(c.career_history) : c.career_history || [];
    console.log('\n---', c.candidate_id, c.name, '| conf:', c.honeypot_confidence, '| exp:', c.years_exp, '---');
    console.log('Headline:', c.headline);
    console.log('Skills count:', skills.length);
    console.log('Career entries:', career.length);
    if (career.length > 0) {
      career.forEach((r, i) => console.log('  Role', i+1 + ':', r.title, 'at', r.company, '(' + r.start_date + ' - ' + r.end_date + ')'));
    }
  });

  await pool.end();
})();
