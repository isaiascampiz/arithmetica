# Roster intake review — October 28, 2026

**October 29 completion:** the authorized initial batch is now saved in production: 71 profiles and 102 Math/Reading enrollments. A read-only reconciliation verified every imported field, original stable ID, source fingerprint and pending setup value. Production contains no fictional students, visits, observations, assignments or completions. An encrypted post-import OneDrive backup passed decryption/read-back verification. Three profiles still require a subject choice, and five common profile dates remain unset while their original per-subject dates are retained. The historical inspection report below describes the earlier pending stage; its implementation/import gates are now superseded by the [current runbook](deployment-and-import-plan.md).

The owner supplied a private Excel workbook, authorized inspection, and then requested combined profiles using known information, with missing setup completed by the teacher later. The original was opened read-only locally and its SHA-256 remained unchanged. No active records were imported, no workbook was edited, no demo data was deleted, and no workbook contents were uploaded. A separate private pending-intake artifact was created under ignored `data/private-intake/`. This report contains counts and cell references, without student names or birth dates.

## Findings

| Check                 | Result                                                                                                                                                                                                                           |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workbook structure    | One worksheet, `Sheet1`, used range `A1:K109`; one heading row and 108 subject rows.                                                                                                                                             |
| Candidate identities  | 71 groups using normalized first/last names together with birth date. These are review candidates, not verified identities or newly created app IDs.                                                                             |
| Subjects              | 61 Math, 41 Reading, 6 EFL rows. The app currently models only Math and Reading.                                                                                                                                                 |
| Required source cells | Names, DOB, grade, level and enrollment date are populated on every subject row.                                                                                                                                                 |
| Dates                 | No invalid, future or enrollment-before-birth dates were flagged relative to the explicit review date, 2026-10-28.                                                                                                               |
| Repeated identities   | No duplicate subject within one candidate identity, same-name/different-DOB collision, or conflicting grade was flagged. Different subject rows must not be imported as separate children. Grouping still requires human review. |
| Worksheets            | `K2:K109` is entirely blank. No starting position, completed worksheet count or packet quantity can be inferred.                                                                                                                 |
| Formats and schedules | No explicit PAPER/CONNECT field or visit weekdays. Status letters must not be interpreted as format choices.                                                                                                                     |
| Enrollment dates      | Five candidate students have different dates across their subjects, affecting 11 rows. Current profiles have one enrollment date field. Preserve the source dates and agree the intended semantics before commit.                |
| Status codes          | ST1 contains C (103), N (3), EO (2); ST2 contains H (1), F (4), otherwise blank. Meanings and active/inactive mapping are unconfirmed.                                                                                           |
| ASHR                  | 13 populated rows use stars. Do not turn these into worksheet verification, medals or historical achievements without an explicit mapping.                                                                                       |
| Formulas              | No formulas found within the used range.                                                                                                                                                                                         |

EFL rows: 30, 45, 58, 76, 83, 87. Differing enrollment-date groups: rows 28–30, 75–76, 79–80, 81–82 and 88–89. Row references are for the unchanged supplied workbook only.

## Proposed mapping for review

| Source column              | Intended treatment                                                                                                                                                                                   |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B Last Name + C First Name | Preserve spelling; compose the display name only after identity review. Assign stable app IDs at a future authorized commit.                                                                         |
| D DOB                      | Comparison aid for this inspection. There is no dedicated DOB field in the current student model; do not silently insert it into notes or add it to production. Confirm whether production needs it. |
| E Grade                    | School grade, separate from academic level. Preserve K/PK1/PK2 and numeric grades as source values; confirm preschool labels before import.                                                          |
| A Subject + F Level        | Subject-specific level after instructor/catalog confirmation. Preserve Roman I/II suffixes. EFL has no automatic Reading mapping.                                                                    |
| J Enroll                   | Preserve each original subject date in the private intake source; resolve the single profile date semantics. Do not silently choose the earliest or latest.                                          |
| G ASHR, H ST1, I ST2       | Unmapped review fields. They are not completion evidence, scheduling, format or authorization.                                                                                                       |
| K Worksheet/#of Worksheets | Blank. Instructor-confirmed starting position and daily quantity remain separate missing facts.                                                                                                      |

