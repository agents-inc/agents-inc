#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
SKILLS="${SKILLS:-$REPO/../skills}"
# Journey 26 (PARTIAL): a project installed under an existing global installation records the
# GLOBAL config's description in its own config.ts, overriding the description of the stack the
# project's own configuration names. Needs: the built CLI, the local worker on :8787, ~/dev/skills.
set -euo pipefail
CLI="node $REPO/packages/cli/dist/index.js"
export AGENTS_INC_API_URL="${AGENTS_INC_API_URL:-http://localhost:8787}"
R=$(mktemp -d /tmp/repro26.XXXX); mkdir -p "$R/src" "$R/hsrc" "$R/home" "$R/proj" "$R/mint"
cd "$R/src" && HOME="$R/hsrc" $CLI new marketplace acme >/dev/null
M="$R/src/acme"
for id in web-framework-react api-framework-hono; do
  cp -r "$SKILLS/src/skills/$id" "$M/src/skills/acme-$id"
  sed -i "0,/^name: $id\$/s//name: acme-$id/" "$M/src/skills/acme-$id/SKILL.md"
done
cat > "$M/config/stacks.ts" <<'S'
export default { "stacks": [
  { "id": "acme-starter", "name": "acme starter", "description": "Every skill acme ships",
    "agents": { "web-developer": { "web-framework": [{ "id": "acme-web-framework-react" }] } } },
  { "id": "acme-api-only", "name": "acme API only", "description": "Just the acme Hono skill",
    "agents": { "api-developer": { "api-api": [{ "id": "acme-api-framework-hono" }] } } } ] };
S
(cd "$M" && HOME="$R/hsrc" $CLI build plugins >/dev/null && HOME="$R/hsrc" $CLI build marketplace >/dev/null)
mint() { (cd "$R/mint" && HOME="$R/hsrc" $CLI share --stdin | sed -n 's/.*Shared as //p'); }
GLOBAL_ID=$(echo '{"v":6,"matrixVersion":"r","stackId":"acme-api-only","skills":{"acme-api-framework-hono":{"install":"eject","scope":"global","assignments":{"api-developer":"lazy"}}},"agents":{"api-developer":{"scope":"global"}}}' | mint)
PROJECT_ID=$(echo '{"v":6,"matrixVersion":"r","stackId":"acme-starter","skills":{"acme-web-framework-react":{"install":"eject","scope":"project","assignments":{"web-developer":"lazy"}}},"agents":{"web-developer":{"scope":"project"}}}' | mint)
(cd "$R/home" && HOME="$R/home" $CLI init --from "$GLOBAL_ID" --marketplace "$M" </dev/null >/dev/null)
(cd "$R/proj" && HOME="$R/home" $CLI init --from "$PROJECT_ID" --marketplace "$M" </dev/null >/dev/null)
echo "global  config.ts: $(grep -o "description: '[^']*'" "$R/home/.agents-inc/claude/config.ts")"
echo "project config.ts: $(grep -o "description: '[^']*'" "$R/proj/.agents-inc/claude/config.ts")"
echo "EXPECTED project: description: 'Every skill acme ships' (its own stack, acme-starter)"
echo "Control: the same project id in a fresh HOME with no global install records 'Every skill acme ships'."
