const express = require("express");
const router = express.Router();
const pool = require("../db");

router.get("/candidates", async (req, res) => {
  try {
    const { limit = 50, offset = 0, search } = req.query;
    let query = "SELECT candidate_id, profile, skills, education, career_history, redrob_signals, is_honeypot, overall_score, rank, reasoning FROM candidates";
    let countQuery = "SELECT COUNT(*) FROM candidates";
    const params = [];
    const conditions = [];

    if (search) {
      conditions.push("(profile->>'name' ILIKE $1 OR profile->>'headline' ILIKE $1 OR profile->>'summary' ILIKE $1)");
      params.push(`%${search}%`);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
      countQuery += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY id ASC LIMIT $" + (params.length + 1) + " OFFSET $" + (params.length + 2);
    params.push(parseInt(limit), parseInt(offset));

    const countResult = await pool.query(countQuery, search ? [`%${search}%`] : []);
    const result = await pool.query(query, params);

    res.json({
      candidates: result.rows,
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error("Error fetching candidates:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/candidates/:candidateId", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM candidates WHERE candidate_id = $1",
      [req.params.candidateId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Candidate not found" });
    }

    const row = result.rows[0];
    if (row) {
      row.profile = typeof row.profile === "string" ? JSON.parse(row.profile) : row.profile;
      row.features = typeof row.features === "string" ? JSON.parse(row.features) : row.features;
      row.honeypot_reasons = typeof row.honeypot_reasons === "string" ? JSON.parse(row.honeypot_reasons) : row.honeypot_reasons;
      row.skills = typeof row.skills === "string" ? JSON.parse(row.skills) : row.skills;
      row.career_history = typeof row.career_history === "string" ? JSON.parse(row.career_history) : row.career_history;
      row.education = typeof row.education === "string" ? JSON.parse(row.education) : row.education;
      row.certifications = typeof row.certifications === "string" ? JSON.parse(row.certifications) : row.certifications;
      row.languages = typeof row.languages === "string" ? JSON.parse(row.languages) : row.languages;
      row.redrob_signals = typeof row.redrob_signals === "string" ? JSON.parse(row.redrob_signals) : row.redrob_signals;
    }
    res.json(row);
  } catch (err) {
    console.error("Error fetching candidate:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/stats", async (req, res) => {
  try {
    const total = await pool.query("SELECT COUNT(*) FROM candidates");
    const embedded = await pool.query("SELECT COUNT(*) FROM candidates WHERE embedding IS NOT NULL");
    const honeypots = await pool.query("SELECT COUNT(*) FROM candidates WHERE is_honeypot = true");
    const ranked = await pool.query("SELECT COUNT(*) FROM candidates WHERE rank > 0");

    res.json({
      totalCandidates: parseInt(total.rows[0].count),
      embeddedCandidates: parseInt(embedded.rows[0].count),
      honeypotCount: parseInt(honeypots.rows[0].count),
      rankedCandidates: parseInt(ranked.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
