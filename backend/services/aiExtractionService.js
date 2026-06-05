/**
 * AI Resume Extraction Service (Phase 3).
 *
 * Enhances candidate data using the configured AI provider. Runs AFTER the
 * deterministic regex parser has already saved the candidate, so failures here
 * never block the upload flow.
 *
 * On success, this service:
 *   - merges higher-confidence fields into `candidates` (name, email, experience…)
 *   - populates `candidate_profiles` with phone/linkedin/github/etc.
 *   - replaces rows in `work_experience` and `education` with AI output
 *   - unions AI-discovered skills into the `skills` table
 *
 * Per architecture decision §6, AI is an enhancement layer. If aiProvider
 * returns null (no key configured, API down, parse error), this is a no-op
 * and the regex baseline remains in the DB.
 */

const pool = require("../db");
const aiProvider = require("./aiProvider");

// ─── helpers ─────────────────────────────────────────────────────────────

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

/** Coerce AI date strings ("2020-01", "2020-01-15", "Present", null) into ISO date or null. */
function coerceDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s || /^present$/i.test(s) || /^current$/i.test(s) || /^now$/i.test(s)) return null;

  // YYYY → Jan 1
  if (/^\d{4}$/.test(s)) return `${s}-01-01`;
  // YYYY-MM → first of month
  if (/^\d{4}-\d{1,2}$/.test(s)) {
    const [y, m] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-01`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y, m, d] = s.split("-");
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // Try Date.parse as last resort
  const t = Date.parse(s);
  if (!Number.isNaN(t)) {
    const d = new Date(t);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(
      d.getUTCDate()
    ).padStart(2, "0")}`;
  }
  return null;
}

function coerceYear(value) {
  if (value == null) return null;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 1900 && n < 2100 ? n : null;
}

function coerceExperienceYears(value) {
  if (value == null) return null;
  const n = typeof value === "number" ? value : parseFloat(value);
  if (!Number.isFinite(n) || n < 0 || n > 80) return null;
  return Math.round(n);
}

/** Merge regex + AI data, AI wins on conflicts (when it's a non-empty value). */
function mergeFields(regexParsed, aiData) {
  return {
    name: isNonEmptyString(aiData.name) ? aiData.name.trim() : regexParsed.name,
    email: isNonEmptyString(aiData.email) ? aiData.email.trim() : regexParsed.email,
    phone: isNonEmptyString(aiData.phone) ? aiData.phone.trim() : null,
    currentRole: isNonEmptyString(aiData.currentRole) ? aiData.currentRole.trim() : regexParsed.role || null,
    experience: coerceExperienceYears(aiData.experienceYears) ?? regexParsed.experience ?? 0,
    summary: isNonEmptyString(aiData.summary) ? aiData.summary.trim() : regexParsed.summary,
    skills: dedupeSkills([...(regexParsed.skills || []), ...(Array.isArray(aiData.skills) ? aiData.skills : [])]),
    workHistory: Array.isArray(aiData.workHistory) ? aiData.workHistory : [],
    education: Array.isArray(aiData.education) ? aiData.education : [],
  };
}

function dedupeSkills(skills) {
  const seen = new Map(); // lowercase → original casing (first occurrence wins)
  for (const raw of skills) {
    if (!isNonEmptyString(raw)) continue;
    const clean = raw.trim().replace(/\s+/g, " ");
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  }
  return Array.from(seen.values()).slice(0, 60);
}

/** Extract linkedin / github URLs from raw text (AI's job, but we also try a regex fallback). */
function extractSocialLinks(text) {
  const t = String(text || "");
  const linkedin = t.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_\-/.]+/i);
  const github = t.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[A-Za-z0-9_\-/.]+/i);
  return {
    linkedin_url: linkedin ? linkedin[0] : null,
    github_url: github ? github[0] : null,
  };
}

// ─── persistence ─────────────────────────────────────────────────────────

