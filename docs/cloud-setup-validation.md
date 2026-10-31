# Centerflow cloud setup validation

Validated on October 15, 2026 (America/Los_Angeles; host UTC October 16). Commands ran in `/workspace/centerflow` on the Codex cloud machine, not on the Windows migration computer. Only fictional local data was used. No Supabase credentials, production data, live database migrations, or Windows localhost services were used.

## Cloud host and tools

- Debian GNU/Linux 13.6 (trixie), Linux x86_64, kernel `6.18.44`.
- Host identifier during execution: `e71a9774a905`.
- Node `v24.20.0`; pnpm `11.25.0`; Next.js `16.4.0`; Playwright `1.64.0`.
- Debian Chromium `154.0.8037.57`, `/usr/bin/chromium`, with installed Linux system libraries. The existing suite ran headlessly with one worker.
- About 32 GiB available memory and 30 GiB available disk before installation. Next used four page-generation workers; Playwright used its configured single worker.

The host initially had Node 24.19.0. Node 24.20.0 was downloaded over verified HTTPS from the official Node distribution host; the Linux x64 archive passed the matching official `SHASUMS256.txt` check. TLS, checksums, package integrity, and pnpm supply-chain checks remained enabled.

```bash
mkdir -p /workspace/tools/downloads /workspace/validation
cd /workspace/tools/downloads
curl -fsSLO https://nodejs.org/dist/v24.20.0/SHASUMS256.txt
curl -fsSLO https://nodejs.org/dist/v24.20.0/node-v24.20.0-linux-x64.tar.xz
rg ' node-v24.20.0-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum -c -
tar -xJf node-v24.20.0-linux-x64.tar.xz -C /workspace/tools
export PATH=/workspace/tools/node-v24.20.0-linux-x64/bin:$PATH
npm install --prefix /workspace/tools/pnpm-11.25.0 --cache /workspace/tools/npm-cache --no-audit --no-fund pnpm@11.25.0
```

Reusable activation is `/workspace/tools/centerflow-env.sh`:

```bash
export PATH=/workspace/tools/node-v24.20.0-linux-x64/bin:/workspace/tools/pnpm-11.25.0/node_modules/.bin:$PATH
export DEMO_MODE=true DATA_ADAPTER=local PRODUCTION_DATA_APPROVED=false ENABLE_SCHEDULER=false ALLOW_CLOUD_PROVISION=false NEXT_TELEMETRY_DISABLED=1
```

## History import and source preservation

`git fetch origin main` returned bootstrap commit `0aee0e044e6ceb9636a5bba721e319d97cd392c3`. The previously unborn checkout was switched to that exact commit on `main`. Transfer documents were read as data. The 48 `.migration/part-*.b64` files were concatenated in filename order and base64-decoded into `/tmp/centerflow-import.bundle`, outside the checkout.

- Bundle size: **3,641,994 bytes**, matching the supplied size.
- Bundle SHA256: **337cba147c27cfd7b56e97fe022f5002aaa3c74a87b2785ac25c12a31aef77a5**, matching the supplied digest.
- `git bundle verify /tmp/centerflow-import.bundle`: exit 0; complete history; no prerequisites.

```bash
git fetch /tmp/centerflow-import.bundle \
  main:refs/heads/import/original-main \
  refs/tags/v3.0.0-baseline:refs/tags/v3.0.0-baseline
git merge --allow-unrelated-histories --no-edit import/original-main
```

Merge commit `8b5566d` retains both histories. The following original commits are ancestors of `main`, verified individually with `git merge-base --is-ancestor <commit> HEAD`:

| Original checkpoint                   | Exact commit                               |
| ------------------------------------- | ------------------------------------------ |
| V3 baseline and `v3.0.0-baseline` tag | `46162816c6b6b71e11076551b1f4c9e2e88a110b` |
| Organized preserved application       | `ed57c9c78097aa17f3c9b488951c710ff814b2c4` |
| Prepared original main                | `4a6464669382de28781db24bcb709c7dcda4dab8` |

