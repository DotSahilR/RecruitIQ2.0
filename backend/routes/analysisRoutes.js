const express = require("express");
const fs = require("fs");
const path = require("path");
const pool = require("../db");
const analysisController = require("../controllers/analysisController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// POST /api/analyze
router.post("/analyze", requireAuth, analysisController.analyzeCandidates);

// GET /api/results
router.get("/results", requireAuth, analysisController.getResults);

// GET /api/sessions
router.get("/sessions", requireAuth, analysisController.getSessions);

// GET /api/ocr-status?ids=1,2,3
router.get("/ocr-status", requireAuth, analysisController.getOcrStatus);

// GET /api/candidates/:id
router.get("/candidates/:id", requireAuth, analysisController.getCandidateById);

// GET /api/candidates/:id/analysis?jobId=X[&refresh=true]
//   Phase 6 + 9 — AI-generated explanation + interview questions, cached in
//   candidate_analysis. Pass refresh=true to force regeneration.
router.get(
  "/candidates/:id/analysis",
  requireAuth,
  analysisController.getAnalysis
);

// GET /api/candidates/:id/file
//   Streams the original uploaded file (PDF / DOCX / TXT / image) so the
//   frontend can render the CV exactly as submitted. Auth-protected —
//   candidates belong to a specific HR user.
//
//   Auth is accepted in two forms:
//     1. Authorization: Bearer <jwt>          (header — fetch / XHR)
//     2. ?token=<jwt>                        (query — iframe / <img> src)
//   The query-string form is needed because browsers do not forward
//   custom headers on iframe navigations, image loads, or PDF embeds.
router.get("/candidates/:id/file", async (req, res) => {
  try {
    const jwt = require("jsonwebtoken");

    const candidateId = parseInt(req.params.id, 10);
    if (Number.isNaN(candidateId)) {
      return res.status(400).json({ error: "Invalid candidate ID." });
    }

    // Resolve the JWT from either header or query string.
    let token = null;
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (req.query.token) {
      token = String(req.query.token);
    }

    if (!token) {
      return res.status(401).json({ error: "Login required." });
    }

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: "Session expired. Please log in again." });
    }
    const userId = payload.id;

    const result = await pool.query(
      "SELECT resume_path, mime_type, original_name FROM candidates WHERE id = $1 AND user_id = $2",
      [candidateId, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Candidate not found." });
    }

    const row = result.rows[0];
    if (!row.resume_path) {
      return res.status(404).json({ error: "No file on disk for this candidate." });
    }

    if (!fs.existsSync(row.resume_path)) {
      console.warn(`[file] candidate=${candidateId} path missing on disk: ${row.resume_path}`);
      return res.status(404).json({ error: "Original file is no longer on disk." });
    }

    const fallbackMime = row.mime_type || "application/octet-stream";
    const stat = fs.statSync(row.resume_path);
    const filename = row.original_name || path.basename(row.resume_path);

    res.setHeader("Content-Type", fallbackMime);
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Content-Disposition", `inline; filename="${filename.replace(/"/g, "")}"`);
    res.setHeader("Cache-Control", "private, max-age=300");
    // Refuse embedding from other origins; same-origin (the app) is fine.
    res.setHeader("X-Content-Type-Options", "nosniff");

    const stream = fs.createReadStream(row.resume_path);
    stream.on("error", (err) => {
      console.error(`[file] stream error candidate=${candidateId}:`, err.message);
      if (!res.headersSent) res.status(500).json({ error: "Failed to read file." });
    });
    stream.pipe(res);
  } catch (err) {
    console.error("[file] candidate file error:", err);
    res.status(500).json({ error: "Server error fetching candidate file." });
  }
});

module.exports = router;
