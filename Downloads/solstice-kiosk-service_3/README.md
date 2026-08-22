# Solstice Kiosk Check-In — Async Redesign

## What changed and why

The old flow called the printer API and blocked until it returned success.
The new vendor API is fire-and-forget: you publish a print request to a
**message queue**, the vendor prints whenever it gets to it, and it calls
**your webhook** when the job is done. That means the kiosk service now has
to track a badge through states instead of getting one synchronous answer.

## State machine

```
not_checked_in --(scan, wins claim)--> pending --(webhook: success)--> checked_in
                                           |
                                           +---(webhook: failure)---> failed --(scan, retry)--> pending
```

- `pending` is the new state the UI shows immediately after a scan — this is
  the "reflect a pending state until the webhook confirmation arrives"
  requirement.
- `checked_in` is only reached via the webhook, never via the check-in call
  itself — the app never claims success it hasn't been told about.

## The two races, and how each is closed

**1. Duplicate scan (two check-in requests for the same attendee).**
Closed with a single conditional UPDATE:

```sql
UPDATE attendees SET status='pending', current_job_id=?
WHERE id=? AND status IN ('not_checked_in','failed')
```

Only one of two concurrent requests can flip `changes === 1`; the loser is
told "already pending/checked in" and never queues a second print job. This
holds even across multiple kiosk service instances, because the guarantee
comes from the database's row-level atomicity, not from in-process locking.

**2. Out-of-order webhooks.** Because a new print job can only be created
while the attendee is *not* pending, an attendee has at most one *active*
job at a time. A webhook is only allowed to change attendee state if it
matches that active job:

```sql
UPDATE attendees SET status=?, current_job_id=NULL
WHERE id=? AND current_job_id=? AND status='pending'
```

If job A fails, the attendee becomes `failed` and `current_job_id` clears.
If the attendee then retries and job B succeeds, the row now points at B.
A late-arriving webhook for A no longer matches `current_job_id` and is
dropped as stale — it can't reach back in time and undo the successful
retry. Duplicate deliveries of the *same* webhook are separately caught by
`print_jobs.status` (`WHERE status='in_progress'`), so retried webhook
deliveries are also no-ops.

## Files

- `db.js` — schema plus every state transition, each written as one
  conditional `UPDATE` so the guarantee lives in the database, not in
  application logic that could be run twice.
- `queue.js` — stands in for the vendor's real queue SDK and its webhook
  delivery. Swap `publishPrintJob` for the vendor's actual "submit job"
  call (SQS/RabbitMQ/their REST equivalent); the webhook handler itself
  (`handlePrintWebhook` in `server.js`) is already what you'd wire the
  vendor's callback to.
- `server.js` — `POST /api/checkin/:attendeeId` (returns `202 pending`
  immediately), `GET /api/status/:attendeeId` (for the UI to poll or for a
  websocket push), `POST /webhook/print-complete` (vendor calls this back).
- `test-scenario.js` — runs 3 attendees checking in, a duplicate scan while
  a print is pending, a genuine concurrent double-scan, and an out-of-order
  webhook case (a failed job's late callback arriving after a successful
  retry) — and asserts the guards hold in each case.

## Running it

```
npm install
node test-scenario.js   # scripted scenario run, logs each guard firing
node server.js           # standalone service on :3000
```

## Production notes

- Replace the in-memory SQLite (`:memory:`) with a file or server database —
  the conditional-UPDATE pattern works unchanged on Postgres/MySQL/etc.
- The kiosk UI should poll `GET /api/status/:attendeeId` (or subscribe over
  a websocket) while showing "Printing…" and flip to "Checked In" only when
  status becomes `checked_in`, and offer a retry affordance on `failed`.
- Verify the vendor's webhook signature/shared secret before trusting
  payloads to `/webhook/print-complete` in production.
