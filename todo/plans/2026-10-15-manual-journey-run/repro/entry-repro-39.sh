#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
# Journey 39: an `edit --from` run prints its marketplace load warning THREE times (once before the
# confirm, twice after), where `init --from` against the same marketplace prints it once.
# Needs: the local worker (AGENTS_INC_API_URL, default http://localhost:8787), the built CLI, tmux.
set -u
CLI=${CLI:-$REPO/packages/cli/dist/index.js}
export AGENTS_INC_API_URL=${AGENTS_INC_API_URL:-http://localhost:8787}
W=$(mktemp -d /tmp/r39.XXXX); export HOME=$W/h; mkdir -p $HOME/mk
ai() { node "$CLI" "$@" </dev/null 2>&1; }
mint() { curl -s -X POST -H 'content-type: application/json' --data "$1" "$AGENTS_INC_API_URL/configs" | sed -E 's/.*"id":"([^"]+)".*/\1/'; }
# a scaffolded marketplace with one extra skill whose SKILL.md frontmatter does not parse
(cd $HOME/mk && ai new marketplace mkb >/dev/null)
M=$HOME/mk/mkb; sed -i 's/"@mkb"/"@someone"/' $M/package.json
mkdir -p $M/src/skills/mkb-broken-skill
sed 's/slug: example-skill/slug: broken-skill/' $M/src/skills/mkb-example-skill/metadata.yaml > $M/src/skills/mkb-broken-skill/metadata.yaml
printf -- '---\nname: mkb-broken-skill\ndescription: [unclosed\n  : : bad yaml\n---\n\n# Broken\n' > $M/src/skills/mkb-broken-skill/SKILL.md
(cd $M && ai build plugins >/dev/null && ai build marketplace >/dev/null)
A='{"v":6,"matrixVersion":"1.0.0","stackId":null,"skills":{"mkb-example-skill":{"install":"eject","scope":"global","assignments":{"web-developer":"preloaded"}},"mkb-broken-skill":{"install":"eject","scope":"global","assignments":{"web-developer":"preloaded"}}},"agents":{"web-developer":{"on":true,"scope":"global"}}}'
B='{"v":6,"matrixVersion":"1.0.0","stackId":null,"skills":{"mkb-example-skill":{"install":"eject","scope":"global","assignments":{"web-developer":"preloaded","pm":"lazy"}},"mkb-broken-skill":{"install":"eject","scope":"global","assignments":{"web-developer":"preloaded","pm":"lazy"}}},"agents":{"web-developer":{"on":true,"scope":"global"},"pm":{"on":true,"scope":"global"}}}'
IA=$(mint "$A"); IB=$(mint "$B")
# as the editor's Install dialog says: cd into the project, then init --from (registers the project)
mkdir -p $HOME/proj; cd $HOME/proj
echo "--- (in ~/proj) init --from $IA --marketplace mkb: count of the SKILL.md warning"
ai init --from "$IA" --marketplace "$M" | grep -c "unparseable SKILL.md frontmatter"
cd $HOME
echo "--- (in ~) edit --from $IB (adds pm; answered y in tmux): count of the same warning"
TS=r39-$$; tmux new-session -d -s $TS -x 250 -y 50 "HOME=$HOME AGENTS_INC_API_URL=$AGENTS_INC_API_URL node $CLI edit --from $IB; sleep 60"
cap() { tmux capture-pane -p -J -S - -t $TS > $W/edit.out; }
for i in $(seq 60); do cap; grep -q "y/N" $W/edit.out && break; sleep 1; done
sleep 1; tmux send-keys -t $TS y; sleep 0.5; tmux send-keys -t $TS Enter
for i in $(seq 60); do cap; grep -q "Done" $W/edit.out && break; sleep 1; done
tmux kill-session -t $TS
grep -c "unparseable SKILL.md frontmatter" $W/edit.out
grep -E "Warning|Apply this|Changes|Done" $W/edit.out | cut -c1-120
echo "EXPECTED: 1 and 1 (the load is reported once per run). OBSERVED above."
