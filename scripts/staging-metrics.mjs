// Output timings only. Request headers, cookies, IP addresses and log bodies are discarded.
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const config = JSON.parse(await readFile('data/deployment/staging.runtime.json', 'utf8'));
assert.equal(config.APP_ORIGIN, 'https://arithmetica-staging.arithmetica.workers.dev');
const users = JSON.parse(await readFile('data/deployment/staging-test-users.json', 'utf8')).users;
const scheduledOnly = process.argv.includes('--scheduled');
let scheduledResult;
const scheduledEvent = scheduledOnly
  ? new Promise((resolve) => {
      scheduledResult = resolve;
    })
  : null;
const tail = spawn(
  process.execPath,
  [
    path.resolve('node_modules/wrangler/bin/wrangler.js'),
    'tail',
    'arithmetica-staging',
    '--format',
    'json',
  ],
  {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let buffer = '',
  depth = 0,
  quoted = false,
  escaped = false,
  pending = '',
  events = 0;
tail.stdout.setEncoding('utf8');
tail.stderr.on('data', () => {});
tail.stdout.on('data', (chunk) => {
  for (const character of chunk) {
    if (!depth && character !== '{') continue;
    buffer += character;
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{') depth++;
    else if (character === '}') depth--;
    if (!depth) {
      try {
        const event = JSON.parse(buffer);
        if (scheduledOnly && event.event?.cron) {
          scheduledResult({
            cron: event.event.cron,
            outcome: event.outcome,
            cpuMs: event.cpuTime,
            exceptionCount: event.exceptions?.length || 0,
          });
        } else if (!scheduledOnly && event.event?.request?.url) {
          events++;
          console.log(
            JSON.stringify({
              path: new URL(event.event.request.url).pathname,
              status: event.event.response?.status,
              cpuMs: event.cpuTime,
              wallMs: event.wallTime,
              outcome: event.outcome,
              exceptionCount: event.exceptions?.length || 0,
            }),
          );
        }
      } catch {
        pending = 'Timing parse failed.';
      }
      buffer = '';
    }
  }
});
try {
  if (scheduledOnly) {
    let deadline;
    const result = await Promise.race([
      scheduledEvent,
      new Promise((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error('No staging scheduled event was observed within 16 minutes.')),
          16 * 60000,
        );
      }),
    ]);
    clearTimeout(deadline);
    assert.equal(result.outcome, 'ok');
    assert.equal(result.exceptionCount, 0);
    console.log(JSON.stringify(result));
  } else {
    // Allow the official tail subscription to establish; no application credentials are in tool output.
    await new Promise((resolve) => setTimeout(resolve, 4000));
    const fixture = users.find((user) => user.role === 'owner');
    const login = await fetch(config.APP_ORIGIN + '/api/auth', {
      method: 'POST',
      headers: { Origin: config.APP_ORIGIN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fixture.email, password: fixture.password }),
    });
    assert.equal(login.status, 200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    for (const resource of [
      '/login',
      '/api/state',
      '/api/state',
      '/api/state',
      '/api/reports?preview=true&kind=monthly&period=2026-10-01&format=xlsx',
      '/api/export',
    ]) {
      const response = await fetch(config.APP_ORIGIN + resource, { headers: { Cookie: cookie } });
      assert.equal(response.status, 200);
      await response.arrayBuffer();
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
    assert.ok(events > 0, pending || 'No timing events received.');
  }
} finally {
  tail.kill('SIGTERM');
}
