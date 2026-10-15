#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
# repro-24.sh — an edit -> edit --from round trip over an install carrying an editor-added external skill
# rewrites that skill's metadata.yaml with its keys in a different order, though nothing about the skill changed.
# Needs: the local worker on :8787 holding payload yygY4oK_ (minted by the editor's Install dialog in lane gap-authoring;
# content-addressed — re-post payloads/yygY4oK_.raw.json to /configs if the worker was reset), tmux, the built CLI.
set -u
S=$(dirname "$(readlink -f "$0")")
W=$(mktemp -d /tmp/c924/gap-authoring/repro24.XXXX)
mkdir -p "$W/home" "$W/proj"; echo '{"name":"r24"}' > "$W/proj/package.json"
BIN=$W/bin; mkdir -p $BIN
printf '#!/bin/sh\nexec node %s/packages/cli/dist/index.js "$@"\n' "$REPO" > $BIN/agents-inc
for b in xdg-open open; do printf '#!/bin/sh\nexit 0\n' > $BIN/$b; done; chmod +x $BIN/*
ENV="export PATH=$BIN:\$PATH HOME=$W/home AGENTS_INC_API_URL=http://localhost:8787 BROWSER=$BIN/open"
eval "$ENV"; cd "$W/proj"
curl -s -X POST -H 'content-type: application/json' --data-binary @"$S/payloads/yygY4oK_.raw.json" http://localhost:8787/configs >/dev/null
agents-inc init --from yygY4oK_ </dev/null >"$W/init.log" 2>&1; echo "init exit=$?"
M=.claude/skills/external-web-testing-test-driven-development/metadata.yaml
cp "$M" "$W/metadata.before"
ID=$(agents-inc edit </dev/null 2>&1 | sed -n 's/.*Shared as \([^ ]*\).*/\1/p'); echo "edit minted: $ID"
tmux new-session -d -s c924-repro24 -x 160 -y 50 "bash --norc --noprofile"
tmux send-keys -t c924-repro24 "$ENV; cd $W/proj; agents-inc edit --from=$ID 2>&1 | tee $W/apply.log; echo EXIT=\$? >> $W/apply.log" Enter
sleep 8; tmux send-keys -t c924-repro24 y; sleep 8; tmux kill-session -t c924-repro24
cat "$W/apply.log"
echo "--- metadata.yaml diff (before < > after), skill unchanged:"
diff "$W/metadata.before" "$M"; echo "diff exit=$? (1 = rewritten differently)"
