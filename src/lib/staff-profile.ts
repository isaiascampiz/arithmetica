import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { DomainError } from './domain';
import type { Database, Staff } from './model';
import type { StaffProfile } from './v3-model';
const picture = z
  .string()
  .max(180000)
  .refine((value) => {
    if (!value) return true;
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) return false;
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length > 128000 || bytes.toString('base64') !== match[2]) return false;
    return match[1] === 'png'
      ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : match[1] === 'jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP';
  }, 'Use a PNG, JPEG or WebP image smaller than 128 KB.');
const profileInput = z
  .object({
    version: z.number().int().nonnegative(),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(60),
    picture,
    disabledAt: z.string().datetime().optional(),
  })
  .strict();
export const accountInput = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    firstName: z.string().trim().min(1).max(60),
    lastName: z.string().trim().max(60),
    picture,
    requestId: z.string().uuid(),
  })
  .strict();
export function validateStaffProfiles(db: Database) {
  const v3 = db.operations?.v3;
  if (v3?.staffProfiles !== undefined)
    z.record(z.string().min(1), profileInput).parse(v3.staffProfiles);
  if (v3?.accountRequests !== undefined)
    z.record(
      z.string().uuid(),
      z
        .object({ fingerprint: z.string().regex(/^[a-f0-9]{64}$/), owner: z.string().min(1) })
        .strict(),
    ).parse(v3.accountRequests);
}
export function staffKey(staff: Staff) {
  return staff.id || 'demo:' + staff.role;
}
export function staffProfile(db: Database, staff: Staff): StaffProfile {
  const [firstName, ...last] = staff.name.split(' ');
  return (
    db.operations?.v3?.staffProfiles?.[staffKey(staff)] || {
      version: 0,
      firstName,
      lastName: last.join(' '),
      picture: '',
    }
  );
}
export function saveStaffProfile(db: Database, staff: Staff, raw: unknown) {
  const input = accountInput.parse(raw),
    key = staffKey(staff),
    v3 = db.operations!.v3!;
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const prior = v3.accountRequests?.[input.requestId];
  if (prior) {
    if (prior.owner !== key || prior.fingerprint !== fingerprint)
      throw new DomainError('Request ID was already used for a different change.', 409);
    return staffProfile(db, staff);
  }
  const current = staffProfile(db, staff);
  if (current.version !== input.expectedVersion)
    throw new DomainError('Your profile changed elsewhere. Reload before saving.', 409);
  const next = {
    version: current.version + 1,
    firstName: input.firstName,
    lastName: input.lastName,
    picture: input.picture,
  };
  (v3.staffProfiles ??= {})[key] = next;
  (v3.accountRequests ??= {})[input.requestId] = { owner: key, fingerprint };
  db.audit.push({
    id: randomUUID(),
    at: new Date().toISOString(),
    actor: staff.name,
    action: 'account:profile',
    entityId: key,
  });
  return next;
}
