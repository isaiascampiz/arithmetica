# Roadmap after V3

V3 is implemented and locally validated in the original V1/V2 project. It delivers the simplified daily roster, explicit instructor handoff, exact per-subject paper preparation/issuance, configurable curriculum review, consolidated student profiles/history, away status and separate arrival/occupancy analytics. Existing reporting and historical data remain. See `v3-acceptance.md` for the 60-item requirement mapping and `validation.md` for actual results.

The original ten-version plan is retained in `history/v1-provisional-roadmap.md`. It is historical context, not authorization to expand this release.

| Deployment gate             | Required result                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Approved private staging    | Live Auth/RLS/tenant, concurrent updates and recovery validation in a disposable Supabase project                      |
| Fictional-data device pilot | Two staff iPads/MacBooks on approved HTTPS; printed QR, camera, installation, supervision and dictation privacy checks |
| Owner workflow validation   | Approve actual curriculum bounds, subject settings, physical pouch flow and closing settings                           |
| Corporate/privacy approval  | Required attendance fields, official report format, retention/access rules and authorization before real minors' data  |
| Operational readiness       | Managed backups, disaster recovery, hosting/scheduler and infrastructure validation                                    |

Future work requires explicit scope. Every release must preserve identities, attendance, notes, attribution and audit history using additive migrations, populated-upgrade tests and isolated restoration. No milestone authorizes deleting or resetting records.
