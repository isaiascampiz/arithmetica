import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const directory = path.resolve('data/deployment');
const plan = JSON.parse(await readFile(path.join(directory, 'staging-plan.json'), 'utf8'));
const config = JSON.parse(await readFile(path.join(directory, 'staging.runtime.json'), 'utf8'));
assert.match(plan.projectRef, /^[a-z]{20}$/);
assert.equal(config.NEXT_PUBLIC_SUPABASE_URL, `https://${plan.projectRef}.supabase.co`);
assert.equal(config.CENTER_ID, plan.centerId);
const base = config.NEXT_PUBLIC_SUPABASE_URL;
const serviceHeaders = {
  apikey: config.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};
const anonHeaders = {
  apikey: config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${config.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
};
async function rpc(name, args, headers = serviceHeaders) {
  return fetch(`${base}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(20000),
  });
}
const response = await rpc('read_arithmetica_if_changed', {
  p_center: plan.centerId,
  p_revision: -1,
});
assert.equal(response.status, 200, 'Staging service RPC must succeed. No key values are logged.');
const state = await response.json();
assert.equal(state.payload.operations.v3.dataMode, 'production');
assert.match(state.payload.operations.center.name, /^Arithmetica staging/);
assert.ok(
  state.payload.students.every((student) => student.name.startsWith('Fictional ')),
  'Never run simulations against real students.',
);
const conditionalResponse = await rpc('read_arithmetica_if_changed', {
  p_center: plan.centerId,
  p_revision: state.revision,
});
const conditionalText = await conditionalResponse.text();
const conditional = JSON.parse(conditionalText);
assert.equal(conditional.unchanged, true);
assert.equal('payload' in conditional, false);
for (const resource of [
  'centerflow_states',
  'centerflow_state_history',
  'students',
  'observations',
  'staff_memberships',
]) {
  const denied = await fetch(`${base}/rest/v1/${resource}?select=*&limit=1`, {
    headers: anonHeaders,
    signal: AbortSignal.timeout(20000),
  });
  assert.ok([401, 403].includes(denied.status), `Anonymous read must be denied for ${resource}.`);
}
for (const name of ['read_arithmetica_if_changed', 'read_centerflow', 'write_centerflow']) {
  const args =
    name === 'write_centerflow'
      ? {
          p_center: plan.centerId,
          p_expected_revision: -1,
          p_payload: { schemaVersion: 3, revision: 0 },
        }
      : name === 'read_centerflow'
        ? { p_center: plan.centerId }
        : { p_center: plan.centerId, p_revision: -1 };
  const denied = await rpc(name, args, anonHeaders);
  assert.ok([401, 403].includes(denied.status), `Anonymous RPC must be denied for ${name}.`);
}
console.log(
  JSON.stringify(
    {
      project: 'arithmetica-staging',
      serviceRead: 'passed',
      anonymousIsolationChecks: 8,
      conditionalReplyBytes: Buffer.byteLength(conditionalText),
      students: state.payload.students.length,
      realStudentTesting: false,
    },
    null,
    2,
  ),
);
if (process.argv.includes('--prepare-auth')) {
  const destination = path.join(directory, 'staging-test-users.json');
  try {
    await readFile(destination);
    console.log('Synthetic test users already prepared; existing credentials preserved.');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const users = [];
    for (const role of ['owner', 'instructor', 'assistant']) {
      const email = `qa-${role}-${plan.centerId.slice(0, 8)}@arithmetica.invalid`;
      const password = randomBytes(36).toString('base64url');
      const created = await fetch(`${base}/auth/v1/admin/users`, {
        method: 'POST',
        headers: serviceHeaders,
        body: JSON.stringify({
          email,
          password,
          email_confirm: true,
          user_metadata: { fixture: 'Arithmetica staging synthetic QA only' },
        }),
        signal: AbortSignal.timeout(20000),
      });
      assert.equal(
        created.status,
        200,
        'Synthetic test-user creation must succeed; no credentials are logged.',
      );
      const user = await created.json();
      users.push({ role, id: user.id, email, password });
    }
    await writeFile(
      destination,
      JSON.stringify({ projectRef: plan.projectRef, centerId: plan.centerId, users }, null, 2),
      { flag: 'wx', mode: 0o600 },
    );
    const sql = `-- Synthetic staging staff only. No invitation emails are sent.\nbegin;\n${users.map((user) => `insert into public.staff_memberships(center_id,user_id,role,display_name) values('${plan.centerId}','${user.id}','${user.role}','Fictional QA ${user.role}');`).join('\n')}\ncommit;`;
    await writeFile(path.join(directory, 'staging-test-memberships.sql'), sql, {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(
      'Three synthetic staging Auth users prepared. Membership SQL saved privately; no passwords printed or emails sent.',
    );
  }
}

if (process.argv.includes('--auth')) {
  const fixtures = JSON.parse(
    await readFile(path.join(directory, 'staging-test-users.json'), 'utf8'),
  );
  assert.equal(fixtures.projectRef, plan.projectRef);
  assert.equal(fixtures.centerId, plan.centerId);
  let checks = 0;
  for (const fixture of fixtures.users) {
    assert.ok(fixture.email.endsWith('@arithmetica.invalid'));
    const login = await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: anonHeaders,
      body: JSON.stringify({
        email: fixture.email,
        password: fixture.password,
      }),
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(login.status, 200, 'Synthetic role login must succeed.');
    const session = await login.json();
    const headers = {
      ...anonHeaders,
      Authorization: `Bearer ${session.access_token}`,
    };
    const membership = await fetch(
      `${base}/rest/v1/staff_memberships?center_id=eq.${plan.centerId}&user_id=eq.${fixture.id}&active=eq.true&select=role`,
      { headers, signal: AbortSignal.timeout(20000) },
    );
    assert.equal(membership.status, 200);
    const memberships = await membership.json();
    assert.equal(
      memberships[0]?.role,
      fixture.role,
      'Synthetic membership must match the approved test role.',
    );
    checks++;
    const aggregate = await fetch(`${base}/rest/v1/centerflow_states?select=*&limit=1`, {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    assert.ok(
      [401, 403].includes(aggregate.status),
      'Authenticated clients cannot read the private aggregate directly.',
    );
    checks++;
    const deniedRpc = await rpc(
      'read_arithmetica_if_changed',
      { p_center: plan.centerId, p_revision: -1 },
      headers,
    );
    assert.ok(
      [401, 403].includes(deniedRpc.status),
      'Authenticated clients cannot invoke server-only RPCs.',
    );
    checks++;
    const promotion = await fetch(
      `${base}/rest/v1/staff_memberships?center_id=eq.${plan.centerId}&user_id=eq.${fixture.id}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ role: 'owner' }),
        signal: AbortSignal.timeout(20000),
      },
    );
    assert.ok(
      [401, 403].includes(promotion.status),
      'Clients cannot promote or modify staff membership.',
    );
    checks++;
  }
  console.log(
    JSON.stringify({
      authenticatedRoleIsolationChecks: checks,
      roles: fixtures.users.map((user) => user.role),
      realStudentTesting: false,
    }),
  );
}
