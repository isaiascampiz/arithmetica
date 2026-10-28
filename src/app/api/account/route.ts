import { cookies } from 'next/headers';
import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { accounts, sameOrigin, staffSession, throttle } from '@/lib/auth';
import { repository } from '@/lib/repository';
import { saveStaffProfile, staffKey, staffProfile } from '@/lib/staff-profile';
import { DomainError } from '@/lib/domain';
import { failure, json } from '@/lib/http';
export async function GET() {
  try {
    const staff = await staffSession();
    return json({
      ...staffProfile(await repository.read(), staff),
      email: staff.email || '',
      role: staff.role,
    });
  } catch (e) {
    return failure(e);
  }
}
export async function PATCH(req: Request) {
  try {
    sameOrigin(req);
    const staff = await staffSession(),
      input = await req.json();
    return json(await repository.transaction((db) => saveStaffProfile(db, staff, input)));
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(req: Request) {
  try {
    sameOrigin(req);
    const staff = await staffSession();
    throttle('account-removal:' + staffKey(staff), 5);
    const input = z
      .object({
        email: z.string().email(),
        password: z.string().max(150),
        confirmation: z.literal('DELETE MY ACCOUNT'),
        requestId: z.string().uuid(),
      })
      .strict()
      .parse(await req.json());
    if (process.env.DEMO_MODE === 'false')
      throw new DomainError(
        'Account removal requires your organization’s verified identity-provider process. No records were deleted.',
        503,
      );
    const account = accounts().find((a) => a.role === staff.role);
    if (
      !account ||
      account.email !== input.email ||
      Buffer.byteLength(account.password) !== Buffer.byteLength(input.password) ||
      !timingSafeEqual(Buffer.from(account.password), Buffer.from(input.password))
    )
      throw new DomainError('Account confirmation did not match.', 403);
    if (staff.role === 'owner')
      throw new DomainError(
        'The center’s only owner cannot be removed. Transfer ownership before requesting account removal.',
        409,
      );
    await repository.transaction((db) => {
      const key = staffKey(staff),
        v3 = db.operations!.v3!,
        profile = staffProfile(db, staff);
      if (!profile.disabledAt) {
        (v3.staffProfiles ??= {})[key] = {
          ...profile,
          version: profile.version + 1,
          picture: '',
          disabledAt: new Date().toISOString(),
        };
        db.audit.push({
          id: input.requestId,
          actor: staff.name,
          at: v3.staffProfiles[key].disabledAt!,
          action: 'account:deactivated',
          entityId: key,
        });
      }
    });
    const jar = await cookies();
    for (const name of ['cf-staff', 'cf-cloud', 'cf-refresh', 'cf-kiosk']) jar.delete(name);
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
