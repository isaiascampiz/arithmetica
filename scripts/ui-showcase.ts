import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { quickViewDemo } from '../tests/fixtures/quick-view-demo';
import { addFictionalCenterActivity } from '../tests/fixtures/center-activity-demo';
import { dailyWork } from '../src/lib/worksheet-allocation';
import { paperProposal } from '../src/lib/v3-planning';
import { validateDatabase } from '../src/lib/repository';
/** Construct a NEW fictional showcase only. Existing center files are never opened or replaced. */
async function main() {
  if (
    process.env.DEMO_MODE !== 'true' ||
    process.env.DATA_ADAPTER !== 'local' ||
    process.env.PRODUCTION_DATA_APPROVED === 'true'
  )
    throw Error('Explicit fictional local mode is required.');
  const now = new Date(),
    db = quickViewDemo(now),
    op = db.operations!;
  op.center.name = 'Kumon Learning Center \u00b7 Yuba City';
  for (const student of db.students) op.students[student.id].visitDays = [1, 3];
  for (const [index, student] of db.students.entries())
    for (const subject of ['Math', 'Reading'] as const) {
      const cfg = op.students[student.id].subjects[subject];
      cfg.dailyWork = dailyWork(index === 1 ? 10 : subject === 'Math' ? 5 : 3);
      cfg.sheetsPerPacket = 10;
      cfg.packetsPerDay = Math.ceil(cfg.dailyWork.worksheets / 10);
      cfg.classworkSheets = Math.min(10, cfg.dailyWork.worksheets);
    }
  // These unissued sets belong only to the new in-memory constructor, before its first write.
  op.assignments = op.assignments.map((a) => {
    if (!a.v3 || a.v3.issuedAt) return a;
    return paperProposal(db, a.studentId, a.subject, a.v3.visitDate, a.id) || a;
  });
  addFictionalCenterActivity(db, now);
  validateDatabase(db);
  const filename = path.resolve('data/ui-showcase-' + randomUUID() + '.json');
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, JSON.stringify(db, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(filename);
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
