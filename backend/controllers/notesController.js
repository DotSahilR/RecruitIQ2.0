/**
 * Recruiter Notes Controller (Phase 7).
 *
 * Free-form per-candidate notes scoped to the HR user who wrote them.
 * Used by the candidate-detail page to track interview impressions, salary
 * conversations, internal alignment, etc.
 *
 *   GET    /api/candidates/:id/notes       — list this candidate's notes
 *   POST   /api/candidates/:id/notes       — create a new note
 *   DELETE /api/notes/:id                  — remove a note (must be author)
 */

const pool = require("../db");

async function _assertCandidateOwns(candidateId, userId) {
  const r = await pool.query(
    "SELECT id FROM candidates WHERE id = $1 AND user_id = $2",
    [candidateId, userId]
  );
  return r.rows.length > 0;
}

async function listNotes(req, res) {
  try {
    const candidateId = parseInt(req.params.id, 10);
    if (Number.isNaN(candidateId)) {
      return res.status(400).json({ error: "Invalid candidate ID." });
    }
    if (!(await _assertCandidateOwns(candidateId, req.user.id))) {
      return res.status(404).json({ error: "Candidate not found." });
    }

    const r = await pool.query(
      `SELECT id, note, user_id, created_at
         FROM recruiter_notes
        WHERE candidate_id = $1
        ORDER BY created_at DESC`,
      [candidateId]
    );

    console.log(`[notes] list candidate=${candidateId} user=${req.user.id} -> ${r.rows.length} note(s)`);
    return res.status(200).json({
      notes: r.rows.map((row) => ({
        id: row.id,
        note: row.note,
        authorId: row.user_id,
        createdAt: row.created_at,
      })),
    });
  } catch (err) {
    console.error("[notes] list error:", err);
    return res.status(500).json({ error: "Server error fetching notes." });
  }
}

async function createNote(req, res) {
  try {
    const candidateId = parseInt(req.params.id, 10);
    const note = String(req.body?.note || "").trim();
    if (Number.isNaN(candidateId)) {
      return res.status(400).json({ error: "Invalid candidate ID." });
    }
    if (!note) {
      return res.status(400).json({ error: "Note text is required." });
    }
    if (note.length > 4000) {
      return res.status(400).json({ error: "Note exceeds 4000 character limit." });
    }
    if (!(await _assertCandidateOwns(candidateId, req.user.id))) {
      return res.status(404).json({ error: "Candidate not found." });
    }

    const r = await pool.query(
      `INSERT INTO recruiter_notes (candidate_id, user_id, note, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING id, note, user_id, created_at`,
      [candidateId, req.user.id, note]
    );
    const row = r.rows[0];
    console.log(`[notes] create candidate=${candidateId} user=${req.user.id} note=${row.id} (${note.length} chars)`);

    return res.status(201).json({
      id: row.id,
      note: row.note,
      authorId: row.user_id,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error("[notes] create error:", err);
    return res.status(500).json({ error: "Server error creating note." });
  }
}

async function deleteNote(req, res) {
  try {
    const noteId = parseInt(req.params.id, 10);
    if (Number.isNaN(noteId)) {
      return res.status(400).json({ error: "Invalid note ID." });
    }

    // Ensure the note exists AND was written by the current user.
    const r = await pool.query(
      "SELECT id, candidate_id FROM recruiter_notes WHERE id = $1 AND user_id = $2",
      [noteId, req.user.id]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ error: "Note not found." });
    }

    await pool.query("DELETE FROM recruiter_notes WHERE id = $1 AND user_id = $2", [
      noteId,
      req.user.id,
    ]);
    console.log(`[notes] delete note=${noteId} user=${req.user.id}`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[notes] delete error:", err);
    return res.status(500).json({ error: "Server error deleting note." });
  }
}

module.exports = {
  listNotes,
  createNote,
  deleteNote,
};
