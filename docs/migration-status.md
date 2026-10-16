# Migration status · October 15, 2026

This task organizes the existing V3 application. It does not redesign, deploy or change application behavior.

## Saved locally

- Working project: `C:\Users\campi\Documents\Codex\centerflow`. Open `Centerflow.code-workspace` in VS Code, or use File > Open Folder.
- Original app remains at `C:\Users\campi\Documents\Codex\2026-10-12\referenced-chatgpt-conversation-this-is-an-2\outputs\center-app`, untouched.
- Complete pre-change snapshot: original workspace `outputs/migration-backup-2026-10-15/centerflow-v3-full-backup.zip`, with SHA256 and file manifest. Verified ZIP integrity; 43,076 regular files and 1,637 recorded Windows link targets. It includes data, configuration, dependency and build files; junctions are recorded rather than recursively duplicated. Keep this backup local.
- Snapshot SHA256: `38cc46615a4acff7e702076d441fb8c76c98ac38364a75e406c199e1776d9130`.
- Local Git `main` has the original V3 baseline commit `46162816c6b6b71e11076551b1f4c9e2e88a110b`, tagged `v3.0.0-baseline`. Organization is saved separately so its changes can be reviewed against the original.

Application files under `src/`, database migrations, assets, original maintenance scripts, package versions and lockfile are unchanged. The folder layout remains the established Next.js structure. New guides identify active V3 modules and retained compatibility code; no historical code was removed.

Three browser test files have only portable fixture/output changes: screenshots now stay under ignored `test-results/` instead of escaping into the previous workspace, and the synthetic scanner uses a fresh fictional identity rather than a student with a previous-day unresolved visit. Existing assertions remain. ESLint now ignores the local dependency download cache; app rules are unchanged. Editor/runtime files and an optional Linux setup script were added.

## Data preservation

The main `data/demo-v1.json` was copied byte-for-byte: **96 students, 77 visits, five observations and 18 legacy homework records**, plus existing operations/history. This is the actual migration-time state, including activity after the earlier V3 release. It is not replaced with a fresh seed.

SHA256: `c12fc2fbd45b7f658f3f0a0092e2cb5b7dad86b48fe67e05f7ff7352de7398ff`. The automated comparison is in `migration-preservation.json`. Tests use separate data; neither main data file is used for browser tests.

Git excludes runtime records, `.env.local`, credential files, dependencies, build output, browser traces and the package cache. The source includes intentionally fictional demo login defaults and fixtures, not private production credentials. A fresh Git clone does not include accumulated local records; source control is not a records backup.

## Validation in the new folder

| Check                                       | Result                                                     |
| ------------------------------------------- | ---------------------------------------------------------- |
| Independent locked dependency installation  | Passed, pnpm 11.25.0 hoisted layout; Node 24.20.0          |
| Production build                            | Passed                                                     |
| Strict TypeScript                           | Passed                                                     |
| ESLint                                      | Passed                                                     |
| Existing unit/domain/recovery suite         | 94 passed, 0 failed                                        |
| Browser regression suite                    | 21 passed, 0 failed; 3.5 minutes against the optimized app |
| Original and copied main data               | Byte-identical                                             |
| Application source / migrations / lockfile  | Unchanged against backup manifest                          |
| Git exclusion and credential-pattern checks | Passed; no actual credentials found by the pattern scan    |

The first browser run revealed old external screenshot paths and an occupied historical scanner fixture. Those test-only migration assumptions were corrected without changing the app or weakening assertions. The final rerun uses the existing retained fictional E2E file without deleting it.

VS Code is installed and the workspace/tasks configuration is prepared. Its CLI printed version 1.141.1 but also reported a sandbox directory-access error; opening its graphical window is not claimed. Open the workspace yourself through VS Code. Git Bash could not start in this sandbox, so Linux setup-script execution/syntax validation is not claimed. Its individual install/build/static/unit commands were run on Windows; Linux/Codex execution remains to be verified.

## Online work not completed

**GitHub:** signed-in account `isaiascampiz` verified; private name `centerflow` available. Automatic approval review rejected clicking Create repository because the attached work order was not accepted as explicit authorization for that destination. No repository creation, push, private visibility verification or remote file comparison has occurred. No verified repository link is presented.

**Codex Cloud:** signed in and environment picker inspected. No Centerflow environment exists/published in the inspected picker; no cloud task or cloud tests were run. Completion depends on private repository publication, repository access and a successfully prepared/published environment. Follow `development.md` after direct approval.

**Cloudflare:** compatibility notes only in `cloudflare.md`. No adapter installation, database replacement or deployment occurred. Physical devices, live Supabase and production/privacy gates from the original release remain unvalidated.

Required next approval: create **private `isaiascampiz/centerflow`** and upload the prepared source Git history, excluding runtime data and credentials. Any additional GitHub app access grant must be scoped and reviewed when presented. Phone tasks become usable only after the environment is published and a cloud test task actually succeeds.
