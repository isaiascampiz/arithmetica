# Arithmetica

Arithmetica is the application identity for this existing Centerflow project. The visual system follows the inspected Wispr Flow Windows app and website: Figtree controls, compact row-based settings, account/theme menus, underlined subject tabs and restrained overlays. The center is displayed as **Kumon Learning Center · Yuba City**. See the [reference audit](docs/wispr-ui-reference-audit.md) and [current refinement specification](.plans/arithmetica-continuous-ui-spec.md).

General contains theme, observation shortcuts and the owner’s Homework switch. Rarely changed center details are separate; staff coverage, medal visibility, reception timing and report scheduling are absent from active settings. Home provides direct check-in for expected students. Roster and preparation share search/sort menus; roster filters omit enrollment status. Insights uses enclosed gray/teal arrival gauges, with no calendar or notifications. Quick View uses full-width subject tabs and matching two-line packet tiles. Reports reveal student detail on request. **Open kiosk** opens an authenticated reception view whose brand returns Home; **Lock for shared use** pairs the isolated public kiosk and clears staff cookies. QR and exact full-name entry share attendance protection. Pouch labels retain existing identifiers and print at 2 × 2 inches.

Centerflow V3 helps a learning center manage arrivals, instructor handoffs, homework packets and student observations. This is the existing working application, preserved during organization. **All included students and sample sign-ins are fictional. Real student data is not authorized.**

Start here, then explore [the code guide](docs/code-guide.md). You do not need to understand every file at once.

## Your tools

