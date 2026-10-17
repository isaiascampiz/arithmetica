# Centerflow V3.0

A working iPad-first learning-center app, upgraded in the original V1/V2 project. **Fictional local release, not a production deployment.** Original records and stable IDs are retained; no live database reset or real minors' data is involved.

## Run

Node 24 and pnpm 11 are the validated runtime family. From this project directory:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Open **http://127.0.0.1:3000**. Dependencies already exist in the delivered workspace. Do not overwrite an existing configured `.env.local`. For the optimized release, stop development first:

```powershell
pnpm build
pnpm start
```

| Demo role  | Email                  | Password        |
| ---------- | ---------------------- | --------------- |
| Owner      | owner@demo.center      | CenterDemo!2026 |
| Instructor | instructor@demo.center | TeachDemo!2026  |
| Assistant  | assistant@demo.center  | HelpDemo!2026   |

The preview is local to this computer and requires the server to remain running. To share across approved devices, host one persistent server behind trusted HTTPS, configure its bind/reverse proxy, set exact `APP_ORIGIN`, `COOKIE_SECURE=true` and a permanent random `SESSION_SECRET` of at least 32 characters. An iPad's localhost is not this computer. Camera use needs a secure browser context. Real device/camera compatibility is unverified.

## V3 workflow

- **Home:** four tiles filter the daily list: Still expected (scheduled with no arrival today and not already present), Here now, Early learners here, and Checked out (explicitly verified physical departures today in the center timezone; automatic/unverified closures excluded). Press the selected tile again to show all; only one tile is active. The full list shows present visits in waiting-first order, then not-yet-arrived students alphabetically, then departed visits. Not arrived opens the profile without recording attendance; visit rows open Quick View. Repeat visits remain separate, so Checked out counts visits and a returning student can also be Here now. Opening a row never confirms attendance or instruction.
- **Quick View:** incoming paper receipt exceptions, per-subject Worksheets / Corrections only / Both, exact outgoing packets, optional observation tiles and typed/dictated notes. One arrival confirmation issues the actual set and records instructor/time. CONNECT-only visits simply confirm the instructor interaction. Departure never requires another instructional handoff.
- **Homework Preparation:** exact individual in-center and take-home ranges, sorted by visit date. Mark Prepared covers the displayed student set, with accurate per-subject partial preparation. Preparation and actual issuance remain separate.
- **Student Roster:** name/ID search stays visible. Open Filters to choose subject, PAPER/CONNECT, enrollment, early learner and weekdays, then Apply. Clear restores the default active-student view while retaining the search. Rows identify CONNECT subjects without routine PAPER labels; medal filtering is hidden. Manual physical check-in/out remains available.
- **Student profile:** Overview, Progress and unified Visit History. Edit Student consolidates permanent configuration, enrollment date, medals, goals and shortcuts. Unknown historical enrollment dates stay unknown.
- **Center Activity:** independent arrival counts and time-weighted occupancy. Unverified historical departures never inflate measured occupancy. Reports retain daily/weekly/monthly archives, revisions and export.
- **Away Until:** pauses routine expectations and pulling, without vacation homework accumulation. A Monday–Thursday return can differ from regular days; resume/cancel keeps the recurring schedule intact.

Dedicated corrections/family/calendar/vacation-planning interfaces are no longer active. Their original records, V2 domain code and migration history remain available for compatibility and dated history. V3 is not a corrections gradebook or a replacement for Kumon Connect.

### Paper planning and curriculum

Homework days are calendar dates strictly between visits, including weekends. The in-center packet is separate. Packet size and daily quantities are per PAPER subject. CONNECT subjects generate no routine physical preparation.

Corrections-only moves the entirely unstarted in-center packet into an existing outgoing slot and holds the final displaced packet. Returned unfinished material can replace new work; missing material is never treated as physically available. Started in-center work creates no incompletion tracker. Adjust/Repeat controls let an instructor record the actual physical set. One-time repeat does not reset ongoing progression; permanent restart is explicit and audited.

The catalog is **explicit, configurable fictional demonstration data**, not a certified Kumon curriculum. Known demo bounds are listed in `v3-migrate.ts`; unresolved levels/subdivisions stop for review. Legacy Reading A/B/C are retained without guessing AI/AII mappings. Owner Settings allows a reviewed identifier, sequence order, first/last worksheet and source. No automatic cross-level advancement occurs. Verify the center's actual catalog before real use.