async function persistMergedData(client, candidateId, merged, rawText) {
  // 1. Update candidate row with refined fields.
  await client.query(
    `UPDATE candidates
        SET name = COALESCE(NULLIF($1, ''), name),
            email = COALESCE(NULLIF($2, ''), email),
            experience = COALESCE($3, experience),
            role = COALESCE(NULLIF($4, ''), role),
            summary = COALESCE(NULLIF($5, ''), summary)
      WHERE id = $6`,
    [merged.name, merged.email, merged.experience, merged.currentRole, merged.summary, candidateId]
  );

  // 2. Replace skills (union of regex + AI was already computed in `merged.skills`).
  await client.query("DELETE FROM skills WHERE candidate_id = $1", [candidateId]);
  for (const skill of merged.skills) {
    await client.query(
      "INSERT INTO skills (candidate_id, skill_name) VALUES ($1, $2)",
      [candidateId, skill]
    );
  }

  // 3. Upsert candidate_profiles.
  const socials = extractSocialLinks(rawText);
  await client.query(
    `INSERT INTO candidate_profiles
       (candidate_id, phone, linkedin_url, github_url, "current_role", summary, extraction_method)
     VALUES ($1, $2, $3, $4, $5, $6, COALESCE(
       (SELECT extraction_method FROM candidate_profiles WHERE candidate_id = $1),
       'ai-enhanced'
     ))
     ON CONFLICT (candidate_id) DO UPDATE
       SET phone = COALESCE(EXCLUDED.phone, candidate_profiles.phone),
           linkedin_url = COALESCE(EXCLUDED.linkedin_url, candidate_profiles.linkedin_url),
           github_url = COALESCE(EXCLUDED.github_url, candidate_profiles.github_url),
           "current_role" = COALESCE(EXCLUDED."current_role", candidate_profiles."current_role"),
           summary = COALESCE(EXCLUDED.summary, candidate_profiles.summary)`,
    [
      candidateId,
      merged.phone,
      socials.linkedin_url,
      socials.github_url,
      merged.currentRole,
      merged.summary,
    ]
  );

  // 4. Replace work_experience rows wholesale.
  await client.query("DELETE FROM work_experience WHERE candidate_id = $1", [candidateId]);
  for (const job of merged.workHistory) {
    if (!isNonEmptyString(job?.company) && !isNonEmptyString(job?.role)) continue;
    await client.query(
      `INSERT INTO work_experience (candidate_id, company, role, start_date, end_date, description)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        candidateId,
        job.company || null,
        job.role || null,
        coerceDate(job.startDate),
        coerceDate(job.endDate),
        job.description || null,
      ]
    );
  }

  // 5. Replace education rows wholesale.
  await client.query("DELETE FROM education WHERE candidate_id = $1", [candidateId]);
  for (const ed of merged.education) {
    if (!isNonEmptyString(ed?.institution) && !isNonEmptyString(ed?.degree)) continue;
    await client.query(
      `INSERT INTO education (candidate_id, institution, degree, field_of_study, graduation_year)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        candidateId,
        ed.institution || null,
        ed.degree || null,
        ed.fieldOfStudy || null,
        coerceYear(ed.graduationYear),
      ]
    );
  }
}

// ─── public ──────────────────────────────────────────────────────────────

/**
 * Try to enhance a candidate using AI. Always safe to call.
 *
 * @param {number} candidateId
 * @param {string} rawText             Full extracted resume text (post-OCR if any)
 * @param {object} regexParsed         Output of parserService.parseResumeText
 * @returns {Promise<{ enhanced: boolean, aiData?: object, error?: string }>}
 */
async function enhanceCandidate(candidateId, rawText, regexParsed) {
  console.log(`[ai-extract] enhanceCandidate start candidate=${candidateId} text_len=${rawText?.length || 0}`);
  if (!aiProvider.isAvailable()) {
    console.log(`[ai-extract] enhanceCandidate candidate=${candidateId} -> skip (ai-not-configured)`);
    return { enhanced: false, error: "ai-not-configured" };
  }
  if (!isNonEmptyString(rawText) || rawText.length < 80) {
    console.log(`[ai-extract] enhanceCandidate candidate=${candidateId} -> skip (insufficient-text)`);
    return { enhanced: false, error: "insufficient-text" };
  }

  const aiData = await aiProvider.extractResume(rawText);
  if (!aiData || typeof aiData !== "object") {
    console.log(`[ai-extract] enhanceCandidate candidate=${candidateId} -> skip (ai-returned-no-data)`);
    return { enhanced: false, error: "ai-returned-no-data" };
  }
  console.log(`[ai-extract] enhanceCandidate candidate=${candidateId} -> got ${Object.keys(aiData).length} fields from ${aiProvider.name}`);

  const merged = mergeFields(regexParsed, aiData);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await persistMergedData(client, candidateId, merged, rawText);
    await client.query("COMMIT");
    console.log(`[ai-extract] enhanceCandidate candidate=${candidateId} -> persisted (skills=${merged.skills.length} jobs=${merged.workHistory.length} edu=${merged.education.length})`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[ai-extract] DB write failed for candidate ${candidateId}:`, err.message);
    return { enhanced: false, error: err.message };
  } finally {
    client.release();
  }

  return { enhanced: true, aiData };
}

module.exports = {
  enhanceCandidate,
  // exported for unit tests
  _internal: { coerceDate, coerceYear, coerceExperienceYears, mergeFields, dedupeSkills, extractSocialLinks },
};
