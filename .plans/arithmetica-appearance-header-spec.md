# Arithmetica appearance and shared headers

28 October 2026. Supersedes the earlier fixed teal accent and internal Traffic period rail. Existing operational content and data remain intact.

- **Appearance:** General / Theme, then Accent color, then existing frequent settings. Native menu with Teal, Blue, Violet, Amber and Rose; all light/dark accent text contrasts exceed 4.5:1 against their surface. Device-only preference persistence matches the existing theme control. Skill identities retain their distinct colors; the all-skills average remains neutral.
- **Common header:** Roster, Homework Preparation, Traffic and Reports share the actual directory-grid dimensions. Traffic and Reports use one component for date navigation and Daily/Weekly/Monthly/Yearly rails. The rail sits outside the content panel. The native date input displays Today in its own box for the current daily/weekly date; no neighboring Today button. Calendar and arrow controls retain 44px targets. Year selection remains a compact native select.
- **Reports:** a document heading gives period, center and absolute dates before the four existing counted sections. Search stays above the panel. Yearly previews use the same original evidence for a whole calendar year; they create no archive or scheduling option. Excel stays monthly. Source revision checks and archived immutability remain enforced.
- **Reception:** remove the small center illustration. Extend original broad contour geometry and soft accent light across the full background. Pointer response is capped at 18px horizontally and 14px vertically and never moves text or controls. Confirmation text and name remain dominant. Check-in settles contours inward; checkout expands them and fades the glow. Foreground receipt enters in 240ms; the decorative 600ms contour echo may complete behind already-usable controls. Opacity and transform only. Reduced-motion mode disables pointer translation and uses a 150ms fade.
- **Identity:** original planar dissection with no letter or arithmetic symbol, shared across header/sidebar/PWA. Expanded and collapsed logo, toggle and navigation glyph centers align. Collapsed width is 72px; mobile navigation restores full-width labeled controls.

References revisited: [Wispr Flow](https://wisprflow.ai/), its [official appearance release](https://wisprflow.ai/whats-new), and [Eden](https://eden.so/). This is an original implementation using the existing fonts/components, without copied artwork or source.

## Verification

Lint, typecheck, all **231 unit tests**, production build and **35 distinct Chromium checks** pass: shared appearance/header/reception cases (7), Traffic (7), latest enrollment/reception (3), skills (4), Arithmetica (2), scanner/shared state (2), and report/UI finalization (10). The final focused rerun also covers resizing a collapsed sidebar into full mobile navigation and accent inheritance in every non-skill student graph. Existing skill regression measurements now wait for the dialog entrance to settle before comparing dimensions; plot behavior and saved skill colors are unchanged.

Inspected screenshots include shared headers at 1024/768/390px, expanded/collapsed sidebar geometry, General / Accent color, reports and receipt backgrounds in normal/reduced motion. The original data file hash is unchanged across the preview restart. Localhost and the current Wi-Fi address both return 200 with the v7 brand assets; anonymous staff-state access returns 401. Preview address verified at delivery: http://10.36.116.164:3001. The host must stay running and the iPad must share its network.

| Severity         | Location                                       | Before                                                               | After                                                                          | Why                                                     |
| ---------------- | ---------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Medium, resolved | src/components/theme.tsx:100                   | Fixed accent and no matching appearance setting                      | Five accessible palettes directly below Theme                                  | Consistent appearance controls and clear selection      |
| Medium, resolved | src/components/workspace-period-controls.tsx:5 | Different search/date dimensions and Traffic periods inside its card | One header with matching geometry, native date picker and external period rail | Consistent grouping, spacing and control targets        |
| Medium, resolved | src/components/v3-reports.tsx:18               | Repeated inner search, no yearly view or document heading            | Shared header and dated report body; read-only calendar year                   | Clear report hierarchy with preserved evidence          |
| Medium, resolved | src/components/reception-backdrop.tsx:4        | Small logo-like illustration                                         | Full-screen responsive contours and explicit receipt states                    | Feedback with static meaning and reduced-motion support |
| Medium, resolved | src/app/workspace-refinement.css               | Unequal collapsed icon centers                                       | Shared optical axis and full mobile navigation after collapse                  | Predictable alignment and usable controls               |

Not verified: physical iPad/Safari, actual Bluetooth pairing, gated reference-app states or 10% DevTools animation replay.

Approve for the inspected Chromium states.
