# Ten incremental versions, provisional

The original roadmap could not be retrieved. These priorities follow the recovered discovery and the current release brief. Each subsequent version requires owner validation and explicit additive migrations, backups and restore testing. No version resets existing IDs, visits, notes, handoffs or review history.

| Version | Outcome | Reason and gate |
|---|---|---|
| 1.0 · delivered demo | Kiosk attendance, staff roles, roster, metrics/history, quick observations, persistent review/follow-up, early learners and homework statuses | Capture reliable events and reduce forgotten details; fictional data only |
| 1.1 | Validated Supabase adapter/auth, private code lifecycle, backups, device validation, idempotent note writes | Required foundation for approved real operations; corporate/privacy authorization first |
| 1.2 | Early-learner support queue and staff handoff, acknowledgement and timestamps | Owner's top priority; validate useful support signals and supervision responsibility |
| 1.3 | Corrections queue and record-book reconciliation | Largest repetitive workload; do not assume grading API access |
| 1.4 | Homework preparation batching, pouch labels and worksheet ranges | Reduce class-time interruption; verify actual physical flow |
| 1.5 | Consistent worksheet completion ledger and exceptions | Accurate completed-sheet counting; validate paper/CONNECT source-of-truth |
| 1.6 | Corporate report preparation with reviewed fields and reconciliation | Reduce 3–5 hour reporting burden; obtain official required format first |
| 1.7 | Parent-facing progress drafts and communication log | Support concise anecdotal updates; instructor review and privacy rules before sharing |
| 1.8 | Arrival-load analysis and optional preferred windows | Spread demand without mandatory reservations; collect enough real authorized events |
| 1.9 | Reviewed integrations, multi-center hardening and operational analytics | Only after permissions/API support are verified; no speculative integration promises |

Upgrade sequence: add schema objects/nullable columns, deploy compatible reads/writes, backfill approved data with resumable scripts, verify counts and references, enable new behavior, retire old fields only in a separately reviewed migration. Keep immutable migration files and migration history. Test upgrades from a populated prior snapshot; compare row counts and identifiers and practice restoration in a disposable project.
