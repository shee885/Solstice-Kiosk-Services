/**
 * Stand-in for the vendor's real message queue + webhook callback.
 *
 * In production this file is replaced by:
 *   - publishPrintJob(): an SDK call to the vendor's queue
 *     (e.g. AWS SQS `sendMessage`, RabbitMQ `channel.publish`, or the
 *     vendor's own "submit print job" REST call that just returns a
 *     202/job_id instead of waiting for the print to finish).
 *   - the webhook itself: an Express route the vendor's infrastructure
 *     calls back on (see server.js /webhook/print-complete).
 *
 * Here we simulate the round trip locally with a random delay so you can
 * see out-of-order delivery happen for real, including a job whose
 * webhook is deliberately delayed past a retry to prove the stale-job
 * guard works.
 */

let onDeliver = null; // injected by server.js: (payload) => Promise

function registerDeliveryHandler(handler) {
  onDeliver = handler;
}

/**
 * @param {string} jobId
 * @param {string} attendeeId
 * @param {object} opts { delayMs, forceFailure }
 */
function publishPrintJob(jobId, attendeeId, opts = {}) {
  const delayMs = opts.delayMs ?? (300 + Math.random() * 900);
  const outcome = opts.forceFailure ? 'failure' : 'success';

  console.log(`  [queue] published job ${jobId} for ${attendeeId} (vendor will call back in ~${Math.round(delayMs)}ms)`);

  setTimeout(() => {
    if (!onDeliver) return;
    onDeliver({ job_id: jobId, attendee_id: attendeeId, status: outcome });
  }, delayMs);
}

module.exports = { publishPrintJob, registerDeliveryHandler };
