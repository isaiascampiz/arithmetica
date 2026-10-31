# Centerflow UI and reporting finalization

Prepared 2026-10-24. Status: implementation handoff; work below is not yet completed or validated.

## 1. User decisions and scope

The user wants a coherent final pass across Settings, Center Activity, Reports, and Kiosk. Quality and economical model usage matter more than elapsed time. Execute this plan when instructed; do not restart product discovery or ask the same questions.

Confirmed decisions:

- Center Activity uses **one compact boxed chart**, not separate cards for each bar or a large full-grid graph.
- Historical average is gray behind actual blue, with **identical bar widths** and a shared zero baseline/scale. Heights encode values. Counts and labels belong **underneath** the chart/bar area, not large repeated numbers above it.
- Worksheet totals mean **verified completed physical sheets**. Prepared, handed out, returned, reported finished, and assumed finished are different evidence and cannot substitute.
- Monthly reporting is an **internal Centerflow summary first**, with a real Excel workbook. Corporate instructor-report compatibility is not established or required in this pass.
- Activity must answer what is happening now and preserve a searchable chronology. Reports must explain the selected period and allow inspection of their supporting records.
- Settings must use compact controls, understandable categories, and working configuration. Kiosk must be straightforward for students and configurable by authorized staff.

Out of scope: unrelated profile/progress redesigns, restoring hidden corrections/family/calendar/vacation navigation, grading automation, corporate integrations, live cloud rollout, real records, a new design system or dependency upgrades unrelated to this work.

## 2. Execution economy and handoff rules

Recommended executor: GPT-6.1 Sol, High reasoning, Standard speed, if available. This is a task-specific judgment, not a guaranteed cheapest configuration. Medium is reasonable for isolated styling; use High for completion evidence, snapshot semantics, permissions, and final integration. Reserve Astra for a concrete unresolved issue rather than a second full implementation. Default to one agent: elapsed time is not the priority. A narrowly scoped review can be delegated if it avoids rework; avoid full-history parallel agents editing shared files.

Official guidance checked on 2026-10-24:

