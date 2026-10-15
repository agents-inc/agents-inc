#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
# Journey 39, with editor-authored ids against a local copy of the public catalogue checkout.
#  D2' : the unparseable-metadata.yaml warning (and its SKILL.md twin) is printed 3x by a global
#        `edit --from` and a global `compile` once a project is registered; `init --from` prints it 1x.
#  D3  : when the unparseable metadata.yaml is a SELECTED skill's, `init --from` drops the 4 sub-agents
#        that existed only to carry that skill, and no line says so ("Skipped 1 skill(s)" only).
# Needs: the local worker (AGENTS_INC_API_URL, default http://localhost:8787), the built CLI, tmux,
#        a checkout of agents-inc/skills at $SKILLS (default $REPO/../skills).
# Ids wej0WC-q (React eject global; web-developer on, 4 more agents via React's assignments) and
# FbFqiiUZ (the same + Zustand) were minted in the editor's Install dialog. The worker store is
# content-addressed: if they are gone, POSTing the saved payloads re-mints the same ids.
set -u
CLI=${CLI:-$REPO/packages/cli/dist/index.js}
SKILLS=${SKILLS:-$REPO/../skills}
export AGENTS_INC_API_URL=${AGENTS_INC_API_URL:-http://localhost:8787}
export AGENTS_INC_SKIP_NEW_VERSION_CHECK=1
P=${P:-}  # the saved payloads were lost with the session scratchpad; the ids must still be on the worker
for id in wej0WC-q FbFqiiUZ; do
  curl -sf "$AGENTS_INC_API_URL/configs/$id" >/dev/null || curl -s -X POST -H 'content-type: application/json' --data @"$P/$id.json" "$AGENTS_INC_API_URL/configs" >/dev/null
done
W=/tmp/c924/repro-39-$$; mkdir -p $W
ai() { node "$CLI" "$@" </dev/null 2>&1; }

# a copy of the public catalogue checkout with one unparseable metadata.yaml and one unparseable SKILL.md
(cd "$SKILLS" && tar --exclude=./node_modules --exclude=./.git -cf - .) | (mkdir -p $W/mk && cd $W/mk && tar -xf -)
printf 'category: web-client-state\nslug: mobx\ndisplayName: [MobX\n  cliDescription: : broken\n' > $W/mk/src/skills/web-state-mobx/metadata.yaml
sed -i 's/^description: Atomic state management with auto-dependency tracking$/description: [Atomic state management\n  : : with auto-dependency tracking/' $W/mk/src/skills/web-state-jotai/SKILL.md

echo "=== D2': init --from from ~/proj (registers proj), then edit --from + compile at HOME"
export HOME=$W/h; mkdir -p $HOME/proj
(cd $HOME/proj && ai init --from wej0WC-q --marketplace $W/mk > $W/init.out)
echo "init --from     : metadata.yaml warning x$(grep -c 'web-state-mobx/metadata.yaml' $W/init.out), SKILL.md x$(grep -c 'web-state-jotai/SKILL.md' $W/init.out)"
TS=r39g-$$; tmux new-session -d -s $TS -x 250 -y 80 -c $HOME "HOME=$HOME AGENTS_INC_API_URL=$AGENTS_INC_API_URL AGENTS_INC_SKIP_NEW_VERSION_CHECK=1 node $CLI edit --from FbFqiiUZ; sleep 60"
cap() { tmux capture-pane -p -J -S - -t $TS > $W/edit.out; }
for i in $(seq 90); do cap; grep -q "y/N" $W/edit.out && break; sleep 1; done
tmux send-keys -t $TS y; sleep 0.5; tmux send-keys -t $TS Enter
for i in $(seq 90); do cap; grep -q "Done" $W/edit.out && break; sleep 1; done
tmux kill-session -t $TS
echo "edit --from     : metadata.yaml warning x$(grep -c 'web-state-mobx/metadata.yaml' $W/edit.out), SKILL.md x$(grep -c 'web-state-jotai/SKILL.md' $W/edit.out)"
(cd $HOME && ai compile > $W/compile.out)
echo "compile (HOME)  : metadata.yaml warning x$(grep -c 'web-state-mobx/metadata.yaml' $W/compile.out), SKILL.md x$(grep -c 'web-state-jotai/SKILL.md' $W/compile.out)"
echo "EXPECTED: 1 each (one load, reported once per run)."

echo "=== D3: the unparseable metadata.yaml is the selected skill's (React)"
cp $W/mk/src/skills/web-framework-react/metadata.yaml $W/react-metadata.bak
printf 'category: web-framework\nslug: react\ndisplayName: [React\n  cliDescription: : broken\n' > $W/mk/src/skills/web-framework-react/metadata.yaml
export HOME=$W/h2; mkdir -p $HOME/proj
(cd $HOME/proj && ai init --from wej0WC-q --marketplace $W/mk > $W/init-sel.out)
grep -E "Skipped 1 skill|web-framework-react$|Sub-agents|^    [a-z-]+$|Configuration saved|Compiled [0-9]+ agent|EXIT" $W/init-sel.out
echo "agents compiled: $(ls $HOME/.claude/agents 2>/dev/null | tr '\n' ' ')"
echo "EXPECTED: the editor's Install dialog said 5 sub-agents; the run either installs them or names the 4 it dropped and why."
