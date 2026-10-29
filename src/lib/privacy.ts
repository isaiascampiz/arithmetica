import type { Snapshot } from './model';

export function dictationAllowed(db: Pick<Snapshot, 'runtime'>) {
  return db.runtime?.demo !== false || db.runtime.dictationApproved === true;
}
