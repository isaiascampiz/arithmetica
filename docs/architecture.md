# Centerflow V3 architecture

## Beginner map

The frontend draws the screens; the backend checks and saves changes. Next.js supplies both in one project.

```mermaid
flowchart TD
  UI[Staff iPad / Mac / browser] -->|JSON via client.ts| API[Next.js state / commands APIs]
  K[Kiosk: restricted attendance] --> KA[Kiosk API]
  API --> AUTH[Session, role, input and version checks]
  KA --> AUTH
  AUTH --> RULES[Domain rules and shared packet planner]
  RULES --> REPO[repository.ts]
  REPO -->|Current local adapter| FILE[Ignored data/demo-v1.json]
  REPO -.->|Optional adapter: not live-validated| DB[Supabase Auth + PostgreSQL]
  JOBS[Secured scheduler / current Node loop] --> RULES
  DB -.-> BACKUP[Independent managed backups]
```

A future Cloudflare host would run the application/API after adapter validation; each iPad would use the same shared server. GitHub stores source, VS Code edits a local checkout, and Codex Cloud runs coding tasks in a separate checkout. None automatically synchronizes runtime student records. See `cloudflare.md` before a future hosting decision.

## Implementation reference

V3 extends the original Next.js application and preserved V2 operations aggregate. It does not create a second app or a new database. V1/V2 domain modules remain for historical compatibility; new daily UI calls V3 commands.

