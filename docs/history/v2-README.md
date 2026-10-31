# Centerflow V2 · working local release

An iPad-inspired learning-center operations PWA built in the original Next.js/TypeScript project. This delivery runs with entirely fictional data; it is not a deployed production system. The 96 original demo students and their V1 records are preserved. V2 upgrades the same data file without resetting it.

## Run the app

Node 24 and pnpm 11 were used for validation. From this folder:

```powershell
pnpm install --frozen-lockfile
Copy-Item .env.example .env.local
pnpm dev
```

Open **http://127.0.0.1:3000**. Dependencies are already installed in the delivered workspace. No cloud credentials are needed for the demo. To run the optimized release, stop the development server, then:

```powershell
pnpm build
pnpm start
```

| Demo role  | Email                  | Password        |
| ---------- | ---------------------- | --------------- |
| Owner      | owner@demo.center      | CenterDemo!2026 |
| Instructor | instructor@demo.center | TeachDemo!2026  |
| Assistant  | assistant@demo.center  | HelpDemo!2026   |

Set a permanent random `SESSION_SECRET` of at least 32 characters and custom demo passwords before sharing access. Commands bind to loopback. A second device needs one persistent host, an approved HTTPS reverse proxy, exact `APP_ORIGIN`, secure cookies and deliberate host/network configuration. An iPad cannot reach this computer through the iPad's localhost. Camera access requires a secure browser context.

## Included workflows

- Action-first Home: student/family search, expected attendance, live timers, early learners, assistance, corrections, preparation and orientation/staffing impact.
- Student creation/edit/withdrawal/reactivation, family recurrence and individual overrides, absences/make-ups/vacations, independent Math/Reading Paper/CONNECT settings and QR reissue.
- Paired kiosk: automatic arrival/departure scanning, duplicate-scan protection and manual fallback. Pairing removes the staff session; kiosk responses expose no roster or private notes.
- Staff attendance/undo/reconciliation and administrative closing that leaves actual departure unverified.
- Schedule-based homework proposals: exact identities, corrections-first rules, reviewed unfinished-classwork carryover replacing outgoing workload, caps, explicit decisions and preparation/distribution/return/verification histories. Original V1 packets remain in Legacy.
- Persistent observation review/follow-up, categorical evaluations with Not assessed, optional typed/dictated notes, full profiles, verified completion/duration charts and manually verified achievements.
- Orientation calendar, coverage/overlap/estimated early-learner demand; archived daily/weekly/monthly reports, immutable revisions and CSV/JSON.
- Server role checks, shared persistence, durable request IDs, stale version detection, checksummed backups, isolated restore drills, light/dark layouts and generic offline PWA page. Offline writes are unavailable.

Corrections tracking and classwork carryover are separate existing workflows. Routine assumptions never become verified worksheet counts. Official monthly totals require explicit verified entries; missing figures remain visible. Charts distinguish physical paper sheets from CONNECT identities.

See [V2 acceptance](../v2-acceptance.md). Reports are operational; the exact corporate format and corporate integrations remain unverified.

## Try it

1. Sign in as owner. Select a Home workload tile or search Avery Bennett. Open the full profile or quick-note action.
2. Save a fictional observation/follow-up. Check out the student: pending review remains until reviewed, retaining original content.
3. Set recurring days and independent subjects in the profile. In Homework choose a planned departure date, propose work, approve, mark ready, pull paper and confirm distribution. Review exact identities/history in the profile.
4. Exercise the existing corrections-first/classwork carryover controls with fictional worksheets. Record actual completed identities separately from planning assumptions.
5. Schedule an orientation in Calendar and inspect staffing impact. Generate archived reports or append historical revisions.
6. Open kiosk in a separate browser. Start camera or enter `CF-DEMO-AVERY-7K2Q`. A scan toggles attendance; repeats are ignored for 30 seconds. Prior unverified visits require staff reconciliation. Sign in again to exit kiosk mode.

## Persistence and recovery

