import { z } from 'zod';
import type { Database } from './model';

export const activityHoursInput = z
  .array(
    z
      .object({
        day: z.number().int().min(0).max(6),
        enabled: z.boolean(),
        start: z.number().int().min(0).max(23),
        end: z.number().int().min(1).max(24),
      })
      .refine((d) => d.end > d.start, 'Closing hour must follow opening hour.'),
  )
  .length(7)
  .refine((days) => new Set(days.map((d) => d.day)).size === 7, 'Include each weekday once.');
export type ActivityHours = z.infer<typeof activityHoursInput>;
const settingsInput = z.object({
  version: z.number().int().min(0),
  days: activityHoursInput,
});

/** Reporting hours only; never changes student schedules or attendance. */
export function activitySettings(db: Pick<Database, 'operations'>) {
  const saved = db.operations?.v3?.activityHours;
  if (saved !== undefined) {
    const parsed = settingsInput.safeParse(saved);
    if (!parsed.success)
      throw Error('Invalid activity hours. Restore a validated backup; records will not be reset.');
    return parsed.data;
  }
  return {
    version: 0,
    days: Array.from({ length: 7 }, (_, day) => ({
      day,
      enabled: db.operations?.center.operatingDays.includes(day) ?? (day >= 1 && day <= 4),
      start: 13,
      end: 19,
    })),
  };
}

export function hourLabel(hour: number) {
  return `${hour % 12 || 12}${hour % 24 < 12 ? 'am' : 'pm'}`;
}
