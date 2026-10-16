# Explore Centerflow one step at a time

Begin with a visible screen and follow one interaction. You do not need to read the application in order.

1. Open `src/app/page.tsx`: it checks the staff session, redirects unsigned visitors and renders `StaffApp`.
2. Open `src/components/staff-app.tsx`: find `nav`, then `view === 'home'`. This component holds shared state, Home and navigation. Use VS Code Find, or Ctrl+click an import to follow it.
3. Follow `QuickView` to `v3-quick-view.tsx`. It draws incoming/activity/outgoing work and optional observations. `v3-shared.tsx` supplies its dialog, packet chips and text/dictation controls.
4. Follow `mutate` back to `staff-app.tsx`, then `request` in `src/lib/client.ts`. The browser sends JSON: a plain-text representation of structured data.
5. Read `src/app/api/commands/route.ts`. It verifies the request and dispatches to `applyV3`, `applyV2` or the original handler. These versions remain deliberately compatible.
6. Read one action in `src/lib/v3-domain.ts`, then its test in `tests/v3.test.ts`. These rules must remain correct when a screen changes.

## Source map

| Area               | Files and purpose                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pages and APIs     | `src/app/page.tsx`, `login/page.tsx`, `kiosk/page.tsx`; each `api/*/route.ts` handles HTTP requests                                               |
| Active screens     | `staff-app.tsx`, `v3-roster.tsx`, `v3-quick-view.tsx`, `v3-preparation.tsx`, `v3-profile.tsx`, `v3-charts.tsx`, `v3-settings.tsx`                 |
| Shared interface   | `v3-shared.tsx`, `shared-ui.tsx`, `pwa.tsx`; reusable controls and installation behavior                                                          |
| Reporting/settings | `calendar-reports.tsx` supplies `ReportsWorkspace` and `CenterSettings`; Calendar is not an active V3 destination despite the historical filename |
| Data shape         | `model.ts`, `v2-model.ts`, `v3-model.ts` describe fields; they do not store actual records                                                        |
| Rules              | `domain.ts`, `v2-domain.ts`, `v3-domain.ts`; validation and mutations for preserved command versions                                              |
| Homework           | `v3-planning.ts` is the shared V3 packet planner; `homework.ts` retains older compatibility                                                       |
| Dates/analytics    | `schedule.ts`, `v3-analytics.ts`; timezone/away/scheduling, history matching and occupancy                                                        |
| Persistence        | `repository.ts`; locked atomic local writes or revision-checked Supabase operations                                                               |
| Access             | `auth.ts`, `cloud-auth.ts`, `http.ts`; sessions, active membership, permissions and responses                                                     |
| Upgrades           | `migrate.ts`, `v3-migrate.ts`, immutable SQL under `supabase/migrations/`                                                                         |
| Jobs               | `reports.ts`, `jobs.ts`, root `instrumentation.ts`, `api/jobs/route.ts`                                                                           |
| Fictional fixtures | `seed.ts`; separate from evolving ignored `data/` files                                                                                           |
| Verification       | `tests/*.test.ts`, `tests/e2e/`, `supabase/tests/access-control.sql`                                                                              |

The table's component names are under `src/components/`; business/storage modules are under `src/lib/`.

## Why older files remain

`student-profile.tsx`, `student-drawer.tsx`, `operations-ui.tsx`, `profile-charts.tsx` and `classwork-records.tsx` retain earlier interface/compatibility code. Current navigation uses the V3 screens above. This is preservation, not a second application. Older commands remain tested and support historical data. Do not delete modules merely because a current screen does not import them.

`tests/e2e/v2-workflows.spec.ts` is a historical filename with **active V3 tests**. Original V2 browser contracts remain as non-executing `.txt` files under `tests/history/v2-browser/`. `docs/history/` records previous releases; README describes the current workspace.

## Concepts worth learning

A **type** describes data; a **component** draws an interface; an **endpoint** handles a browser request; a **domain command** applies rules; a **migration** upgrades existing records. A **unit test** checks a rule directly; an **end-to-end test** uses the app like a person.

Prepared homework is distinct from issued homework. A reported return is distinct from verified worksheet completion. Stable student/visit/packet IDs connect history even when names or settings change. Existing comments around transactions, version checks and sequencing explain the less obvious constraints; routine markup does not need extra narration.
