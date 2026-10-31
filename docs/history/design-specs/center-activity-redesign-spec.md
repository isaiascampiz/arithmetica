# Center Activity design brief

**Superseded by the current implementation:** see [Arithmetica refinement specification](arithmetica-refinement-spec.md). The graph’s data-preservation and inspection requirements below remain. The current pass also changes reception and closing-time policy as explicitly requested; the earlier appearance-only scope no longer describes the complete task.

The graph should make arrival patterns readable at a glance, with exact values available on demand. Keep the existing overview, date controls, daily/weekly switch, totals, average explanation and activity history in their current content sequence. No attendance calculation, saved record, permission or command changes are needed.

## Confirmed direction

Dark is the default; retain the existing theme control and saved light/dark preference. This preference was confirmed through the Interview clarification. Better UI, Animate and Interview are local skills, not runtime dependencies. No package installation is needed.

## Graph and wireframe notes

```text
Sidebar | Center Activity                           Synced  Theme
        | Center Activity
        | [Currently here] [Arrived today] [Still scheduled]
        | Overview / Punch history                    Timezone
        | + Student check-ins ---------------- Daily / Weekly +
        | | Previous  Date picker  Next  Today   Selected date |
        | | Legend: Historical average / Actual check-ins     |
        | | Selected period · actual · average · sample count |
        | | max  |                                            |
        | | half |    paired gray and blue bars                |
        | |   0  +--------------------------------------------|
        | |        one time/day label per period               |
        | | Checked in so far · Typical day · Next hour        |
        | | Partial-period explanation / How average works    |
        | +---------------------------------------------------+
        | Today's activity                         Full activity log
```

- Use paired bars on a shared zero baseline. Historical bars are slate; recorded arrivals are blue. Distinct positions and text labels supplement color.
- Keep only three vertical scale labels: zero, midpoint and ceiling. Show each hour/day label once. Remove repeated numeric rows beneath every bar.
- Keep the existing matching-weekday calculation intact. Show precise values and historical sample coverage in one persistent detail strip on hover, keyboard focus or tap. This supplies tooltip information without covering nearby bars or requiring hover.
- A selected period has a tinted background and a stronger label. Keep complete accessible names on every period button, including partial and unavailable values.
- Keep all periods in a horizontally scrollable chart with at least 48px per column on narrow screens. The page itself must not overflow. Never shrink all the timestamps until they collide.
- Preserve the average-method disclosure, exact totals, current-period indication, absent future actuals and all history filters, expandable records, session links and pagination.

## Surface and theme recipe

Use the existing system font stack. Neutral charcoal surfaces, a restrained blue accent, 12–14px card corners, thin structural dividers and 24px desktop padding connect the chart to the existing shell. The three summary cards remain above the view controls. On phones their padding and gaps decrease while the chart scrolls inside its card.

The implementation extends the existing tokens; this is a compact extract:

```css
[data-theme='dark'] {
  --bg: #0d1017;
  --surface: #151a23;
  --side: #10141c;
  --ink: #edf1f7;
  --muted: #a2adbd;
  --line: #2c3544;
  --brand: #83b4ff;
  color-scheme: dark;
}
[data-theme='dark'] :is(input, textarea, select) {
  border-color: #68768a;
}
.activity-card-chart {
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--side);
}
@media (prefers-reduced-motion: no-preference) {
  .activity-date-controls button {
    transition: transform 150ms ease-out;
  }
  .activity-date-controls button:active:not(:disabled) {
    transform: scale(0.96);
  }
}
```

```html
<html lang="en" data-theme="dark">
  <section aria-label="Student check-ins">
    <div class="activity-inspection" aria-live="polite">
      <!-- Populate from the hovered, focused or tapped period. -->
    </div>
    <div
      class="activity-chart-scroll"
      role="group"
      tabindex="0"
      aria-label="Arrival counts by period; scroll horizontally for more periods"
    >
      <!-- Existing periods remain accessible buttons with exact-value labels. -->
    </div>
  </section>
</html>
```

## Implementation sequence

1. **Interview:** confirm the only unresolved appearance choice: dark by default with the theme control retained. Preserve the supplied content and workflow constraints in this spec.
2. **Better UI:** extend shared dark tokens and shell styling; align chart surfaces, selected states, focus outlines, control sizes and corner geometry with existing components.
3. Replace repeated per-period counts with one inspection strip. Place historical and actual bars side by side and restore a sparse scale. Preserve the comparison engine and full accessible descriptions.
4. **Animate:** apply the frequency/function gate. Operational graph data and frequently inspected columns stay still. Occasional date-button presses receive 150ms feedback at scale 0.96, gated by the reduced-motion preference. CSS is sufficient.
5. Check daily/weekly views, current and future periods, no-history states, keyboard focus, touch selection, history filters/session access and saved light/dark preference. Use isolated fictional fixtures.
6. Run lint, typecheck, unit tests, production build and the Center Activity browser suite. Inspect the generated screenshots at phone, tablet and desktop widths. Record actual results separately; a checklist alone is not evidence of verification.

## Acceptance criteria

- No repeated count rows or overlapping comparison bars.
- Every underlying period/value remains available through inspection and accessible names.
- Default dark appearance and working light/dark control.
- Readable text, visible input boundaries and focus, minimum 44px controls, reduced-motion support and contained horizontal chart scrolling.
- Existing content sequence, matching-weekday calculations and core workflows preserved.
- No new dependencies, storage schema changes or authenticated browser caches.

## Validation

Lint, TypeScript checking, the production build and all 210 unit tests passed using the existing Corepack pnpm 11.25.0 runner. The Center Activity browser suite passed seven checks covering default/saved theme, keyboard inspection, separate bars, 44px button heights, no page overflow, daily/weekly periods, history search/details, settings and authorization across five viewport sizes (320–1366px). Desktop and phone screenshots were inspected. Browser coverage uses isolated fictional data.

Computed dark contrast ratios: main text 15.39:1 and secondary text 7.68:1 against the card surface; blue bars 8.73:1 and slate bars 4.79:1 against the plot; input boundaries 3.78:1 against their surface. Motion is limited to reduced-motion-gated date-button press feedback. Physical-device feel testing is not verified.

# Current implementation

The latest user-directed design is documented in [Arithmetica continuous workspace refinement](arithmetica-continuous-ui-spec.md). It combines the attendance summary, chart, period navigation and punch disclosure on one page. The earlier specification below is retained as design history.
