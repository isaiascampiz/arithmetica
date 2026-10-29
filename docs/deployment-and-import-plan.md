# Live deployment, records and recovery

Status: October 29, 2026. The owner confirmed documented corporate/privacy authorization and approved the Free Cloudflare/Supabase configuration. Production is **https://arithmetica.arithmetica.workers.dev**. Staging is separate and uses fictional records only.

## Imported roster

The unchanged supplied workbook has 108 subject rows, consolidated by normalized first/last name and matching DOB into **71 profiles**. Production contains **102 supported enrollments: 61 Math and 41 Reading**. Six EFL rows were excluded from subject enrollment; all identities remain, including three profiles awaiting subject selection. ASHR/ST1/ST2 were not mapped. DOB was used for local identity matching and is not stored in app profiles.

Names, grades, levels, original source rows, source fingerprint and subject enrollment dates were read back and reconciled after the authorized atomic import. Five common profile dates remain unset because the source subject dates differ. Original per-subject dates remain saved. All missing formats, worksheet positions and schedules remain pending, without guessed completions or paper plans. An instructor can complete individual profiles while all app sections remain available. Production initially contains no fictional students, visits, observations, assignments, completions or reports.

The exact import batch and stable IDs are retained in protected `data/private-intake/`. Do not regenerate it or use it as a backup. Initial import refuses an occupied center except an exact same-batch retry. It never runs on deployment or startup. Keep the original workbook outside Git.

## Daily use and device pilot

Sign in using the owner's app account, separate from GitHub/Supabase dashboard login. Give staff separate accounts and membership roles; do not share the owner password. Server membership checks determine access. Only the owner can import or manage settings/backups. The paired public kiosk receives attendance functionality, not the private workspace; locking clears staff cookies.

On each actual iPad, open the production URL in Safari and add it to the Home Screen using the Share menu. Before routine center use, conduct a supervised pilot on those exact devices: sign in/out; lock to kiosk; check camera/HID scanner and permissions; verify portrait/landscape controls and keyboard; enter an actual authorized arrival once, confirm it appears on another staff iPad; save an instructor note and verify it persists after reload; test network loss produces a visible failure and retry does not duplicate the action. Use isolated staging for invented test visits. Do not add fictional records to production.

Attendance and typed notes work while subject setup is pending. Paper preparation needs instructor-confirmed format, catalog/level, starting worksheet and schedule. Preparation, issuance, instructor handoff and verified completions remain separate actions. CONNECT creates no ordinary paper preparation. Dictation remains disabled for real records until provider-specific privacy approval is documented. No actual iPad, printer or physical scanner has been tested by this coding session.

## Backups

Independent AES-256-GCM encrypted archives are saved under `C:\Users\campi\OneDrive\Arithmetica Backups`. The post-import production archive was decrypted and reconciled successfully. A separate synthetic staging recovery restored 71 profiles, six historical revisions and three memberships with exact preserved values.

Windows task **Arithmetica encrypted student backup** runs daily at 8:30 PM local time and at this user's sign-in, with limited privileges, a hidden window and no saved Windows password. Its first actual run succeeded with exit code 0 and verified all 71 saved profiles. The computer must be on and the Windows user signed in. Missed tasks catch up when available. Moving this source folder or changing Node requires reinstalling the task with `scripts/backup-schedule.ps1`. The latest aggregate-only result is protected at `data/deployment/backup-latest.log`. Check Windows Task Scheduler's last result and confirm OneDrive has finished syncing; local creation alone does not prove offsite upload.

Manual backup:

```powershell
corepack pnpm backup:cloud production "C:\Users\campi\OneDrive\Arithmetica Backups"
```

Archives contain current records, paginated aggregate history, center and staff memberships, applied versions, ordered migration SQL and Auth identity metadata. Passwords, password hashes, sessions and deployment secrets are excluded. The recovery key is in protected `data/deployment/recovery-key.txt`; the owner acknowledged saving it separately. Keep that independent copy outside OneDrive and do not send it in chat. Losing every key copy makes archives unrecoverable. No archive retention/deletion is automatic.

For recovery, first stop changes and preserve existing state. Use an isolated new project/center, apply the recorded migrations in order, recreate original Auth UUIDs with new passwords, and restore original record values, revision history and memberships. Verify decrypted hashes/IDs/dates/attribution before changing the app's center/project binding. `scripts/staging-restore.ts` is the tested synthetic drill, not a command to point at production. Do not clear a live center to test recovery.

## Updates and scheduled jobs

See [release commands](cloudflare.md). Code deployment keeps PostgreSQL records, printed pouch identifiers and existing IDs. Schema upgrades are explicit/additive and backed up first. A code rollback must remain database-compatible; recovering database contents is a separate deliberate operation.

Cloudflare invokes the protected jobs endpoint every 15 minutes for closing/report catch-up. Workspace access also catches up; neither depends on a persistent Node process. Job authorization is server-only, failures produce non-sensitive errors, and retry behavior is idempotent. Check the Worker scheduled-event status after changes.

## Security and responsibility

No system is unhackable. Verified protections include server membership/role checks, anonymous database isolation, private kiosk responses, secure HttpOnly cookies, strict origin checks on browser writes, no authenticated browser/SW storage, hashed-script Content Security Policy, version/CAS conflict rejection, durable request IDs, secret/artifact/history scanning and encrypted independent backups. The database service key remains in the backend/protected recovery configuration. Public signup alone grants no center membership.

The owner should enable MFA on GitHub, Cloudflare and Supabase, review membership changes and lost-device access, and retain recovery codes separately. MFA enrollment and personal recovery credentials require the account owner. In-memory app throttling is per runtime instance; it is not a global distributed abuse guarantee. Monitor provider authentication/rate-limit alerts and free usage rather than treating a passed regression suite as a penetration test or uptime promise.

The backend, import, recovery and hosted synthetic checks are completed. Wider live use remains conditional on the physical-device pilot, instructor confirmation of paper setup, and owner verification of OneDrive sync/account recovery. Exact automated results are in the [V1 review](release-review-2026-10-29.md).
