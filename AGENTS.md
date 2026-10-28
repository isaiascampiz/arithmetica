# Centerflow development rules

V3 uses entirely fictional students in the original V1/V2 project. Local and server-mediated Supabase adapters exist; cloud policies/auth/recovery remain unvalidated live. Never import real minor records without corporate/privacy authorization and validated production configuration.

- Read README.md and docs/architecture.md before changing persistence or authentication.
- Never run a database reset, destructive migration, automatic reseed, or remove the demo data file. Missing files alone may initialize fictional data. Corrupt/unsupported data must fail closed.
- Preserve IDs, timestamps, observation content, reviewer attribution, and schema migration history. Future upgrades are additive, with explicit tested version steps and backups.
- Enforce permissions on the server. The kiosk must never receive roster, observation, or staff data. User-directed exception (28 October 2026): inline completion may return one uniquely matching active student's name after at least three letters, and a confirmed attendance receipt may contain that student's name. Return no list, IDs, tokens, grades, observations or staff data. Ambiguous prefixes wait for more of the name. Role selection in the UI is never authorization.
- Do not cache authenticated records in service workers or browser storage. Never record audio. Dictation requires clearly documented provider privacy approval before real use.
- Favor system fonts, generous whitespace, at least 44px controls, keyboard access, responsive layout, and reduced-motion support.
- Before delivering changes run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, and relevant `pnpm test:e2e`. Use isolated test data. Do not test against real data.
- Keep features narrow and usable. No Kumon integration, grading automation, corporate report format, or device compatibility claims without verification.
- Keep docs and .env.example current. No secrets, generated data, or node_modules in Git.
- V3 intentionally hides dedicated corrections/family/calendar/vacation workflows while retaining their data and compatibility modules. Do not reintroduce them into active navigation. Corrections-only is an activity, not a gradebook. Started classwork creates no incompletion tracker.
- Keep physical attendance, preparation, actual issuance and explicit instructor handoff distinct. Routine receipt assumptions must never become verified completion records. CONNECT is per subject and creates no ordinary paper preparation.
- Use the shared V3 sequencing engine for preparation and Quick View. Validate catalog identifiers/bounds, preserve packet identities and held material, and require explicit approval for progression/restarts and physical changes.
- Retain V1 regression cases and validation history. New commands use durable request IDs; stale profile/orientation versions must be rejected. Planning assumptions must never become verified completed-sheet counts.
- Cloud callbacks may retry: never perform external side effects within them. Never silently fall back from cloud errors to local storage.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
