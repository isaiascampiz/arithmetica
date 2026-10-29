# Arithmetica V1 verification — October 29, 2026

Production: https://arithmetica.arithmetica.workers.dev. Documented organizational authorization and the specific production/import/deployment approvals were confirmed by the owner. No paid upgrade was selected. This record supersedes earlier pending-deployment/import status; prior regression history remains preserved.

## Delivered behavior

The original layout is retained. Pending profiles preserve source names, grades, levels and enrollment dates while modality, schedule and worksheet positions await teacher confirmation. Pending subjects cannot generate paper tasks. Attendance and typed observations remain available; three profiles without a selected subject are included in the full roster. This fixes the filter that previously hid them.

Intake parsing, atomic owner-authorized import, empty-center initialization, setup validation, pouch-code compatibility, privacy controls and encrypted archives are separated into focused modules. Earlier version handlers, printed tokens, data IDs and migration history are retained. The public app/workspace identity is Arithmetica; legacy `cf-*` cookies, database RPC/table identifiers and preserved demo filenames remain intentionally compatible.

The API runs shared authenticated handlers in Supabase Edge Functions. Static browser assets and a small fixed-project Cloudflare proxy fit the measured Free runtime. Request cookies are isolated per concurrent request, only application cookies are forwarded, provider cookies are removed, backend environment aliases are immutable, and cloud errors have no local fallback. Unused hosting adapter/build paths were removed. Visible-only polling reduces background calls; browser-history restoration reloads private screens. Scripts generate a CSP with approved inline script hashes, without `unsafe-inline` scripts.

## Evidence

| Check                              | Result                                                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint and TypeScript                | Passed                                                                                                                                                                 |
| Unit tests                         | 270 passed, including original regression cases, pending setup, import retry/roles, conditional reads, cookie isolation, scheduler authorization and archive tampering |
| Node and hosted browser/API builds | Passed with Next 16.4.1                                                                                                                                                |
| Full local Chromium suite          | 122 passed in one complete run (11.6 minutes), including synthetic camera decoding                                                                                     |
| Hosted browser workflows           | 3 passed on final staging deployment, including 71-profile visibility, tablet/phone layouts, pouch labels and isolated kiosk                                           |
| Deployed API exercise              | 32 synthetic checks passed: secure cookies, roles, stale/concurrent edits, import/attendance retries, notes, pending subjects, backup and Excel export                 |
| Staging database isolation         | 8 anonymous and 12 authenticated-role checks passed; direct private aggregates/RPCs and self-promotion denied                                                          |
| Production read-only checks        | Five applied schema versions, eight anonymous denials, owner membership, secure/no-store responses, login headers and full field reconciliation passed                 |
| Actual roster import               | 71 profiles, 102 Math/Reading enrollments; no fictional operational students; all original IDs/source dates/pending fields reconciled                                  |
| Code update preservation           | Production reconciliation repeated after final code deployment; all imported fields unchanged                                                                          |
| Backend secret placement           | Six app-secret SHA-256 digests match in each environment; Cloudflare proxies retain only gateway and job secrets                                                       |
| Source/artifact/history scan       | Ten configured credentials/recovery/deployment values and 71 exact student names checked; no exposed paths                                                             |
| Dependency audit                   | No known production advisories reported                                                                                                                                |
| Backup                             | Encrypted production archive contains all 71 profiles; decryption/read-back passed; daily Windows task first run exited 0                                              |
| Recovery drill                     | Isolated synthetic cloud restore preserved 71 profiles, six historical revisions and three memberships with exact values                                               |
| Jobs                               | Missing/wrong credentials denied; valid staging invocation and idempotent retry passed; 15-minute triggers deployed                                                    |
| CPU sample                         | Proxy HTTP requests measured at 1–3 ms in staging; this is a sample, not a capacity/uptime guarantee                                                                   |

The earlier full browser run had a synthetic-camera timeout. Its focused five-repeat run passed; the final full 122-workflow run then passed independently. No automated simulation used real student data. Production activity during this pass was the authorized import, encrypted backup and read-only reconciliation, not invented test visits.

A live timer check exposed a Cloudflare-only redirect-mode exception that Node mocks did not catch. The scheduled handler now uses manual redirects and rejects every non-success status, preventing credentials from following redirects. The corrected handler passed in Cloudflare's actual local runtime against synthetic staging, then a live staging timer execution completed with outcome `ok`, 0 ms reported CPU and zero exceptions. The temporary one-minute staging verification schedule was restored to 15 minutes; production uses the corrected handler and its regular 15-minute schedule. This behavior follows the [Cloudflare Request runtime contract](https://developers.cloudflare.com/workers/runtime-apis/request/).

## Operational limits

A supervised pilot on the actual iPads is still required, including Home Screen installation, Safari camera/HID reader, print scale, cross-device arrival/note read-back and network failure. Browser viewport checks do not certify physical hardware. Homework requires instructor confirmation of missing subject setup and center-approved catalog bounds. Dictation remains disabled until provider-specific privacy approval.

The backup computer must be running with its user signed in; verify OneDrive offsite sync. Retain the recovery key independently. Archives do not contain Auth passwords/hashes or deployment secrets; recovery recreates original Auth UUIDs with new passwords. Provider account MFA/recovery remains owner-controlled. The scoped deployment credential expires November 5, 2026; expiry does not stop the running app.

Free hosting has usage/storage limits and potential inactivity pauses. Review database/history growth, function errors, egress, backups and unauthorized login alerts. Per-instance throttling is not a distributed abuse guarantee. These checks are not an independent penetration test and cannot establish that compromise or bugs are impossible. See the [operations runbook](deployment-and-import-plan.md) and [release commands](cloudflare.md).
