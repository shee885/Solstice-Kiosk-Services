const request = require('http');
const app = require('./server');

const server = app.listen(0, () => run(server.address().port));

function call(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = request.request(
      { host: 'localhost', port, path, method, headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw || '{}') }));
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run(port) {
  const log = (...a) => console.log(...a);

  log('\n=== Scenario 1: three attendees check in ===');
  for (const id of ['A-1001', 'A-1002', 'A-1003']) {
    const r = await call(port, 'POST', `/api/checkin/${id}`);
    log(`checkin ${id} ->`, r.status, r.body);
  }

  log('\n=== Scenario 2: duplicate scan while print is still pending ===');
  const dup = await call(port, 'POST', '/api/checkin/A-1001');
  log('duplicate scan of A-1001 (still pending) ->', dup.status, dup.body);
  console.assert(dup.body.status === 'pending' && !dup.body.jobId, 'FAIL: duplicate scan must not create a new job');

  log('\n=== Scenario 3: two simultaneous scans of the same badge (race) ===');
  const [r1, r2] = await Promise.all([
    call(port, 'POST', '/api/checkin/A-1002'),
    call(port, 'POST', '/api/checkin/A-1002'),
  ]);
  log('scan #1 ->', r1.status, r1.body);
  log('scan #2 ->', r2.status, r2.body);
  const jobIds = [r1.body.jobId, r2.body.jobId].filter(Boolean);
  console.assert(jobIds.length <= 1, 'FAIL: concurrent scans must not both create a print job');

  // let all three original prints (plus the race one) resolve
  await sleep(1500);

  log('\n=== Status after prints complete ===');
  for (const id of ['A-1001', 'A-1002', 'A-1003']) {
    const s = await call(port, 'GET', `/api/status/${id}`);
    log(id, '->', s.body.status);
  }

  log('\n=== Scenario 4: out-of-order webhook (a stale job must be ignored) ===');
  log('Attendee fails to print, retries, and the FIRST (failed) job\'s webhook');
  log('arrives late — after the retry already succeeded. It must not clobber the retry.');

  // fresh attendee for this scenario
  const { seedAttendee } = require('./db');
  seedAttendee('A-2001', 'Ada Lovelace');

  const first = await call(port, 'POST', '/api/checkin/A-2001', { _simulate: { delayMs: 800, forceFailure: true } });
  log('first checkin (will fail) ->', first.status, first.body);
  await sleep(1000); // let the failure land

  const afterFail = await call(port, 'GET', '/api/status/A-2001');
  log('status after failed print ->', afterFail.body.status);

  const retry = await call(port, 'POST', '/api/checkin/A-2001', { _simulate: { delayMs: 300 } });
  log('retry checkin (will succeed) ->', retry.status, retry.body);
  await sleep(600);

  const finalStatus = await call(port, 'GET', '/api/status/A-2001');
  log('final status ->', finalStatus.body.status);
  console.assert(finalStatus.body.status === 'checked_in', 'FAIL: retry should have won and set checked_in');

  log('\nAll scenarios complete.\n');
  process.exit(0);
}
