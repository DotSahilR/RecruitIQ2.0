const { Pool } = require('pg');
const pool = new Pool({ user: 'postgres', host: 'localhost', database: 'recruitiq_hackathon', password: '', port: 5432 });

(async () => {
  const ch = await pool.query("SELECT career_history->0 as first_role FROM candidates WHERE jsonb_array_length(career_history) > 0 AND founder_fit_score >= 50 LIMIT 3");
  ch.rows.forEach(r => console.log('Career entry keys:', Object.keys(r.first_role || {})));
  console.log('Sample:', JSON.stringify(ch.rows[0]?.first_role, null, 2));

  // Check for "1-10" company sizes
  const tiny = await pool.query("SELECT COUNT(*) FROM candidates WHERE career_history::text LIKE '%1-10%'");
  console.log('Candidates with 1-10 in career:', tiny.rows[0].count);

  // Check career history company_size vs profile current_company_size
  const prof = await pool.query("SELECT profile->>'current_company_size' as ccs FROM candidates WHERE profile->>'current_company_size' IS NOT NULL LIMIT 10");
  const profSizes = prof.rows.map(r => r.ccs);
  console.log('Profile company sizes:', [...new Set(profSizes)]);

  await pool.end();
})();
