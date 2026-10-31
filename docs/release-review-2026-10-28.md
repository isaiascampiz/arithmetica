# First-shipment review — October 28, 2026

This pass preserves the approved Arithmetica layout, V1/V2 compatibility modules and V3 data model. The internal application/package version remains `3.0.0` and the schema remains version 3. Calling the first shipment v1 does not require rewriting migration history.

## Findings and fixes

| Severity      | Location                                                                                                           | Before                                                                                                                      | After                                                                                                                                | Why                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| High, fixed   | `src/components/preparation/quick-view.tsx:55`                                                                     | No enrolled subjects could cause an absent-subject dereference.                                                             | A usable empty state links to the profile.                                                                                           | Preserve access to historical visits without a runtime crash.                       |
| High, fixed   | `src/components/ui/shared.tsx:156`                                                                                 | Dictation could discard typing made after recognition started.                                                              | Append to the latest draft; detach callbacks and stop on unmount.                                                                    | Preserve unsaved instructor text. Tests use a fake provider and no audio.           |
| High, fixed   | `src/components/workspace/staff-app.tsx:81`                                                                        | Delayed reads could overwrite a newer visible snapshot.                                                                     | Request sequencing and revision guards reject stale responses.                                                                       | Keep displayed records current after concurrent reads/saves.                        |
| High, fixed   | `src/app/globals.css:169`, `src/app/v2.css:203`, `src/app/v3.css:5648`, `src/components/settings/settings.css:101` | Unguarded hover rules could latch after touch input and override theme colors.                                              | Hover-only feedback requires a hover-capable pointer; selected states remain independent.                                            | Keep touch controls in the correct visual state.                                    |
| Medium, fixed | `src/components/ui/ui-primitives.tsx:22`                                                                           | Menus positioned only on opening could leave the viewport after resizing or scrolling.                                      | Flip above when needed, clamp to viewport bounds and reposition on scroll/resize/content changes.                                    | Keep menus reachable and keyboard-operable. Initial focus excludes disabled items.  |
| Medium, fixed | `src/app/refinement.css:440`, `src/app/workspace-refinement.css:36`                                                | Theme and accent controls had different sizes, fonts and surfaces.                                                          | Shared dimensions, typography, padding and surfaces, including narrow screens.                                                       | Consistent settings controls without a layout redesign.                             |
| Medium, fixed | `src/app/v3.css:5648`                                                                                              | History buttons differed in height; wrapped headings/footnotes shifted chart geometry; 320px panels scrolled unnecessarily. | Shared 44px history actions, narrow heading/footnote space and responsive chart-height budget.                                       | Align progress panels and retain access on short screens.                           |
| Medium, fixed | `src/components/workspace/staff-app.tsx:81`, `src/components/settings/account-settings.tsx:195`                    | Failed sign-out produced an unhandled rejection.                                                                            | Visible errors restore the enabled state and retain the session.                                                                     | Let staff retry failed actions.                                                     |
| Medium, fixed | `src/components/workspace/staff-app.tsx:81`                                                                        | Back to `/` could retain another screen; Quick View survived history navigation.                                            | Missing/invalid view parameters resolve to Home; history clears transient panels.                                                    | Keep URL and displayed workspace connected.                                         |
| Medium, fixed | `src/lib/device-preferences.ts:4`, `src/components/ui/theme.tsx:20`                                                | Denied storage could interrupt setup or appearance changes.                                                                 | Guard only the theme, accent and sidebar keys; changes still work for the session.                                                   | Keep restricted browsers usable without storing authenticated records.              |
| Medium, fixed | `src/lib/client.ts:11`                                                                                             | Simultaneous expired requests could rotate the session repeatedly; gateway HTML exposed parser errors.                      | One concurrent refresh, original request replay, useful response errors and no staff refresh for public kiosk endpoints.             | Preserve durable IDs and explain connection failures.                               |
| Medium, fixed | `scripts/e2e.mjs:13`, `scripts/e2e-settings.mjs:1`, `playwright.config.ts:1`                                       | Windows shell-based teardown could hang, and concurrent runs shared a destructive artifact-cleanup directory.               | Directly own and close the isolated Next process; reject occupied ports; use unique artifact directories and shared launch settings. | Repeatable checks without stopping another server or removing another run's traces. |