Reported receipt, routine no-exception assumptions, preparation and issuance **never create verified completed-sheet totals**. Existing verified ledger records remain the reporting source.

## Data, upgrades and recovery

The original path stays **`data/demo-v1.json`**, now schema 3. A V2 snapshot was backed up and restored in isolation before structural changes. On local upgrade, the repository saves an untouched `.v2-backup.json`, then adds V3 state. IDs, original visits, observations, packets and previous operations remain. Corrupt/unsupported files fail closed; only a missing file initializes fictional seed data. **Never delete or reseed to upgrade.**

Local storage uses serialized transactions, cross-process locking and atomic file replacement. Use one durable Node host, not ephemeral/serverless disk. Supabase revision CAS and Auth/membership adapters remain implemented; there is no cloud-error local fallback.

```powershell
pnpm backup
pnpm restore:test 'data/backups/<explicit-backup>.json'
```

Backups include JSON and SHA256. Restore testing writes a new isolated folder, migrates forward and checks identities; it never overwrites live state. Keep managed off-host copies. Scripts use exported environment variables rather than automatically reading Next's `.env.local`:

```powershell
node --env-file=.env.local scripts/run-ts.cjs scripts/backup.ts
```

Command-line scripts and unit tests use the installed TypeScript compiler through `scripts/run-ts.cjs`, avoiding a Windows account-lookup failure in the previous launcher. Next still compiles application production code normally.

## Supabase / private deployment

1. Use an approved disposable Supabase project for policy and recovery tests. Apply immutable SQL migrations in order: `202610120001_v1_operations.sql`, `202610120002_v2_shared_operations.sql`, then `202610140003_v3_handoffs.sql`. V3 changes version compatibility, keeps occupied payloads/history, and preserves server-only RPC access. Never reset a live database.
2. Provision the center, Supabase Auth users and active staff memberships through a privileged process. Validate roles/tenant isolation. The service role stays on the server; browsers use role-filtered Next APIs.
3. Configure `DATA_ADAPTER=supabase`, public URL/anon key, server-only service key, `CENTER_ID`, permanent session secret, exact HTTPS origin and secure cookies. Real-data mode also needs `DEMO_MODE=false` and organizational approval represented by `PRODUCTION_DATA_APPROVED=true`.
4. For an **empty** cloud state only, export configuration and `ALLOW_CLOUD_PROVISION=true`, then run `pnpm cloud:provision '<explicit-authorized-backup>.json'`. Disable the flag afterward. Existing state is never overwritten. Apply V3 SQL before V3 cloud writes; compare-and-swap commits retain prior state in recovery history.
5. Validate real Auth/refresh/revocation, roles, concurrent writes, backups/restore and curriculum bounds before real student records. No live cloud credentials/policy execution were available for this delivery.
6. Deploy the optimized app to a persistent Node host behind HTTPS. Keep `ENABLE_SCHEDULER=true` on an always-running service, or call `POST /api/jobs` with `Authorization: Bearer <JOBS_SECRET>` from a secured scheduler. Closing/report jobs catch up idempotently; actual departures stay unverified after administrative closure. Review center settings before use.

## Checks and delivery evidence

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Build before browser tests. They use port 3100 and **`data/e2e-v3.json`**, separate from preserved demo data. Windows uses installed Chrome; override with `PLAYWRIGHT_CHANNEL`. Other systems can install Chromium with `pnpm exec playwright install chromium`. A restricted environment can start the isolated server using `playwright.config.ts` variables, then run tests with `E2E_EXTERNAL_SERVER=true`.

See [validation](docs/validation.md), [V3 changelog](docs/changelog-v3.md), [acceptance coverage](docs/v3-acceptance.md), [architecture](docs/architecture.md), and [screenshots](docs/screenshots). V1/V2 validation and original V2 browser contracts are retained in history folders.

External gates: corporate/privacy authorization, exact official reporting/attendance requirements, approved curriculum bounds, live Supabase policy/auth/recovery verification, actual iPad Safari/camera/printed-code/install testing, and dictation-provider privacy. No real audio was recorded; no production deployment or physical hardware test is claimed.
