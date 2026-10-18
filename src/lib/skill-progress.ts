import { dayKey, type Database } from './model';
import { addDays, zonedTimestamp } from './schedule';

export type SkillRating = {
  id: string;
  skillId: string;
  label: string;
  score: number;
  at: string;
  day: string;
  actor: string;
  scope: string;
};
export type SkillSeries = {
  key: string;
  id: string;
  label: string;
  scope: string;
  active: boolean;
  records: SkillRating[];
};
const defaults = [
  { id: 'focus', label: 'Focus' },
  { id: 'handwriting', label: 'Handwriting' },
  { id: 'independence', label: 'Independence' },
];

/** IDs identify a skill, not labels or positions. Revisions replace ratings on the original date. */
export function skillSeries(db: Database, studentId: string): SkillSeries[] {
  const configured = db.operations!.students[studentId]?.observationSkills || defaults;
  const series = new Map<string, SkillSeries>();
  const key = (scope: string, id: string) => JSON.stringify([scope, id]);
  for (const skill of configured)
    series.set(key('Visit-wide', skill.id), {
      ...skill,
      key: key('Visit-wide', skill.id),
      scope: 'Visit-wide',
      active: true,
      records: [],
    });
  for (const observation of db.observations
    .filter((o) => o.studentId === studentId)
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
    const current = observation.revisions?.at(-1) || observation;
    const scope = observation.subject || 'Visit-wide';
    for (const rating of new Map((current.skillRatings || []).map((r) => [r.id, r])).values()) {
      if (!Number.isInteger(rating.score) || rating.score < 1 || rating.score > 5) continue;
      const seriesKey = key(scope, rating.id);
      let entry = series.get(seriesKey);
      if (!entry) {
        entry = {
          key: seriesKey,
          id: rating.id,
          label: rating.label,
          scope,
          active: false,
          records: [],
        };
        series.set(seriesKey, entry);
      }
      if (!entry.active) entry.label = rating.label;
      entry.records.push({
        ...rating,
        skillId: rating.id,
        id: observation.id + ':' + rating.id,
        at: observation.createdAt,
        day: dayKey(observation.createdAt, db.operations!.center.timezone),
        actor: current === observation ? observation.author : observation.revisions!.at(-1)!.actor,
        scope,
      });
    }
  }
  return [...series.values()];
}

/** Arithmetic average of actual saved ratings only; unrecorded dates have no denominator. */
export function skillAverage(records: SkillRating[]) {
  return records.length ? records.reduce((sum, r) => sum + r.score, 0) / records.length : null;
}

/** Real observations only. Connections may span unrated dates but never manufacture dots. */
export function skillScatter(records: SkillRating[], start: string, end: string, timezone: string) {
  const from = Date.parse(zonedTimestamp(start, '00:00', timezone)),
    to = Date.parse(zonedTimestamp(addDays(end, 1), '00:00', timezone));
  const span = Math.max(1, to - from);
  return records
    .filter((r) => r.day >= start && r.day <= end)
    .toSorted((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id))
    .map((r) => ({
      ...r,
      x: Math.max(0, Math.min(100, ((Date.parse(r.at) - from) / span) * 100)),
    }));
}

const palette = [
  '#2676c9',
  '#238579',
  '#8056b3',
  '#b16b28',
  '#c14f71',
  '#65752d',
  '#427ca0',
  '#a84a3b',
  '#5962b8',
  '#847043',
  '#a1428b',
  '#51775f',
];
/** Use all recorded identities, never the filtered period or the current display order. */
export function skillColors(series: SkillSeries[]) {
  const colors = new Map<string, string>();
  for (const s of series) {
    const fixed = ['focus', 'handwriting', 'independence'].indexOf(s.id);
    if (fixed >= 0 && s.scope === 'Visit-wide') colors.set(s.key, palette[fixed]);
  }
  let next = 3;
  for (const s of series.toSorted(
    (a, b) =>
      (a.records[0]?.at || '~').localeCompare(b.records[0]?.at || '~') ||
      a.key.localeCompare(b.key),
  ))
    if (!colors.has(s.key)) colors.set(s.key, palette[next++ % palette.length]);
  return colors;
}

/** Daily summary of every saved rating, independent of display pins or selected skills. */
export function skillDailyAverages(points: ReturnType<typeof skillScatter>) {
  const grouped = new Map<string, typeof points>();
  for (const point of points) {
    const records = grouped.get(point.day) || [];
    records.push(point);
    grouped.set(point.day, records);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, records]) => ({
      ...records[0],
      id: 'overall-average:' + day,
      skillId: 'overall-average',
      label: 'All skills average',
      day,
      score: skillAverage(records)!,
      x: records.reduce((sum, r) => sum + r.x, 0) / records.length,
      records,
    }));
}
