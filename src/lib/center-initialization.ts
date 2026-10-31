import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { dayKey, type Database } from './model';

export const productionCenterInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    timezone: z.string().refine((value) => {
      try {
        new Intl.DateTimeFormat('en', { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }),
    operatingDays: z.array(z.number().int().min(1).max(4)).min(1).max(4),
    closingTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    expectedMinutes: z.number().int().min(5).max(240),
    earlyPerInstructor: z.number().int().min(1).max(20),
  })
  .strict();

/** Explicit new-center construction. Never call seed or a fictional-data migration. */
export function emptyProductionCenter(input: unknown, actor: string, now = new Date()): Database {
  const config = productionCenterInput.parse(input);
  if (!actor.trim()) throw new Error('An accountable setup actor is required.');
  const at = now.toISOString();
  return {
    schemaVersion: 3,
    revision: 0,
    students: [],
    visits: [],
    observations: [],
    homework: [],
    audit: [
      {
        id: randomUUID(),
        actor,
        at,
        action: 'center-initialize:schema-3',
        entityId: 'schema-v3',
      },
    ],
    operations: {
      students: {},
      families: [],
      scheduleEvents: [],
      assistance: [],
      corrections: [],
      classwork: [],
      assignments: [],
      completions: [],
      evaluations: [],
      decisions: [],
      achievements: [],
      appointments: [],
      coverage: [],
      reports: [],
      processedRequests: [],
      configHistory: [],
      center: {
        ...config,
        version: 0,
        operatingDays: [...new Set(config.operatingDays)],
        closedDates: [],
        reportTime: config.closingTime,
        autoClose: true,
        jobStartDate: dayKey(now, config.timezone),
      },
      v3: {
        dataMode: 'production',
        catalog: [],
        instructorTiles: {},
        migratedAt: at,
        features: { homework: true, medals: true, version: 0 },
      },
    },
  };
}
