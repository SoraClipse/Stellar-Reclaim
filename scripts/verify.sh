#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
git diff --check