| Module                                   | Responsibility                                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.ts`, `v2-model.ts`, `v3-model.ts` | Existing students/history plus optional visit handoff, student configuration and packet-level fields on existing assignments                                                     |
| `v3-migrate.ts`                          | Explicit schema 2 → 3 addition; preserve original arrays, old settings/records, medals and reports; unknown enrollment dates remain null                                         |
| `v3-planning.ts`                         | One sequencing engine for preparation and Quick View; calendar-day quantities, exact identities, catalog stops, held-packet reuse, recommendations and continuous roster sorting |
| `v3-domain.ts`                           | Validated, role-checked preparation/handoff/receipt/override/repeat/absence/shortcut/catalog commands; stale versions and attribution                                            |
| `v3-analytics.ts`                        | Same-subject filters, deterministic legacy visit matching, verified durations, independently weighted occupancy using real DST intervals                                         |
| V3 components                            | Lightweight Quick View, compact pulling list, directory filters, three-section profile and three relevant student charts                                                         |
| Existing repository/auth/report APIs     | Locks/atomic disk writes or Supabase CAS, durable command IDs, active membership verification, restricted kiosk, append-only reporting versions and jobs                         |

Commands are `{kind:'v3', command:{action:...}, requestId}`. The existing server API maintains idempotency and permissions. Paper-set versions and expected handoff timestamps reject competing edits. Optional observations can be added after departure without a second handoff. Assistants cannot perform instructional actions.

## Truth and physical packets

Physical arrival/departure and instructor handoff are independent. Administrative closure leaves actual departure null/unverified. Every attended session retains its own identity, including repeat same-day visits. The Home roster sorts waiting, ready and departed visits without separate panels.

V3 adapts existing Assignment records through optional `v3` data: visit date, one in-center packet, recommended take-home packets, actual issued packets, held packets, preparation/issuance attribution, version, review and receipt events. Subject + level + exact range is structured identity, not a parsed display string. Packet IDs retain origin when physically reissued. Prepared sets are not silently replaced; changed requirements flag physical adjustment.

The catalog has explicit identifiers/order/bounds and review sources. Unknown legacy Reading identifiers are retained, not guessed into subdivisions. Out-of-bounds ranges produce a review state before any physical pull list. A confirmed position change is an academic decision. One-time repeat preserves the ongoing cursor; explicit restart is separately recorded. Actual manual sets and held ranges inform next preparation.

Incoming no-exception is a planning assumption. Finished/unfinished/missing receipt reports are not verified completion ledger entries. Missing packets cannot become physically available through assumption. Corrections-only shifting applies per subject to entirely unstarted in-center work. A started packet going home requires no classwork-incompletion workflow.

## Migration, persistence and security

The same local file upgrades forward with untouched V1/V2 backup copies. Corruption never causes reseeding. Transactions use a bounded directory lock and atomic replacement; no-op transactions avoid revision growth. The cloud adapter uses revision compare-and-swap and retries side-effect-free callbacks; cloud failures never use local fallback.

The V3 SQL migration permits schema 2/3 payload compatibility, records target schema on commit, and retains existing payload/recovery tables and service-role-only access. No SQL was applied live. Real Auth/RLS/tenant isolation and disaster recovery require external validation. Never run resets or use empty-state provisioning over occupied state.

Records are served through role-filtered APIs. Kiosk pairing removes staff cookies and never exposes private snapshots. The service worker caches only installation assets and a generic offline page; offline mutations are unsupported. No audio files are stored. Browser dictation/provider behavior needs privacy approval.

## Charts and history

Paper academic history projects recorded packet completions and receipt assumptions without converting assumptions into verified ledger entries. Its connected daily position trace can move backward after an explicit repeat. Period views use daily checkpoints for Week, monthly checkpoints for Year, and about fourteen time-distributed checkpoints for the other ranges; the line connects those displayed checkpoints while Page history retains the underlying records; explicit legacy completion dates are respected. Homework consistency uses the latest saved incoming packet snapshot per subject/physical visit to calculate a packet-weighted review percentage. Completed-by-default and reported-finished outcomes contribute to the display numerator while preserving their different source evidence; they never become verified ledger entries. Reissued packets can contribute at a later review, duplicate saves within one review do not, and periods with no review remain unknown rather than zero. Issuance and legacy academic completion records do not provide a review denominator. Duration bars use verified departures. CONNECT subjects omit paper charts/settings.

Visit History merges attendance, observations/evaluations/notes and decisions where a unique match exists. Ambiguous historical entries remain dated entries without fabricated visit links. Existing V2 worksheet history remains readable. Center Activity separately computes arrivals and elapsed-time occupancy; old unresolved visits are excluded, current open intervals are labeled provisional, and DST/midnight intervals use actual elapsed timestamps.

Operational reports remain the existing archive/revision/export system. UI references to removed correction/appointment destinations are suppressed; historical payloads and verified completion records are retained.

The Time spent at center progress card reads `center-duration.ts`, using the existing `measuredMinutes` physical-attendance rule with invalid/negative intervals excluded. Each physical visit remains a separate record. Center-local arrival dates determine calendar buckets; elapsed timestamps determine duration. The headline is visit-weighted and excludes empty buckets. Preview uses eight weekly columns; detail uses daily, weekly or monthly averages and a zero-based, uncapped minutes axis. The projection never writes attendance or assigns attendance time to Math/Reading.

Skill trends are a read-only projection in `skill-progress.ts`. Stable skill IDs and original observation dates identify history; the latest observation revision supplies the score without creating a second event. Current configuration supplies names/order, while historical records retain their original labels. Legacy subject-scoped ratings stay separate from visit-wide series. The shared scatter plot uses only actual saved ratings, aligned by timestamp within center-local calendar boundaries. Straight connections span unrated dates without fabricating dots or extending endpoints. Per-skill arithmetic averages include only ratings inside the selected window. Colors are assigned using all identities rather than the selected period. No schema or command changes are required.

Skills visibility and pins remain per-student in-memory view preferences. The main preview shows three boxed pinned skill averages without buttons or pin icons, and a single shaded aggregate line. Its plot geometry stays aligned with Time spent at center. The aggregate is the daily arithmetic mean of every recorded rating, including unpinned skills; missing ratings are excluded. Expanded-only pin controls change preview labels, not the aggregate. The expanded View dropdown selects All skills average or one individual skill, retaining light shading. The View dropdown includes gray pin controls and a three-skill limit; unpin one to replace it. Escape dismisses the dropdown before closing the panel. The gray summary shows the selected period average without a rating count. The dropdown overlays the chart without increasing panel height; Skills alone follows Time spent at center for gray summary height, plot bounds and history-action placement, verified at desktop and phone widths. The original Homework consistency and Time spent at center layouts are unchanged. The three operational previews share an eight-week window and aligned typography and plot geometry; Skills shows its aggregate headline on the left and three pinned skill summaries in a compact box on the right, aligned alongside the heading and average. Duration omits its measured-visit count. Preview labels and square keys match Homework consistency and Time spent at center, and /5 uses the same size as the score with normal weight. No database or attendance changes.

The three operational charts use compact inline period controls with accessible names and no visible Period label (Carbon inline dropdown guidance: https://www.carbondesignsystem.com/building-blocks/core/components/dropdown/guidelines). Skills uses a visible, fully clickable summary dropdown beside the period control; the selected-skill button and period selector are adjacent, and the average remains a separate summary. Shared-value tooltips remain above the plot and track the selected date horizontally, clamped within plot edges, for hover, keyboard and tap. This is a Centerflow choice among supported chart patterns, not a claim of universal convention (https://www.highcharts.com/docs/chart-concepts/tooltip). No chart calculations or saved records change.

Academic progress now matches the operational previews and expanded duration panel: eight-week preview, subject caption, configured current-level headline, 190px preview chart, matching detailed plot bounds and neutral history actions. Its expanded default is 8 weeks, with prior/next eight-week navigation and existing calendar/all-time choices. Five linear Y ticks fit all visible recorded page positions with round page increments; no planned or issued work creates points. Weekly desktop / fortnightly phone grid lines and fewer regularly spaced date labels preserve readability. The source history and student configuration are unchanged. Guidance: https://service-manual.ons.gov.uk/data-visualisation/guidance/axes-and-gridlines (cropped line axes, round intervals and responsive grid density); five labels and faint vertical guides are Centerflow choices.


Progress chart consistency: all four previews and expanded panels default to eight weeks. Previews share 210px chart frames (expanded maximum 310px), five value ticks, horizontal unit titles, right-aligned numeric labels with a separate plot gutter, and four fortnightly date labels. The homework outcome legend occupies the same corner summary box as Skills. Academic and Skills share calendar-day coordinates and one responsive calendar tick policy: daily grids for a week, weekly for a month/eight weeks, fortnightly for a quarter, then aligned calendar months (coarsened at longer spans or narrower widths). Label density is independent of record count and never creates data points. Both bar charts use daily buckets for a week/month, weekly for eight weeks through six months, monthly for a year; All time adapts to its actual span. Headline totals still use original records and full histories remain available. These are read-only presentation changes; no persisted records, attendance behavior or schema changes. Guidance: https://service-manual.ons.gov.uk/data-visualisation/guidance/axes-and-gridlines and https://nces.ed.gov/statprog/styleguide/pdf/2004606.pdf.

Progress visual refinement: all preview and expanded charts use vertical unit titles beside horizontal numeric labels, preserving shared plot bounds. Homework outcomes use an unboxed horizontal legend above the plot on the right. Preview skill summaries remain centered for one, two or three pinned skills. Academic progress has a muted 9% area fill beneath its existing straight line. Homework amber is darkened for improved contrast against white; records and calculations are unchanged.
