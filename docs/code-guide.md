# Code guide

Start with one feature, then follow its request into the domain and repository. Interface names describe the current workspace; persistence versions remain explicit in the domain layer.

## Feature entry points

| Feature                   | Entry point under `src/components/`                      |
| ------------------------- | -------------------------------------------------------- |
| Home and navigation       | `workspace/staff-app.tsx`                                |
| Student roster            | `students/roster.tsx`                                    |
| Profile and visit history | `students/profile.tsx`, `students/session-history.tsx`   |
| Subject/profile editors   | `students/profile-overview.tsx`                          |
| Progress charts           | `progress/progress.tsx` and individual chart modules     |
| Quick View                | `preparation/quick-view.tsx`                             |
| Homework preparation      | `preparation/preparation.tsx`                            |
| Reception/kiosk           | `attendance/kiosk.tsx`                                   |
| Traffic                   | `attendance/center-activity.tsx`                         |
| Reports                   | `reports/reports.tsx`                                    |
| Center/account settings   | `settings/settings.tsx`, `settings/account-settings.tsx` |
| Sign-in                   | `auth/login.tsx`                                         |
| Pouch printing            | `pouch/`                                                 |
| Shared controls and theme | `ui/`                                                    |

## Follow a request

1. `src/app/page.tsx` checks the session and renders `workspace/staff-app.tsx`.
2. A feature such as `preparation/quick-view.tsx` presents instructor actions.
3. `src/lib/client.ts` sends a JSON command with its original request ID.
4. `src/app/api/commands/route.ts` verifies the request and dispatches its command version.
5. `src/lib/v3-domain.ts` checks permissions, versions, packet identity, and business rules.
6. `src/lib/repository.ts` commits through the configured local or cloud adapter.

## Domain map

| Responsibility                | Modules under `src/lib/`                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Stored models and commands    | `model.ts`, `domain.ts`, `v2-model.ts`, `v2-domain.ts`, `v3-model.ts`, `v3-domain.ts`                             |
| Additive upgrades             | `migrate.ts`, `v3-migrate.ts`; SQL in `supabase/migrations/`                                                      |
| Shared preparation sequencing | `v3-planning.ts`, `worksheet-allocation.ts`, `home-preparation.ts`, `preparation-queue.ts`                        |
| Attendance and calendars      | `kiosk-attendance.ts`, `punch-history.ts`, `center-attendance.ts`, `schedule.ts`, `calendar-buckets.ts`           |
| Progress projections          | `academic-progress.ts`, `homework-consistency.ts`, `center-duration.ts`, `skill-progress.ts`, `progress-chart.ts` |
| Verification and reports      | `completion-evidence.ts`, `reports.ts`, `report-detail.ts`, `report-view.ts`, `report-workbook.ts`                |
| Storage and access            | `repository.ts`, `auth.ts`, `cloud-auth.ts`, `http.ts`, `privacy.ts`                                              |
| Intake and setup              | `roster-intake.ts`, `roster/import.ts`, `student-setup.ts`, `center-initialization.ts`                            |
| Account metadata              | `staff-profile.ts`                                                                                                |
| Jobs and recovery             | `jobs.ts`, `backup-archive.ts`; maintenance commands in `scripts/`                                                |
| Fictional starter data        | `seed.ts`; synthetic fixtures in `tests/fixtures/`                                                                |
| Brand constants               | `brand.ts`; icons and manifest in `public/`                                                                       |

## Styles and runtime adapters

`src/app/layout.tsx` imports global CSS in a deliberate order. Earlier `v2.css` and `v3.css` layers retain selectors used by preserved and current screens. Feature styles sit beside their components. Preserve the cascade when editing them.

The Node and static browser builds share components. Update `scripts/static-build.mjs` when an entry component moves. Edge handlers reuse domain modules; business logic belongs outside runtime adapters.

## Preserved code

`legacy/` retains earlier profile, calendar, report, and operations interfaces. Some controls remain referenced by current screens. These modules do not activate hidden workflows.

Unit tests preserve V1/V2/V3 contracts. Current browser workflows live in `tests/e2e/`, including `workspace.spec.ts`. Original V2 browser contracts remain as non-executing text in `tests/history/v2-browser/`. See [compatibility](compatibility.md) and the [documentation index](README.md).
