import { z } from 'zod';
import type { Database } from './model';
import type { Range, SubjectSettings } from './v2-model';

export const STANDARD_PACKET_SHEETS = 10;
export const dailyWorkInput = z
  .object({
    version: z.literal(1),
    worksheets: z.number().int().min(0).max(50),
    packetSheets: z.literal(10),
  })
  .strict();
export function dailyWorksheets(s: SubjectSettings) {
  return s.dailyWork?.worksheets ?? s.packetsPerDay * s.sheetsPerPacket;
}
export function dailyWork(worksheets: number) {
  return dailyWorkInput.parse({
    version: 1,
    worksheets,
    packetSheets: STANDARD_PACKET_SHEETS,
  });
}
/** Older clients may omit the new policy, but cannot accidentally erase it. */
export function preserveDailyWork(prior: SubjectSettings, next: SubjectSettings): SubjectSettings {
  if (!prior.dailyWork || next.dailyWork) return next;
  const quantityChanged =
    prior.packetsPerDay !== next.packetsPerDay || prior.sheetsPerPacket !== next.sheetsPerPacket;
  return {
    ...next,
    dailyWork: quantityChanged
      ? dailyWork(next.packetsPerDay * next.sheetsPerPacket)
      : { ...prior.dailyWork },
  };
}
export function validateDailyWork(db: Database) {
  for (const cfg of Object.values(db.operations?.students || {}))
    for (const sub of ['Math', 'Reading'] as const) {
      if (cfg.subjects?.[sub]?.dailyWork !== undefined)
        dailyWorkInput.parse(cfg.subjects[sub].dailyWork);
    }
}
/** Existing issued portions keep their identities. New homework pulls follow ten-sheet boundaries. */
export function allocatedRanges(
  level: string,
  start: number,
  homeworkSheets: number,
  centerSheets: number,
  includeCenter: boolean,
) {
  const ranges: Range[] = [];
  let cursor = start;
  if (includeCenter) {
    const size = Math.min(10, Math.max(1, centerSheets));
    ranges.push({ level, start: cursor, end: cursor + size - 1 });
    cursor += size;
  }
  let remaining = homeworkSheets;
  while (remaining > 0 && ranges.length < 102) {
    const boundary = Math.floor((cursor - 1) / 10) * 10 + 10,
      size = Math.min(remaining, boundary - cursor + 1);
    ranges.push({ level, start: cursor, end: cursor + size - 1 });
    cursor += size;
    remaining -= size;
  }
  return ranges;
}