The bootstrap commit is also an ancestor. Source comparison against `import/original-main` passed with no differences for `src/`, `tests/`, `supabase/`, `scripts/`, `public/`, dependency declarations, lockfile, and application configuration. No application redesign or behavior changes were made. The temporary 48 parts and two import documents were removed in ordinary cleanup commit `73ba23032421cc47a46c2f6b741e23a1b43f57d2` after verification. Their presence in historical bootstrap commits is intentional; history was not rewritten.

`git push origin main refs/tags/v3.0.0-baseline` succeeded using the platform's existing authorized HTTPS Git identity, without force-push or credential output. `git ls-remote origin refs/heads/main refs/tags/v3.0.0-baseline` confirmed the pushed main and original tag. The subsequent documentation commit preserves the same ancestry and application tree.

## Installation, build and unit checks

```bash
cd /workspace/centerflow
source /workspace/tools/centerflow-env.sh
set -o pipefail
bash scripts/setup-development.sh 2>&1 | tee /workspace/validation/setup-development.log
```

The checked-in setup script ran unchanged and exited 0:

| Executed command                                                                     | Result                                                                                       |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile --store-dir .pnpm-store`                             | Passed; 380 packages; lockfile unchanged; supply-chain policy check passed for 464 entries   |
| `DEMO_MODE=true DATA_ADAPTER=local PRODUCTION_DATA_APPROVED=false pnpm demo:restore` | Restored 96 fictional students at schema 3                                                   |
| `pnpm build`                                                                         | Passed; optimized Next production build completed, including route generation and TypeScript |
| `pnpm typecheck`                                                                     | Passed; `tsc --noEmit`, exit 0                                                               |
| `pnpm lint`                                                                          | Passed; `eslint .`, exit 0                                                                   |
| `pnpm test`                                                                          | **94 passed, 0 failed, 0 skipped, 0 cancelled**                                              |

Logs remain outside Git under `/workspace/validation/`. Generated dependencies, data, builds, traces, and runtime configuration remain ignored or outside the checkout.

## Independent demo reconstruction and non-overwrite verification

Executed `node /workspace/validation/verify-demo.cjs` with the activation above; exit 0. Its independent assertions checked the JSON contents, not only the restoration command's output:

1. `data/demo-v1.json` has schema 3, exactly 96 students, 96 unique IDs, and every `demo-student-1` through `demo-student-96`.
2. Running `pnpm demo:restore` again leaves the default file's SHA256 and modification time unchanged.
3. `pnpm demo:restore data/restore-drills-cloud-rb7o1H/fresh.json` reconstructs all 96 expected identities into a previously nonexistent file. A repeat run leaves its SHA256 and modification time unchanged.
4. A separate fictional copy with one student omitted is rejected by `pnpm demo:restore data/restore-drills-cloud-rb7o1H/incomplete.json` with expected exit 1. Its SHA256 remains unchanged. This negative check is expected, not a failed setup check.
5. The original default data remains unchanged throughout. No existing data file was removed or overwritten.

The verification log is `/workspace/validation/demo-restore-verification.log`. Restore-drill files remain in ignored `data/`; they were not committed.

## Linux Chromium browser checks

`pnpm exec playwright install chromium` was attempted with `PLAYWRIGHT_BROWSERS_PATH=/workspace/tools/ms-playwright` and failed with HTTP 403 `Domain forbidden` for `cdn.playwright.dev`. The requested Playwright browser was Chrome for Testing 156.0.8078.4 (revision 1248). That download was not used or represented as installed. No network policy was broadened to work around the denial.

The preinstalled Debian Chromium 154.0.8037.57 and required libraries work. A local external config at `/workspace/validation/playwright-cloud.config.cjs` imports the existing repository config and changes only browser executable selection and the absolute paths needed by the external config:

```javascript
const { createRequire } = require('node:module');
const requireProject = createRequire('/workspace/centerflow/package.json');
const { defineConfig } = requireProject('@playwright/test');
const base = require('/workspace/centerflow/playwright.config.ts').default;
module.exports = defineConfig({
  ...base,
  testDir: '/workspace/centerflow/tests/e2e',
  outputDir: '/workspace/centerflow/test-results',
  webServer: { ...base.webServer, cwd: '/workspace/centerflow' },
  projects: base.projects.map((project) => ({
    ...project,
    use: {
      ...project.use,
      channel: undefined,
      launchOptions: { executablePath: '/usr/bin/chromium' },
    },
  })),
});
```

`pnpm test:e2e --config /workspace/validation/playwright-cloud.config.cjs --list` discovered **21 tests in four files**. The first full invocation ran all 21 and returned **20 passed, 1 failed**. The failure occurred before the kiosk workflow: login returned HTTP 429, confirmed in the Playwright network trace and the “Too many attempts” page. The app deliberately limits the shared login bucket to 20 requests per minute (`src/app/api/auth/route.ts`, `src/lib/auth.ts`); the fast suite accumulated too many logins in one server process. No limit or assertion was disabled.

The cloud execution procedure starts a fresh Playwright-managed server process per spec file, preserving the same fictional `data/e2e-v3.json` file and every original test. Exact command:

```bash
cd /workspace/centerflow
source /workspace/tools/centerflow-env.sh
set -euo pipefail
for spec in resilience scanner-sync v2-workflows workflows; do
  pnpm test:e2e --config /workspace/validation/playwright-cloud.config.cjs \
    "tests/e2e/$spec.spec.ts" --output "test-results/cloud-$spec" \
    2>&1 | tee "/workspace/validation/playwright-$spec.log"
