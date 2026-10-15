# V3 acceptance coverage

The complete original V3 work order drove this upgrade. Numbers below refer to its 60 explicit acceptance examples.

| Acceptance items                          | Executed coverage                                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–14 attendance/Home/handoff              | V3 unit attendance, ordering, physical presence, double scan, unverified closure and multi-session cases; browser direct Quick View, handoff, notes, kiosk and busy-day tests                  |
| 15–25 paper schedule/ranges/modes         | Table-driven Monday/Wednesday and Thursday/Monday unit examples; packet sizes 3/5/10, independent formats, confirmed V2/V3 sequencing; browser physical preparation versus issue               |
| 26–28 weekday/Away Until                  | Validated Monday–Thursday writes, return date and pause/resume unit cases; consolidated Edit Student/browser absence scenario                                                                  |
| 29–37 physical exceptions                 | Per-subject Worksheets/Both/corrections-only unit and browser checks; held packet identities, no extra pull, explicit zero-slot review, returned unfinished versus unavailable missing packets |
| 38–44 repeat/override/catalog/idempotency | One-time versus permanent restart, actual manual ranges, physical adjustment/stale versions, unknown boundaries and explicit catalog approval; browser overrides and competing clients         |
| 45–48 mode/medal/early learner            | Preserved history on mode switch, temporary CONNECT fallback, same-subject medals and profile configuration tests                                                                              |
| 49–56 history/charts/reporting truth      | Unique and ambiguous visit association, sessions without notes, repeat decisions, paper-only chart omissions, verified duration/empty states and zero assumed verified counts                  |
| 57–60 filters/activity/preservation       | Same-subject format/medal combination, weekday/status filters, separate time-weighted occupancy including DST/midnight, populated migration/restore identity tests                             |

Browser viewports: 1024×768, 1194×834, 768×1024, 1440×1000 and narrow-phone coverage. This is Chromium viewport testing, not real iPad/Safari hardware.

The fictional busy-day browser scenario sets 50 expected original demo students, six early learners present, PAPER/CONNECT/mixed subjects, two independent staff sessions, returned unfinished and missing homework, corrections-only work, repeat and manual override, absence, departure without handoff, an unverified closure and varied upcoming visit days. A test-only repository fixture uses the real closing function to simulate the unverified visit; no testing API or clock override was added to the product. Prior synthetic packet cycles are explicitly reconciled as reported receipts, preserving history and keeping verified counts at zero.

Technical adaptations: V3 packet records extend the existing Assignment entity rather than adding a parallel store; historical gradebook-like data is hidden from active workflows but remains readable. The local curriculum is a clearly labeled fictional configured catalog. Unknown bounds require owner review instead of invented material.
