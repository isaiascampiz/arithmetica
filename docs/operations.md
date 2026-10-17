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
- **Quick View:** browser-style Math/Reading tabs show one subject at a time, with avatar/name, Time here and compact subject badges. Open every available tab before Confirm check-in becomes active; the first displayed tab counts as opened. Tab switches preserve drafts, and one confirmation still saves the complete visit interaction together. Packet / Corrections / Both are activity buttons using the existing stored values. Incoming ranges are shown without assuming completion. Outgoing cards open read-only details; use Adjust for changes. Prepared/Not prepared comes from existing preparation and stale state. Adjust, Repeat and Reset are small blue actions. Optional observation tiles/customization are hidden; typed/dictated notes remain last. Existing observations and follow-ups are preserved; new notes do not create follow-up flags. Saved subject checkmarks require recorded activities or assignment IDs. No independent saves, new packet-status recording or goal ratings are introduced.
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

## Separate fictional Quick View preview

Run `pnpm demo:quick-view` to create **only** `data/quick-view-demo.json`. It contains three explicitly fictional students: two PAPER subjects with prepared materials, mixed PAPER/CONNECT with unprepared materials, and one Reading subject. Previously issued homework has real packet identities and realistic ranges; completion remains unassessed. The command refuses cloud/real-data mode and refuses to overwrite an existing file. It never touches `data/demo-v1.json`.

Start a separate preview in PowerShell:

```powershell
$env:DEMO_DATA_PATH="data/quick-view-demo.json"
$env:DEMO_MODE="true"
$env:DATA_ADAPTER="local"
$env:ENABLE_SCHEDULER="false"
pnpm start --port 3002
```

Open http://127.0.0.1:3002, use a fictional staff sign-in, and open a Fictional Demo student from Home. The center is labeled FICTIONAL Quick View demo. These environment settings apply to this terminal; use a different terminal for the regular preview. The checked-in builder is `tests/fixtures/quick-view-demo.ts`; browser tests view a separate in-memory instance without adding demo records to the main data file.

Quick View now confirms one subject at a time. Optional `subjectCheckIns` on a visit retain each subject's confirmation and attribution; the existing aggregate handoff is recorded once all enrolled subjects are confirmed. Physical attendance is unchanged. Optional `inCenterReturns` on a paper set retain unfinished incoming packet identities separately from new classwork and outgoing homework. These are backward-compatible optional JSON fields; no SQL schema or migration changes are required, and existing records are not rewritten.

Incoming packet cards begin neutral; selecting one marks it unfinished. The shared subject planner orders unfinished packets by approved curriculum level order, then worksheet number. Packet and Both use exactly one earliest unfinished packet in the center (or the planned packet when none is unfinished); Both only adds the corrections activity record. Remaining unfinished packets, followed by displaced classwork and planned packets, fill the existing schedule's outgoing homework slots. Corrections-only uses no in-center packet and shifts all packets into homework. Displaced ranges stay visible as disabled gray “Not going home” cards; blue shifted cards and small “Pull” / “Returned packet” labels distinguish physical actions. Overflow requires explicit Adjust rather than silently dropping unfinished work. Original packet identities and receipt history are retained; unselected packets are not verified completed.

Horizontal subject controls scroll with the content, time appears under the student's name, and Quick View retains a consistent viewport-limited size for PAPER and Kumon CONNECT. Repeat previews use the shared sequencing engine and the student's visit schedule. Repeat quantities and starting position apply to this visit only; permanent progression settings are preserved. Confirming the repeat preview stages the plan; the final subject check-in explicitly confirms its physical materials and saves it. Outgoing packet cards are display-only; Adjust changes the reviewed packet queue. Instructional notes remain optional at the bottom.

Activity controls precede today's packet. Adjust edits are isolated until **Confirm adjustment**; instructors can edit today's packet for Packet/Both and outgoing ranges, then type or dictate an adjustment reason. Changing the center range rebuilds the proposed outgoing sequence from its ending page. **Confirm repeat plan** follows its typed/dictated reason and supports side-by-side **Today's packet** and **Homework** buttons. Homework-only preserves today's packet; corrections-only has no in-center packet. While an editor is open, confirm it or close it before the final subject check-in.

An explicitly confirmed replacement rebuilds the sequence rather than inserting the previous unfinished queue ahead of it. Exact subject/level/start/end matches reuse existing, physically available packets and retain their IDs and source assignments. Cards distinguish **Pull**, **Reuse existing packet**, and **Not going home**. Unmatched unfinished packets become held material, retain their unfinished reconciliation history, and can be reused when a later rebuilt sequence reaches their exact ranges. They are neither deleted nor marked completed. Missing, unreturned issued, and separately reserved packets cannot be silently reused. No persistence schema or SQL migration changes are needed; replacement choices are validated by the existing versioned subject command and saved into existing packet/history fields.

