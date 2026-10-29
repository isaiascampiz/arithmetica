// Read-only release/reconciliation checks. Never creates students, sessions or fictional records.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory = 'data/deployment';
const config = JSON.parse(await readFile(`${directory}/production.runtime.json`, 'utf8'));
const plan = JSON.parse(await readFile(`${directory}/production-plan.json`, 'utf8'));
assert.equal(config.DEPLOYMENT_ENV, 'production');
assert.equal(config.APP_ORIGIN, 'https://arithmetica.arithmetica.workers.dev');
assert.equal(config.CENTER_ID, plan.centerId);
assert.equal(config.NEXT_PUBLIC_SUPABASE_URL, `https://${plan.projectRef}.supabase.co`);
const base = config.NEXT_PUBLIC_SUPABASE_URL;
const headersFor = (key) => ({
  apikey: key,
  Authorization: `Bearer ${key}`,
  'Content-Type': 'application/json',
});
const headers = headersFor(config.SUPABASE_SERVICE_ROLE_KEY),
  anon = headersFor(config.NEXT_PUBLIC_SUPABASE_ANON_KEY);
async function service(resource, init) {
  const response = await fetch(base + resource, {
    ...init,
    headers,
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200, `Production read ${resource.split('?')[0]} failed.`);
  return response.json();
}
const state = await service('/rest/v1/rpc/read_centerflow', {
  method: 'POST',
  body: JSON.stringify({ p_center: plan.centerId }),
});
assert.equal(state.payload.schemaVersion, 3);
assert.equal(state.payload.operations.v3.dataMode, 'production');
assert.equal(state.payload.operations.center.name, 'Kumon Learning Center · Yuba City');
assert.equal(
  state.payload.students.some((student) => student.name.startsWith('Fictional ')),
  false,
);
const versions = await service('/rest/v1/application_versions?order=version.asc');
assert.deepEqual(
  versions.map((version) => version.version),
  [1, 2, 3, 4, 5],
);
const members = await service(
  `/rest/v1/staff_memberships?center_id=eq.${plan.centerId}&active=eq.true`,
);
assert.ok(members.some((member) => member.role === 'owner'));
let isolationChecks = 0;
for (const resource of [
  'centerflow_states',
  'centerflow_state_history',
  'students',
  'observations',
  'staff_memberships',
]) {
  const denied = await fetch(`${base}/rest/v1/${resource}?select=*&limit=1`, {
    headers: anon,
    signal: AbortSignal.timeout(30000),
  });
  assert.ok([401, 403].includes(denied.status));
  isolationChecks++;
}
for (const name of ['read_arithmetica_if_changed', 'read_centerflow', 'write_centerflow']) {
  const args =
    name === 'write_centerflow'
      ? { p_center: plan.centerId, p_expected_revision: -1, p_payload: {} }
      : name === 'read_centerflow'
        ? { p_center: plan.centerId }
        : { p_center: plan.centerId, p_revision: -1 };
  const response = await fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: anon,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(30000),
  });
  assert.ok([401, 403].includes(response.status));
  isolationChecks++;
}
const login = await fetch(config.APP_ORIGIN + '/login', { signal: AbortSignal.timeout(30000) });
assert.equal(login.status, 200);
assert.equal(login.headers.get('x-frame-options'), 'DENY');
assert.equal(login.headers.get('x-content-type-options'), 'nosniff');
const unauthenticated = await fetch(config.APP_ORIGIN + '/api/state', {
  signal: AbortSignal.timeout(30000),
});
assert.equal(unauthenticated.status, 401);
assert.match(unauthenticated.headers.get('cache-control'), /no-store/);
if (process.argv.includes('--reconcile')) {
  const source = process.argv[process.argv.indexOf('--reconcile') + 1];
  assert.ok(source, 'Pass the exact authorized private pending roster.');
  const roster = JSON.parse(await readFile(source, 'utf8'));
  assert.equal(state.payload.students.length, roster.profiles.length);
  assert.deepEqual(
    state.payload.students.map((student) => student.id).sort(),
    roster.profiles.map((profile) => profile.intakeId).sort(),
  );
  for (const profile of roster.profiles) {
    const student = state.payload.students.find((student) => student.id === profile.intakeId);
    const settings = state.payload.operations.students[student.id];
    assert.equal(student.firstName, profile.firstName);
    assert.equal(student.lastName, profile.lastName);
    assert.equal(student.name, `${profile.firstName} ${profile.lastName}`);
    assert.equal(settings.grade, profile.grade || null);
    assert.equal(settings.enrollmentDate, profile.enrollmentDate);
    assert.deepEqual(
      student.subjects,
      profile.subjects.map((subject) => subject.subject),
    );
    assert.deepEqual(settings.intake.sourceRows, profile.sourceRows);
    assert.equal(settings.intake.sourceSha256, roster.sourceSha256);
    assert.equal(settings.intake.batchRequestId, roster.batchRequestId);
    assert.deepEqual(settings.recurringDays, []);
    for (const sourceSubject of profile.subjects) {
      const subject = settings.subjects[sourceSubject.subject];
      assert.equal(subject.enrolled, true);
      assert.equal(subject.level, sourceSubject.level);
      assert.equal(
        settings.intake.subjectEnrollmentDates[sourceSubject.subject],
        sourceSubject.enrollmentDate,
      );
      assert.equal(subject.format, 'Unspecified');
      assert.equal(subject.setupPending, true);
      assert.equal(subject.currentStart, 0);
      assert.equal(subject.nextStart, 0);
    }
  }
  assert.equal(state.payload.visits.length, 0);
  assert.equal(state.payload.observations.length, 0);
  assert.equal(state.payload.operations.assignments.length, 0);
  assert.equal(state.payload.operations.completions.length, 0);
}
console.log(
  JSON.stringify(
    {
      environment: 'production',
      readOnly: true,
      schemaVersions: versions.map((version) => version.version),
      anonymousIsolationChecks: isolationChecks,
      loginAndSecurityHeaders: 'passed',
      students: state.payload.students.length,
      subjects: state.payload.students.reduce(
        (count, student) => count + student.subjects.length,
        0,
      ),
      fictionalOperationalStudents: 0,
      fieldReconciliation: process.argv.includes('--reconcile') ? 'passed' : 'not requested',
    },
    null,
    2,
  ),
);