done
```

All four invocations exited 0, with **21 passed, 0 failed, 0 skipped** in total:

| Spec                   | Executed / passed | Runner duration |
| ---------------------- | ----------------- | --------------- |
| `resilience.spec.ts`   | 2 / 2             | 5.0 s           |
| `scanner-sync.spec.ts` | 2 / 2             | 6.0 s           |
| `v2-workflows.spec.ts` | 12 / 12           | 1.0 min         |
| `workflows.spec.ts`    | 5 / 5             | 44.0 s          |

Each current-run `test-results/cloud-<spec>/.last-run.json` independently reports `status: passed` and an empty `failedTests` list. The original kiosk case passed in 33.2 seconds, including its real debounce wait. These are all 21 discovered tests; none was filtered out or skipped.

The initial failure artifacts were preserved outside Git at `/workspace/validation/first-browser-run-results`, and its log is `/workspace/validation/playwright-tests.log`. Test names that mention iPad/phone describe emulated viewports in Linux Chromium; this is not a physical iPad, Safari, or phone compatibility claim.

## Application startup and functional request

```bash
cd /workspace/centerflow
source /workspace/tools/centerflow-env.sh
pnpm start --port 3000
```

A Node HTTP smoke check against this cloud-host process verified:

- `GET /login`: HTTP 200 and the expected sign-in form.
- Anonymous `GET /api/state`: HTTP 401.
- `POST /api/auth` using the checked-in fictional owner sign-in and matching local Origin: HTTP 200.
- Authenticated `GET /api/state`: HTTP 200, exactly 96 unique fictional students.

The cookie was held only in the smoke-check process and never logged. Playwright independently launched the optimized application on cloud-host loopback port 3100 and exercised the real routes. Neither service accessed the user computer. Onboarding does not supply a user-facing web preview.

## Reusable environment configuration and publication

The environment draft successfully saved complete **`install_script`** and **`start_skill`** fields. The tool returned `status: saved` and `requires_publish: true`. No network, secret, or unrelated configuration fields were changed.

The install script provisions the pinned tools outside the checkout, writes the safe activation and external Playwright config, checks the existing system Chromium, and executes the original setup script. Its exact saved contents were also executed as:

```bash
cd /workspace/centerflow
set -o pipefail
bash /workspace/validation/install.sh 2>&1 | tee /workspace/validation/reusable-install-repeat.log
```

This repeat exited 0: locked installation was already up to date, all 96 existing demo students were preserved with no write, build/typecheck/lint passed, and all 94 unit tests passed again with no failures or skips. Rebuilding was necessary here to exercise the complete reusable install script; it reused valid cached build artifacts.

The start instructions activate the exact tools and fictional local flags, use the existing isolated checkout without creating a worktree, restart `pnpm start --port 3000`, verify login/access control and the demo identities with actual HTTP requests, and provide the full 21-test per-spec Chromium procedure. The server was stopped and restarted using only the process tree started by this setup; the saved HTTP smoke check passed after the repeat installation. The current cloud instance has the app running, but future tasks must restart it.

Saving the draft did not itself execute scripts, publish the environment, change sharing, or prove restoration into a new task. The prepared filesystem and successful checks support this local-fictional development workflow; publication remains a separate product action.

The repository was verified private during its authorized creation; this host verified native Git fetch/push and exact remote refs. Direct metadata access to `api.github.com` failed at the network proxy (CONNECT 403), so privacy was not independently re-read here. The environment configuration tools expose scripts, repositories, networking, and variable requirements, but no sharing/visibility setting. **Verify Only me in environment settings before publication.** No sharing change is claimed.

Publication and a fresh task restored from the published snapshot are not yet verified. Review the saved configuration, keep the environment private/Only me, and publish through the product UI. A subsequent task should read `AGENTS.md`, activate the saved tools, run a check, and confirm the restored checkout and fictional demo. Live Supabase policy checks remain unrun by design; no production readiness is claimed.

## Published environment: fresh-task verification, October 15, 2026

This section supersedes the pending-publication statements above; earlier setup results remain historical evidence. The user supplied the product UI confirmation **Environment published**, **Only me** sharing, and verified-private `isaiascampiz/centerflow`. Those UI/privacy confirmations are user-reported, not a new metadata API verification. Native Git read/write is verified separately below. No application deployment occurred.

A new task restored `/workspace/centerflow`, `/workspace/tools/centerflow-env.sh`, pinned tools and dependencies, `data/demo-v1.json`, and `/workspace/validation/playwright-cloud.config.cjs`. No worktree or dependency installation was needed. The restored host is `f457d6671116`, distinct from setup host `e71a9774a905`: Debian GNU/Linux 13.6 (trixie), Linux x86_64, kernel `6.18.44`. Node is `v24.20.0`, pnpm `11.25.0`, Next `16.4.0`, TypeScript `5.9.3`, Playwright `1.64.0`, and system Chromium `154.0.8037.57` at `/usr/bin/chromium`.

`AGENTS.md` was read. The saved Start skill itself was not exposed by this task's tools or restored skill directories (executor skill discovery returned no skills). Its recorded instructions in this report and `docs/development.md` were read and followed: use the existing checkout, activate the pinned tools and fictional-local flags, restart the server, and check actual HTTP authorization. This is a visibility limitation, not a claim that the Start skill was independently retrieved. Runtime status reported a running, connected instance, current observations, no configured secrets/runtime variables/outbound identities, and network-policy state `unknown`; no enforced-policy readiness claim is inferred from that status. `/etc/codex/network-policy.json` reported restricted HTTP policy and no VPN configuration.

### Restored history and fictional records

Initial branch was `main`, HEAD `6af0fb5d59047db416be3b68dbe2706505412bfc`; `git status --porcelain=v1` was empty. The baseline tag remains `46162816c6b6b71e11076551b1f4c9e2e88a110b`. Each of the three original commits and bootstrap commit listed above again passed ancestry checks. A comparison with `import/original-main` showed no differences in application source, tests, SQL, scripts, public assets, dependencies, lockfile or the checked application/browser configuration.

The restored default JSON independently contained schema 3 and exactly 96 unique IDs, precisely `demo-student-1` through `demo-student-96`. The saved `verify-demo.cjs` was executed afresh. Repeat `pnpm demo:restore` preserved the default file's SHA256 and modification time. A new ignored drill file at `data/restore-drills-cloud-Hv5srG/fresh.json` reconstructed all 96 identities and its repeat also preserved SHA256/mtime. An incomplete fictional copy was rejected with expected exit 1, unchanged SHA256; the overall verification script exited 0. No existing records were removed or overwritten.

### Actual checks and sandbox failures

| Check executed in this new task               | Final result                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm build`                                  | Passed; optimized build, TypeScript, route generation, exit 0                              |
| `pnpm typecheck`                              | Passed, exit 0                                                                             |
| `pnpm lint`                                   | Passed, exit 0                                                                             |
| `pnpm test`                                   | **94 passed, 0 failed, 0 skipped, 0 cancelled**, exit 0                                    |
| Existing external Playwright config, `--list` | **21 cases in four files**, exit 0                                                         |
| Synthetic camera QR decoder case only         | **1 passed**, 5.0 s overall, system Chromium, fresh Playwright-managed server on port 3100 |
| Cloud-local optimized server on port 3000     | Started successfully; HTTP checks below passed                                             |

