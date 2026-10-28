import { dayKey, type Database } from './model';
import { attendancePunches } from './center-arrivals';
import { academicWindow, type AcademicPeriod } from './academic-progress';
import { calendarBuckets } from './calendar-buckets';
import { progressBarUnit, progressDateLabel } from './progress-chart';

/** One filtered source drives both the calendar chart and its optional audit list. */
export function punchHistory(
  db: Database,
  period: AcademicPeriod,
  offset: number,
  query: string,
  now: Date,
) {
  const tz = db.operations!.center.timezone,
    today = dayKey(now, tz);
  const names = new Map(db.students.map((s) => [s.id, s.name]));
  const all = attendancePunches(db, now);
  const first = all.reduce((day, p) => (dayKey(p.at, tz) < day ? dayKey(p.at, tz) : day), today);
  const window = academicWindow(period, offset, today, first);
  const end = window.end < today ? window.end : today;
  const rows = all.filter(
    (p) =>
      dayKey(p.at, tz) >= window.start &&
      dayKey(p.at, tz) <= end &&
      (names.get(p.studentId) || p.studentId).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const unit = progressBarUnit(period, window.start, end);
  const bins = calendarBuckets(
    rows.map((p) => ({ ...p, day: dayKey(p.at, tz) })),
    window.start,
    end,
    unit,
  ).map((b) => ({
    key: b.start,
    label: progressDateLabel(b.start, window.start, end),
    actual: b.records.filter((p) => p.kind === 'Check-in').length,
    expected: b.records.filter((p) => p.kind === 'Check-out').length,
    samples: 0,
    partial: false,
  }));
  return { rows, bins, start: window.start, end, first, unit };
}
