const express = require('express');
const crypto = require('crypto');
const {
  seedAttendee, getAttendee, claimForPrinting,
  createJobRecord, getJob, resolveJob, applyWebhookOutcome,
} = require('./db');
const { publishPrintJob, registerDeliveryHandler } = require('./queue');

const app = express();
app.use(express.json());

// --- Wire the simulated queue's callback to our own webhook logic ---
// In production this "handler" IS the /webhook/print-complete route below,
// called over HTTP by the vendor. We reuse the same function either way.
function handlePrintWebhook({ job_id, attendee_id, status }) {
  const job = getJob(job_id);

  if (!job) {
    console.log(`  [webhook] unknown job_id ${job_id} — ignored`);
    return { ok: true, ignored: true, reason: 'unknown_job' };
  }

  // Idempotency: a duplicate delivery of a webhook we already processed.
  const outcome = status === 'success' ? 'completed_success' : 'completed_failure';
  const jobJustResolved = resolveJob(job_id, outcome);
  if (!jobJustResolved) {
    console.log(`  [webhook] job ${job_id} already resolved — duplicate delivery ignored`);
    return { ok: true, ignored: true, reason: 'duplicate_webhook' };
  }

  // Out-of-order guard: only apply if this job is still the attendee's
  // active job and the attendee is still 'pending'. A late callback for
  // a superseded job (e.g. attendee retried after an earlier failure)
  // fails this conditional update and is safely dropped.
  const newAttendeeStatus = status === 'success' ? 'checked_in' : 'failed';
  const applied = applyWebhookOutcome(attendee_id, job_id, newAttendeeStatus);

  if (!applied) {
    console.log(`  [webhook] job ${job_id} resolved but is stale for ${attendee_id} — attendee state left untouched`);
    return { ok: true, ignored: true, reason: 'stale_job' };
  }

  console.log(`  [webhook] job ${job_id} applied: ${attendee_id} -> ${newAttendeeStatus}`);
  return { ok: true, ignored: false, attendeeStatus: newAttendeeStatus };
}

registerDeliveryHandler(handlePrintWebhook);

// --- Seed demo attendees ---
seedAttendee('A-1001', 'Grace Hopper');
seedAttendee('A-1002', 'Alan Turing');
seedAttendee('A-1003', 'Katherine Johnson');

// --- POST /api/checkin/:attendeeId ---
// No longer waits for a print result. Publishes to the queue and returns
// 'pending' immediately (or the attendee's current state, unchanged, if a
// print for them is already pending or already succeeded).
app.post('/api/checkin/:attendeeId', (req, res) => {
  const { attendeeId } = req.params;
  const attendee = getAttendee(attendeeId);

  if (!attendee) {
    return res.status(404).json({ error: 'unknown_attendee' });
  }

  if (attendee.status === 'checked_in') {
    return res.status(200).json({
      attendeeId, status: 'checked_in',
      message: 'Already checked in — no badge printed.',
    });
  }

  if (attendee.status === 'pending') {
    return res.status(202).json({
      attendeeId, status: 'pending',
      message: 'Print already in progress for this attendee.',
    });
  }

  // status is 'not_checked_in' or 'failed' -> try to claim it
  const jobId = crypto.randomUUID();
  const claimed = claimForPrinting(attendeeId, jobId);

  if (!claimed) {
    // Lost a race to a concurrent scan of the same badge between our
    // read above and the UPDATE. Report current truth, don't print twice.
    const current = getAttendee(attendeeId);
    return res.status(202).json({
      attendeeId, status: current.status,
      message: 'Concurrent scan already in progress for this attendee.',
    });
  }

  createJobRecord(jobId, attendeeId);
  publishPrintJob(jobId, attendeeId, req.body?._simulate); // _simulate is test-only

  return res.status(202).json({
    attendeeId, status: 'pending', jobId,
    message: 'Print request queued. UI should show a pending state.',
  });
});

// --- GET /api/status/:attendeeId --- for the kiosk UI to poll ---
app.get('/api/status/:attendeeId', (req, res) => {
  const attendee = getAttendee(req.params.attendeeId);
  if (!attendee) return res.status(404).json({ error: 'unknown_attendee' });
  res.json({ attendeeId: attendee.id, status: attendee.status });
});

// --- POST /webhook/print-complete --- vendor calls this back ---
app.post('/webhook/print-complete', (req, res) => {
  const result = handlePrintWebhook(req.body);
  res.status(200).json(result);
});

module.exports = app;

if (require.main === module) {
  const PORT = 3000;
  app.listen(PORT, () => console.log(`Kiosk service listening on :${PORT}`));
}