Initial command-sandbox attempts failed: build compiled but could not parse TypeScript `--showConfig`; QR smoke could not start its web server; direct startup returned `listen EPERM` on `127.0.0.1:3000`. A child-process probe showed console output missing under that sandbox. The initial unit invocation reported only six file-level passes, so it was not accepted as evidence for 94 cases. An exploratory `pnpm test --test-isolation=none` also failed with unknown `.ts` extension; no test or loader was changed. The ordinary commands were rerun in the approved cloud-host execution context outside the command sandbox, and all final results above passed. No application, dependency or test changes were used to obtain success. Harmless Chromium runner warnings about `NO_COLOR`/`FORCE_COLOR` remained.

Only the requested QR case was run in this task. The earlier full 21-case per-spec success remains documented above; it was not rerun or represented as a new full-suite pass. The fresh server retained the existing separate fictional `data/e2e-v3.json`. The default app data was not used by browser tests.

HTTP requests from this cloud host verified `GET /login` 200 with the expected form; anonymous `GET /api/state` 401; fictional owner `POST /api/auth` 200 with matching loopback Origin; authenticated `GET /api/state` 200 with exactly the expected 96 unique fictional identities. Session cookies stayed in memory and were not printed. No Windows machine, real student records, production credentials, live Supabase migrations or production service was accessed.

