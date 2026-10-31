# Contributing to Arithmetica

Read [AGENTS.md](AGENTS.md), [architecture](docs/architecture.md), and [development](docs/development.md) before changing the application. Keep changes focused and use fictional test data.

## Workflow

1. Create a branch from the current default branch.
2. Keep interface code in its feature folder under `src/components/`; share controls through `ui/`.
3. Put business rules in `src/lib/` and enforce permissions in API/domain code.
4. Update documentation and `.env.example` when behavior or configuration changes.
5. Run the required checks and describe their actual results in the pull request.

```sh
corepack pnpm build
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm format:check
corepack pnpm test
corepack pnpm repo:check
corepack pnpm test:e2e
```

## Preservation rules

Never reset databases, automatically reseed existing records, or remove the demo data file. Preserve IDs, timestamps, observations, staff attribution, schema migration history, and regression tests. Existing SQL migrations are immutable. Read [compatibility](docs/compatibility.md) before renaming stored identifiers.

Do not commit student records, private intake artifacts, exports, credentials, backups, generated output, or dependencies. Keep authenticated data outside service-worker caches and browser storage. No real student data belongs in tests, screenshots, issues, or pull requests.

## Style

Use Arithmetica consistently for the product and lowercase kebab-case filenames. Follow the existing TypeScript types and Prettier configuration. Use direct imports, named component exports, accessible controls, and reduced-motion support. Add tests for changed domain behavior; avoid tests that merely repeat markup or implementation details.

Third-party fonts and agent skills retain their own licenses. Public visibility alone does not grant a license to redistribute the application's source; agree on licensing with the owner before reuse.
