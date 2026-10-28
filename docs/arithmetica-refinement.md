# Arithmetica refinement

28 October 2026.

Traffic uses seven visible hourly columns (all 24 hours remain reachable by horizontal scrolling), all seven weekdays, calendar-month days and twelve calendar-year months. The daily summary groups day and selected-hour arrivals against matching-weekday estimates; these are not occupancy counts. Search, totals and the optional punch list share one date scope. Monthly/yearly show recorded check-ins only.

Subject editing uses Enrolled, Learning mode, Current level, Current/Starting worksheet and Worksheets per day. Unenrollment hides values while retaining the saved configuration and history. An optional, validated `dailyWork` version 1 policy represents a daily worksheet allocation with ten-sheet standard packets. Newly planned homework ranges follow ten-sheet boundaries, including smaller portions; existing issued/prepared material and legacy policies remain unchanged until an explicit edit and required review. No automatic data conversion or reseed occurs.

As explicitly requested by the user, POST `/api/kiosk/name` and `/api/reception/name` return only `{ completion: name | null }` after three normalized letters. A unique active match completes inline; ambiguous prefixes wait for a surname. No roster array, ID, token, grade or private record is returned. The same-origin, authenticated, throttled responses are `no-store`. Confirmed durable attendance receipts may include that student’s name. This narrow disclosure exception does not approve real-student deployment or replace the existing privacy/configuration gates.

Reception uses a quiet scan signal and a named receipt with a one-time check/opacity sequence, plus an opacity-only reduced-motion variant. The geometric brand is a flat dissected-square mark. `scripts/ui-showcase.ts` creates a separate, uniquely named fictional file with exclusive-create semantics; it never opens or replaces existing center data. Run only with explicit `DEMO_MODE=true`, `DATA_ADAPTER=local`, and no production approval.

Validation: lint, typecheck, 229 unit tests, production build and 65 distinct Chromium checks pass. Physical iPad/Safari, Bluetooth pairing and slow DevTools motion replay remain unverified. Main preview: port 3001 with the preserved center file. Separate fictional preparation showcase: port 3002. Both are local previews and require the host computer to remain running.
