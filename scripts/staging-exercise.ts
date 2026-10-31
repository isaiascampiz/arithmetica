/** Live synthetic-only checks through the deployed application, never the real intake file. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { fictionalPendingRoster } from '../tests/fixtures/pending-roster';
import { validateDatabase } from '../src/lib/repository';
import type { Snapshot } from '../src/lib/model';
import type { Subject } from '../src/lib/v2-model';

async function main() {
  const directory = 'data/deployment';
  const config = JSON.parse(await readFile(`${directory}/staging.runtime.json`, 'utf8'));
  const fixtures = JSON.parse(await readFile(`${directory}/staging-test-users.json`, 'utf8'));
  assert.equal(config.APP_ORIGIN, 'https://arithmetica-staging.arithmetica.workers.dev');
  assert.equal(config.CENTER_ID, fixtures.centerId);
  assert.equal(
    new URL(config.NEXT_PUBLIC_SUPABASE_URL).hostname,
    `${fixtures.projectRef}.supabase.co`,
  );
  const origin = config.APP_ORIGIN;
  const apiOrigin = process.env.ARITHMETICA_STAGING_TEST_ORIGIN || origin;
  assert.ok(
    [origin, 'http://127.0.0.1:8788'].includes(apiOrigin),
    'Only synthetic staging or its loopback runtime test is allowed.',
  );
  let checks = 0;
  class Client {
    cookies = new Map<string, string>();
    async request(path: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') {
      const response = await fetch(apiOrigin + path, {
        method,
        headers: {
          Origin: origin,
          Cookie: [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; '),
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(45000),
        redirect: 'manual',
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(';')[0],
          at = pair.indexOf('=');
        if (/max-age=0/i.test(cookie) || !pair.slice(at + 1))
          this.cookies.delete(pair.slice(0, at));
        else {
          assert.match(cookie, /HttpOnly/i, 'Session cookies must be inaccessible to scripts.');
          assert.match(cookie, /Secure/i, 'Session cookies must require HTTPS.');
          assert.match(cookie, /SameSite=Strict/i);
          this.cookies.set(pair.slice(0, at), pair.slice(at + 1));
        }
      }
      return response;
    }
    async json(path: string, body?: unknown, status = 200, method?: string) {
      const response = await this.request(path, body, method);
      assert.equal(
        response.status,
        status,
        `${path} must return ${status}, received ${response.status}.`,
      );
      assert.match(response.headers.get('cache-control') || '', /no-store/);
      checks++;
      return response.json();
    }
    async login(role: string) {
      const user = fixtures.users.find((item: { role: string }) => item.role === role);
      assert.ok(user?.email.endsWith('@arithmetica.invalid'));
      await this.json('/api/auth', {
        email: user.email,
        password: user.password,
      });
    }
    async state(): Promise<Snapshot> {
      const state = await this.json('/api/state');
      assert.equal(state.runtime.environment, 'staging');
      assert.match(state.operations.center.name, /^Arithmetica staging/);
      assert.ok(
        state.students.every((student: { name: string }) => student.name.startsWith('Fictional ')),
      );
      return state;
    }
    command(command: unknown, requestId: string = randomUUID(), status = 200) {
      return this.json('/api/commands', { kind: 'v3', command, requestId }, status);
    }
  }

  const owner = new Client(),
    instructor = new Client(),
    assistant = new Client(),
    kiosk = new Client();
  await owner.json('/api/state', undefined, 401);
  await owner.login('owner');
  await instructor.login('instructor');
  await assistant.login('assistant');
  let snapshot = await owner.state();
  assert.equal(snapshot.staff.role, 'owner');
  const rosterPath = `${directory}/staging-synthetic-roster.json`;
  let roster: ReturnType<typeof fictionalPendingRoster>;
  try {
    roster = JSON.parse(await readFile(rosterPath, 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    assert.equal(
      snapshot.students.length,
      0,
      'Only an empty synthetic staging center may start this exercise.',
    );
    roster = fictionalPendingRoster();
    const template = roster.profiles[0];
    let sourceRow = 2;
    roster.profiles = Array.from({ length: 71 }, (_, index) => {
      const subjects = template.subjects.filter((item) =>
        item.subject === 'Math' ? index < 61 : index >= 27 && index < 68,
      );
      return {
        ...structuredClone(template),
        intakeId: randomUUID(),
        lastName: `QA Student ${String(index + 1).padStart(3, '0')}`,
        subjects: structuredClone(subjects),
        sourceRows: Array.from({ length: Math.max(1, subjects.length) }, () => sourceRow++),
      };
    });
    roster.sourceSha256 = createHash('sha256')
      .update(JSON.stringify(roster.profiles))
      .digest('hex');
    await writeFile(rosterPath, JSON.stringify(roster, null, 2), {
      flag: 'wx',
      mode: 0o600,
    });
  }
  assert.equal(roster.sourceSheet, 'Fictional source');
  assert.ok(roster.profiles.every((profile) => profile.firstName === 'Fictional'));
  const importRequest = { expectedRevision: snapshot.revision, roster };
  await instructor.json('/api/admin/roster', importRequest, 403);
  const imported = await owner.json('/api/admin/roster', importRequest);
  assert.equal(imported.imported, 71);
  const retry = await owner.json('/api/admin/roster', importRequest);
  assert.equal(retry.duplicate, true);
  snapshot = await owner.state();
  assert.equal(snapshot.students.length, 71);
  assert.equal(
    snapshot.students.reduce((n, student) => n + student.subjects.length, 0),
    102,
  );
  assert.equal(snapshot.operations!.completions.length, 0);
  assert.equal(snapshot.operations!.assignments.length, 0);
  for (const student of snapshot.students) {
    assert.match(student.token, /^AR-/);
    const settings = snapshot.operations!.students[student.id];
    for (const subject of student.subjects) {
      assert.equal(settings.subjects[subject as Subject].format, 'Unspecified');
      assert.equal(settings.subjects[subject as Subject].currentStart, 0);
    }
  }

  // Stable requests make an interrupted exercise safe to resume on the same day.
  const student = snapshot.students[0];
  const requestId = (label: string) =>
    createHash('sha256').update(`${roster.batchRequestId}:${label}`).digest('hex');
  await assistant.json('/api/commands', {
    kind: 'attendance',
    studentId: student.id,
    direction: 'in',
    requestId: requestId('attendance'),
  });
  snapshot = await owner.state();
  const visit = snapshot.visits.find((item) => item.studentId === student.id)!;
  assert.ok(visit);
  const activity = {
    action: 'activity-check-in',
    visitId: visit.id,
    subject: 'Math',
    activity: 'Worksheets',
    expectedAt: null,
    expectedFeaturesVersion: 0,
    text: 'Fictional staging activity before homework setup.',
  };
  await assistant.command(activity, randomUUID(), 403);
  await instructor.command(activity, requestId('activity'));
  await instructor.command(activity, requestId('activity'));
  await assistant.json('/api/export', undefined, 403);
  await instructor.json('/api/export', undefined, 403);

  // Two independent staff devices edit the same profile: exactly one wins.
  snapshot = await owner.state();
  const settings = snapshot.operations!.students[student.id];
  const profile = {
    action: 'student-save',
    studentId: student.id,
    name: student.name,
    firstName: student.firstName,
    lastName: student.lastName,
    earlyLearner: false,
    settings: structuredClone(settings),
    enrollmentDate: settings.enrollmentDate,
    visitDays: [],
    tiles: [],
    goals: '',
    arrivalWindow: '',
  };
  const results = await Promise.all([
    owner.request('/api/commands', {
      kind: 'v3',
      command: profile,
      requestId: randomUUID(),
    }),
    instructor.request('/api/commands', {
      kind: 'v3',
      command: profile,
      requestId: randomUUID(),
    }),
  ]);
  assert.deepEqual(results.map((response) => response.status).sort(), [200, 409]);
  await Promise.all(results.map((response) => response.body?.cancel()));
  checks++;

  await kiosk.login('assistant');
  await kiosk.json('/api/kiosk', {}, 200, 'PUT');
  assert.equal(kiosk.cookies.has('cf-cloud'), false);
  assert.equal(kiosk.cookies.has('cf-refresh'), false);
  await kiosk.json('/api/state', undefined, 401);
  await kiosk.json('/api/export', undefined, 401);
  const ready = await kiosk.json('/api/kiosk');
  assert.deepEqual(Object.keys(ready).sort(), ['confirmationSeconds', 'demo', 'ready']);
  assert.deepEqual(await kiosk.json('/api/kiosk/name', { prefix: 'Fi' }), {
    completion: null,
  });
  assert.deepEqual(await kiosk.json('/api/kiosk/name', { prefix: 'Fictional' }), {
    completion: null,
  });
  const arrivalStudent = snapshot.students[1];
  assert.deepEqual(await kiosk.json('/api/kiosk/name', { prefix: arrivalStudent.name }), {
    completion: arrivalStudent.name,
  });
  const attendanceRequest = {
    token: arrivalStudent.token,
    requestId: randomUUID(),
  };
  const receipt = await kiosk.json('/api/kiosk', attendanceRequest);
  assert.deepEqual(Object.keys(receipt).sort(), ['changed', 'direction', 'message', 'studentName']);
  assert.equal(receipt.studentName, arrivalStudent.name);
  assert.deepEqual(await kiosk.json('/api/kiosk', attendanceRequest), receipt);

  const backupResponse = await owner.request('/api/export');
  assert.equal(backupResponse.status, 200);
  const backup = await backupResponse.text();
  const restored = JSON.parse(backup);
  validateDatabase(restored);
  assert.equal(restored.students.length, 71);
  assert.equal(restored.operations.completions.length, 0);
  assert.equal(restored.operations.assignments.length, 0);
  const observedVisit = restored.visits.find((item: { id: string }) => item.id === visit.id);
  assert.equal(observedVisit.sessionRecords.length, 1);
  assert.equal(observedVisit.sessionRecords[0].mode, 'activity-only');
  assert.ok(restored.observations.some((item: { text: string }) => item.text === activity.text));
  const path = `${directory}/staging-backup-${Date.now()}.json`;
  await writeFile(path, backup, { flag: 'wx', mode: 0o600 });
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), restored);
  checks++;
  const report = await owner.request(
    '/api/reports?preview=true&kind=monthly&period=2026-10-01&format=xlsx',
  );
  assert.equal(report.status, 200, 'Monthly Excel export must work on the actual free Worker.');
  const workbook = Buffer.from(await report.arrayBuffer());
  assert.equal(workbook.subarray(0, 2).toString(), 'PK');
  checks++;
  await owner.json('/api/auth', undefined, 200, 'DELETE');
  await owner.json('/api/state', undefined, 401);
  console.log(
    JSON.stringify(
      {
        checks,
        students: 71,
        subjects: 102,
        concurrentEdit: 'one saved, one rejected',
        kioskIsolation: 'passed',
        duplicateImportAndAttendance: 'passed',
        activityWithoutInventedPaper: 'passed',
        backupReadback: 'passed',
        excelBytes: workbook.length,
        backupFile: path,
        realStudentTesting: false,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Staging exercise failed.');
  process.exitCode = 1;
});
