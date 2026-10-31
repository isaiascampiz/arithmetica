/** Explicit owner-authorized initial import. Never runs on startup/deploy and never clears an occupied center. */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { repository } from '../src/lib/repository';
import {
  prepareRosterImport,
  applyRosterImport,
  assertRosterDestination,
} from '../src/lib/roster/import';
import type { Staff } from '../src/lib/model';

async function main() {
  const [rosterPath, workbookPath, ownerId, commit] = process.argv.slice(2);
  assert.equal(
    commit,
    '--commit',
    'Pass the explicit --commit flag for the authorized initial import.',
  );
  assert.match(ownerId || '', /^[a-f0-9-]{36}$/i, 'Pass the approved owner user ID.');
  const config = JSON.parse(await readFile('data/deployment/production.runtime.json', 'utf8'));
  const plan = JSON.parse(await readFile('data/deployment/production-plan.json', 'utf8'));
  assert.equal(config.CENTER_ID, plan.centerId);
  assert.equal(config.DEPLOYMENT_ENV, 'production');
  assert.equal(config.NEXT_PUBLIC_SUPABASE_URL, `https://${plan.projectRef}.supabase.co`);
  assert.equal(config.APP_ORIGIN, 'https://arithmetica.arithmetica.workers.dev');
  assert.equal(config.PRODUCTION_DATA_APPROVED, 'true');
  assert.equal(config.DEMO_MODE, 'false');
  assert.equal(config.DATA_ADAPTER, 'supabase');
  const roster = JSON.parse(await readFile(rosterPath, 'utf8'));
  assert.equal(
    createHash('sha256')
      .update(await readFile(workbookPath))
      .digest('hex'),
    roster.sourceSha256,
    'The source workbook changed. No records were imported.',
  );
  const response = await fetch(
    `${config.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/staff_memberships?center_id=eq.${plan.centerId}&user_id=eq.${ownerId}&active=eq.true&select=user_id,role,display_name`,
    {
      headers: {
        apikey: config.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${config.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  assert.equal(response.status, 200, 'Owner authority could not be checked.');
  const members = await response.json();
  assert.equal(members.length, 1);
  assert.equal(members[0].role, 'owner');
  const staff: Staff = {
    id: members[0].user_id,
    role: 'owner',
    name: members[0].display_name,
  };
  Object.assign(process.env, config);
  const before = await repository.read();
  const prepared = prepareRosterImport({
    expectedRevision: before.revision,
    roster,
  });
  assertRosterDestination(prepared.roster, config.DEPLOYMENT_ENV);
  const result = await repository.transaction((db) => applyRosterImport(db, prepared, staff));
  const saved = await repository.read();
  assert.equal(saved.students.length, roster.profiles.length);
  assert.equal(
    saved.operations!.v3!.rosterImports![roster.batchRequestId].fingerprint,
    prepared.fingerprint,
  );
  console.log(
    JSON.stringify(
      {
        environment: 'production',
        imported: result.imported,
        duplicate: result.duplicate,
        subjects: saved.students.reduce((count, student) => count + student.subjects.length, 0),
        pendingProfiles: saved.students.filter((student) => !student.subjects.length).length,
        savedRevision: saved.revision,
        fictionalDataCopied: false,
      },
      null,
      2,
    ),
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Roster import failed.');
  process.exitCode = 1;
});
