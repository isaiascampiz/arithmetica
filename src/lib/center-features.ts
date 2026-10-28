import type { Database } from './model';

/** Missing settings preserve the existing center workflow. No history is rewritten. */
export function centerFeatures(db: Pick<Database, 'operations'>) {
  const saved = db.operations?.v3?.features;
  if (saved === undefined) return { homework: true, medals: true, version: 0 };
  if (
    !saved ||
    typeof saved.homework !== 'boolean' ||
    typeof saved.medals !== 'boolean' ||
    !Number.isInteger(saved.version) ||
    saved.version < 0
  )
    throw new Error(
      'Invalid center feature settings. Restore a validated backup; records will not be reset.',
    );
  return saved;
}