The retained local path is **`data/demo-v1.json`**, now schema 2. Only a missing file initializes fictional data. V1 upgrades create an untouched `.v1-backup.json` before adding V2 state. Student IDs, codes, visits, observations and homework survive. Corrupt/unsupported files fail closed. Never delete/reseed to upgrade.

Local transactions serialize, take a cross-process directory lock and atomically replace the file. Use one persistent Node host with durable disk, not an ephemeral/serverless filesystem. Stale locks fail explicitly. This demo storage option does not establish production durability. Owner JSON export and these tools support recovery:

```powershell
pnpm backup
pnpm restore:test 'data/backups/<explicit-backup>.json'
```

Backup writes JSON plus SHA256. Restore testing writes a new isolated folder and checks identities; it never overwrites live state. Keep copies outside the host. Scripts use exported environment variables and do not automatically load `.env.local`; to use its configuration explicitly:

```powershell
node --env-file=.env.local --import tsx scripts/backup.ts
```

## Supabase and deployment

The server-mediated Supabase repository and Auth adapter are implemented and contract-tested. No live cloud credentials were available; SQL/RLS, cloud authentication, tenant isolation and recovery still require validation in a disposable project.

1. Create an approved Supabase test project. Apply immutable migrations in filename order: `202610120001_v1_operations.sql`, then `202610120002_v2_shared_operations.sql`. Never reset an existing database. V2 adds private revisioned aggregate storage and append-only recovery history; V1 normalized tables remain intact.
2. Privileged provisioning must create the center and active staff memberships linked to Supabase Auth users. Review/test roles and tenant boundaries. Aggregate RPCs are server service-role only; browser users receive role-filtered server views.
3. Configure `DATA_ADAPTER=supabase`, public URL/anon key, server-only `SUPABASE_SERVICE_ROLE_KEY`, exact `CENTER_ID`, permanent `SESSION_SECRET`, `APP_ORIGIN=https://...` and `COOKIE_SECURE=true`. Real-data mode also requires `DEMO_MODE=false` and organizational approval represented by `PRODUCTION_DATA_APPROVED=true`.
4. Initialize **empty** cloud state only from an explicitly authorized backup. Export configuration, set `ALLOW_CLOUD_PROVISION=true`, run `pnpm cloud:provision '<explicit-backup>.json'`, then disable the flag. Revision-zero initialization refuses existing state. This is not an overwrite/import or occupied-state upgrade procedure.
5. Validate login/refresh/revocation, simultaneous writes, policies and backup/restore before real records. Cloud errors never fall back to local storage. Protect service keys; add reviewed infrastructure/device rate limits. QR is a bearer identifier, not pickup authorization.
6. Build/deploy to a persistent Node service with HTTPS. Use `ENABLE_SCHEDULER=true` on an always-running host, or an external scheduler calling `POST /api/jobs` with `Authorization: Bearer <JOBS_SECRET>`. Jobs catch up and are idempotent. Fictional defaults are Mon–Thu 19:15 America/Los_Angeles; review Settings. Manual midday reports do not suppress closing snapshots.

## Validation

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Build before E2E. Windows defaults to installed Chrome; `PLAYWRIGHT_CHANNEL` overrides it. Other systems can install Chromium with `pnpm exec playwright install chromium`. Tests use port 3100 and separate `data/e2e-v2.json`, appending fictional fixtures without resetting main data. If a restricted environment cannot stop Playwright's managed server, start the isolated server using the variables in `playwright.config.ts`, then set `E2E_EXTERNAL_SERVER=true`.

See [validation](../validation.md), [architecture](../architecture.md), [roadmap](../roadmap.md) and [screenshots](../screenshots). V1 validation is preserved in `docs/history/v1-validation.md`.

Before real use, resolve corporate/privacy authorization, attendance requirements, exact report fields, reception layout/supervision, actual device installation/camera/printed-code tests, dictation privacy and live cloud policy/recovery validation. No real audio, minors' records or hardware compatibility was validated or promised.
