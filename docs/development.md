# Development

## Setup

Use Node **24.20.0** and pnpm **11.25.0**, pinned by `.node-version`, `.nvmrc`, and `package.json`. Use `corepack pnpm` when `pnpm` is not on PATH. Open the folder or `Arithmetica.code-workspace` in VS Code.

```sh
corepack pnpm install --frozen-lockfile --store-dir .pnpm-store
```

On Windows, add `--node-linker=hoisted` if symlink permissions prevent installation. Copy `.env.example` to `.env.local` only when no local configuration exists. Keep fictional local mode enabled.

## Commands

| Command                             | Purpose                                                          |
| ----------------------------------- | ---------------------------------------------------------------- |
| `pnpm dev`                          | Local development at `http://127.0.0.1:3000`                     |
| `pnpm build` / `pnpm start`         | Build and serve the optimized Node app                           |
| `pnpm lint` / `pnpm typecheck`      | ESLint and TypeScript checks                                     |
| `pnpm format:check` / `pnpm format` | Check or apply consistent formatting                             |
| `pnpm test`                         | Unit and domain regression tests                                 |
| `pnpm test:e2e`                     | Browser workflows with isolated fictional data                   |
| `pnpm repo:check`                   | Scan publishable files for private paths and credential patterns |
| `pnpm repo:check --history`         | Include locally reachable Git history in that scan               |
| `pnpm benchmark`                    | In-memory fictional performance workload                         |

Build before typechecking on a fresh checkout. Run the checks in [CONTRIBUTING.md](../CONTRIBUTING.md) before submitting changes.

## Browser tests

The runner owns a new server on port 3100, refuses occupied ports, and creates unique `data/e2e-runs/<run ID>/state.json` records. Existing demo and test records are retained. Failure screenshots/traces go to `test-results/runs/<run ID>/`.

Windows uses installed Chrome. Linux needs `corepack pnpm exec playwright install --with-deps chromium`. To choose another port in PowerShell:

```powershell
$env:ARITHMETICA_E2E_PORT = '3110'
corepack pnpm test:e2e
```

`ARITHMETICA_E2E_DATA_PATH` and `ARITHMETICA_E2E_OUTPUT_DIR` allow explicit isolated test paths. With `E2E_EXTERNAL_SERVER=true`, server and helpers must use the same fictional data file. Legacy `CENTERFLOW_E2E_*` aliases remain supported; Arithmetica names take precedence.

## Records and configuration

Never remove or overwrite `data/demo-v1.json` to refresh a demo. Only a missing file may initialize fictional data; invalid data fails closed. `pnpm demo:restore` is a manual fictional-fixture recovery tool that refuses production/cloud mode and preserves a complete existing demo.

Runtime files, workbooks, exports, credentials, and backups belong in ignored private storage. Source checkpoints do not back up records. Use the documented [operations](operations.md) and [recovery](deployment-and-import-plan.md) procedures.

Cloud coding environments need no production credentials. `bash scripts/setup-development.sh` is an optional Linux helper. Keep access private when an environment contains private configuration. Earlier machine-specific setup evidence remains in [history](history/development-2026-10-29.md) and [cloud validation](cloud-setup-validation.md).

## Naming

Use **Arithmetica** for the product, `arithmetica` for repository/package names, and lowercase kebab-case filenames. Group interface modules by feature and use direct imports. Stored schema versions, database identifiers, printed `CF-` pouch codes, and preference/cookie keys remain compatibility contracts; read [compatibility](compatibility.md) before changing them.

The checkout directory may have any name. Renaming it does not change app behavior. Close running tools before moving a checkout, and preserve its ignored data and configuration.