### Exact verification commands

Commands ran in `/workspace/centerflow`. Logs are outside Git in `/workspace/work/final-verification/` (final checks use `*-unsandboxed.log`); the HTTP helper is an external copy of the saved helper with explicit length/uniqueness assertions. These files are task evidence, not tracked application changes.

```bash
cd /workspace/centerflow
source /workspace/tools/centerflow-env.sh
uname -a
hostname
cat /etc/os-release
realpath /workspace/centerflow /workspace/tools/centerflow-env.sh \
  /workspace/validation/playwright-cloud.config.cjs
node --version
pnpm --version
pnpm exec next --version
pnpm exec playwright --version
pnpm exec tsc --version
chromium --version
git status --porcelain=v1
git branch --show-current
git rev-parse HEAD refs/tags/v3.0.0-baseline
for commit in \
  46162816c6b6b71e11076551b1f4c9e2e88a110b \
  ed57c9c78097aa17f3c9b488951c710ff814b2c4 \
  4a6464669382de28781db24bcb709c7dcda4dab8 \
  0aee0e044e6ceb9636a5bba721e319d97cd392c3; do
  git merge-base --is-ancestor "$commit" HEAD
done
git diff --exit-code import/original-main -- \
  src tests supabase scripts public package.json pnpm-lock.yaml \
  next.config.ts playwright.config.ts
node /workspace/validation/verify-demo.cjs
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e --config /workspace/validation/playwright-cloud.config.cjs --list
pnpm test:e2e --config /workspace/validation/playwright-cloud.config.cjs \
  tests/e2e/scanner-sync.spec.ts \
  --grep 'real QR decoder reads a synthetic camera stream and releases it' \
  --output test-results/fresh-cloud-qr
pnpm start --port 3000
# In another cloud command with the same activation:
node /workspace/work/final-verification/application-smoke.cjs
git fetch origin main
git ls-remote origin refs/heads/main refs/tags/v3.0.0-baseline
git diff --check
git add -- README.md docs/development.md docs/cloud-setup-validation.md
git commit -m "docs: verify published cloud task restoration"
git push origin HEAD:main
git ls-remote origin refs/heads/main
git status --porcelain=v1
```

The remote main read returned the restored HEAD `6af0fb5d59047db416be3b68dbe2706505412bfc`; the baseline tag matched. Only `README.md`, `docs/development.md` and this appended section are committed for this verification. The documentation commit is pushed normally to `main`, preserving original history, with no force-push. The published environment is verified ready for fictional-data phone coding tasks independent of the user's computer. Each new task must start its own live server; cloud coding readiness does not establish production hosting or live database readiness.