- **Git** records checkpoints on your computer. A branch is a separate line of work; a commit is a saved checkpoint.
- **GitHub** is the private online home for those checkpoints: [isaiascampiz/centerflow](https://github.com/isaiascampiz/centerflow). The authorized source and original Git history are now pushed, including the V3 baseline tag. Privacy was verified during repository creation; this cloud host verified Git read/write access. GitHub does not run the app or automatically back up student records.
- **VS Code** is your local editor. Open this folder, or double-click `Centerflow.code-workspace`. Explorer shows files; Terminal runs commands; Source Control shows proposed changes.
- **Codex** helps read and edit the same code. Local tasks require your computer. A separately published **Codex Cloud** environment can run tasks without it. The setup UI confirmed **Environment published** with **Only me** sharing. A fresh cloud task restored this project and passed build, typecheck, lint, all 94 unit tests, the synthetic QR browser smoke and authorized HTTP checks without the Windows computer. It is ready for fictional-data phone coding tasks. See [cloud validation](docs/cloud-setup-validation.md).

## Start and stop

Use Node **24.20.0** and pnpm **11.25.0**, the tested versions. Install Node from its official website and pnpm with `npm install -g pnpm@11.25.0` if needed. Git and VS Code are already installed on the migration computer.

Open a terminal **inside this folder**:

```powershell
pnpm install --frozen-lockfile --store-dir .pnpm-store
```

If Windows reports a symlink permission error, use this equivalent dependency layout:

```powershell
pnpm install --frozen-lockfile --store-dir .pnpm-store --node-linker=hoisted
```

Keep the lockfile; do not upgrade dependencies during ordinary setup. On a fresh clone, copy `.env.example` to `.env.local` once. Do not overwrite an existing configured file. The migration working copy retains its `data/` directory. Defaults use fictional local data without cloud credentials.

```powershell
pnpm dev
```

Open [the local preview](http://127.0.0.1:3000). Stop it with **Ctrl+C** in that terminal. For the optimized version, stop development first, then run `pnpm build` followed by `pnpm start`. A second copy can use `pnpm start --port 3001` if port 3000 is occupied. Preview links work only while that server runs on this computer.

The login screen uses one staff sign-in form with fictional owner credentials in demo mode; additional test accounts remain server-authorized. See [operations](docs/operations.md) for test defaults, configuration, backups and existing deployment guidance. These examples are not private production passwords; never reuse them for real access.

Traffic is one attendance card with Daily, Weekly, Monthly and Yearly ranges. Daily/Weekly retain a matching-weekday comparison; longer ranges show actual check-ins. Student search updates the graph, totals and optional punch list together. Reports show Visits, Observations recorded/not recorded, and Verified completed worksheets, with one continuous panel and section buttons switching the list. Scheduled daily/weekly/monthly archives remain preserved. Only monthly Excel export is offered: student, grade, subject, last verified level/worksheet, verified worksheets and ten-sheet packet equivalents. Receipt assumptions and planned packets are excluded. See [reporting and verification](docs/operations.md#reports-and-verified-completions).

The workspace opens dark and retains Light/Dark/System control. Profile editors use compact settings-style dialogs. Roster and preparation share identical toolbar/filter components; Home shows actual preparation state. Reception shows QR-reader scanning and full-name entry on one page; readers use keyboard/HID mode with an Enter suffix after OS pairing. Camera access requires HTTPS or localhost. No physical scanner or iPad compatibility claim is made without testing that device. See the [current design brief and implementation notes](.plans/arithmetica-continuous-ui-spec.md).

## Folder map

```text
centerflow/
  src/
    app/                 Next.js pages, HTTP API routes and global styles
      page.tsx           Signed-in entry; loads the staff workspace
      api/               Server endpoints: state, commands, sign-in, kiosk, reports
    components/          React screens and reusable interface pieces
    lib/                 Data types, business rules, planning, storage and security
      seed.ts            Fictional starter data, used only for a missing data file
      repository.ts      Local-file or Supabase storage boundary
  public/                Icons, PWA manifest and generic offline page
  tests/                 Unit tests; e2e/ contains browser workflows
  supabase/              Ordered SQL migrations and manual access-control checks
  scripts/               Build, test, backup and isolated restore commands
  docs/                  Learning guide, operations, architecture and validation
    history/             Earlier release documentation, kept for context
    screenshots/         Fictional release evidence, not live student data
  data/                  Local records, backups and test data; NEVER committed
  .vscode/               Optional editor recommendations and runnable tasks
  .env.example           Empty configuration template; safe to commit
  .env.local             Private configuration, if created; NEVER committed
  AGENTS.md              Preservation rules for future coding agents
  package.json           Available commands and dependency versions
  pnpm-lock.yaml         Exact dependency resolution; commit this file
```

`node_modules/`, `.next/` and `.pnpm-store/` are installed dependencies, build output and cache, not application source. Git ignores them. Screens follow the existing Next.js App Router structure. Earlier modules remain because migrations, historical records and regression tests depend on them. The code guide distinguishes them from active V3 screens; no working code was deleted or renamed.

## Find a screen

| Screen or behavior                  | Start with                                |
| ----------------------------------- | ----------------------------------------- |
| Home and sidebar                    | `src/components/staff-app.tsx`            |
| Student Roster                      | `src/components/v3-roster.tsx`            |
| Instructor Quick View               | `src/components/v3-quick-view.tsx`        |
| Homework Preparation                | `src/components/v3-preparation.tsx`       |
| Student profile and visit history   | `src/components/v3-profile.tsx`           |
| Student progress charts             | `src/components/v3-progress.tsx`          |
| Center Activity charts              | `src/components/v3-center-activity.tsx`   |
| Kiosk and sign-in                   | `src/components/kiosk.tsx`, `login.tsx`   |
| Appearance                          | `src/app/v3.css`, `globals.css`, `v2.css` |
| Exact homework rules                | `src/lib/v3-planning.ts`, `v3-domain.ts`  |

**TypeScript** is JavaScript with checked types. **React** builds screens from components. `.tsx` files combine TypeScript and screen markup. **Next.js 16** supplies page routing and server endpoints in the same project. **CSS** controls appearance. **PostgreSQL/Supabase** is the implemented optional cloud storage/auth path; it is not live-validated. Centerflow needs no OpenAI API key to run.

## Records and requests

Preserved local records live in `data/demo-v1.json`, now schema 3. Its old filename is intentional: changing it could create a second empty database. Source fixtures in `src/lib/seed.ts` are separate from changing records. A fresh clone has no `data/` and initializes fictional seed data; it does not contain your accumulated local history. Keep an independent records backup.

Run `pnpm demo:restore` in a development checkout to reconstruct the 96 fictional students at schema 3. The command uses only checked-in fictional fixtures, preserves an existing complete demo roster without writing, and refuses production/cloud-database mode. The cloud setup script runs it automatically. It does not upload or reproduce local visit/observation history; that history stays in the preserved local backup.

A screen uses `src/lib/client.ts` to send JSON to `/api/commands`. The server checks login, role, input and version, applies a domain rule, then saves through `repository.ts`. Screens read the latest authorized snapshot from `/api/state`. Browsers never open the server's JSON file or receive its database service key. See the [architecture diagram](docs/architecture.md#beginner-map).

## Check a change

```powershell
pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
```

Build first on a fresh checkout so Next generates its types. Unit tests check rules directly; browser tests click through the optimized app using **separate fictional test data** on port 3100. Windows uses installed Chrome. Linux/cloud setup needs Playwright Chromium (`pnpm exec playwright install --with-deps chromium`). Live database policy checks under `supabase/tests/` are separate from local tests.

## Safe development

Read `AGENTS.md`, create a branch (`git switch -c describe-your-change`), then ask Codex for one clear change and its acceptance checks. Request preservation of records and no unrelated redesign. Review changed files in VS Code, run the checks above and save a commit. Once GitHub publication is approved, push the branch and review a pull request before merging. Never delete `data/`, reset a live database, commit `.env.local`, or treat a source backup as a records backup.

For phone tasks, follow [development and cloud setup](docs/development.md). For eventual hosting, read [Cloudflare readiness](docs/cloudflare.md). Nothing has been deployed. Current cloud verification is in [cloud setup validation](docs/cloud-setup-validation.md); the earlier migration checkpoint is in [migration status](docs/migration-status.md); earlier results remain in [V3 release validation](docs/validation.md).


### October 28 refinement

Traffic now uses Daily, Weekly, Monthly and Yearly views with a linked punch list. Subject edits retain unenrolled configurations and use an optional versioned daily worksheet policy with ten-sheet standard packets. Reception completes a uniquely matching active name inline and confirms the student by name, as explicitly authorized by the user; it does not send a roster or private records. See [implementation and privacy details](docs/arithmetica-refinement.md).
