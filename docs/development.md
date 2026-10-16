# Local development, GitHub and Codex Cloud

## Actual connection status

The original V3 history has been imported into [isaiascampiz/centerflow](https://github.com/isaiascampiz/centerflow), merged with the bootstrap history without rewriting either history, and pushed with `v3.0.0-baseline`. All three original commit IDs remain ancestors of `main`. The repository was verified private during its authorized creation. On this cloud host, native HTTPS Git fetch and push work through the existing platform identity; no credentials were copied or printed. The available metadata API route is blocked, so repository privacy was not independently re-read here.

The Linux cloud host has Node 24.20.0, pnpm 11.25.0, locked dependencies, a restored 96-student fictional demo, and a working production server. See [the cloud validation report](cloud-setup-validation.md) for exact checks, browser configuration, and outcomes. These commands executed inside the cloud machine, independently of the Windows computer. Environment publication and restoration into a new task have not been performed. The configuration tools do not expose environment sharing; verify **Only me** in environment settings before publishing.

## VS Code

Open this folder or `Centerflow.code-workspace`. `.vscode/` recommends ESLint and Prettier, points TypeScript at the project version and supplies Terminal > Run Task commands. It does not install extensions or alter app behavior. Formatting on save is off to prevent unrelated changes while exploring.

Node 24.20.0 and pnpm 11.25.0 were validated. `.nvmrc` and `.node-version` document Node for compatible version managers. Dependencies are pinned by `pnpm-lock.yaml`. The working copy uses pnpm's hoisted dependency layout because the sandbox denied Windows symlinks; Linux can use the standard layout. The app and lockfile are unchanged.

## Preserved GitHub publication

The authorized import is complete. `main` contains both bootstrap and original application history, and `v3.0.0-baseline` still points to `46162816c6b6b71e11076551b1f4c9e2e88a110b`. No force-push was used. Temporary transfer files were removed in a normal commit after bundle integrity and source/history verification. Application source, tests, SQL, scripts and lockfile remain identical to the imported original main. New setup documentation records the cloud evidence without changing app behavior.

The working folder retains accumulated fictional records locally; the repository intentionally excludes them. A clone generates fresh fictional data when missing. Transfer exact history only through a separately authorized records backup/restore process, not Git.

For development, `pnpm demo:restore` reconstructs all 96 fictional demo identities from `src/lib/seed.ts`, then applies existing forward migrations. It never overwrites a file. A repeat run checks the expected identities and preserves existing history. It refuses production and Supabase modes. To test separately, pass a new path inside `data/`, such as `pnpm demo:restore data/restore-drills/my-demo.json`. Runtime JSON remains ignored by Git.

## Prepare a cloud environment after publication

The current official flow is Settings > Codex Cloud > Environments > Create environment, or Work in > Cloud > Select environment > Create environment. Choose only the private Centerflow repository. Keep sharing private/Only me unless you explicitly authorize others. If a new GitHub app permission grant is needed, review its scope rather than granting all repositories.

Ask the environment setup conversation:

> Prepare Centerflow without changing behavior. Use Node 24.20.0 and pnpm 11.25.0. Run `bash scripts/setup-development.sh` from the repository root. For browser validation install Playwright Chromium and system dependencies, then run the existing browser suite. Use fictional local data only, no cloud database credentials or live migrations. Report actual results before publishing the environment.

The checked-in script installs locked dependencies, builds and runs static/unit checks. Browser installation needs package/browser download access; configure the environment's network policy for the hosts it actually requires. No production secret is needed. **This script has now executed successfully on the Linux cloud host.** The full browser run needs the system Chromium override and per-file server isolation documented in [cloud validation](cloud-setup-validation.md).

For this onboarding environment, source `/workspace/tools/centerflow-env.sh`, then run `pnpm start --port 3000` from `/workspace/centerflow` after a successful build. Use internal HTTP requests to verify `/login` and authenticated `/api/state`; this onboarding UI does not provide a web preview. Live processes must restart after snapshot restoration. Keep real data and production service keys out of coding environments.

Review the setup report, then Publish. Verify the interface actually says Environment published. Run a small read-only task that reads AGENTS.md and reports a test result. Until those checks succeed, phone development is not proven ready.

## Tasks from a phone

After publication, open Codex on mobile, select the **published cloud environment** and submit one concrete task. A safe first example is “Read AGENTS.md and explain the Home roster code; do not change files.” Later request a branch, narrow change, tests and a reviewable diff. Review before merging; cloud work does not automatically update a local checkout. Pull approved commits in VS Code before your next local change.

Cloud tasks can continue while your computer is off. Local tasks and the local app preview still depend on that computer. Cloud coding is separate from hosting the app for students.

Official source checked October 15, 2026: [OpenAI cloud environment documentation](https://learn.chatgpt.com/docs/environments/cloud-environments). Account availability and policy may vary.

## Configuration

`.env.example` is the safe template. Actual values belong in ignored `.env.local` or a hosting secret manager. Next loads `.env.local`; maintenance scripts require exported variables or `node --env-file=.env.local scripts/run-ts.cjs scripts/backup.ts`.

| Purpose                          | Existing settings                                                                                                 |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Fictional local development      | `DEMO_MODE`, `DATA_ADAPTER=local`, `DEMO_DATA_PATH`, `CENTER_TIMEZONE`                                            |
| Real-data approval gate          | `PRODUCTION_DATA_APPROVED` (leave false without approval)                                                         |
| Sessions/public URL              | `SESSION_SECRET`, `APP_ORIGIN`, `COOKIE_SECURE`                                                                   |
| Optional demo password overrides | `DEMO_OWNER_PASSWORD`, `DEMO_INSTRUCTOR_PASSWORD`, `DEMO_ASSISTANT_PASSWORD`                                      |
| Jobs                             | `ENABLE_SCHEDULER`, server-only `JOBS_SECRET`                                                                     |
| Supabase                         | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY`, `CENTER_ID` |
| Empty-project provisioning gate  | `ALLOW_CLOUD_PROVISION` (normally false)                                                                          |

See `operations.md` for the existing cloud adapter and recovery procedure. Never paste production credentials into source files or task descriptions.
