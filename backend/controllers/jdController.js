const pool = require("../db");
const scoringService = require("../services/scoringService");
const parserService = require("../services/parserService");
const embeddingService = require("../services/embeddingService");

/**
 * Handles job description creation and skill extraction.
 */
async function uploadJd(req, res) {
  try {
    let fileText = "";
    if (req.file) {
      const { text } = await parserService.extractText(req.file.path);
      fileText = text;
    }
    const titleFromFile = req.file ? req.file.originalname.replace(/\.[^/.]+$/, "") : "";
    const { title } = req.body;
    const description = parserService.sanitizeText(req.body.description || fileText);
    console.log(`[jd] uploadJd user=${req.user.id} hasFile=${!!req.file} desc_len=${description.length}`);

    if (!description || description.trim().length < 10) {
      return res.status(400).json({ error: "Job description is required (min 10 chars)." });
    }

    // Derive a meaningful role name from the description if none was supplied.
    // Prefer first short, non-header line — e.g. "Senior Full Stack Engineer"
    // — over the generic "Target Spec Role" fallback.
    function titleFromDescription(text) {
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (const line of lines) {
        if (line.length > 80) continue;
        if (/^(requirements|responsibilities|about|nice to have|qualifications|what we offer|job description|skills|experience|education):?$/i.test(line)) continue;
        if (/^\d+\s*(year|yr)/i.test(line)) continue;
        if (line.length >= 4) return line;
      }
      return "";
    }

    const derivedTitle = titleFromDescription(description);
    const jobTitle = title || derivedTitle || titleFromFile || "Untitled role";

    // 1. Save Job Description in PostgreSQL for the logged-in HR account.
    const jobResult = await pool.query(
      "INSERT INTO jobs (user_id, title, description) VALUES ($1, $2, $3) RETURNING id",
      [req.user.id, jobTitle, description]
    );
    const jobId = jobResult.rows[0].id;
    console.log(`[jd] uploadJd -> saved job=${jobId} user=${req.user.id} title="${jobTitle}"`);

    // 2. Extract required skills from description text
    const extractedSkills = scoringService.extractJdSkills(description);
    console.log(`[jd] uploadJd -> extracted ${extractedSkills.length} required skills`);

    // 3. Save extracted skills in job_skills table
    for (const skill of extractedSkills) {
      await pool.query(
        "INSERT INTO job_skills (job_id, skill_name) VALUES ($1, $2)",
        [jobId, skill]
      );
    }

    // Fire-and-forget: generate a semantic embedding for this JD so v2
    // scoring can compute cosine similarity against resume embeddings.
    setImmediate(async () => {
      try {
        const out = await embeddingService.embedJobDescription(jobId, description);
        if (out.embedded) {
          console.log(`[embed] ✓ job ${jobId} embedded (${embeddingService.VECTOR_DIM}-d)`);
        } else if (out.error && out.error !== "embed-not-configured") {
          console.log(`[embed] skipped job ${jobId}: ${out.error}`);
        }
      } catch (err) {
        console.error(`[embed] background error for job ${jobId}:`, err.message);
      }
    });

    return res.status(201).json({
      message: "Job description uploaded and processed.",
      job: {
        id: jobId,
        title: jobTitle,
        description,
        skills: extractedSkills
      }
    });

  } catch (err) {
    console.error("[jd] uploadJd error:", err);
    return res.status(500).json({ error: "Server error processing job description." });
  }
}

module.exports = {
  uploadJd
};
