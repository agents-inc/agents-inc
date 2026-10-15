#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
# Row 48 / defect X2 (2026-10-01 D2, still open): the Output preview orders an agent's skills
# (front-matter `skills:` and the activation table) differently from what `init --from` writes.
# Needs: editor dev server on :5173 (calling the worker on :8787), worker on :8787, built CLI, `claude` on PATH,
# Playwright (root node_modules) with Chromium installed.
set -u
DIR=$(cd "$(dirname "$0")" && pwd); CLI=$REPO/packages/cli/dist/index.js
W=$(mktemp -d /tmp/repro48.XXXX); mkdir -p $W/home $W/proj
ID=$(node $DIR/repro-48.mjs cli-developer $W/preview-cli-developer.md) || exit 2
echo "minted id: $ID"
cd $W/proj && echo '{"name":"p"}' > package.json
HOME=$W/home AGENTS_INC_API_URL=http://localhost:8787 BROWSER=true node $CLI init --from $ID </dev/null >/dev/null 2>&1 || { echo "init failed"; exit 2; }
DISK=$W/home/.claude/agents/cli-developer.md
cmp -s $W/preview-cli-developer.md $DISK && { echo "IDENTICAL (not reproduced)"; exit 0; }
echo "--- preview vs disk (cli-developer.md):"; diff $W/preview-cli-developer.md $DISK | grep -E '^[<>] (  - |### )'
echo "--- same lines as a multiset? $(diff <(sort $W/preview-cli-developer.md) <(sort $DISK) >/dev/null && echo yes || echo no)"
echo "EXPECTED: byte-identical (journey 48: the preview is the install)."