The owner chose all capabilities at launch, with teachers completing individual students' setup gradually. The owner confirmed combining subject rows when first name, last name and DOB match, and requested omission of status codes. EFL is excluded from subject enrollment in the staged artifact. All 71 identities are retained as pending profiles; the three EFL-only profiles await subject selection. No automatic EFL-to-Reading conversion occurs. ASHR/ST1/ST2 are omitted from profiles; DOB is used only in memory for matching and is not exported to profiles.

The staging artifact has 102 Math/Reading entries retaining their source level and enrollment date. Modality, worksheet position, daily quantity and visit days are explicitly null. Five profiles have a null profile-level enrollment date because their source subject dates differ; all subject dates, including excluded EFL row dates in the audit manifest, remain available without choosing an invented common date. Existing app profile commands are not a pending-intake path: they currently require fields that are absent. Loading drafts into the active roster still requires that workflow, the authorized commit importer and validated production storage. The center-wide Homework toggle alone does not provide per-student pending setup.

## Repeatable preview

```powershell
pnpm roster:preview "C:\private\roster.xlsx" 2026-10-28
```

Use `corepack pnpm` if pnpm is not on PATH. Supply the date explicitly; add the exact sheet name as a final argument for a multi-sheet workbook. The command accepts the reviewed eleven-column template, reads locally, computes a source fingerprint, and prints counts plus issue row numbers. It returns no names, DOBs, source values or candidate profiles. It imports no application repository or environment configuration, performs no database writes and has no commit mode. Instructions inside workbook cells are data, never commands.

The preview always reports `productionImportReady: false`. A successful exit means inspection completed, not that the data is importable. Required reviews appear in `issues` and `missingLaunchFields`. File size is bounded at 5 MiB; data at 10,000 rows. Excel 1900/1904 date handling is covered with fictional fixtures; formulas, cached formula objects, hyperlinks and other object-valued source cells are rejected for mapping review rather than evaluated or fetched.

Eleven new fictional-fixture tests cover identity conflicts, subject/date uncertainty, malformed files, formula/link rejection, date systems, bounds, source-byte preservation, report redaction, pending-profile consolidation and a CLI retry that preserves existing record bytes and saved draft IDs. This pass: lint, typecheck, build, all 251 unit tests and eight focused Chromium workflows passed (Quick View, kiosk isolation, responsive profile layout, independent profile saves, stale update rejection and saved subject medals). The prior full 120-workflow run remains documented in the release review; it was not repeated for the intake tooling addition. No automated test used the real workbook or its students; that file was used only for the authorized local inspection/staging operation.

## Private pending profiles

```powershell
pnpm roster:stage "C:\private\roster.xlsx" 2026-10-28
```

This writes `data/private-intake/<source SHA-256>.pending.json` exclusively; an existing file is never overwritten. It is sensitive student data, excluded from Git, and must stay in approved private storage. The persisted artifact retains its batch request ID and per-profile intake IDs across command retries. It has its own `centerflow-pending-roster` format, not a Database/backup format, and has no active enrollment, attendance, packet, observation or completed-sheet records. It cannot be used with cloud provisioning or an existing student-save command. Do not upload it as an application backup. Future commit tooling must validate its version, fingerprint and IDs, implement the pending-profile workflow, and reconcile it against the source before making authorized production changes.

The supplied workbook was staged once successfully: 71 pending profiles, 102 supported subject entries, six excluded EFL rows, three profiles awaiting subject selection and five awaiting a common enrollment-date decision. The original file is unchanged. Neither this artifact nor its real contents are test fixtures.

## Remaining gates

Implement pending profiles and per-subject setup so that teachers can complete fields gradually while incomplete subjects cannot generate paper plans. Resolve the five profile-date decisions and three subject selections. Then implement the authorized, atomic, version-checked commit importer and clean production initializer. Use fictional staging data to validate the chosen runtime, live Supabase permissions, concurrent saves, independent backup/restore and app updates. Test the physical iPads before real operation. See the [deployment and import plan](deployment-and-import-plan.md).
