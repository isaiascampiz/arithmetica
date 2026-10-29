# Arithmetica edit surfaces

28 October 2026. Refines existing editors without changing stored records or command semantics.

The installed Wispr Flow 1.6.1297 Add snippet form and General settings were inspected again. Their consistent content inset, compact labels, paired controls and quiet action hierarchy inform this pass. Reference forms were cancelled without submitting changes. These are adaptations to the existing center workflows; controls retain the project's 44px minimum targets.

## Shared form treatment

`Modal` exposes `variant="form"`. Record editors, settings subdialogs, custom skill entry, account removal and directory filters use that shared treatment. Form dialogs cap at 520px; filters cap at 460px. Content insets are 24px, 20px on phones and 16px on the narrowest screens. Labels use 14px/500, fields 14px/400, and titles 18px/600. Touch inputs retain 16px text. Label-to-field gaps are 8px, related columns 16px, and field groups 20px. Header, body and action edges align. Existing scrolling, focus restoration, Escape, reduced motion and server authorization remain intact.

Student Details and Enrollment retain their field order. Subject editors group Learning mode / Current level, then Current worksheet / Worksheets per day; narrow phones stack the pairs. Curriculum groups Subject, Level / Sequence order, First / Last worksheet, then a full-width Verification source. Regular visit days keep four aligned touch targets.

Unenrolled Math or Reading uses one **Add** action in the same header position and dimensions as **Edit**. The redundant lower Add button is removed. Opening Add checks Enrolled in the draft; cancelling writes nothing. Existing subject values remain hidden until enrollment, and previously saved configuration is restored by the existing enrollment flow.

## Editing inventory

| Surface         | States inspected                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| Student profile | Details, Enrollment, Paper, CONNECT, Add subject, retained medal entry                                              |
| Directory       | Add student, Roster filters, Preparation filters                                                                    |
| Settings        | Observation shortcuts, Center details / operating days, curriculum boundaries, Homework confirmation                |
| Account         | Editable names, profile-picture control, removal explanation and credential-confirmation form; no removal submitted |
| Quick View      | Adjust, Repeat, nested custom skill entry                                                                           |
| Past visits     | Observation ratings/note, explicit sheet verification, date/sort popover, historical reconciliation                 |

Historical V1/V2 workflow modules stay outside active navigation. Legacy packet transitions remain covered through their existing commands and retained records. Earlier browser assertions that expected the removed legacy panel, inline date filters or a top-level Sign out button were updated to the current authorized interface.

## UI polish audit

| Severity         | Location                                                              | Before                                                                       | After                                                                                 | Why                                                        |
| ---------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Medium, resolved | src/components/v3-shared.tsx:18; src/app/workspace-refinement.css:688 | Form spacing combined unrelated modal, label and field margins               | Explicit form variant with aligned edges and one spacing rhythm                       | Consistent grouping and readable action hierarchy          |
| High, resolved   | src/app/workspace-refinement.css:987                                  | Legacy directory grid positions overlapped filter controls at desktop widths | Single-column filter flow with a paired Subject/Format row and no inherited positions | Controls remain readable and operable                      |
| Medium, resolved | src/components/profile-overview.tsx:17                                | Unenrolled subject offered Edit above a separate Add button                  | One Add action occupies the existing Edit position                                    | A clear action with stable alignment                       |
| Medium, resolved | src/components/v3-session-history.tsx:337                             | Observation reset label and action order differed from other editors         | Cancel before the primary Update action, with shared inline spacing                   | Predictable cancellation without discarding saved evidence |
| Low, resolved    | src/app/workspace-refinement.css                                      | Visit-day controls wrapped unevenly on narrow phones                         | Four equal controls within the form width                                             | Consistent alignment and touch targets                     |

## Verification

Lint, typecheck, production build and all **232 unit tests** pass. **41 distinct Chromium checks** pass across focused runs: editor surfaces (4), profile Overview (6), enrollment/reception (3), Quick View (1), workflows (8), center features (3), refinement/account (6), and report/verification UI (10). The final five-check editor/Quick View run includes non-overlapping controls, equal medal-field heights, date/sort alignment, all lower form sections, cancellation without writes and focus restoration. Geometry measurements wait for the existing overlay entrance to settle.

Screenshots were inspected in light/dark at 320, 390, 768 and 1024px, with existing profile checks through 1440px. The original preview and showcase file hashes are unchanged after restart. Both localhost and the current Wi-Fi preview return 200, and anonymous staff-state access returns 401. All browser runs use separate fictional data. Physical iPad/Safari and 10% DevTools motion replay remain unverified; existing modal motion is unchanged.

Approve for the inspected Chromium states.
