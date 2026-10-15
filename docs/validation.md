# V3 release validation · October 14, 2026

Validation used entirely fictional data in the existing V1/V2 project. No real minors' records were processed, live database reset or migration applied, or production deployment performed. Prior evidence is preserved in `history/v1-validation.md` and `history/v2-validation.md`.

## Executed checks

| Check                                          | Result                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Optimized production build                     | Passed, exit 0                                                                                                             |
| Strict TypeScript                              | Passed, exit 0                                                                                                             |
| ESLint                                         | Passed, exit 0                                                                                                             |
| Unit/domain/adapter/recovery tests             | **94 passed, 0 failed**; original regression cases retained                                                                |
| Full browser suite                             | **21 passed, 0 failed**, 3.8 minutes; installed Chrome against optimized app                                               |
| Actual backup command                          | Passed; schema-3 JSON and SHA256 sidecar written                                                                           |
| Actual V2 backup restore and forward migration | Passed in a new isolated folder; schema 3 and all 96 student identities retained                                           |
| Original data preservation comparison          | Passed; 96 students, 66 visits, five observations, 18 legacy homework records, original V2 settings and histories retained |
| Visual inspection                              | Eight release views inspected, plus responsive/dark test evidence                                                          |

Validated runtime: Windows, Node 24.20.0 and pnpm 11. The old TypeScript launcher encountered a sandbox Windows account-lookup failure before application code ran. The checked-in compiler runner now executes the original TypeScript tests and maintenance scripts using the existing TypeScript dependency; backup and restore were actually rerun successfully. Strict type checking and Next's production compiler remain separate checks.

Browser tests use `data/e2e-v3.json` on port 3100 with scheduled jobs disabled, separate from the preserved main file. External-server mode avoids sandbox managed-server teardown issues. Earlier fixture failures were corrected without weakening product checks: a prepared student is selected from the Prepared view; repeated synthetic busy days explicitly reconcile previously issued test material and re-prepare stale physical plans. The final complete suite passed after these corrections.

## Preservation and recovery evidence

- Pre-change V2 backup: `data/backups/centerflow-2026-10-14T08-01-34.840Z.json`. SHA256: `e516b4ff6647ce1a957542951fbf1b9389f2a0c6d3b2b8fe4e037d09b7faee8d`.
- Independent baseline: workspace `work/v2-backup/before-v3.json`. Local upgrade also keeps an untouched `.v2-backup.json` beside the original data file.
- Executed V3 backup: `data/backups/centerflow-2026-10-15T04-28-09.251Z.json`, with SHA256 sidecar. The filename uses UTC; this was October 14 locally.
- Executed isolated restore: `data/restore-drills/1792038490841/restored.json`, migrated forward to schema 3 without overwriting the main file.
- Original-field comparison result: workspace `work/v3-preservation-result.json`. Existing student IDs and original records/configuration were compared with the V2 baseline; all retained.

The original data path remains `data/demo-v1.json`. Generated records, backups and browser test data stay in the workspace and are excluded from the source ZIP. Extracting the ZIP into a new folder initializes fictional seed data only when its data file is absent; upgrading the existing workspace never requires deleting that file.

## Covered behavior

Unit tests cover additive populated migrations; exact packet sizes and calendar days between visits; independent PAPER/CONNECT subjects; reviewed curriculum bounds and unknown subdivisions; shared preparation/handoff planning; partial/stale physical preparation; corrections-only displacement and held packet identity; returned unfinished versus missing material; actual outgoing overrides and repeat versus permanent progression; away/return scheduling; optimistic versions, durable request IDs and role boundaries; receipt assumptions versus verified ledger counts; roster filters; ambiguous historical note matching; measured duration; deduplicated arrivals, weighted occupancy, midnight and daylight-saving transitions. Existing V1/V2 domain, authorization, concurrency, corruption, cloud mock and recovery tests remain in the 94-test suite.

Browser tests cover retained drafts and errors; offline privacy; actual ZXing software decoding from synthetic camera media and track cleanup; shared updates between staff clients; student creation/editing/enrollment/QR reissue; precise preparation and instructor handoff; returned unfinished/missing/repeat/manual adjustment; profile/history and reports; stale updates and retry idempotency; persistent notes/follow-up after departure; manual kiosk check-in/out and duplicate protection; camera denial; assistant, anonymous and foreign-origin restrictions; responsive layouts and keyboard dialog handling.

The fictional busy-day scenario used 50 expected students, six early learners physically present and two independent staff sessions, with PAPER, CONNECT and mixed enrollment. It exercised preparation, arrival handoff, receipt exceptions, packet displacement, repeat/manual override, away status, departure without notes and unverified administrative closure. It confirmed preserved original IDs and no invented verified completion totals. Repeated browser runs retain synthetic history; screenshot totals can therefore exceed one scenario's 50-student setup.

## Visual evidence

`docs/screenshots/v3/` contains Home, Quick View, Homework Preparation, Student Profile, Visit History, Center Activity, Reports and Kiosk from the running release. Additional dark, phone and tablet/desktop viewport evidence is included. Browser assertions checked overflow and usable controls at 1024×768, 1194×834, 768×1024, 1440×1000 and 390×844. These are Chromium viewport tests, not physical iPad/Safari tests.

## External validation still required

- Live Supabase SQL/RLS/tenant isolation, Auth refresh/revocation, service-role setup, concurrent commits and disaster recovery. Cloud adapters and mock contracts are implemented; live cloud validation is not claimed.
- Physical iPad Safari camera/focus, printed QR codes, lighting, standalone installation and any scanner hardware. Synthetic decoder tests do not establish hardware compatibility.
- Actual speech recognition/keyboard dictation and provider privacy review. No audio was recorded.
- Corporate/privacy authorization, required attendance/report format, approved curriculum identifiers/bounds, retention/access rules, reception layout and kiosk supervision.
- Production hosting/scheduling, managed off-host backup retention, power-loss recovery, infrastructure limits and production load.

This is a completed, locally validated V3 fictional-data application with source and forward migrations. The external checks above are deployment/device gates, not claimed completed tests.
