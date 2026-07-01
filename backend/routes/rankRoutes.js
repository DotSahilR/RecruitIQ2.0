const express = require("express");
const router = express.Router();
const pool = require("../db");
const rankingEngine = require("../services/rankingEngine");

router.post("/rank", async (req, res) => {
  try {
    const { jdId, weights } = req.body;
    if (!jdId) return res.status(400).json({ error: "jdId is required" });

    const result = await rankingEngine.rankCandidates(jdId, weights || {
      capability: 40,
      founderFit: 20,
      hireability: 20,
      trust: 15
    });

    res.json(result);
  } catch (err) {
    console.error("Ranking error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/results", async (req, res) => {
  try {
    const { limit = 100, offset = 0, minScore = 0, search, sortBy = "overall_score", sortOrder = "desc" } = req.query;
    const allowedSort = ["overall_score", "capability_score", "founder_fit_score", "hireability_score", "trust_score", "rank", "confidence_score"];
    const sortField = allowedSort.includes(sortBy) ? sortBy : "overall_score";
    const order = sortOrder === "asc" ? "ASC" : "DESC";

    let conditions = ["is_honeypot = false", "rank > 0"];
    const params = [parseInt(limit), parseInt(offset)];

    if (parseFloat(minScore) > 0) {
      conditions.push("overall_score >= $" + (params.length + 1));
      params.push(parseFloat(minScore));
    }

    if (search) {
      conditions.push("(profile->>'name' ILIKE $" + (params.length + 1) + ")");
      params.push(`%${search}%`);
    }

    const whereClause = conditions.join(" AND ");
    const countResult = await pool.query(`SELECT COUNT(*) FROM candidates WHERE ${whereClause}`, params.slice(2));
    const result = await pool.query(
      `SELECT candidate_id, profile, rank, overall_score, capability_score, founder_fit_score,
              hireability_score, trust_score, confidence_score, reasoning, is_honeypot,
              honeypot_confidence, honeypot_reasons, features
       FROM candidates
       WHERE ${whereClause}
       ORDER BY ${sortField} ${order}
       LIMIT $1 OFFSET $2`,
      params
    );

    res.json({
      candidates: result.rows.map(r => ({
        ...r,
        profile: typeof r.profile === "string" ? JSON.parse(r.profile) : r.profile,
        features: typeof r.features === "string" ? JSON.parse(r.features) : r.features,
        honeypot_reasons: typeof r.honeypot_reasons === "string" ? JSON.parse(r.honeypot_reasons) : r.honeypot_reasons
      })),
      total: parseInt(countResult.rows[0].count),
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    console.error("Error fetching results:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/results/top", async (req, res) => {
  try {
    const { count = 100 } = req.query;
    const result = await pool.query(
      `SELECT candidate_id, profile, rank, overall_score, capability_score, founder_fit_score,
              hireability_score, trust_score, confidence_score, reasoning
       FROM candidates
       WHERE is_honeypot = false AND rank > 0
       ORDER BY rank ASC
       LIMIT $1`,
      [parseInt(count)]
    );

    res.json(result.rows.map(r => ({
      ...r,
      profile: typeof r.profile === "string" ? JSON.parse(r.profile) : r.profile
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/export/csv", async (req, res) => {
  try {
    let jdTitle = "rankings";
    const { sessionId } = req.query;
    if (sessionId) {
      const session = await pool.query("SELECT jd_title FROM ranking_sessions WHERE id = $1", [sessionId]);
      if (session.rows.length > 0 && session.rows[0].jd_title) {
        jdTitle = session.rows[0].jd_title.replace(/[^a-zA-Z0-9\s-]/g, "").trim().slice(0, 50);
      }
    }
    const { csv } = await rankingEngine.exportCsv(jdTitle);
    const filename = encodeURIComponent(jdTitle.replace(/\s+/g, "-").toLowerCase()) + ".csv";
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${filename}`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/rerank", async (req, res) => {
  try {
    const { sessionId, weights } = req.body;
    if (!sessionId || !weights) {
      return res.status(400).json({ error: "sessionId and weights are required" });
    }
    const result = await rankingEngine.reRankWithWeights(sessionId, weights);
    res.json(result);
  } catch (err) {
    console.error("Re-ranking error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/sessions", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, jd_id, jd_title, weights, candidate_count, top_score, created_at FROM ranking_sessions ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/sessions/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM ranking_sessions WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "Session not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/compare", async (req, res) => {
  try {
    const { a, b } = req.query;
    if (!a || !b) return res.status(400).json({ error: "Two candidate_ids required: ?a=CAND_X&b=CAND_Y" });
    const result = await pool.query(
      `SELECT candidate_id, profile, rank, overall_score, capability_score, founder_fit_score,
              hireability_score, trust_score, confidence_score, reasoning,
              is_honeypot, honeypot_confidence, honeypot_reasons
       FROM candidates WHERE candidate_id IN ($1, $2)`,
      [a, b]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Candidates not found" });
    const parsed = result.rows.map(r => ({
      ...r,
      profile: typeof r.profile === "string" ? JSON.parse(r.profile) : r.profile,
      honeypot_reasons: typeof r.honeypot_reasons === "string" ? JSON.parse(r.honeypot_reasons) : r.honeypot_reasons
    }));
    res.json({ candidates: parsed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
