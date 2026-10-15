# Centerflow V3.0 changelog

- Replaced the busy V2 Home with three counters and one ordered attendance roster.
- Added explicit instructor handoff attribution, separate from kiosk/staff physical attendance.
- Added lightweight arrival Quick View with exact prepared/outgoing packets, optional observations, secondary overrides/repeats and later note entry.
- Added deterministic paper sequencing for each subject, configurable packet sizes, between-visit homework days, catalog boundary review and reuse of physically held material.
- Added explicit returned-unfinished/missing packet receipt and per-subject corrections-only shifting without increasing routine outgoing quantity.
- Replaced preparation stages with Needs Preparation / Prepared, exact packet chips and student/per-subject readiness.
- Consolidated roster filters, Edit Student, medals, enrollment and goals; simplified profiles to Overview / Progress / Visit History.
- Added simple Away Until and independent arrival/occupancy Center Activity charts.
- Removed active corrections/family/calendar/vacation-planner interfaces while preserving their stored history and V2 compatibility code.
- Added non-destructive schema 3 migration and forward SQL compatibility; retained authentication, role separation, reporting archives and original IDs.
- Retained V1/V2 domain tests; adapted intentionally replaced browser contracts and archived their original source.
- Added a compiler-based command-line runner to avoid a Windows OS-account lookup failure without adding dependencies or changing production compilation.
