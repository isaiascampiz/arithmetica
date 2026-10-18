import { type AcademicPeriod } from './academic-progress';
import { addDays } from './schedule';

const dayNumber = (day: string) => Date.parse(day + 'T12:00:00Z') / 86400000;

/** Calendar-day coordinates, shared by both line charts; no observations are manufactured. */
export function progressDayX(day: string, start: string, end: string) {
  return (
    ((dayNumber(day) - dayNumber(start) + 0.5) /
      Math.max(1, dayNumber(end) - dayNumber(start) + 1)) *
    100
  );
}

/** Calendar cadence changes with the visible range, not with the number of saved records. */
export function progressTimeAxis(start: string, end: string, width: number, detail: boolean) {
  const span = Math.max(1, dayNumber(end) - dayNumber(start) + 1);
  const gridBudget = width < 300 ? 4 : 8;
  const labelBudget = detail ? (width < 300 ? 4 : 6) : 4;
  const days = (step: number) => {
    const result: string[] = [];
    for (let i = 0; i < span; i += step) result.push(addDays(start, i));
    return result;
  };
  if (span <= 100) {
    const base = span <= 7 ? 1 : span <= 62 ? 7 : 14;
    const count = Math.ceil(span / base);
    const grids = days(base * Math.max(1, Math.ceil(count / gridBudget)));
    const labels = days(base * Math.max(1, Math.ceil(count / labelBudget)));
    return { grids, labels };
  }
  const months = (budget: number) => {
    const from = new Date(start + 'T12:00:00Z'),
      to = new Date(end + 'T12:00:00Z');
    const first =
      from.getUTCFullYear() * 12 + from.getUTCMonth() + (from.getUTCDate() === 1 ? 0 : 1);
    const last = to.getUTCFullYear() * 12 + to.getUTCMonth();
    const minimum = Math.max(1, Math.ceil((last - first + 1) / budget));
    const step =
      [1, 2, 3, 6, 12, 24, 60, 120].find((n) => n >= minimum) ?? Math.ceil(minimum / 120) * 120;
    const result: string[] = [];
    for (let month = Math.ceil(first / step) * step; month <= last; month += step)
      result.push(
        new Date(Date.UTC(Math.floor(month / 12), month % 12, 1, 12)).toISOString().slice(0, 10),
      );
    return result;
  };
  return { grids: months(gridBudget), labels: months(labelBudget) };
}

export function progressDateLabel(day: string, start: string, end: string) {
  const span = dayNumber(end) - dayNumber(start) + 1;
  return new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    ...(span <= 190 ? { day: 'numeric' as const } : {}),
    ...(span > 370 ? { year: 'numeric' as const } : {}),
  });
}

/** Same grouping for homework and physical attendance. Totals still use original records. */
export function progressBarUnit(period: AcademicPeriod, start: string, end: string) {
  if (period === '1 week' || period === '1 month') return 'day';
  if (period === '8 weeks' || period === '3 months' || period === '6 months') return 'week';
  if (period === '1 year') return 'month';
  const span = dayNumber(end) - dayNumber(start) + 1;
  return span <= 31 ? 'day' : span <= 190 ? 'week' : 'month';
}

/** Regular bucket strides, with four fortnightly labels in an eight-week preview. */
export function progressBarLabels(count: number, unit: 'day' | 'week' | 'month', detail: boolean) {
  const budget = detail ? 6 : 4;
  const minimum = Math.max(1, Math.ceil(count / budget));
  const steps =
    unit === 'day'
      ? [1, 2, 7, 14, 28]
      : unit === 'week'
        ? [1, 2, 4, 8, 13, 26]
        : [1, 2, 3, 6, 12, 24];
  const step =
    steps.find((n) => n >= minimum) ?? Math.ceil(minimum / steps.at(-1)!) * steps.at(-1)!;
  return Array.from({ length: count }, (_, i) => i).filter((i) => i % step === 0);
}
