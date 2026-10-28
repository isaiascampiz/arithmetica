import { centerFeatures } from './center-features';
import { activitySettings } from './activity-settings';
import { kioskSettings } from './kiosk-settings';
import { validateStaffProfiles } from './staff-profile';
import { validateReceptionReceipts } from './kiosk-attendance';
import { validateDailyWork } from './worksheet-allocation';
import { mkdir, readFile, rename, writeFile, rmdir } from 'node:fs/promises';
import path from 'node:path';
import { seed } from './seed';
import { migrateV2 } from './migrate';
import { migrateV3 } from './v3-migrate';
import type { Database } from './model';
export interface Repository {
  read(): Promise<Database>;
  transaction<T>(fn: (db: Database) => T): Promise<T>;
}
const runtime = globalThis as typeof globalThis & { centerQueue?: Promise<unknown> };
function serialize<T>(fn: () => Promise<T>) {
  const p = (runtime.centerQueue ?? Promise.resolve()).then(fn, fn);
  runtime.centerQueue = p.then(
    () => undefined,
    () => undefined,
  );
  return p;
}
export function dataFilename() {
  return path.resolve(
    /* turbopackIgnore: true */ process.env.DEMO_DATA_PATH || 'data/demo-v1.json',
  );
}
async function locked<T>(fn: () => Promise<T>) {
  await mkdir(path.dirname(dataFilename()), { recursive: true });
  const lock = dataFilename() + '.lock';
  const deadline = Date.now() + 15000;
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (Date.now() > deadline)
        throw new Error(
          'Data file is locked. Stop other app processes and inspect the lock; no records have been reset.',
        );
      await new Promise((r) => setTimeout(r, 40));
    }
  }
  try {
    return await fn();
  } finally {
    await rmdir(lock);
  }
}
export function validateDatabase(db: Database) {
  centerFeatures(db);
  activitySettings(db);
  kioskSettings(db);
  validateStaffProfiles(db);
  validateReceptionReceipts(db);
  validateDailyWork(db);
  const centerVersion = db.operations?.center.version;
  if (centerVersion !== undefined && (!Number.isInteger(centerVersion) || centerVersion < 0))
    throw Error(
      'Invalid center settings version. Restore a validated backup; records will not be reset.',
    );
  if (
    ![1, 2, 3].includes(db.schemaVersion) ||
    !Number.isInteger(db.revision) ||
    !Array.isArray(db.students) ||
    !Array.isArray(db.visits) ||
    !Array.isArray(db.observations) ||
    !Array.isArray(db.homework) ||
    !Array.isArray(db.audit) ||
    (db.schemaVersion >= 2 && !db.operations) ||
    (db.schemaVersion === 3 && !db.operations?.v3)
  )
    throw new Error('Unsupported or damaged data. Restore a backup; records will not be reset.');
  if (new Set(db.students.map((s) => s.id)).size !== db.students.length)
    throw new Error('Duplicate student identities in backup.');
  if (new Set(db.students.map((s) => s.token)).size !== db.students.length)
    throw new Error(
      'Duplicate pouch identifiers in backup. Restore a validated backup; identifiers will not be regenerated.',
    );
}
async function localLoad() {
  let raw: string;
  try {
    raw = await readFile(/* turbopackIgnore: true */ dataFilename(), 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
    const db = seed();
    migrateV2(db);
    migrateV3(db);
    await save(db);
    return db;
  }
  const db: Database = JSON.parse(raw);
  validateDatabase(db);
  if (db.schemaVersion === 1) {
    try {
      await writeFile(dataFilename() + '.v1-backup.json', raw, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    migrateV2(db);
    await save(db);
  }
  if (db.schemaVersion === 2) {
    const before = JSON.stringify(db, null, 2);
    try {
      await writeFile(dataFilename() + '.v2-backup.json', before, { flag: 'wx', mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
    migrateV3(db);
    await save(db);
  }
  return db;
}
async function save(db: Database) {
  const temporary = dataFilename() + '.tmp';
  await writeFile(temporary, JSON.stringify(db, null, 2), { mode: 0o600 });
  await rename(temporary, dataFilename());
}
export async function supabaseRpc<T>(name: string, args: unknown): Promise<T> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !process.env.CENTER_ID)
    throw new Error('Supabase URL, service key and CENTER_ID are required.');
  const res = await fetch(url + '/rest/v1/rpc/' + name, {
    method: 'POST',
    cache: 'no-store',
    headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok)
    throw new Error(
      'Supabase transaction failed (' + res.status + '); no local fallback is allowed.',
    );
  return (await res.json()) as T;
}
async function remoteLoad() {
  const result = await supabaseRpc<{ revision: number; payload: Database } | null>(
    'read_centerflow',
    { p_center: process.env.CENTER_ID },
  );
  if (!result)
    throw new Error(
      'Cloud state is not initialized. Follow the documented provisioning procedure.',
    );
  validateDatabase(result.payload);
  if (result.payload.schemaVersion === 2) migrateV3(result.payload);
  if (result.payload.schemaVersion !== 3)
    throw new Error('Cloud state needs a compatible explicit migration.');
  return result;
}
const cloud = () => process.env.DATA_ADAPTER === 'supabase';
function assertMode() {
  if (
    process.env.DEMO_MODE === 'false' &&
    (!cloud() || process.env.PRODUCTION_DATA_APPROVED !== 'true')
  )
    throw new Error('Real-data mode requires approved shared Supabase configuration.');
}
export const repository: Repository = {
  read: () =>
    serialize(() => {
      assertMode();
      return cloud() ? remoteLoad().then((r) => r.payload) : locked(localLoad);
    }),
  transaction: <T>(fn: (db: Database) => T) =>
    serialize(async () => {
      assertMode();
      if (cloud()) {
        for (let attempt = 0; attempt < 8; attempt++) {
          const record = await remoteLoad();
          const before = JSON.stringify(record.payload);
          const result = fn(record.payload);
          if (JSON.stringify(record.payload) === before) return result;
          record.payload.revision = record.revision + 1;
          const success = await supabaseRpc<boolean>('write_centerflow', {
            p_center: process.env.CENTER_ID,
            p_expected_revision: record.revision,
            p_payload: record.payload,
          });
          if (success) return result;
        }
        throw new Error('Concurrent update could not be committed; reload and retry.');
      }
      return locked(async () => {
        const db = await localLoad();
        const before = JSON.stringify(db);
        const result = fn(db);
        if (JSON.stringify(db) === before) return result;
        db.revision++;
        await save(db);
        return result;
      });
    }),
};
