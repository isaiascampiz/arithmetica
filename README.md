<p align="center">
  <img src="public/icon.svg" width="72" height="72" alt="Arithmetica" />
</p>

# Arithmetica

[![Arithmetica CI](https://github.com/isaiascampiz/arithmetica/actions/workflows/ci.yml/badge.svg)](https://github.com/isaiascampiz/arithmetica/actions/workflows/ci.yml)

A learning center workspace for attendance, instructor handoffs, homework preparation, and student observations.

Built with **Next.js, React, and TypeScript**, with a fictional local demo and a server-authorized Supabase adapter. This repository contains application source and fictional fixtures. Operational student records, credentials, and backups stay outside Git.

![Arithmetica Home with clearly labeled fictional demo students](docs/screenshots/arithmetica-home.png)

## Features

- **Attendance:** staff check-in, an isolated reception kiosk, and arrival/departure receipts.
- **Student workspace:** profiles, visit history, subject setup, observations, and progress charts.
- **Quick View:** subject-specific instructor handoffs and recorded activities.
- **Homework preparation:** shared sequencing with preserved packet identities and instructor approval.
- **Reports:** attendance, observations, and explicitly verified worksheet completion.
- **Appearance:** responsive layouts, keyboard access, light/dark themes, and reduced-motion support.

Attendance, preparation, issuance, and verified completion are separate events. A planned or issued packet never counts as completed work.

## Run locally

Use **Node 24.20.0** and **pnpm 11.25.0**, pinned in this repository.

```sh
git clone https://github.com/isaiascampiz/arithmetica.git
cd arithmetica
corepack pnpm install --frozen-lockfile --store-dir .pnpm-store
```

Copy `.env.example` to `.env.local` once, then start the app:

```sh
corepack pnpm dev
```

Open [localhost:3000](http://127.0.0.1:3000). Defaults use fictional local data and need no cloud credentials. Demo sign-in details are in [operations](docs/operations.md). Stop the server with **Ctrl+C**.

If Windows denies dependency symlinks, add `--node-linker=hoisted` to the install command. Do not overwrite existing local configuration or records. See [development](docs/development.md) for setup and troubleshooting.

## Project structure

```text
arithmetica/
├── src/
│   ├── app/                 Next.js routes, HTTP APIs, and global styles
│   ├── components/          Interface code grouped by feature
│   │   ├── attendance/      Reception, kiosk, and traffic
│   │   ├── auth/            Staff sign-in
│   │   ├── preparation/     Homework preparation and Quick View
│   │   ├── progress/        Student progress charts
│   │   ├── reports/         Reporting workspace
│   │   ├── settings/        Center and account settings
│   │   ├── students/        Roster, profiles, and visit history
│   │   ├── pouch/           Printed student labels
│   │   ├── workspace/       Application shell and period controls
│   │   ├── ui/              Shared controls, theme, and brand
│   │   └── legacy/          Preserved earlier interface modules
│   ├── lib/                 Business rules, models, storage, and security
│   └── server/              Edge API and static hosting adapters
├── tests/                   Unit tests, fictional fixtures, and browser workflows
├── scripts/                 Build, verification, demo, deployment, and recovery tools
├── supabase/                Ordered SQL migrations and access-control checks
├── public/                  Brand assets, licensed fonts, and offline shell
├── config/                  Example center configuration
└── docs/                    Architecture, operations, and release history
```

Versioned domain modules and SQL migration names describe persisted contracts. They remain versioned intentionally; see [compatibility](docs/compatibility.md). Local records live in ignored `data/`, independently of source control.

## Validation

```sh
corepack pnpm build
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
corepack pnpm test
corepack pnpm repo:check
corepack pnpm test:e2e
```

Build first on a fresh checkout to generate Next.js types. Browser tests create isolated fictional records. Windows uses installed Chrome; Linux requires `corepack pnpm exec playwright install --with-deps chromium`. GitHub Actions runs these checks without production credentials.

## Documentation

- [Code guide](docs/code-guide.md): feature entry points and request flow.
- [Architecture](docs/architecture.md): runtime boundaries, permissions, and persistence.
- [Development](docs/development.md): local setup, commands, and test isolation.
- [Operations](docs/operations.md): configuration, backups, and reporting semantics.
- [Hosting](docs/cloudflare.md): Cloudflare/Supabase deployment.
- [Documentation index](docs/README.md): release evidence and historical design work.
- [Contributing](CONTRIBUTING.md) and [security](SECURITY.md): change and disclosure guidance.

Arithmetica is an independent project. No corporate integration or untested device compatibility is implied. Real student use requires organizational/privacy authorization and validated production configuration. Publishing source does not publish or back up application records.
