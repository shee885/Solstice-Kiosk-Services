const Database = require('better-sqlite3');
const db = new Database(':memory:'); // swap for a file path / real DB in production

db.exec(`
  CREATE TABLE attendees (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_checked_in'
      CHECK (status IN ('not_checked_in','pending','checked_in','failed')),
    current_job_id TEXT,        -- the ONE print job allowed to resolve this attendee right now
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE print_jobs (
    job_id TEXT PRIMARY KEY,
    attendee_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'in_progress'
      CHECK (status IN ('in_progress','completed_success','completed_failure','ignored_stale')),
    created_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
  );
`);

function seedAttendee(id, name) {
  db.prepare(`INSERT INTO attendees (id, name) VALUES (?, ?)`).run(id, name);
}

function getAttendee(id) {
  return db.prepare(`SELECT * FROM attendees WHERE id = ?`).get(id);
}

/**
 * Atomically claim an attendee for printing.
 * Only succeeds if the attendee is currently 'not_checked_in' or 'failed'
 * (i.e. no print is already pending). This is the duplicate-scan guard:
 * two simultaneous scans race on this UPDATE, only one can win the row.
 */
function claimForPrinting(attendeeId, jobId) {
  const result = db.prepare(`
    UPDATE attendees
    SET status = 'pending', current_job_id = ?, updated_at = datetime('now')
    WHERE id = ? AND status IN ('not_checked_in','failed')
  `).run(jobId, attendeeId);
  return result.changes === 1; // true = this request won the race and owns the print job
}

function createJobRecord(jobId, attendeeId) {
  db.prepare(`INSERT INTO print_jobs (job_id, attendee_id) VALUES (?, ?)`).run(jobId, attendeeId);
}

function getJob(jobId) {
  return db.prepare(`SELECT * FROM print_jobs WHERE job_id = ?`).get(jobId);
}

/**
 * Mark a job as resolved (idempotent: WHERE status='in_progress' means a
 * second delivery of the same webhook is a no-op, changes === 0).
 */
function resolveJob(jobId, outcome) {
  const result = db.prepare(`
    UPDATE print_jobs
    SET status = ?, completed_at = datetime('now')
    WHERE job_id = ? AND status = 'in_progress'
  `).run(outcome, jobId);
  return result.changes === 1;
}

/**
 * Apply the webhook's outcome to the attendee, but ONLY if this job is
 * still the attendee's currently-active job AND the attendee is still
 * 'pending'. This is the out-of-order guard: a stale/late webhook for a
 * job that's no longer the active one (attendee moved on to a retry, or
 * this callback is a duplicate delivery) is rejected by the WHERE clause,
 * not by application-level "is this the newest timestamp" logic.
 */
function applyWebhookOutcome(attendeeId, jobId, newStatus) {
  const result = db.prepare(`
    UPDATE attendees
    SET status = ?, current_job_id = NULL, updated_at = datetime('now')
    WHERE id = ? AND current_job_id = ? AND status = 'pending'
  `).run(newStatus, attendeeId, jobId);
  return result.changes === 1;
}

module.exports = {
  db, seedAttendee, getAttendee, claimForPrinting,
  createJobRecord, getJob, resolveJob, applyWebhookOutcome,
};
