import { dayKey, type Database } from './model';
import type { Subject } from './v2-model';
import type { SessionRecord } from './v3-model';
import { addDays, weekday } from './schedule';

export type HomeworkReview = {
  id: string;
  visitId: string;
  at: string;
  day: string;
  actor: string;
  packets: SessionRecord['incoming'];
};
export type HomeworkTotals = {
  completed: number;
  unfinished: number;
  missing: number;
  total: number;
  reviews: number;
  percent: number | null;
};
export type HomeworkBucket = HomeworkTotals & {
  start: string;
  end: string;
  records: HomeworkReview[];
};

/** Saved incoming snapshots are the review evidence. No issuance/completion-ledger inference. */
export function homeworkReviews(
  db: Database,
  studentId: string,
  subject: Subject,
): HomeworkReview[] {
  return db.visits
    .filter((v) => v.studentId === studentId)
    .flatMap((visit) => {
      const records = (visit.sessionRecords || [])
        .filter((r) => r.subject === subject)
        .map((record, index) => ({ record, index }))
        .toSorted((a, b) => a.record.at.localeCompare(b.record.at) || a.index - b.index);
      const latest = records.at(-1)?.record;
      if (!latest || latest.format !== 'Paper') return [];
      const packets = [
        ...new Map(
          latest.incoming.map((p) => [p.packet.sourceAssignmentId + ':' + p.packet.id, p]),
        ).values(),
      ];
      const at = records[0].record.at;
      return [
        {
          id: visit.id + ':' + subject,
          visitId: visit.id,
          at,
          day: dayKey(at, db.operations!.center.timezone),
          actor: latest.actor,
          packets,
        },
      ];
    })
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export function homeworkTotals(reviews: HomeworkReview[]): HomeworkTotals {
  const packets = reviews.flatMap((r) => r.packets);
  const completed = packets.filter(
    (p) => p.outcome === 'finished' || p.outcome === 'assumed completed',
  ).length;
  const unfinished = packets.filter((p) => p.outcome === 'unfinished').length;
  const missing = packets.filter((p) => p.outcome === 'missing').length;
  const total = completed + unfinished + missing;
  return {
    completed,
    unfinished,
    missing,
    total,
    reviews: reviews.filter((r) => r.packets.length).length,
    percent: total ? (completed / total) * 100 : null,
  };
}

export function homeworkBuckets(
  reviews: HomeworkReview[],
  start: string,
  end: string,
  unit: 'day' | 'week' | 'month',
): HomeworkBucket[] {
  const result: HomeworkBucket[] = [];
  let cursor =
    unit === 'week'
      ? addDays(start, -((weekday(start) + 6) % 7))
      : unit === 'month'
        ? start.slice(0, 7) + '-01'
        : start;
  for (let guard = 0; cursor <= end && guard < 3700; guard++) {
    const next =
      unit === 'day'
        ? addDays(cursor, 1)
        : unit === 'week'
          ? addDays(cursor, 7)
          : new Date(Date.UTC(Number(cursor.slice(0, 4)), Number(cursor.slice(5, 7)), 1, 12))
              .toISOString()
              .slice(0, 10);
    const from = cursor < start ? start : cursor,
      to = addDays(next, -1) > end ? end : addDays(next, -1);
    const records = reviews.filter((r) => r.day >= from && r.day <= to);
    result.push({ start: from, end: to, records, ...homeworkTotals(records) });
    cursor = next;
  }
  return result;
}
