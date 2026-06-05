const express = require("express");
const pipelineController = require("../controllers/pipelineController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// GET /api/pipeline — 7-column kanban payload for the logged-in user
router.get("/pipeline", requireAuth, pipelineController.getPipeline);

// PATCH /api/candidates/:id/status — move a candidate between columns
router.patch(
  "/candidates/:id/status",
  requireAuth,
  pipelineController.updateStatus
);

module.exports = router;
