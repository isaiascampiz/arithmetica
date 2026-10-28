# Arithmetica refinement specification

Confirmed center: **Kumon Learning Center · Yuba City**. Dark by default; retain Light, Dark and System controls. Preserve the established navigation destinations and working content layout while replacing the visual and interaction system. No new dependencies.

## Reference and visual brief

Use the installed Wispr Flow Windows app 1.6.1297 and its public website as the reference. Match its neutral surfaces, Figtree interface, editorial EB Garamond settings titles, quiet line icons, compact edit rows and purposeful overlays. Use the original Arithmetica aperture mark throughout; no Wispr branding or proprietary artwork is redistributed.

Typography: 26px/600 page titles; 29px/400 serif settings sections; 15px/500 setting labels; 14px/400 secondary text; 13–14px/450–500 actions. Metric numbers use 30px/500 and tabular digits. On touch, text inputs use 16px. All interactive targets are at least 44px. Controls use 7–8px corners, cards 8px, inset settings groups 12px and the outer workspace 22px. Readable input boundaries remain stronger than the reference where required for contrast.

## Wireframe notes

- Top strip: sidebar control and square account icon; opposite end theme sun. No notifications. The workspace wordmark is passive; use Home for navigation. Bottom sidebar: reception and settings gear. Remove the redundant center/workspace block and bottom owner block.
- Home: existing metrics and students list, clearer weights and statuses; only Home shows the weekday/time. Expected rows keep Not arrived and add a direct physical Check in button. Square-cornered avatars replace circular ones.
- Insights: three arrival metrics, Overview/Punch history tabs, an enclosed Daily/Weekly gauge chart and collapsed Today's activity. The arrival calendar and notifications are removed.
- Graph: shared zero baseline, three Y ticks and enclosed vertical gauges. Gray typical arrivals and the contrasting recorded-arrival fill occupy the same width. A small marker retains the typical level when the actual fill exceeds it. No counts above each column. Exact values and matching-weekday coverage appear on hover, focus or tap. Explain methodology through an info control. Historical averages remain estimates; no recorded data is removed.
- Reports: period tabs, summary metrics and exports first. Saved versions, student tables and daily detail open only when requested. Remove the scheduler status paragraph and move coverage/methodology into contextual information.
- Settings: SETTINGS → General, Center details; ACCOUNT → Account, Data and privacy; version bottom left. General shows Theme, observation shortcuts and Homework. Rare center edits open a separate dialog. No staff-coverage, medal-visibility, kiosk-timing or report-clock controls. Legacy settings values and command compatibility remain intact.
- Account: own first/last name, read-only verified email, picture, Save, Sign out and guarded account removal. Removal preserves attributed center records and blocks the only owner. Cloud removal requires a validated organization identity-provider process.
- Quick View: full-width Snippets-style Math/Reading tab rail, direct rating buttons on a slim segmented track, and a separate Add skill dialog. In-center and outgoing packet tiles share dimensions and a second-line In center / Send home label. The note heading is Instructional note. Existing subject-by-subject confirmation advances to the next unconfirmed subject. Preserve the existing five-point rating scale and all historical scores. Pressing an already selected Quick View rating clears it.
- Reception: brand in the corner, focused name/pouch choice, one confirmation. Full-name resolution is exact, case/spacing normalized, server-side, with no roster or suggestions. Duplicate/unknown names require the pouch or staff assistance. Staff reception returns Home; locked public reception requires staff authentication for private access.
- Pouch: show the student’s name and existing unique QR, never replace the identifier for a reprint. Authenticated print page defines a 2-inch square with 100% print scaling.

Student Roster and Homework Preparation share icon-led search and a checked Sort by menu. Roster filters contain Subject, Format, Early learner and weekday chips; enrollment status is absent. The roster retains inactive students without that filter. Preparation adds refresh and keeps blocked plans safe behind a concise review affordance. Student profiles retain Student information and Subjects boxes, reduce duplicated identity/status text, remove expected-duration display and use consistent Math/Reading and Overview/Progress/Visit History tab rails. The four progress-chart calculations and geometry remain intact; only shared type and surface details change.

## Implementation sequence and skills

1. **Interview:** retain the confirmed dark-default preference and exact center name in this specification. The detailed user feedback supplies the remaining decisions.
2. **Better UI:** apply common typography, spacing, radii, icon weight, switches, menu states, scrollbars, accessible focus and contrast across all surfaces.
3. **Animate:** native popovers use a brief opacity/position transition; dialogs use restrained WAAPI entry/exit. Ordinary data, tab switches and charts stay stationary. Reduced motion uses opacity and theme changes suppress color transitions.
4. Replace settings with compact rows and on-demand editors; consolidate appearance in a shared provider. Keep changes and errors inside the active dialog.
5. Simplify reports/Insights, align subject tabs and rating controls, refine sign-in and student views, and add stable-label printing.
6. Add closing-time cleanup and private name lookup. V3 ignores the old auto-close/report-clock switches: missed checkouts close administratively and reports are due at center closing. V1/V2 retain their behavior. Catch up on workspace access and before reception attendance; use the existing scheduler for unattended processing.
7. Add self-scoped account metadata with version checks, durable request IDs and fail-closed validation. Preserve original reviewer identity and attribution; snapshots include only the signed-in person’s display profile.
8. Run required checks with isolated fictional data and inspect rendered desktop/tablet/phone screens. Real iPad/Safari and live Supabase remain separate validation work.

## Implementation examples

The actual reusable components are in `src/components/ui-primitives.tsx`; tokens and styling live in `src/app/identity.css` and `src/app/refinement.css`.

```html
<button type="button" role="switch" aria-checked="true" aria-label="Homework">
  <span></span>
</button>
```

```css
[data-theme='dark'] {
  --bg: #1a1a1a;
  --surface: #202020;
  --ink: #e9e8e1;
  --muted: #b3b2ad;
  --input-edge: #71716e;
}
.secondary {
  min-height: 44px;
  border-radius: 8px;
  font-weight: 500;
}
.setting-label {
  font-size: 15px;
  font-weight: 500;
}
.setting-detail {
  font-size: 14px;
  font-weight: 400;
}
```

## Data and usability boundaries

No database reset, reseed, ID replacement or rewrite of archived reports. The former fictional center name receives a presentation alias; a subsequent explicit center save uses the confirmed name. Unique pouch identifiers fail closed if duplicated. Automatic closure never writes a physical departure or completed work. Explicit after-hours staff arrivals stay open until the next day. Routine auto-closed visits do not block the next check-in; other attendance anomalies retain their safeguards.

Account photos are locally cropped and re-encoded before the authenticated save, capped and restricted to supported raster formats on the server. Original author/reviewer strings never change with a display-profile edit. Public kiosk endpoints return confirmations only; locking clears staff authentication. Private documents remain excluded from service-worker caching and browser storage.

Reception retries retain server receipts and never become an accidental second attendance action. Client request IDs also work on local HTTP previews through Web Crypto. Camera scanning still requires a secure context; public deployment and physical iPad/Safari validation are outside the verified local browser scope.
