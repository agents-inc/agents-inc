#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
SKILLS="${SKILLS:-$REPO/../skills}"
# Observation beside journey 22: with a remote (tarball URL) marketplace unreachable, `doctor` prints
# "Warning: Could not reach … using the cached copy" and still reports
# "Marketplace Reachable ✓ Connected to remote: <local cache dir>" and "0 warnings".
# Needs: the built CLI, the local worker on :8787, ~/dev/skills, node.
set -euo pipefail
CLI="node $REPO/packages/cli/dist/index.js"
export AGENTS_INC_API_URL="${AGENTS_INC_API_URL:-http://localhost:8787}"
R=$(mktemp -d /tmp/repro22.XXXX); mkdir -p "$R/src" "$R/hsrc" "$R/home" "$R/proj" "$R/mint"
cd "$R/src" && HOME="$R/hsrc" $CLI new marketplace acme >/dev/null
M="$R/src/acme"; id=api-framework-hono
cp -r "$SKILLS/src/skills/$id" "$M/src/skills/acme-$id"
sed -i "0,/^name: $id\$/s//name: acme-$id/" "$M/src/skills/acme-$id/SKILL.md"
(cd "$M" && HOME="$R/hsrc" $CLI build plugins >/dev/null && HOME="$R/hsrc" $CLI build marketplace >/dev/null)
tar -czf "$R/source.tar.gz" -C "$R/src" acme
cat > "$R/serve.cjs" <<'S'
const fs = require("fs"); const body = fs.readFileSync(process.argv[2]);
require("http").createServer((q, s) => { s.setHeader("etag", '"fixed-1"'); s.setHeader("content-type", "application/gzip");
  s.setHeader("content-length", body.length); s.writeHead(200); s.end(q.method === "GET" ? body : undefined); }).listen(47431, "127.0.0.1");
S
node "$R/serve.cjs" "$R/source.tar.gz" & SRV=$!; sleep 1
ID=$(echo '{"v":6,"matrixVersion":"r","stackId":null,"skills":{"acme-api-framework-hono":{"install":"eject","scope":"project","assignments":{"api-developer":"lazy"}}},"agents":{"api-developer":{"scope":"project"}}}' | (cd "$R/mint" && HOME="$R/hsrc" $CLI share --stdin | sed -n 's/.*Shared as //p'))
(cd "$R/proj" && HOME="$R/home" $CLI init --from "$ID" --marketplace http://localhost:47431/source.tar.gz </dev/null >/dev/null)
kill $SRV; sleep 0.5
cd "$R/proj" && HOME="$R/home" $CLI doctor 2>&1 | grep -E "Could not reach|Marketplace Reachable|Summary" || true
echo "EXPECTED: the Marketplace Reachable row is not a pass (or at least a warning) while the source cannot be reached."
