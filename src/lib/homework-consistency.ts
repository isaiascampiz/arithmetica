import { dayKey, type Database } from './model';
import type { Subject } from './v2-model';
import type { SessionRecord } from './v3-model';
import { calendarBuckets } from './calendar-buckets';

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
        .filter((record) => record.mode !== 'activity-only')
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
  return calendarBuckets(reviews, start, end, unit).map((bucket) => ({
    ...bucket,
    ...homeworkTotals(bucket.records),
  }));
}
