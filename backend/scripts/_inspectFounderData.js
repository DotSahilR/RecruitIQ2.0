const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'recruitiq_hackathon', password: '', port: 5432 });
(async () => {
  // Check for founder titles in dataset
  const titles = await pool.query(`
    SELECT DISTINCT jsonb_array_elements(career_history)->>'title' as title
    FROM candidates
    WHERE jsonb_array_length(career_history) > 0
      AND (career_history::text ILIKE '%founder%' OR career_history::text ILIKE '%cto%' OR career_history::text ILIKE '%ceo%' OR career_history::text ILIKE '%chief%')
    LIMIT 30
  `);
  console.log('Founder/C-level titles in dataset:');
  titles.rows.forEach(r => console.log(' -', r.title));

  const count = await pool.query(`
    SELECT COUNT(DISTINCT candidate_id) FROM candidates
    WHERE career_history::text ILIKE '%founder%' OR career_history::text ILIKE '%cto%' OR career_history::text ILIKE '%ceo%'
  `);
  console.log('Candidates with founder/cto/ceo in career:', count.rows[0].count);

  // Check highest founder fit candidate profile
  const hf = await pool.query(`
    SELECT candidate_id, founder_fit_score, profile->>'headline' as headline,
           career_history AS ch
    FROM candidates WHERE is_honeypot = false AND rank > 0
    ORDER BY founder_fit_score DESC LIMIT 3
  `);
  console.log('\nTop founder fit candidates:');
  for (const c of hf.rows) {
    const ch = typeof c.ch === 'string' ? JSON.parse(c.ch) : c.ch;
    console.log(c.candidate_id, 'score:', c.founder_fit_score, 'headline:', c.headline);
    ch.forEach((r, i) => console.log('  Role', i+1 + ':', r.title, 'at', r.company, '(' + (r.company_size || '?') + ')'));
  }

  await pool.end();
})();
