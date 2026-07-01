const express = require("express");
const router = express.Router();
const pool = require("../db");
const jdIntelligence = require("../services/jdIntelligence");
const embeddingService = require("../services/embeddingService");

router.post("/analyze", async (req, res) => {
  try {
    const { text, title } = req.body;

    if (!text || text.trim().length === 0) {
      return res.status(400).json({ error: "Job description text is required" });
    }

    const signals = jdIntelligence.extractSignals(text);
    const jdEmbedding = await embeddingService.generateJdEmbedding(text);

    const result = await pool.query(
      `INSERT INTO jd_analyses (title, description, embedding, embedding_model, technical_signals, founder_signals, hireability_signals, negative_signals)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [
        title || "Untitled JD",
        text,
        jdEmbedding,
        "all-MiniLM-L6-v2",
        JSON.stringify(signals.technicalSignals),
        JSON.stringify(signals.founderSignals),
        JSON.stringify(signals.hireabilitySignals),
        JSON.stringify(signals.negativeSignals)
      ]
    );

    res.json({
      id: result.rows[0].id,
      signals,
      message: "JD analyzed successfully"
    });
  } catch (err) {
    console.error("JD analysis error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get("/analyses", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, title, technical_signals, founder_signals, hireability_signals, negative_signals, created_at FROM jd_analyses ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/analyses/:id", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM jd_analyses WHERE id = $1", [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: "JD analysis not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
