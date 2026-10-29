# Wispr Flow UI reference audit

## Latest user-directed refinement

The newest pass adds an accent menu immediately below Theme, shared external search/date/period headers for Traffic and Reports, and a read-only Yearly report. Native calendars display Today within the date field. Original planar geometry replaces the mark, and reception uses full-screen interactive contours rather than a small logo illustration. Skill colors remain independent of the chosen accent. See [the current brief](../.plans/arithmetica-appearance-header-spec.md). The official Wispr appearance release and public Eden homepage were revisited; their source/assets are not copied.

### Previous refinement

**Latest refinement:** Arithmetica now uses flat dissected-square geometry. Subject dialogs pair Learning mode/Current level and Current worksheet/Worksheets per day; unenrolled values stay hidden while saved settings remain. Preparation uses Home-aligned identity and a compact filter order, with refresh beside status tabs. Traffic has Daily/Weekly/Monthly/Yearly views, grouped day/hour values, seven visible hourly gauges and a linked punch disclosure. Reception completes one uniquely matching active name inline and uses a named receipt with a restrained check/ring sequence and reduced-motion fade. This narrow name disclosure is expressly user-authorized and documented in AGENTS.md. See the current [.plans/arithmetica-continuous-ui-spec.md](../.plans/arithmetica-continuous-ui-spec.md) for implementation and validation. Earlier notes below retain their original historical scope.

### Earlier 28 October pass

**28 October follow-up:** Arithmetica uses the original folded A mark. Profile editing now uses Settings-style dialogs and aligned Details/Enrollment and Math/Reading rails; portrait widths stack the two cards. Quick View held packets keep the same fixed geometry, selected activities remain legible in both appearances, and the subject rail has no contrasting gray wrapper. Home has Sync. Shared search fields avoid nested borders, including Reports and punch history. Reports now has four on-demand lists and monthly-only Excel; Insights has linked student/timeframe filtering and Today's punches within the comparison card. The reception reader/name surface and single staff sign-in replace method/role chooser clutter. See `.plans/arithmetica-refinement-spec.md` for the current brief, implementation sequence and review.

Current validation: lint, typecheck, production build and **220 unit tests** passed. **60 distinct Chromium checks** passed across Arithmetica (2), Center Activity (7), profile Overview (6), visual system (3), refinement (6), scanner/shared state (2), UI finalization (10), preparation (7), Quick View (1) and V2 workflows (16). Focused reruns verified the final report metric alignment, one-row date navigation, borderless inner search fields, all four report drill-downs and read-only session/worksheet pop-ups. Hardware keyboard scans and camera behavior were emulated; physical Bluetooth pairing and iPad Safari remain unverified.

The current identity is **Arithmetica**, with an original folded A mark. Centerbook and its book logo were rejected. The sidebar wordmark is passive; Home remains the navigation destination. Insights has enclosed equal-width gray/teal gauges, no activity calendar, and on-demand history. Notifications are removed.

The installed Snippets page was re-inspected: a full-width baseline, selected label underline, 400/500 text hierarchy, search and vertical sort arrows, and a compact Sort by menu with a checked/bolder selected item. Quick View and profile subject tabs now use that rail. Roster and preparation share search/sort controls; roster filters omit enrollment status and use an early-learner switch plus weekday chips. Packet tiles, including held/crossed-out tiles, share fixed two-line dimensions.

