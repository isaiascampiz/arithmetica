<p align="center">
  <img src="public/icon.svg" width="72" height="72" alt="Arithmetica logo" />
</p>

# Arithmetica

[![CI](https://github.com/isaiascampiz/arithmetica/actions/workflows/ci.yml/badge.svg)](https://github.com/isaiascampiz/arithmetica/actions/workflows/ci.yml)

Arithmetica is a learning center operations app for coordinating arrivals, worksheet preparation, instructor handoffs, and progress records. It keeps planned work separate from physical preparation and verified completion, so reports reflect what actually happened.

![Home screen with fictional demo students](docs/screenshots/arithmetica-home.png)

## What it covers

- **Arrival:** check students in by pouch code or exact name, see expected arrivals, and keep a visit history.
- **Preparation:** plan worksheets by subject, keep track of held packets, and record when materials are physically ready.
- **Instruction:** use Quick View for the next handoff and record observations without losing earlier notes.
- **Reporting:** review visits and observations alongside verified worksheet totals.

The interface is built with Next.js, React, and TypeScript. Server routes enforce staff permissions and run the same business rules against local demo data or Supabase. The deployed browser build uses Cloudflare; the API runs in Supabase Edge Functions. See [architecture](docs/architecture.md) for the boundaries and [the code guide](docs/code-guide.md) for entry points.

## Run locally

Use Node **24.20.0** and pnpm **11.25.0**. From a fresh clone:

```sh
git clone https://github.com/isaiascampiz/arithmetica.git
cd arithmetica
corepack pnpm install --frozen-lockfile
```

Copy `.env.example` to `.env.local` if you do not already have local configuration. Then run:

```sh
corepack pnpm dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The default setup uses fictional students and needs no cloud credentials. [Operations](docs/operations.md) lists the demo sign-in. Windows setup and test isolation are covered in [development](docs/development.md).

## Check a change

```sh
corepack pnpm build
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm test
corepack pnpm test:e2e
```

Browser tests use a separate fictional data file. The [contribution guide](CONTRIBUTING.md) covers formatting and repository checks. Historical identifiers remain where saved records or printed pouch labels depend on them; see [compatibility](docs/compatibility.md).

Student records, backups, and credentials are excluded from this repository. The screenshot shows fictional demo students. Real student use requires organizational privacy approval and a validated deployment; see [security and data handling](SECURITY.md). The app has no Kumon integration.
