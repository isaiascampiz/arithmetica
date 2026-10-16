# V2 release validation · October 12, 2026

Validation used entirely fictional data in the original workspace. No real minors' records were processed; no live database migration or production deployment occurred. V1 evidence remains in `history/v1-validation.md`.

## Executed checks

| Check                              | Result                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| Optimized build                    | Passed; all app/API routes dynamically rendered                                |
| Strict TypeScript                  | Passed                                                                         |
| ESLint                             | Passed with no errors/warnings                                                 |
| Unit/domain/adapter/recovery tests | **52 passed, 0 failed**; V1 regression cases retained                          |
| Browser regression suite           | **16 passed, 0 failed**, 1.4 minutes; installed Chrome against optimized build |
| Actual backup command              | Passed; JSON plus SHA256 sidecar saved                                         |
| Actual isolated restore drill      | Passed; original 96 student identities retained in a new folder                |

The browser suite ran against port 3100 and `data/e2e-v2.json`, separate from the main preserved file. The environment needed network permission for localhost; the server was restarted after permission was granted. Playwright's managed-server teardown could hang in the sandbox, so validation used the documented external-server mode. No permission bypass or app code change was needed. A final test selector was corrected to account for the Corrections navigation count; the application feature remained unchanged.

## Covered behavior

Unit cases validate populated V1 migration/no reset, codes/stable IDs, student CRUD and stale versions, recurrence/family overrides and individual exceptions, homework quantities, temporary returns/closures/vacations/caps, independent Reading and CONNECT, duplicate-task prevention, corrections-first/partial/defer, exact carryover replacing workload without double reservation, classwork edits and retained ledger history, physical versus official counts, actual completion dates, audited status reversal, explicit instruction approval/superseded review, missing ratings, scan debounce/second visits/stale visits, unverified closing/reconciliation, job catch-up/manual-versus-scheduled idempotency, immutable report versions, staffing overlap/early learners, DST, permissions, concurrent file transactions and fail-closed corruption. Supabase mock contracts check revision-conflict retry and no local fallback; restore tests check a populated upgrade and untouched backup.

Browser workflows validate retained draft/error state, generic offline page without cached records, actual ZXing decoder with a synthetic canvas media stream and track release, two independent clients sharing persistent updates, light/dark/responsive layouts, Home navigation/global search/sidebar, create/edit/withdraw/reactivate/QR reissue, independent preparation/proposal/pull/distribution, existing corrections/carryover/evaluation/progress workflows, orientations/conflicts/rescheduling/cancellation, report archive/export/revisions, competing profile versions/request retry idempotency, persistent note/follow-up/review after departure, manual kiosk duplicate protection and checkout, assistant restrictions/legacy handoff, camera-denial/manual fallback, keyboard close, anonymous and foreign-origin denial.

## Visual evidence

Required release views are under `screenshots/`: Home, Student Profile, Homework Preparation, Calendar, Reports and Kiosk. Additional desktop, portrait-tablet, dark and phone screenshots are included. Views were inspected visually; browser tests checked horizontal overflow and sidebar control fit at 1024×768, 768×1024, 1440×1000 and 390×844. The running application was also inspected in the in-app browser.

These are Chromium viewport checks, not physical iPad/Safari device tests. Screenshots use fictional test records and illustrate existing state, not real operations.

## Remaining external validation

- Live Supabase migration/RLS/tenant isolation, Auth/refresh/revocation, service-role configuration, concurrent cloud commits and disaster recovery. The adapter is implemented and mock-tested; cloud success is not claimed.
- Actual iPad Safari rear camera/focus, printed codes, lighting, standalone PWA installation and scanner hardware. Synthetic decoding establishes software behavior, not physical compatibility.
- Actual speech recognition/keyboard dictation and provider privacy. No audio was captured or transmitted.
- Corporate/privacy authorization, required attendance compliance/report format, retention/access rules, reception layout and kiosk supervision.
- Power-loss durability, managed backup retention, infrastructure/device rate limits, hosting/scheduler operations and production load.

Corrections tracking and unfinished-classwork handling were already implemented when the final user guidance arrived; neither was redesigned or changed in response. Routine assumed completion never supplies verified reporting counts. Final delivery is a working fictional local V2 release with source and forward migrations, not a production deployment.