The five-point observational scale remains unchanged. Direct numbered choices avoid dragging for a discrete value; [USWDS range guidance](https://designsystem.digital.gov/components/range-slider/) treats sliders as approximate-range controls, while [Fluent rating guidance](https://fluent2.microsoft.design/components/web/react/core/rating/usage/) describes sentiment ratings. These sources inform the choice; they do not mandate this app's numbered track. No design library was installed.

Expected students can check in from Home. Profile details omit expected duration and display early learner as a badge, retaining its edit field and all saved configuration. The four established progress charts retain their calculations and geometry. Blocked packet plans still require actual instructor approval; visual simplification never fabricates a valid curriculum plan.

2026-10-27. This replaces the earlier approximate visual direction. The user asked for a close Wispr Flow visual match while preserving Arithmetica’s center-management capabilities and reducing noise.

## Evidence inspected

- Public [website](https://wisprflow.ai/), [release notes](https://wisprflow.ai/whats-new), their linked public stylesheet, and [desktop navigation documentation](https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android).
- The installed Windows application, version **1.6.1297**: main navigation, Dictionary, Snippets, Insights/usage, theme menu, the two-pane Settings overlay, General settings, nested Shortcuts, and the Add snippet form. Opening and cancelling these reference views did not submit data or change saved preferences.
- Read-only inspection of the installed application’s static font metadata and UI styling resources. This identified exact typeface families and neutral color tokens. Application code and third-party artwork are not shipped with Arithmetica. Raw research files stay in the Git-ignored `data/design-reference/` directory; user history is not copied into the project.

This is a component and interaction inventory of the accessible reference, not a claim that every gated account state, recording mode, platform, or animation frame was exhaustively tested.

## Observed primitives

| Primitive            | Observed reference                                                                               | Arithmetica implementation                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Interface typography | Figtree variable sans; stylistic alternates enabled                                              | Locally hosted Figtree, `font-feature-settings: 'salt' on`, system fallback                                             |
| Editorial typography | EB Garamond in Settings titles and selected website/banner headings                              | Settings section headings and sign-in story; ordinary form dialog titles remain sans                                    |
| Auxiliary typefaces  | Manrope and Google Sans Code are also bundled; the website loads additional mono faces           | Not added to ordinary center data; no code-editor or transcription surface is needed                                    |
| Dark palette         | Main `#1a1a1a`, lifted `#202020`, selected `#30302f`, text `#e9e8e1`, secondary `#b3b2ad`        | Shared dark tokens across screens, forms, dialogs and reception                                                         |
| Light palette        | Sand/cream neutrals, dark ink                                                                    | The same component hierarchy in the retained light appearance                                                           |
| Analytics accent     | Teal usage intensity colors in Insights                                                          | Teal arrival/academic/duration/consistency series; existing distinct skill-series and evidence colors remain meaningful |
| Main frame           | Stable left navigation and a bordered content well with generous upper corners                   | Existing screen arrangement inside a 24px content frame; narrower adaptation on phones                                  |
| Navigation           | Quiet icon-and-label rows; selected neutral fill                                                 | Rounded neutral selection, consistent outline icons, accessible current-page state                                      |
| Tabs                 | Underlined content tabs; compact grouped selectors in smaller contexts                           | Roster/profile/activity tabs and compact daily/weekly/report selectors                                                  |
| Settings             | Centered two-pane overlay, compact left navigation, serif section title, grouped neutral content | A native dialog with the existing settings categories and every saved control preserved                                 |
| Secondary forms      | Sans heading, dim backdrop, neutral input edges, secondary Cancel and bright primary action      | Shared native form dialogs; 180ms entry and 120ms close feedback, opacity-only under reduced motion                     |
| Data lists           | Restrained dividers, modest row density, secondary metadata                                      | Existing student/activity/report data with unified typography and boundaries                                            |
| Analytics            | Large numeric summaries, sparse labels, quiet chart containers                                   | Existing chart calculations, paired arrival bars, exact-value inspection, and smaller visual hierarchy                  |

Figtree and EB Garamond were obtained from the official Google Fonts repository under their included SIL Open Font Licenses. No external font request is made when using Arithmetica.

## Reference capabilities mapped to center workflows

| Reference surface/use case                    | Existing center capability receiving that treatment               |
| --------------------------------------------- | ----------------------------------------------------------------- |
| Dictation hub and dated history               | Home roster and punch/session history                             |
| Dictionary directory and search/filter tabs   | Student Roster and catalog/settings controls                      |
| Snippets list and create/edit forms           | Observation shortcuts and existing edit dialogs                   |
| Style/personalization                         | Personal preferences and observation choices                      |
| Insights, summary cards and period navigation | Center Activity and student Progress                              |
| Notetaker/session context                     | Existing session observations and verified visit history          |
| Scratchpad/text editing patterns              | Existing note-entry surfaces                                      |
| General/System/Account settings hierarchy     | General, rare Center details, Account, and Data and privacy       |
| Theme/menu and nested dialogs                 | Retained theme control, settings overlay and existing modal flows |

Wispr’s recording, billing, transcription, external connector and account-management capabilities are reference context; they do not add new capabilities to Arithmetica. The center’s role checks, packet identities, attendance, handoff, verification, observations and reports keep their existing semantics.

## Usability adaptations

Controls retain 44px minimum targets and text fields use 16px text on touch pointers. Native dialogs preserve focus management and Escape; settings also supports backdrop dismissal and returns to the prior screen/profile. On phones, settings navigation becomes a scrollable category strip rather than compressing a desktop sidebar. The average methodology is available from a contextual information control rather than repeated below the arrival chart. Long medal history scrolls inside its own strip.

Animation timings are implementation choices informed by the inspected interaction patterns; this audit does not claim frame-perfect measurement of every Wispr transition. Operational data and frequent chart inspection remain stationary. Exact values remain available by touch, keyboard and pointer inspection. Physical iPad/Safari validation remains separate from browser viewport testing.

## Validation of the implementation

Lint, TypeScript checking, production build and all **217 unit tests** passed. **62 distinct browser checks** passed across focused runs: V2 workflows (16), Quick View (1), refinement (6), visual system (3), UI finalization (10), profile Overview (5), preparation (7), Center Activity (7), center features (3), scanner/shared state (2), and past-session observation editing (2). Coverage includes tablet portrait/landscape, narrow layouts, dark/light/system appearance, reduced motion, settings error/focus handling, self-scoped account edits, owner-removal protection, direct Home check-in, equal-width arrival gauges, report export/history, stable two-inch pouch labels, and isolated public reception.

One narrow profile-layout regression was corrected by containing medal history horizontally. A test that requested a saved hour now chooses a different value before attempting a failed save, so it remains valid when another test already saved the first candidate hour. Screenshot capture finishes finite animations before saving review images.

Computed contrast against relevant surfaces: dark primary text 13.26:1, dark secondary text 7.67:1, dark input edge 3.55:1; light secondary text 4.95:1 and light input edge 3.55:1. The light input edge intentionally uses a stronger neutral from the inspected palette rather than reproducing a boundary below 3:1.

Generated fictional-data review images are in `test-results/arithmetica-*.png`, including the settings overlay, generic form dialog, main screens, and student Overview/Progress/Visit History at tablet widths. Physical-device/Safari behavior and gated reference-app states remain unverified.

## Final polish review

| Severity         | Location                                                             | Before                                                                | After                                                                                | Why                                                    |
| ---------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| HIGH, resolved   | src/app/refinement.css; src/components/v3-quick-view.tsx             | Rating buttons inherited a slider grid and overflowed narrow screens  | A 44px-per-choice rating track reflows beneath the skill name                        | Discrete values remain touchable without clipping      |
| HIGH, resolved   | src/components/ui-primitives.tsx                                     | Tooltip focus/hover CSS could defeat Escape and overflow the viewport | Controlled pointer/focus/tap visibility, viewport clamping and Escape dismissal      | Contextual explanations remain accessible              |
| MEDIUM, resolved | src/components/v3-profile.tsx; src/app/refinement.css                | Long names compressed between an avatar and medals                    | A full-width identity row on narrow screens with aligned avatar/medals above         | Preserves readable names and the two information cards |
| MEDIUM, resolved | src/components/staff-app.tsx; src/components/list-controls.tsx       | Redundant identity/actions and inconsistent filtering                 | Passive wordmark, no bell, direct expected-student check-in and shared list controls | Every visible action has a clear purpose               |
| MEDIUM, resolved | src/components/v3-center-activity.tsx; src/components/v3-reports.tsx | Excess labels and automatically expanded details                      | Enclosed arrival gauges, contextual explanations and on-demand report detail         | Keeps the first view useful and quiet                  |

A transient Windows EPERM occurred once during parallel fixture writes. The affected isolated test passed on rerun; no reset or replacement data was used. Geometry assertions now wait for finite modal entry motion before comparing positions. Physical iPad/Safari and live Supabase remain unverified. The local preview was checked by HTTP on loopback and the machine's Wi-Fi address; HTTP name/code workflows retain secure random request IDs, while camera access still requires a secure context.

Approve for the inspected Chromium states.
