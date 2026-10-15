#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
# Journey 14, project leg: under a live GLOBAL install, a project whose config.ts was deleted.
# doctor never names the stranded project skill, and calls the stranded agent a mere "orphaned agent file".
# Needs: the local worker (AGENTS_INC_API_URL, default http://localhost:8787) and the built CLI.
set -u
CLI=${CLI:-$REPO/packages/cli/dist/index.js}
export AGENTS_INC_API_URL=${AGENTS_INC_API_URL:-http://localhost:8787}
P=$(dirname "$0")/payloads
mint() { curl -s -X POST -H 'content-type: application/json' --data-binary @"$1" "$AGENTS_INC_API_URL/configs" | sed -E 's/.*"id":"([^"]+)".*/\1/'; }
G=$(mint $P/global-eject.json)        # CLI Tool stack, 10 ejected skills, 9 agents, all global
PR=$(mint $P/project-react-pm.json)   # React (eject, project) + pm (project)
W=$(mktemp -d /tmp/r14.XXXX); export HOME=$W/h; mkdir -p $HOME/proj
ai() { node "$CLI" "$@" </dev/null 2>&1; }
(cd $HOME && ai init --from "$G" >/dev/null)
(cd $HOME/proj && ai init --from="$PR" >/dev/null)
rm $HOME/proj/.agents-inc/claude/config.ts
echo "--- doctor in the project (global install behind it):"
(cd $HOME/proj && ai doctor | sed -n '/Operational/,/Summary/p')
echo "EXPECTED (row 14): No Orphans names ~/proj/.claude/skills/web-framework-react AND ~/proj/.claude/agents/pm.md as unowned"
echo "--- control: same project, blank global config (nothing installed globally):"
W2=$(mktemp -d /tmp/r14c.XXXX); export HOME=$W2/h; mkdir -p $HOME/proj
(cd $HOME/proj && ai init --from="$PR" >/dev/null); rm $HOME/proj/.agents-inc/claude/config.ts
(cd $HOME/proj && ai doctor | grep -A3 "No Orphans")
