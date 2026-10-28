import { z } from 'zod';
import type { Database } from './model';

export const kioskSettingsInput = z.object({
  version: z.number().int().min(0),
  confirmationSeconds: z.number().int().min(2).max(10),
});

export function kioskSettings(db: Pick<Database, 'operations'>) {
  const saved = db.operations?.v3?.kiosk;
  if (saved === undefined) return { version: 0, confirmationSeconds: 4 };
  const parsed = kioskSettingsInput.safeParse(saved);
  if (!parsed.success)
    throw Error('Invalid kiosk settings. Restore a validated backup; records will not be reset.');
  return parsed.data;
}
