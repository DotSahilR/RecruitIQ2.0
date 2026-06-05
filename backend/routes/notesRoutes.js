const express = require("express");
const notesController = require("../controllers/notesController");
const { requireAuth } = require("../middleware/authMiddleware");

const router = express.Router();

// GET    /api/candidates/:id/notes  — list notes for one candidate
// POST   /api/candidates/:id/notes  — create a new note
router.get("/candidates/:id/notes", requireAuth, notesController.listNotes);
router.post("/candidates/:id/notes", requireAuth, notesController.createNote);

// DELETE /api/notes/:id  — remove a note (must be author)
router.delete("/notes/:id", requireAuth, notesController.deleteNote);

module.exports = router;
