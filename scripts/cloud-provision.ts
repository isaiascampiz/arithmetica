import { readFile } from 'node:fs/promises';
import { validateDatabase, supabaseRpc } from '../src/lib/repository';
import { migrateV2 } from '../src/lib/migrate';
import { migrateV3 } from '../src/lib/v3-migrate';
async function main() {
  const source = process.argv[2];
  if (!source || process.env.ALLOW_CLOUD_PROVISION !== 'true')
    throw new Error(
      'Set ALLOW_CLOUD_PROVISION=true and pass an explicit authorized backup. Never point this command at real data without permission.',
    );
  const db = JSON.parse(await readFile(source, 'utf8'));
  validateDatabase(db);
  migrateV2(db);
  migrateV3(db);
  db.revision = 1;
  const success = await supabaseRpc<boolean>('write_centerflow', {
    p_center: process.env.CENTER_ID,
    p_expected_revision: 0,
    p_payload: db,
  });
  if (!success)
    throw new Error('Cloud state already exists. Provisioning did NOT overwrite or reset it.');
  console.log(
    'Explicit cloud initialization succeeded; verify roles, access policies and restore before real use.',
  );
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