Quick View places the activity explanation between the activity controls and today's packet. Adjust uses one shared column-header row (Level, Starting page, Ending page) with a subtly highlighted Today row and small Homework labels. Editing today's range rebuilds subsequent homework rows; instructors may then edit or remove individual homework rows before Confirm adjustment. Confirm applies the displayed queue, keeps the current center packet for homework-only edits, and retains removed unfinished material as held with its reconciliation history. Reason controls use the compact Dictate label. Subject check-in remains the final save; profile summaries of restarts remain a later feature.

Quick View optional observations use compact 0�5 sliders for Focus, Handwriting and Independence. Zero means unrated and is omitted from saved ratings; these are instructor observations, not grading or verified homework completion. Customize supports renaming, removal and keyboard-accessible ordering; Add custom supports up to 12 student-specific skills. Names/order save with the existing subject check-in or Save observations action, using the student settings version to reject stale edits. Ratings retain their label, visit, author and timestamp in the existing observation record. After a successful save, ratings clear to avoid duplicating them on the next subject check-in. The optional typed/dictated instructional note remains below in a matching enclosure. No SQL migration or attendance change is involved.

Student profile Visit History now uses expandable visit details and a View session dialog. Session homework/activity is read-only; new check-ins append immutable per-subject packet snapshots, including assumed-completed versus explicitly unfinished incoming work. Earlier visits show existing recorded material and identify missing incoming details rather than reconstructing current plans. Edit observations appends attributed revisions to the original observation, retaining original content and reviewer attribution. Concurrent edits use the revision count and reject stale saves; server permissions require an instructor or owner. No attendance or physical packet command is available in the historical dialog. No SQL migration is required; the optional fields remain compatible with existing records.

Visit History cards show the center-local weekday/date, check-in, verified check-out and duration vertically, plus compact observation indicators and View session. Visit date selects a center-local calendar day; sorting supports newest/oldest and longest/shortest verified duration, placing unverified durations last. The historical session uses Homework received, In-center work and Homework sent home; routine incoming work is labeled Completed (assumed), never verified completion. Additional notes are explicitly separate records with context=additional and inputMethod=dictation, author and added timestamp. Additional note opens a dictation-only, read-only transcript composer; audio is never recorded. Unsupported browser dictation leaves saving unavailable until a transcript exists. Original historical entries are not retrospectively classified as additional. Existing observations retain attributed edit history and review controls.

Visit history visual cleanup: Filter & sort uses a dismissible native popover. Every visit summary consistently shows Observations and Note as Yes/No rows. Historical packet cards share the same container alignment. Observations use compact Skill ratings and Instructional note sections, with sliders visible only while editing via Edit observation. Edit attribution and revision history are retained in records but hidden in this interface. The separate additional-note composer is hidden; previously saved additional notes remain readable. Attendance, sequencing and persistence rules are unchanged.

Historical view presentation: desktop visit cards balance attendance and observation indicators across two columns and stack on phones. Skill ratings display full-width neutral read-only bars plus numeric scores; editing keeps sliders. The editor uses Update observation with Cancel in the bottom action row. Historical Mark reviewed controls and the editor speech privacy helper are hidden. Shared dictation keeps its helper by default elsewhere, and provider privacy requirements remain documented. Saved observation content, revisions, review attribution and attendance are unchanged.

Visit history follow-up polish: Filter & sort expands inline below its toggle; Visit duration replaces Time here. Desktop summary columns sit closer together. Historical packet blocks share fixed dimensions, and routine received packets omit the assumed-completion display label without changing recorded outcomes. Editing uses blue adjustable rating bars in the same horizontal arrangement as display; Reset restores the currently saved rating/note draft without saving, and Update observation remains on the opposite side. Reviewed indicators are hidden; review data is retained.

Follow-up correction: historical packet chips again use their original content-sized dimensions. Reset now discards the draft and exits observation editing. Desktop cards place visit duration above View session in a centered far-right column, with attendance and observation indicators alongside. Stored observation and homework records are unchanged.

Visit summary refinement: check-in and observations share the first row, check-out and note share the second, visit duration sits below attendance, and View session is vertically centered at the right. The inline filter panel uses a compact tinted surface with a left accent, aligned date/sort controls and Clear date; phone controls stack. No filtering, attendance or save behavior changes.
Filter-panel width refinement: the tinted surface spans the full visit-card width while its controls keep their compact sizing. The desktop View session button centers across the entire normal visit card, including the date heading.
