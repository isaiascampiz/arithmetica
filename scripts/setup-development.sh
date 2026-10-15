#!/usr/bin/env bash
# Optional Linux/Codex setup. No production access or database changes.
set -euo pipefail
cd "$(dirname "$0")/.."
node -e "if (Number(process.versions.node.split('.')[0]) !== 24) { console.error('Use Node 24; tested with 24.20.0.'); process.exit(1); }"
command -v pnpm >/dev/null || { echo 'Install pnpm 11.25.0 first.'; exit 1; }
pnpm install --frozen-lockfile --store-dir .pnpm-store
pnpm build
pnpm typecheck
pnpm lint
pnpm test
# Optional when browser/system downloads are allowed:
# pnpm exec playwright install --with-deps chromium
# pnpm test:e2e