Picture uploads now merge with the latest account draft, retaining name edits made during image decoding. Tooltip timers, animation frames and theme-switch frames clean up on unmount.

Locking reception disables controls while the device moves to the public kiosk, preventing overlapping submissions. Its browser test waits for that navigation before entering a pouch code.

## Refactoring and optimization

Unchanged authorized snapshots retain their React identity instead of rerendering the workspace every poll. Staff display metadata, runtime settings and timezone changes remain visible even at the same revision. Home roster derivation is memoized. Quick View's live minute counter is a separate component, so its clock no longer reruns packet planning and editor derivations every second.

HTTP request options are built once and reused after refresh, preserving the original payload and request ID. Appearance selectors, chart sizing and test-server configuration share rules. No dependencies were upgraded. No reset, destructive migration, reseed, records-file deletion, real-data import or deployment was performed.

## Validation

Commands used the pinned package manager through `corepack pnpm`: pnpm 11.25.0 and Node 24.20.0. Production browser checks use installed Chrome and newly created fictional files under ignored `data/e2e-runs/`. Ordinary development records are not a test target.

| Check            | Result                                             |
| ---------------- | -------------------------------------------------- |
| `pnpm lint`      | Passed, no warnings                                |
| `pnpm typecheck` | Passed                                             |
| `pnpm test`      | 240 passed                                         |
| `pnpm build`     | Passed                                             |
| `pnpm test:e2e`  | 120 passed in one clean run (12.5 minutes)         |
| `pnpm benchmark` | Completed: 2,110 fictional visits, 216 assignments |

The added in-memory simulation completes 96 visits across 24 fictional students on four dates, covering paper/CONNECT, preparation, handoff, 45-minute departures, unique visit identities, repeatable synchronization, read-only reports and zero invented verified worksheets. Request regressions cover concurrent session expiry, failed refreshes, exact retry IDs, public kiosk isolation and malformed gateway responses. A runner regression confirms occupied ports are refused without stopping their listener.

Benchmark medians on this machine were 10.010 ms for Home roster derivation, 28.153 ms for monthly center activity, 0.144 ms for preparation synchronization and 0.682 ms for repeat planning. These are synthetic local samples, not production load results or a measured before/after speedup. Component optimizations reduce repeated work rather than changing these domain calculations.

One repeated concurrency run encountered a Windows `EPERM` during atomic rename of isolated test data. The operation surfaced an error; the adapter did not delete the destination or fall back to a new database. The isolated persistence rerun and subsequent full 240-test run passed. The OS cause was not established, and persistence behavior was not rewritten to conceal it.

Mocked saved snapshots now advance revisions just as the repository does. Test sign-ins are paced to honor the existing 20-attempt/minute protection; production authentication limits remain unchanged.

Browser coverage includes Home, roster, preparation, profiles, all progress panels, Traffic, Reports, settings, account actions, reception, public kiosk, Excel exports, stale versions, multi-client updates, retained drafts and synthetic QR decoding. Layout checks cover widths from 320px to 1440px, light/dark themes, reduced motion, keyboard menus and focus restoration. Geometry tests wait for dialog entry to finish; alignment tolerances remain strict. Offline verification checks both the generic page and the installation-asset cache allowlist.

## Verification limits

Not verified: live Supabase Auth/RLS/tenant isolation/recovery, deployed hosting/scheduler behavior, production load, physical iPad/Safari or scanner hardware, physical printing, or an approved real dictation provider. Existing corporate/privacy authorization and production-configuration requirements still apply to real student data. This review does not certify those external connections or devices.

UI-polish approval covers only the inspected local Chromium surfaces and tested states. External verification limits remain as listed above.

Approve
