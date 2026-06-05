/**
 * Pipeline Controller (Phase 8).
 *
 * Powers the kanban view at /pipeline. All candidates for the logged-in HR
 * user, grouped by their current candidate_status row.
 *
 *   GET    /api/pipeline                  — list all candidates in 7 columns
 *   PATCH  /api/candidates/:id/status     — move one candidate to a new status
 *
 * Status enum is enforced both by the DB CHECK constraint and the in-code
 * VALID_STATUSES set, so a typo from the frontend never silently lands.
 */

const pool = require("../db");

const VALID_STATUSES = [
  "Applied",
  "Screened",
  "Shortlisted",
  "Interview",
  "Offer",
  "Hired",
  "Rejected",
];

/**
 * GET /api/pipeline
 * Returns candidates grouped into the 7 kanban columns, plus a per-status
 * count summary. Includes a top-skills list per card (capped at 6) so the
 * kanban can render without a second round-trip.
 */
async function getPipeline(req, res) {
  try {
    const userId = req.user.id;
    console.log(`[pipeline] getPipeline user=${userId}`);

    // One round-trip: candidate + status (LEFT, default 'Applied') + last
    // session's job title for context. Sort: most-recently-touched first
    // (status update time if available, else candidate id as a proxy).
    const candRes = await pool.query(
      `SELECT
         c.id, c.name, c.email, c.role, c.location, c.score, c.rank,
         c.experience, c.summary,
         COALESCE(cs.status, 'Applied')            AS status,
         cs.updated_at                              AS status_updated_at,
         j.title                                    AS job_title,
         ss.algorithm_version                       AS algo_version,
         ss.created_at                              AS session_created_at
       FROM candidates c
       LEFT JOIN candidate_status    cs ON cs.candidate_id = c.id
       LEFT JOIN screening_sessions  ss ON ss.id = c.session_id
       LEFT JOIN jobs                 j ON j.id = ss.job_id
       WHERE c.user_id = $1
       ORDER BY
         cs.updated_at DESC NULLS LAST,
         c.id DESC`,
      [userId]
    );

    const candidates = candRes.rows;

    // Second round-trip: skills for the visible candidates. We grab all of
    // them and group in-memory; the list is bounded by the user's total
    // candidates so this is fine.
    let skillsByCandidate = new Map();
    if (candidates.length > 0) {
      const ids = candidates.map((c) => c.id);
      const skillsRes = await pool.query(
        `SELECT candidate_id, skill_name
           FROM skills
          WHERE candidate_id = ANY($1::int[])
          ORDER BY candidate_id, id`,
        [ids]
      );
      for (const row of skillsRes.rows) {
        if (!skillsByCandidate.has(row.candidate_id)) {
          skillsByCandidate.set(row.candidate_id, []);
        }
        const list = skillsByCandidate.get(row.candidate_id);
        if (list.length < 6) list.push(row.skill_name);
      }
    }

    // Build the 7 columns, always in the canonical order, even when empty.
    const columns = VALID_STATUSES.map((status) => {
      const inColumn = candidates.filter((c) => c.status === status);
      return {
        status,
        count: inColumn.length,
        candidates: inColumn.map((c) => ({
          id: String(c.id),
          name: c.name,
          email: c.email,
          role: c.role || "",
          location: c.location || "",
          score: Number(c.score) || 0,
          rank: c.rank || 0,
          experience: c.experience || 0,
          summary: c.summary || "",
          topSkills: skillsByCandidate.get(c.id) || [],
          jobTitle: c.job_title || null,
          algorithmVersion: c.algo_version || null,
          statusUpdatedAt: c.status_updated_at || null,
        })),
      };
    });

    const counts = Object.fromEntries(columns.map((col) => [col.status, col.count]));
    console.log(`[pipeline] getPipeline user=${userId} -> 200 total=${candidates.length} counts=${JSON.stringify(counts)}`);

    return res.status(200).json({
      columns,
      counts,
      total: candidates.length,
      statuses: VALID_STATUSES,
    });
  } catch (err) {
    console.error("[pipeline] getPipeline error:", err);
    return res.status(500).json({ error: "Server error fetching pipeline." });
  }
}

/**
 * PATCH /api/candidates/:id/status
 * Body: { status: "Shortlisted" }
 */
async function updateStatus(req, res) {
  try {
    const userId = req.user.id;
    const numericId = parseInt(req.params.id, 10);
    const newStatus = String(req.body?.status || "").trim();

    if (Number.isNaN(numericId)) {
      return res.status(400).json({ error: "Invalid candidate ID." });
    }
    if (!VALID_STATUSES.includes(newStatus)) {
      return res.status(400).json({
        error: `Invalid status "${newStatus}". Must be one of: ${VALID_STATUSES.join(", ")}.`,
      });
    }

    // Confirm the candidate belongs to this user before mutating.
    const ownRes = await pool.query(
      "SELECT id FROM candidates WHERE id = $1 AND user_id = $2",
      [numericId, userId]
    );
    if (ownRes.rows.length === 0) {
      return res.status(404).json({ error: "Candidate not found." });
    }

    // Read the previous status for logging.
    const prevRes = await pool.query(
      "SELECT status FROM candidate_status WHERE candidate_id = $1",
      [numericId]
    );
    const prevStatus = prevRes.rows[0]?.status || "Applied";

    // UPSERT the status row.
    const upRes = await pool.query(
      `INSERT INTO candidate_status (candidate_id, status, updated_at)
         VALUES ($1, $2, NOW())
       ON CONFLICT (candidate_id) DO UPDATE
         SET status = EXCLUDED.status, updated_at = NOW()
       RETURNING status, updated_at`,
      [numericId, newStatus]
    );

    console.log(`[status] update candidate=${numericId} user=${userId} ${prevStatus} -> ${newStatus}`);

    return res.status(200).json({
      candidateId: numericId,
      previousStatus: prevStatus,
      status: upRes.rows[0].status,
      updatedAt: upRes.rows[0].updated_at,
    });
  } catch (err) {
    console.error("[pipeline] updateStatus error:", err);
    return res.status(500).json({ error: "Server error updating candidate status." });
  }
}

module.exports = {
  VALID_STATUSES,
  getPipeline,
  updateStatus,
};
