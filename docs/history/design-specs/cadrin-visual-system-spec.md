# Cadrin — complete visual system

**Current direction:** superseded by the user’s request for a much closer Wispr Flow match. See the [direct desktop/website audit](../../wispr-ui-reference-audit.md). The implementation now uses Figtree/EB Garamond, observed neutral tokens, underlined tabs and modal settings. The earlier Geist/citron design below is retained as iteration history.

## Direction and scope

The user rejected the previous chart-focused update as too soft and too narrow. This work replaces the application’s visual identity across every active workspace while preserving the established sidebar, screen arrangement, content and operations. The user identified Wispr Flow’s Windows application and website as the main reference for visual quality and interaction continuity, with a darker treatment.

**Working product identity: Cadrin.** This advances a name from the project’s prior branding studies. The mark is original vector artwork: an open, chamfered C with a small separate square in its opening. The same construction appears in the sidebar, sign-in, reception and install icons. It replaces the blue book symbol and Centerflow wordmark. This is an implementation choice for review, not a claim of trademark clearance.

## Research applied

- [Wispr Flow’s official desktop dark-mode announcement](https://wisprflow.ai/whats-new), October 19, 2026, and its published screenshot: neutral charcoal layers, readable contrasting type, quiet outlined navigation and clear content boundaries. The supplied reference is the primary direction. No Wispr artwork or product functionality is copied.
- [Wispr Flow’s desktop navigation documentation](https://docs.wisprflow.ai/articles/5096240724-navigating-the-wispr-flow-app-desktop-ios-and-android): a stable navigation frame and consistent settings surfaces. The existing project’s destinations remain unchanged.
- [Linear’s interface refresh](https://linear.app/now/behind-the-latest-design-refresh): consistent hierarchy and aligned chrome across different views. Used as a secondary reference for component discipline.
- [Geist](https://vercel.com/font) and its [official font repository](https://github.com/vercel/geist-font): a crisp variable sans for interface text. The WOFF2 and SIL Open Font License are stored in `public/fonts/`. The app serves the font locally through `next/font/local`; visiting the app makes no third-party font request.

## Visual rules

| Element          | Treatment                                                                                                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Typography       | Geist variable sans, 430 body weight, 550–570 hierarchy weights; tighter tracking on page titles; tabular chart and metric values                                                 |
| Main surfaces    | Neutral charcoal canvas, darker sidebar, gently lifted content panels; legible off-white text and warm gray secondary text                                                        |
| Accent           | Restrained pale citron for selected rails, chart data and small status details; primary buttons use high-contrast chalk rather than saturated color                               |
| Shape            | 8px main cards, 6px inputs/actions, 5px navigation controls, 3–4px nested selections/badges, 10px dialogs; circular status dots and meaningful medal artwork remain               |
| Icons            | One Lucide family, consistent 1.75px strokes, firmer ends; navigation glyphs chosen for dashboard, directory, material layers, activity and reports                               |
| Sidebar          | Same destinations and order; new wordmark/mark, precise collapse control, restrained selected surface with a thin rail, quiet center identity block and outlined reception action |
| Header           | Same location/date/status/theme content; tighter title/date hierarchy and a defined theme control                                                                                 |
| Lists and forms  | Structural dividers, aligned controls, clear focus rings and a consistent input edge; inline editing retains row alignment                                                        |
| Charts           | Existing calculations and data; shared theme tokens, sparse arrival scale, exact counts available on inspection                                                                   |
| Dialogs          | Native modal semantics, distinct header/footer, contained scrolling and consistent action styling                                                                                 |
| Light appearance | Stone surfaces and dark ink using the same shapes and hierarchy; the existing light/dark control and saved preference remain                                                      |

## Interaction decisions — Animate and Better UI

Operational rows, chart data, keyboard navigation and tab selections do not move for decoration. Routine feedback remains immediate. Date/action presses use 150ms feedback with scale 0.96 when motion is permitted.

Shared dialogs enter over 180ms with opacity and a small translate/scale, using `cubic-bezier(0.23, 1, 0.32, 1)`. Close-button and Escape dismissal use a shorter 120ms exit. Reduced motion uses opacity only. Web Animations handles these existing dialogs without an additional library. Unmount cancels animations and returns focus to the connected trigger. Unique title IDs support nested dialogs. Successful actions that unmount a parent retain their existing dismissal behavior.

Theme changes temporarily suppress transitions so the entire interface changes appearance together. Hover-specific treatments are limited to hover-capable pointers; touch selection does not require hovering. The chart and history remain keyboard-readable.

## Implementation coverage

- Home metrics and student list.
- Roster, filtering and add-student dialog.
- Homework preparation and readiness controls.
- Student Overview, inline editing, Progress, Visit History and Quick View.
- Center Activity, period inspection and punch history.
- Reports, archive controls, tables and downloads.
- Settings navigation, forms and kiosk preview.
- Sign-in, reception, offline screen, browser metadata, installed-app manifest and 192/512px icons.

The backend command model, records, IDs, auth, session cookies, preference keys, Supabase RPC names and the existing PWA installation ID are retained. Download filenames and workbook creator metadata use Cadrin. No new runtime dependency or environment variable is introduced. The service worker still caches public installation assets only and never authenticated records.

## Verification approach

Use isolated fictional data. Run the required lint, TypeScript, unit-test and production-build commands, plus relevant browser suites. Inspect tablet portrait/landscape screenshots of every main screen, profile and dialog. Exercise Escape/focus restoration and the reduced-motion variant. Verify reports and exports, preparation/issuance distinctions and the existing V1/V2 regression workflows.

Browser batches are kept below the server’s authentication rate limit rather than weakening it. Report tests must wait for the completed archive before following a download link; a stale live-report revision should continue to return 409.

Physical iPad/Safari behavior and installed-app icon propagation need a real-device check; Chromium viewport tests do not establish device compatibility.

## Completed validation

- `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` passed through the existing Corepack pnpm runner; all 210 unit tests pass.
- All 47 distinct browser checks across Center Activity, preparation layout, profile Overview, UI finalization, V2 workflows and the new visual-system suite passed in focused batches. Earlier failures were resolved: inline-checkbox baseline expansion, a generated-font-name test assumption, and an archive/download test race. Rapid-login throttling was avoided by running separate batches; the production protection remains unchanged.
- Tablet screenshots cover all six primary destinations, student profile and a shared dialog at 1024×768 and 768×1024 with touch input enabled. The existing suites additionally cover phone/desktop widths, both appearances, reports/Excel, kiosk isolation and record-preserving workflows.
- Shared dialog checks verify Escape, trigger focus restoration and opacity-only animation keyframes under reduced motion.
- Computed contrast: dark main/secondary text 14.14:1 / 7.38:1 against the card, dark input edge 3.90:1; light secondary text 5.71:1 and light input edge 3.45:1. Focus and current-page cues remain available in forced-colors mode through explicit outlines/borders.

Current review images are under `test-results/cadrin-*.png`; these are generated fictional-data evidence, not source assets.