- [Model selection and effort](https://learn.chatgpt.com/docs/models): Sol is positioned for complex work at lower cost; more reasoning uses more tokens. Ultra and Ultrafast are different controls.
- [Subscription usage](https://learn.chatgpt.com/docs/pricing): speed, reasoning, context and tools affect allowance. API prices do not predict included subscription tasks. Standard speed is appropriate here.

Work phase by phase; record completed items and exact test results at the end of this document. Read bounded file ranges; retain research below instead of searching again. Run targeted checks during changes, then one complete final validation pass. Repeat only affected checks after fixes. Do not claim that tests passed merely because they started.

## 3. Starting state: preserve existing work

The working tree is extensively dirty, including changes from before this conversation. Do not reset, stash indiscriminately, revert whole files, reseed, or delete demo/test data. Inspect current diff before editing; work from the actual current contents.

Earlier interrupted work added provisional changes:

- `v3-settings.tsx` plus `v3-settings.css`: anchor navigation, full-width section stack, shortcut previews, discard actions and copying hours. This is **not** the final single-section Settings experience.
- `staff-app.tsx`: passes `CenterSettings` as children of `V3Settings` for teachers; assistants still see standalone center settings.
- `calendar-reports.tsx`: section IDs, owner-only backup link, disabled center-edit fieldset for non-owners. Preserve sound permission improvements while reorganizing.
- `v3-center-activity.tsx` plus `v3-center-activity.css`: isolated cards for individual bars. **The user rejected this direction**. Replace that presentation with one contained plot; retain valid data calculations and interactions.
- `kiosk.tsx` plus `kiosk.css`: instructions, manual input focus, scanner cleanup and saving feedback. Audit these partial changes rather than assuming completion.

No completed lint/typecheck/build/browser validation was reported for these provisional changes. `pnpm` was missing from shell PATH, but `corepack pnpm --version` returned 11.25.0. Use `corepack pnpm <script>` if necessary; do not reinstall or upgrade packages merely to fix PATH.

Read `AGENTS.md`, `README.md`, `docs/architecture.md`, and relevant installed `node_modules/next/dist/docs/` guides. Next is 16.4.0. Preserve fictional records, IDs, attribution, timestamps, migration history and existing archived reports. Use unique isolated fictional test paths.

## 4. Source map and findings

| Area               | Start here                                                                                      | Finding / constraint                                                                                                            |
| ------------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Workspace          | `src/components/workspace/staff-app.tsx`                                                        | Existing role gates, dynamic screens, theme and kiosk launch                                                                    |
| Settings           | `v3-settings.tsx`, `calendar-reports.tsx`, `src/lib/activity-settings.ts`, `center-features.ts` | Personal shortcuts, shared display hours, owner feature flags, catalog, center policies and coverage already exist              |
| Settings mutations | `src/lib/v3-domain.ts`, `v2-domain.ts`, `v3-model.ts`, `repository.ts`                          | Reuse durable command IDs; optional config requires validation and stale-write protection                                       |
| Activity           | `v3-center-activity.tsx`, `src/lib/center-arrivals.ts`, `v3-analytics.ts`                       | Arrival bins/history already exist; arrival averages are not occupancy                                                          |
| Schedule           | `src/lib/schedule.ts`                                                                           | Reuse `expectedOn`; V3 currently restricts recurring visits to Mon–Thu, distinct from center operating-day settings             |
| Session detail     | `v3-session-history.tsx`, `v3-profile.tsx`, `v3-analytics.ts`                                   | Reuse session evidence and unique visit matching; ambiguous older records cannot get invented visit links                       |
| Reports            | `src/lib/reports.ts`, `v2-model.ts`, `src/app/api/reports/route.ts`, `calendar-reports.tsx`     | Daily/weekly/monthly snapshots, revisions, scheduled catch-up and CSV already exist                                             |
| Completions        | `src/lib/v2-model.ts` `Completion`, `v2-domain.ts` completion branch                            | Active entries contain exact worksheet identities, physical count, completion date, verifier and optional official count        |
| V3 packets         | `src/lib/v3-model.ts`, `v3-domain.ts`, `v3-planning.ts`                                         | Receipt outcomes and routine assumptions do not establish ledger verification; physical packet identity persists across reissue |
| Kiosk              | `kiosk.tsx`, `src/app/api/kiosk/route.ts`, `src/lib/kiosk-attendance.ts`                        | Restricted session, 4-second confirmation, scanner debounce, manual fallback; GET currently returns readiness/demo only         |
| Styling            | `src/app/globals.css`, `v2.css`, `v3.css`, new component CSS                                    | Broad input rules include 100% width/48px height; inspect computed checkbox styles rather than piling on overrides              |

Current reporting gaps to address explicitly:

1. Totals read the legacy completion ledger; V3 receipt/handoff history must not be converted into completed-sheet counts.
2. The report has no comprehensive frozen visit/session detail for the proposed report drill-down/export.
3. Historical level lookup must be checked against V3 configuration history; never label current configuration as the historical month-end level.
4. Report generation POST currently lacks the durable request-ID pattern required for new commands. Preserve old compatibility while making new creation/revision requests safe to retry.
5. `runDueJobs` already creates month-end reports, but a scheduler is only operational when configured and running. Show actual configuration; do not imply live automation was validated.
6. Older report generation can inspect current mutable state. Separate “generated from records available now” from “known at period end”; frozen versions must remain reproducible.

## 5. Visual contract shared by all four screens

- Retain existing brand, system fonts and theme choice. Use existing color tokens; remove new hard-coded light surfaces that break dark mode.
- Consistent heading hierarchy, restrained borders, generous spacing, and a clear primary action. Advanced explanations belong in details panels.
- Checkbox visual: 18–20px, no inherited text-input padding/100% width. Clickable label row: at least 44px. Switches only for immediate-save behavior; settings committed with Save should use checkboxes/selects.
- Buttons/selects at least 44px; clear focus outline and disabled/saving/saved/error states. No success message before server confirmation.
- One-column phone layout with contained horizontal scrolling only for plots/tables that need it. No document-wide overflow. Reduced-motion support.
- Preserve unsaved edits across section navigation, or provide an explicit discard choice. Do not remount drafts on every background snapshot refresh. Conflicts preserve the draft and offer reload/review.
- Validate using rendered browser screenshots at 390px, 768px, 1024px and 1440px, in light/dark themes. Inspect actual screens, not just source CSS.

## 6. Phase A — Settings organization and controls

Build category navigation with one visible section at a time. Use an accessible navigation pattern and stable section identifiers; desktop side navigation becomes a labeled category selector or wrapped navigation on phones. Preserve role-aware direct navigation and browser history if using URL state. Search is unnecessary for six clear categories.

| Category             | Controls and content                                                                                                    | Scope                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Center               | Center name, operating days, closures, closing time, administrative closure policy; coverage under secondary disclosure | Existing settings, owner edits                      |
| Attendance & kiosk   | Preview, launch, camera test/help, confirmation duration                                                                | Existing launch + narrow new configuration below    |
| Activity & reports   | Per-weekday chart display hours, report time, scheduler status, due-job action                                          | Existing commands/permissions                       |
| Teaching             | Homework workflows, medals, approved curriculum bounds                                                                  | Owner; preserve resume-review requirement           |
| Personal preferences | Theme and instructor observation shortcuts with preview                                                                 | Existing preference semantics                       |
| Access & data        | Current role, storage/worker status, owner backup export                                                                | Status/read-only except existing authorized actions |

Implementation details:

- Extract small settings sections from `calendar-reports.tsx` if needed; leave hidden compatibility workflows intact. Keep Reports and Settings responsibilities separate.
- Label display hours, operating/report days, and recurring student visit days distinctly. V3's Mon–Thu constraint must be clear; do not silently extend schedule business rules while restyling settings.
- Keep feature-off history intact. Curriculum fields require explicit verification reason and existing catalog validation. Avoid adding auto-progression options.
- Save/Discard per section; dirty state and inline errors. Copying one day's hours is an unsaved edit with explicit scope, not an automatic server mutation.
- Show permission-specific explanations; no editable controls with no usable save path. Staff coverage is planning, not account/permission management.
- Keep advanced storage configuration in environment configuration; do not expose secrets or build a live adapter switch.

Acceptance: all categories reachable by keyboard; compact checkboxes; unsaved drafts survive switching sections; success/error/stale-version behavior works; role API restrictions unchanged; homework-off and medals-off workflows retain their regression coverage.

## 7. Phase B — Center Activity

Recommended structure:

```text
Center Activity                         Today / date / period
[Currently here] [Students arrived] [Scheduled, not yet arrived]

+----------------------------------------------------------+
| Arrivals                   Daily | Weekly     date arrows |
| compact gray/blue overlay bars; shared scale, quiet frame |
| time/day labels and actual/average counts UNDER the bars  |
| short legend / selected-period detail / method disclosure |
+----------------------------------------------------------+

Activity log           date range / student search / event filter
Time       Student       Event                 Session / status
```

Definitions:

- Currently here: current-day open physical visits, deduplicated by student. Surface old unresolved visits separately; an old missing departure is not proof of present occupancy.
- Students arrived: distinct students with actual arrivals that center-local day. The chart counts arrival events; disclose repeat visits so its sum need not equal distinct students.
- Scheduled, not yet arrived: distinct active expected students from existing schedule rules minus students already arrived. This is an expectation, not a promise of remaining arrivals.
- Historical arrivals: retain up to eight matching prior weekdays, sample coverage, closures, partial periods and absent future actual values. Use no speculative baseline where evidence is absent.
- If retaining peak occupancy, use measured interval logic with provisional/open-visit disclosure. Never label the busiest arrival hour “peak occupancy.”

Chart requirements: one outer surface; equal blue/gray width, common zero and scale, subdued axes, no card border per bar. Zero bars have zero height; missing values differ from zero. Exact values remain available beneath and by keyboard/tap; gray can be fully hidden when blue exceeds it, so numeric comparison remains available. Keep labels readable without making one card per period. Current periods say “so far.”

Log requirements: default chronological order with explicit sort control; stable ties by timestamp/type/ID. Include arrival, per-subject instructor/session records and confirmed departure. Label administrative closure, correction and reopening separately. Use visit IDs; preserve same-day repeat visits. A session detail action reuses existing history presentation. Notes without an unambiguous visit association stay dated/unlinked. Paginate long histories and keep period/search state when closing detail.

Acceptance: chart matches confirmed layout; counts distinguish students from visits; schedule and historical estimate never merge; corrections do not double-count arrivals/departures; midnight/DST, same-day repeats, missing history and future dates covered.

## 8. Phase C — Verified completion evidence

First audit the existing ledger, command validation and user-accessible verification paths. Write the counting contract and meaningful tests before extending reports. This is a narrow evidence requirement, not a gradebook project.

Counting contract:

- Aggregate active verified paper completion entries by completion date in the center timezone; use existing documented date fallback only for legacy rows without `completedDate`.
- Preserve `physicalSheets` and exact worksheet identities; investigate inconsistent legacy evidence rather than silently rewriting it.
- A separately issued repeat can represent newly completed physical sheets. Re-saving or reissuing the same physical packet must not count again. Deduplication therefore cannot be merely student+level+worksheet number.
- CONNECT activity contributes no physical paper sheets. Unknown format/evidence is disclosed, not guessed. `officialCount` remains a distinct legacy value, not the primary internal metric.
- A report with no verified entries says “No verified completions recorded”; it must not imply no work occurred. A numeric sum of zero is acceptable only with this evidence label.
- Do not derive verified counts from routine receipts, reported-finished packets, cursor advancement, check-ins or issued packet sizes.

If the existing V3 UI cannot explicitly record verified completions, add the smallest action within existing student session/packet detail: **Verify completed sheets**. Show subject, exact physical packet/worksheet identities, completion date, selected sheets/count and logged-in verifier. Require deliberate submission. Do not make verification a compulsory check-in or departure step.

Reuse the ledger where compatible. If provenance needs an optional physical packet ID/version, add validated optional fields with backward compatibility and preservation tests; do not rewrite old entries. A new V3 verification command must have server role checks, durable request ID, expected source version, bounds/date validation, duplicate rejection and append-only correction history. A correction supersedes evidence with attribution/reason instead of deleting it. Homework-disabled mode must not regenerate packets; legacy/activity-only sessions without exact identities cannot be auto-verified. Reuse an existing safe action if it meets all these requirements.

Acceptance: exact paper counts, independent subjects, partial verification, repeat physical packets, reissue, duplicate requests, stale versions, CONNECT, forbidden assistant/kiosk access, missing evidence and correction history are tested. No verification action changes attendance or progression.

## 9. Phase D — Reports and immutable snapshots

Use a dedicated Reports component if it keeps `calendar-reports.tsx` manageable. Default Daily; use date, week and month-appropriate selectors, previous/next controls, and explicit **View report**, **Archive snapshot**, **Export Excel** actions as applicable. Clearly label live period views versus archived versions. Keep revision details secondary but accessible.

Daily summary: distinct students, visits, verified departures, unresolved departures, busiest arrival period, follow-up items and verified completed paper sheets. Add one short deterministic factual paragraph only when it helps (for example, visits/repeats and busiest recorded hour). Avoid invented assessments such as “students performed well.” Summaries must link to supporting filtered rows.

Weekly/monthly: attendance by day, verified sheets by subject/level, student-subject table with recorded level/range and evidence date, visits, verified sheets and missing-data indicators. Completion-by-level totals must not assign all a student's work to their current level. Peak calculations use the selected period's actual records.

Historical rules:

- Identify exact period bounds and timezone. Timestamp ranges should be half-open boundaries; date-only completions follow their documented local date semantics.
- A visit ledger can be grouped by arrival date; event history can include period-contained events from cross-midnight visits. Label the distinction and avoid duplicate rows/counts.
- Current-month preview is provisional. Month-end archival uses existing scheduler semantics and catches up safely after downtime.
- Frozen snapshot includes summaries, visit/session/observation detail and completion evidence required for its UI/export. Never combine an archived headline with current mutable detail.
- Extend report payload additively with a format version or optional detail block. Old reports remain readable/exportable with “detail unavailable in this version” where needed; never backfill them silently from today's state.
- Generating a corrected version preserves the earlier version and records reason, actor, generated time and source revision. Retries must not create duplicate versions. Serialize/fetch external output outside retrying repository callbacks.
- Historical configurations use recorded evidence; unknown month-end level stays unknown. Evidence recorded after period end can be included in a later revision, labeled by its verification/generated time rather than presented as known earlier.

Acceptance: on-screen totals equal detail rows; repeated visits distinguish visit/student totals; selected period never silently opens another period; later edits do not mutate existing snapshots; monthly rollover/leap year/DST and scheduler retries are tested.

## 10. Phase E — Excel export

Create an actual `.xlsx`, retaining CSV compatibility. Evaluate one maintained server-side workbook library using current primary documentation, check license/runtime compatibility, and pin the added dependency. Do not handcraft ZIP/XML or pull in several libraries. Consult the available spreadsheet skill when working on workbook output.

Workbook sheets:

1. **Summary**: center, period bounds/timezone, live/archived state, version/source revision, generated time, attendance and verified-sheet totals, evidence limitations.
2. **Students & subjects**: stable student ID, display name, subject, recorded level/range/evidence date, visits, verified paper sheets, data-status fields.
3. **Completion detail**: completion ID, physical packet/assignment source when recorded, student, subject, level, exact worksheets, physical count, completion date, verifier and verification timestamp. Preserve repeats as distinct evidence.
4. **Attendance**: visit ID, student, actual arrival/departure, verification state, administrative closure separately, verified duration and session references.

Use typed numeric/date cells, useful widths, frozen header rows, filters, readable headings and a deterministic filename. Keep notes out of default workbook unless required by the user; authorized on-screen report detail still supports session review. Totals and source metadata must reconcile with the exact selected snapshot. User text must be string cells, never formulas/hyperlinks; retain CSV injection escaping.

Export endpoint checks authorized instructor/owner access and returns `no-store`; assistants/kiosks/anonymous requests remain denied. Test downloaded bytes by parsing the workbook and checking sheets, types, row counts and totals. Include a visual inspection of a fictional workbook via available tooling. No generated workbooks or private data in Git.

## 11. Phase F — Kiosk configuration and flow

Student states: setup required → ready/scanning or manual code → saving → checked in/checked out/already recorded → next student. Failures state a usable next step. Never show success offline or before confirmed persistence. Preserve debounce behavior and prevent repeated camera frames from reversing attendance.

Settings provides preview and setup help separate from live student mode. Camera permissions are browser/device controlled: offer an explicit local camera test/start/stop and accurate status, not a fake permission switch. Starting kiosk mode retains existing staff-cookie removal. Camera tests stop tracks on exit and do not submit attendance.

One narrow new center setting: confirmation display duration (bounded, default existing 4 seconds; e.g. 2–10 seconds). Preview the duration. Keep manual fallback available. Avoid new sound/language/logo systems in this pass. If supporting a welcome message, use a short plain-text field and existing center identity only; treat it as optional polish after required checks.

Persist any new kiosk setting through validated owner commands with expected version and request ID. Missing setting uses the existing default; malformed saved values fail closed. Kiosk GET returns only an explicit allowlist of public presentation settings plus readiness/demo status—never a staff snapshot. No authenticated records in browser storage/service worker. No audio recording.

Acceptance: camera denied/unavailable, manual invalid code, duplicate scan, in/out confirmation, network failure, expiry/setup-required state, focus recovery, timer configuration and camera cleanup. Demonstrate kiosk cannot fetch staff/roster/notes endpoints.

## 12. Verification and completion criteria

Useful existing coverage: `tests/e2e/center-activity.spec.ts`, `center-features.spec.ts`, `workflows.spec.ts`, `scanner-sync.spec.ts`, `v2-workflows.spec.ts`, `runtime-clock.spec.ts`; unit suites in `tests/` covering arrival bins, activity windows, calendar buckets, domain, persistence and recovery. Locate relevant test names with `rg` instead of guessing filenames.

Update browser tests where the accepted UI intentionally changes (single visible settings category, saved checkbox semantics, one chart surface). Preserve business assertions; never loosen a test simply to hide a regression. Add tests for evidence calculations, snapshot/export consistency, request retries and any new configuration permissions. Avoid brittle tests for each cosmetic CSS declaration.

Final required commands (use `corepack pnpm` if bare pnpm is unavailable):

```powershell
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:e2e tests/e2e/center-activity.spec.ts tests/e2e/center-features.spec.ts tests/e2e/workflows.spec.ts tests/e2e/scanner-sync.spec.ts tests/e2e/workspace.spec.ts tests/e2e/runtime-clock.spec.ts
```

Add new relevant specs to the browser invocation. Build before e2e because its server uses `next start`. Avoid typecheck racing Next-generated type rewrites. Browser script allocates unique fictional run directories; never redirect it to existing local records. If a fresh checkout lacks generated route types, build then rerun typecheck.

Final review checklist:

- [ ] Four screens visually inspected in both themes at specified widths; no giant checkboxes or page overflow.
- [ ] Chart is one compact box, equal-width overlay bars, counts underneath.
- [ ] Activity current state and history are correct and clearly distinguished.
- [ ] Settings edits persist, drafts/conflicts behave correctly, roles enforced server-side.
- [ ] Verified completion totals have explicit traceable evidence and a usable recording path.
- [ ] Daily/weekly/monthly report totals, detail and exports reconcile.
- [ ] Existing archives/history preserved; corrected reports create new versions.
- [ ] Kiosk scanning, fallback, configuration and privacy boundaries pass.
- [ ] Required commands pass; failures and environment limitations explicitly documented.
- [ ] README, architecture and operations explain new behavior; update `.env.example` only if configuration actually changes.
- [ ] No unrelated files reverted, no data resets/reseeds, no secrets/generated data committed.

Deliver a concise description of completed behavior, validation results and any actual remaining limitation. Do not claim a corporate report format, real-device compatibility or live cloud validation. Do not publish, deploy or push as part of this local implementation.

## 13. Research already completed

- [Linear workspace settings](https://linear.app/docs/workspaces): separate personal/team controls from administration. Use category organization, not a visual clone.
- [Harvest time report](https://support.getharvest.com/hc/en-us/articles/360048181692-Time-report): summary, filtered drill-down and export of the selected report.
- [Harvest exports](https://support.getharvest.com/hc/en-us/articles/31625325401229-Exporting-data): distinct summary/detail exports and permission-scoped data.
- [Envoy welcome-screen setup](https://envoy.help/en/articles/3330019-welcome-screen-setup): configure kiosk presentation in staff settings separately from the sign-in flow. Do not import their unrelated identity/face-recognition features.
- [NN/g toggle guidance](https://www.nngroup.com/articles/toggle-switch-guidelines/): switches suggest immediate effects; use appropriate save-based form controls.
- [IBM comparison charts](https://www.ibm.com/design/language/data-visualization/charts/): compact comparison patterns. The user's confirmed bar placement/width requirements take precedence.

No authoritative public corporate instructor monthly report template was established. User explicitly chose internal reporting first, so further corporate-template research is unnecessary.

## 14. Execution log

- Planning: requirements and sources recorded; provisional edits identified. No implementation changes made by this planning handoff. Tests not run for this documentation-only addition.
- Phase A: implemented category navigation, retained drafts, compact controls, independent report settings, role-aware access and explicit conflict recovery. Final browser verification pending.
- Phase B: implemented one boxed overlay chart with equal-width bars/counts underneath, current-day metrics, compact overview log and full filtered chronology with session detail.
- Phase C: implemented explicit packet/sheet verification, stale checks, attributed corrections, physical identity protection and evidence filtering. Seven focused unit tests cover these rules and export/recovery boundaries.
- Phase D: implemented live reports and frozen detail snapshots, period-scoped archive versions, retry-safe new revisions, attention detail and subject/level totals. Old snapshots remain readable.
- Phase E: implemented pinned ExcelJS 4.4.0 server export with four sheets; workbook bytes round-trip correctly and all four sheets were rendered for visual review. Long-ID row sizing and date formatting refined after review.
- Phase F: implemented kiosk preview/camera test/confirmation duration, owner/version checks and a public-settings allowlist. Student scan/fallback behavior retained.
- Interim validation: 210 unit tests passed; earlier lint, typecheck and production build passed. First browser run: 43/46 passed. Three test-harness issues identified (one login-rate-limit collision and two global-empty-ledger assumptions), corrected without changing authentication or weakening learner-specific business assertions.
- Test isolation: another test run owns port 3100. Added optional CENTERFLOW_E2E_PORT and dynamic test origins; this run uses 3110 with a unique fictional data directory. No existing server was stopped.
- Final validation: pending rerun after final refinements.
