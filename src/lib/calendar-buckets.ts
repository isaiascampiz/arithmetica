import { addDays, weekday } from './schedule';

export type CalendarUnit = 'day' | 'week' | 'month';

/** Calendar buckets retain gaps, clipped edges and the source order within each bucket. */
export function calendarBuckets<T extends { day: string }>(
  records: T[],
  start: string,
  end: string,
  unit: CalendarUnit,
) {
  const buckets: { start: string; end: string; records: T[] }[] = [];
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
    const last = addDays(next, -1);
    buckets.push({
      start: cursor < start ? start : cursor,
      end: last > end ? end : last,
      records: [],
    });
    cursor = next;
  }
  for (const record of records) {
    // Find the last bucket beginning on or before this record's day. A binary
    // search avoids scanning the full history once for every displayed bucket.
    let low = 0,
      high = buckets.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (buckets[middle].start <= record.day) low = middle + 1;
      else high = middle;
    }
    const bucket = buckets[low - 1];
    if (bucket && record.day <= bucket.end) bucket.records.push(record);
  }
  return buckets;
}
