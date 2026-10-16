# Local development, GitHub and Codex Cloud

## Actual connection status

Local Git is initialized and the V3 baseline is committed. Following direct user authorization, [isaiascampiz/centerflow](https://github.com/isaiascampiz/centerflow) was created and verified private. Publication of the prepared Git history is in progress. The Windows sandbox denied credential-manager access, so the authorized cloud setup is being used to import the credential-free Git history bundle instead of exposing or copying credentials.

Codex Cloud can see the private repository and its setup conversation has started. Environment publication and an independent cloud build/test run are still pending verification. The earlier local migration report records the checkpoint before repository authorization.

## VS Code

Open this folder or `Centerflow.code-workspace`. `.vscode/` recommends ESLint and Prettier, points TypeScript at the project version and supplies Terminal > Run Task commands. It does not install extensions or alter app behavior. Formatting on save is off to prevent unrelated changes while exploring.

Node 24.20.0 and pnpm 11.25.0 were validated. `.nvmrc` and `.node-version` document Node for compatible version managers. Dependencies are pinned by `pnpm-lock.yaml`. The working copy uses pnpm's hoisted dependency layout because the sandbox denied Windows symlinks; Linux can use the standard layout. The app and lockfile are unchanged.

## Finish GitHub publication after direct approval

1. Create `isaiascampiz/centerflow` as **Private**, without auto-generated README/license/gitignore; local history already contains project files.
2. Add the actual URL as `origin` and push `main` and the local `v3.0.0-baseline` tag using authenticated Git. Do not force-push or overwrite an unexpected existing repository.
3. Read remote metadata to confirm privacy. Fetch the remote and compare its `main` commit/tree with local history. Inspect README, source, lockfile, tests and SQL. Only then call publication complete.
4. Confirm Git contains no `data/`, `.env.local`, credentials, dependencies, builds or browser traces. Fictional default sign-ins in application/tests are examples, not production secrets.

The working folder retains accumulated fictional records locally; the repository intentionally excludes them. A clone generates fresh fictional data when missing. Transfer exact history only through a separately authorized records backup/restore process, not Git.

For development, `pnpm demo:restore` reconstructs all 96 fictional demo identities from `src/lib/seed.ts`, then applies existing forward migrations. It never overwrites a file. A repeat run checks the expected identities and preserves existing history. It refuses production and Supabase modes. To test separately, pass a new path inside `data/`, such as `pnpm demo:restore data/restore-drills/my-demo.json`. Runtime JSON remains ignored by Git.

## Prepare a cloud environment after publication

The current official flow is Settings > Codex Cloud > Environments > Create environment, or Work in > Cloud > Select environment > Create environment. Choose only the private Centerflow repository. Keep sharing private/Only me unless you explicitly authorize others. If a new GitHub app permission grant is needed, review its scope rather than granting all repositories.

Ask the environment setup conversation:

> Prepare Centerflow without changing behavior. Use Node 24.20.0 and pnpm 11.25.0. Run `bash scripts/setup-development.sh` from the repository root. For browser validation install Playwright Chromium and system dependencies, then run the existing browser suite. Use fictional local data only, no cloud database credentials or live migrations. Report actual results before publishing the environment.

The checked-in script installs locked dependencies, builds and runs static/unit checks. Browser installation needs package/browser download access; configure the environment's network policy for the hosts it actually requires. No production secret is needed. **This script is prepared, not executed in Codex Cloud yet.**

For cloud preview use `DEMO_MODE=true`, `DATA_ADAPTER=local`, `ENABLE_SCHEDULER=false`, then `pnpm dev --hostname 0.0.0.0`. Follow that environment's preview URL; a localhost link on your phone does not point into the container. Use a generated environment-only session secret when sharing an approved preview. Keep real data and production service keys out of coding environments.

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
