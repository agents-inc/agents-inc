#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
# Row 30 / defect X1: `edit --from` run from a project names existing global sub-agents
# "Kept as installed in the global install", then rewrites them (adds the new skill to their
# stack and compiled .md), and its "Changes:" list does not mention them.
# Needs: local worker on :8787, built CLI at packages/cli/dist, `claude` and `tmux` on PATH.
set -u
CLI=$REPO/packages/cli/dist/index.js
DIR=$(cd "$(dirname "$0")" && pwd)
W=$(mktemp -d /tmp/repro30.XXXX); mkdir -p $W/home $W/proj
export HOME=$W/home AGENTS_INC_API_URL=http://localhost:8787 BROWSER=true
post() { curl -s -X POST -H 'content-type: application/json' --data-binary @"$1" http://localhost:8787/configs | sed -E 's/.*"id":"([^"]+)".*/\1/'; }
A=$(post $DIR/payloads/30-installed.json)   # React+Zustand; web-developer at project scope, pm/reviewer/web-researcher/web-tester global
B=$(post $DIR/payloads/30-edited.json)      # same, Zustand deselected, Vitest added (assigned to all five)
echo "ids: installed=$A edited=$B"
cd $W/proj && echo '{"name":"p"}' > package.json
node $CLI init --from $A </dev/null >/dev/null 2>&1 || { echo "init failed"; exit 2; }
echo "--- before: pm stack";  sed -n "/^  pm: {/,/^  },/p" $HOME/.agents-inc/claude/config.ts
# edit --from asks y/N and needs a terminal: run it in tmux, wait for the question, answer y
T=repro30-$$
printf '#!/bin/bash\nexport HOME=%q AGENTS_INC_API_URL=%q BROWSER=true PATH=%q\ncd %q && node %q edit --from %q; echo EXIT=$?; read -t 600\n' "$HOME" "$AGENTS_INC_API_URL" "$PATH" "$W/proj" "$CLI" "$B" > $W/run.sh; chmod +x $W/run.sh
tmux new-session -d -s $T -x 160 -y 50 $W/run.sh
for i in $(seq 1 120); do tmux capture-pane -p -t $T | grep -q "y/N" && break; sleep 0.5; done
tmux send-keys -t $T y
for i in $(seq 1 240); do tmux capture-pane -p -t $T | grep -q "EXIT=" && break; sleep 0.5; done
tmux capture-pane -p -t $T -S -200 > $W/edit.out; tmux kill-session -t $T
echo "--- edit --from output (disclosure + changes)"; sed 's/\x1b\[[0-9;?]*[a-zA-Z]//g' $W/edit.out | tr -d '\r' | grep -E "Kept as installed|sub-agent |skill |Changes|^  [+~-] |rewritten"
echo "--- after: pm stack";  sed -n "/^  pm: {/,/^  },/p" $HOME/.agents-inc/claude/config.ts
echo "--- after: pm.md mentions vitest: $(grep -c web-testing-vitest $HOME/.claude/agents/pm.md) line(s)"
echo "EXPECTED: a sub-agent listed under 'Kept as installed' is not rewritten (or is not listed as kept, and Changes names it)."
