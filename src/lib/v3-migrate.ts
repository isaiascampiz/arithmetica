import { randomUUID } from 'node:crypto';
import type { Database } from './model';
import { migrateV2 } from './migrate';
import { recurring } from './schedule';
import type { Subject } from './v2-model';
import type { CatalogLevel } from './v3-model';
// Explicit identifiers and order, never lexical sorting. Bounds are a fictional
// local catalog for the supplied demo levels. Other levels require owner review.
export function demoCatalog(): CatalogLevel[] {
  const order: Record<Subject, string[]> = {
    Math: [
      '6A',
      '5A',
      '4A',
      '3A',
      '2A',
      'A',
      'B',
      'C',
      'D',
      'E',
      'F',
      'G',
      'H',
      'I',
      'J',
      'K',
      'L',
      'M',
      'N',
      'O',
    ],
    Reading: [
      '7A',
      '6A',
      '5A',
      '4A',
      '3A',
      '2A',
      'AI',
      'AII',
      'BI',
      'BII',
      'CI',
      'CII',
      'DI',
      'DII',
      'EI',
      'EII',
      'FI',
      'FII',
      'G',
      'H',
      'I',
      'J',
      'K',
      'L',
    ],
  };
  return (Object.keys(order) as Subject[]).flatMap((subject) =>
    order[subject].map((id, index) => ({
      subject,
      id,
      order: index,
      first: 1,
      last:
        ['4A', '3A', '2A', 'D'].includes(id) || (subject === 'Math' && ['A', 'B', 'C'].includes(id))
          ? 200
          : null,
      approved:
        ['4A', '3A', '2A', 'D'].includes(id) ||
        (subject === 'Math' && ['A', 'B', 'C'].includes(id)),
      source: 'Fictional demo catalog; verify center boundaries before real use',
    })),
  );
}
export function migrateV3(db: Database, now = new Date()): boolean {
  if (db.schemaVersion === 3) {
    if (!db.operations?.v3) throw Error('V3 configuration missing; refusing reset.');
    return false;
  }
  if (db.schemaVersion === 1) migrateV2(db, now);
  if (db.schemaVersion !== 2 || !db.operations) throw Error('Unsupported V3 upgrade source.');
  const op = db.operations;
  for (const student of db.students) {
    const c = op.students[student.id];
    c.visitDays = recurring(op, c).filter((d) => d >= 1 && d <= 4);
    c.enrollmentDate = null;
    c.awayUntil = null;
    c.observationTiles = [];
    c.goals = '';
  }
  op.v3 = {
    catalog: demoCatalog(),
    instructorTiles: {},
    migratedAt: now.toISOString(),
  };
  db.schemaVersion = 3;
  db.revision++;
  db.audit.push({
    id: randomUUID(),
    action: 'schema-upgrade:2-to-3',
    actor: 'System',
    at: now.toISOString(),
    entityId: 'schema-v3',
  });
  return true;
}
