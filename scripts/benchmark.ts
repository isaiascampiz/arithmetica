// In-memory fictional fixtures only. This command never opens the records repository.
import { performance } from 'node:perf_hooks';
import { academicProgressDemo } from '../tests/fixtures/academic-progress-demo';
import { dayKey } from '../src/lib/model';
import { addDays } from '../src/lib/schedule';
import { homeRoster, repeatSequence, synchronizePreparation } from '../src/lib/v3-planning';
import { centerActivity } from '../src/lib/v3-analytics';
import { academicHistory, academicPlot } from '../src/lib/academic-progress';
import { durationBuckets, durationVisits } from '../src/lib/center-duration';
import { homeworkBuckets, homeworkReviews } from '../src/lib/homework-consistency';

const now = new Date('2026-10-18T21:00:00Z');
const db = academicProgressDemo(now);
const student = db.students[0];
const sourceVisit = db.visits.find((v) => v.studentId === student.id && v.departedAt)!;
for (let i = 0; i < 2000; i++) {
  const day = addDays('2026-01-01', i % 280);
  db.visits.push({
    ...sourceVisit,
    id: 'benchmark-visit-' + i,
    arrivedAt: day + 'T21:00:00Z',
    departedAt: day + 'T21:45:00Z',
  });
}
const events = academicHistory(db, student.id, 'Math');
const visits = durationVisits(db, student.id);
const reviews = homeworkReviews(db, student.id, 'Math');
const set = db.operations!.assignments.find((a) => a.v3 && a.subject === 'Math')!;
const samples: Record<string, number[]> = {};
function measure(name: string, fn: () => unknown) {
  fn();
  samples[name] = [];
  for (let i = 0; i < 5; i++) {
    const start = performance.now();
    fn();
    samples[name].push(performance.now() - start);
  }
}
measure('dayKey x 2000', () => {
  for (const visit of db.visits.slice(0, 2000)) dayKey(visit.arrivedAt, 'America/Los_Angeles');
});
measure('homeRoster', () => homeRoster(db, '2026-10-18'));
measure('centerActivity month', () => centerActivity(db, '2026-09-01', '2026-09-30', null, now));
measure('synchronizePreparation', () => synchronizePreparation(db, '2026-10-18'));
measure('academicPlot', () => academicPlot(db, 'Math', events));
measure('durationBuckets year/day', () =>
  durationBuckets(visits, '2026-01-01', '2026-12-31', 'day'),
);
measure('homeworkBuckets year/day', () =>
  homeworkBuckets(reviews, '2026-01-01', '2026-12-31', 'day'),
);
measure('repeatSequence', () =>
  repeatSequence(
    db,
    set,
    {
      level: '4A',
      start: 21,
      packetsPerDay: 1,
      sheetsPerPacket: 5,
      startWith: 'today',
    },
    'Worksheets',
    set.v3!.inCenter,
  ),
);
console.log(
  JSON.stringify(
    {
      node: process.version,
      visits: db.visits.length,
      assignments: db.operations!.assignments.length,
      events: events.length,
      heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      measurements: Object.fromEntries(
        Object.entries(samples).map(([name, values]) => [
          name,
          {
            medianMs: +values.toSorted((a, b) => a - b)[2].toFixed(3),
            samplesMs: values.map((n) => +n.toFixed(3)),
          },
        ]),
      ),
    },
    null,
    2,
  ),
);
