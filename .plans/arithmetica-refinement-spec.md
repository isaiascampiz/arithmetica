# Arithmetica refinement — 28 October 2026

The approved name is **Arithmetica**. An original folded A replaces the prior aperture mark in the sidebar, sign-in, reception, manifest and installed-app icons. The two ascending planes and open counter use the interface's neutral colors. The center label remains **Kumon Learning Center · Yuba City**. The sidebar wordmark is passive; reception's wordmark returns authenticated staff Home.

## Layout and interaction brief

- Home retains its four attendance tiles and student list. A centered 44px Sync icon replaces the explanatory filter text opposite Today's students. Expected students still check in directly.
- Quick View retains all paper and observation commands. Math/Reading use a transparent full-width tab rail. Packet, Corrections and Both have readable selected states in either appearance. In-center, outgoing and held tiles share a 128 × 76px footprint; held ranges retain their strike-through. Skill ratings remain the same direct five-point scale.
- Overview keeps two information cards. Student information has Details/Enrollment at the same hierarchy as Math/Reading. Both subjects remain available even when one is not enrolled; the empty subject offers its enrollment dialog. Edit actions share one component and open the existing native settings-style modal, with a fixed Cancel/Save footer. Portrait widths stack cards instead of squeezing labels into narrow columns. The four Progress calculations and Visit History remain intact. The V1/V2 history disclosure is removed from active UI while its records and compatibility modules remain.
- Roster and preparation share a search/sort toolbar. Search is one outlined field, with a shrinking input that cannot overlap its icon or adjacent controls. Preparation status is a rail directly beneath it. Roster filters are a compact Subject/Format pair, Early learner switch and weekday choices.
- Insights keeps the real matching-weekday average calculation and enclosed gauges. Actual and typical fills occupy identical horizontal bounds. A single legend shows exact values on focus, pointer or touch; sample coverage moves out of the visible inspection area. Today's punches expands inside the same card. Punch history defaults to eight weeks, uses the same calendar periods/bucket cadence as Progress, and filters both chart and optional list by student. It has no average. The optional list adds Newest/Oldest sorting.
- Reports has Daily/Weekly/Monthly navigation and four clickable totals: Visits, Observations recorded, Observations not recorded, Verified completed worksheets. One selected total reveals one list. Recorded/unrecorded are complementary **visit** groups: at least one saved nonempty observation or historical evaluation counts once, regardless of subjects or number of notes. A handoff by itself never counts as an observation. Visit details use the established session dialog in read-only form. Archive/revision controls and redundant report tabs disappear from the workspace; scheduled reports and retained APIs preserve archives.
- Excel is available only for monthly reports. One sheet has student, grade, subject, last verified level/worksheet, verified worksheets and packets at ten worksheets each. That last column is a reporting equivalent, including fractions, and never changes physical packet settings or identities. Values come from frozen evidence; old snapshots do not borrow current grades to fill historical gaps.
- Reception is student-facing: Scan your pouch, exact full-name entry, optional code entry and a small camera action on one surface. A QR reader in keyboard/HID mode sends the existing token followed by Enter. Pairing happens in the operating system; no Bluetooth plugin or Web Bluetooth permission is required. The locked kiosk remains isolated from roster/staff data. The sign-in surface no longer offers a demo role chooser; verified server accounts still determine permissions.

## Implementation sequence and capabilities

1. Apply shared brand assets and tokens, then fix the packet and search-wrapper cascade.
2. Reuse native Settings dialogs for profile and subject edits; preserve version-checked commands and cancel behavior.
3. Reuse the shared calendar window/bucket rules for punch history; verify totals against the filtered attendance source.
4. Add optional frozen report metadata without migrating or rewriting older archives. Use the existing ExcelJS dependency for the monthly workbook.
5. Add keyboard-reader input to existing QR/name attendance, preserving request receipts and scan debounce.
6. Use **Better UI** for radii, icon consistency, optical alignment, control size and surface checks. Use the existing **Animate** dialog implementation for occasional entry/exit; frequent tabs, chart inspection and data updates stay stationary. **Interview** requirements are supplied by the user's detailed feedback; no additional naming/theme interview is needed.
7. Run lint, typecheck, unit tests, production build and isolated browser checks. Inspect dark/light tablet and narrow screenshots. Check the preview URL after restarting the owned server.

## Shared styling example

```html
<div class="profile-section-heading">
  <h2>Student information</h2>
  <button class="secondary profile-edit-action">Edit</button>
</div>
<div class="segmented profile-subject-selector" role="tablist">
  <button role="tab" aria-selected="true" class="selected">Details</button>
  <button role="tab" aria-selected="false" tabindex="-1">Enrollment</button>
</div>
```

```css
[data-theme='dark'] {
  --bg: #1a1a1a;
  --surface: #202020;
  --ink: #e9e8e1;
  --muted: #b3b2ad;
  --line: #30302f;
  --input-edge: #71716e;
}
.profile-edit-action {
  min-height: 44px;
  border-radius: 8px;
}
.profile-subject-selector {
  background: transparent;
  border-radius: 0;
}
.profile-subject-selector .selected {
  background: transparent;
  border-bottom: 2px solid var(--ink);
  font-weight: 500;
}
```

The installed Wispr reference inventory is documented in `docs/wispr-ui-reference-audit.md`. This implements its observed visual patterns with original branding and the center's existing functions; it does not claim exhaustive gated-app or physical iPad coverage.

## Validation and final polish review

Lint, explicit TypeScript checking, the production build and all **220 unit tests** pass. **60 distinct Chromium browser checks** pass across the current screens and retained functional workflows. The final focused rerun additionally checks report-value baselines, one-row date controls, search-field borders, linked punch filtering, and actual session/worksheet drill-downs. All tests use isolated fictional data. Screenshots cover dark/light, tablet portrait/landscape and narrow layouts; existing reduced-motion checks pass. The preview login responds with Arithmetica branding on localhost and the current Wi-Fi address, and anonymous access to staff state remains rejected.

| Principle / severity                 | Location                                                                                              | Before                                                                  | After                                                                        | Why                                                       |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| Selected state, HIGH resolved        | `src/app/refinement.css:1239`                                                                         | The dark activity selection could show white text on white              | Neutral selected fill and explicit readable foreground                       | Selection remains visible without relying on motion       |
| Surface consistency, MEDIUM resolved | `src/app/refinement.css:1235`; `src/app/refinement.css:1251`                                          | A contrasting tab wrapper and nested input borders added visual clutter | Tab wrapper matches its dialog; shared search inputs have one outer boundary | One treatment works in either appearance and across lists |
| Consistent editing, MEDIUM resolved  | `src/components/students/profile-overview.tsx:75`; `src/components/students/profile-overview.tsx:252` | Inline edits changed card height and mismatched actions                 | Shared Edit action and native Settings-style dialogs; portrait cards stack   | Labels, subject rails and controls stay readable          |
| Stable geometry, MEDIUM resolved     | `src/app/refinement.css` packet rule; `src/components/reports/reports.css:20`                         | Held tiles shrank and report arrows could wrap                          | Fixed matching packet geometry and a three-column date group                 | Operational state changes do not disturb the layout       |

Not verified: physical iPad/Safari, actual Bluetooth pairing/reader hardware, gated reference-app states and slow-motion DevTools replay of every animation. Keyboard-reader input and camera decoding/track release are emulated browser checks. Existing shared dialog motion and reduced-motion behavior are retained.

Approve for the inspected Chromium states.
