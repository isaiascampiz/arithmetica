# Centerflow V2 architecture

The original Next.js App Router app now has a V2 operations layer alongside preserved V1 attendance, observations and packets. Authenticated routes render dynamically. Server APIs own validation/permissions; React renders snapshots and retains drafts. System fonts, CSS and existing icons create the iPad-inspired interface.

## Boundaries

| Layer                            | Responsibility                                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.ts`, `v2-model.ts`        | Stable records plus families, subjects, schedule events, classwork/corrections, assignments, evaluations/decisions, achievements, coverage and archived reports |
| `migrate.ts`                     | Additive V1 → V2 migration preserving IDs/content                                                                                                               |
| `domain.ts`, `v2-domain.ts`      | Zod commands, roles, transitions, ledger/decision history, stale version checks and audit                                                                       |
| `schedule.ts`, `homework.ts`     | Center-local dates/DST, recurrence/exceptions, next visit, independent exact proposals, corrections-first and carryover constraints                             |
| `reports.ts`, `jobs.ts`          | Verified aggregates/unknowns, immutable snapshots, unverified closing, job-specific catch-up/idempotency                                                        |
| `repository.ts`                  | Local serialization/locks/atomic replacement or Supabase revision compare-and-swap; no cloud-error fallback                                                     |
| `auth.ts`, `cloud-auth.ts`, APIs | Demo HMAC or verified Supabase Auth/membership, origin checks, cookies, role-filtered views and restricted kiosk                                                |
| Components                       | Navigation, live timers, seven-second shared state polling, forms/charts, media lifecycle and visible errors                                                    |

V2 commands are `{kind:'v2', command:{action:..., ...}, requestId}`. Durable request IDs prevent duplicate mutations after ambiguous retries. The UI reuses an ID for the same failed request. Profile/orientation versions reject competing stale changes. Cloud CAS can rerun transaction callbacks; they must have no external side effects.

## Storage and upgrades

Local mode retains `data/demo-v1.json`. V1 is backed up unchanged before migration. Only a missing file may initialize seed data; corrupt/unsupported data fails. No resets exist. Bounded directory locks coordinate processes; atomic replacement and per-process serialization protect writes. Stale locks fail explicitly. No-op transactions do not advance revision. Use one durable host and managed backups; power-loss durability is not established.

V2 PostgreSQL stores a private center-scoped domain aggregate in `centerflow_states`, with row-locked revision CAS RPCs and append-only history. V1 normalized tables remain. Aggregate storage preserves original string IDs/nested histories without lossy remapping. Future normalized projections require forward migrations/reconciliation. Service-role access is server-only; server commands and response projections enforce staff permissions. RLS denies direct anon/authenticated aggregate access. Live SQL/tenant tests remain necessary; mock contracts are not policy proof.

Future upgrades must be additive and explicit, backed up and tested using populated prior snapshots and isolated restore drills. Never reset a live database or overwrite occupied state through provisioning.

## Operational truth

Attendance separates actual departure from administrative closure. Automatic closing leaves departure null and unverified. Reconciliation/undo appends events. Kiosk uses generic responses, 30-second debounce and explicit stale/unverified-visit handling; pairing removes staff cookies.

Planning is distinct from completed work. Subject/schedule settings produce exact ranges/quantities. Corrections and unfinished classwork are independent existing records. Carryover replaces proposed new work, preserving identities and preventing duplicate reservations. Approved decisions control instruction; freeform notes never automatically advance/repeat levels. Classwork/status corrections retain history and revoke superseded ledger entries.

Only verified recorded completions contribute to charts. CONNECT worksheet identities never invent physical sheets. Official counts are separately verified or unknown. Actual completion dates support monthly backlog reconciliation. Routine assumptions supply no completed-sheet count. Missing ratings are Not assessed, never low performance. Awards need manual dated verification.

Reports retain immutable snapshot data; corrections append versions. Scheduled job keys differ from manual snapshots, so midday reports do not suppress closing. The worker checks every minute on a persistent host; authorized external triggering is available. Staffing warnings estimate demand from expected visits/available instructors; flexible arrivals and actual layout still require judgment.

## Access and devices

Owner/instructor access instructional records. Assistants have attendance/preparation permissions; private observations/evaluations/decisions/achievements/reports are hidden and denied. Configuration/coverage/backup are owner-only. Real mode requires approved shared storage, HTTPS, secure cookies and permanent secret. Supabase Auth checks active membership, refreshes server cookies and rechecks roles. Secrets remain server-side.

The PWA caches installation assets and a generic offline page, never staff documents or API records. Offline writes are unsupported. ZXing starts on request and stops media after capture/close; manual entry is available. Optional dictation may use browser/provider processing; no audio files are stored. Safari/iPad hardware, microphone privacy, printed codes and standalone installation remain unverified.
