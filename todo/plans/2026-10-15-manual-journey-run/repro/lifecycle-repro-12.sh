#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
# repro-12.sh — a stack built in the editor drops the stack's empty-skill sub-agent (journeys 12 and 2).
# Needs: editor dev server at http://localhost:5173/editor/, local worker at http://localhost:8787,
# Playwright in $REPO/node_modules, the built CLI at $REPO/packages/cli/dist/index.js.
set -u
STACK_ID=nextjs-ai-saas; STACK_NAME="Next.js AI SaaS"
export PLAYWRIGHT_BROWSERS_PATH=${PLAYWRIGHT_BROWSERS_PATH:-$HOME/.cache/ms-playwright}
W=$(mktemp -d /tmp/repro12.XXXX); mkdir -p $W/home $W/proj $W/bin
printf '#!/bin/sh\nexec node %s/packages/cli/dist/index.js "$@"\n' "$REPO" > $W/bin/agents-inc
printf '#!/bin/sh\ntrue\n' > $W/bin/xdg-open; chmod +x $W/bin/*
export PATH=$W/bin:$PATH HOME=$W/home AGENTS_INC_API_URL=http://localhost:8787 BROWSER=$W/bin/xdg-open
# 1. the stack as the catalogue declares it (the CLI's own fetched copy)
(cd $W/proj && agents-inc search vitest >/dev/null 2>&1)
CAT=$(ls -d $HOME/.cache/agents-inc/sources/github-agents-inc-skills-*/.claude-plugin/catalog.json | head -1)
# 2. pick the stack in the editor and read the id the Install dialog mints
cat > $W/mint.mjs <<JS
import { chromium } from "$REPO/node_modules/playwright/index.mjs";
const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 1000 } });
await p.goto("http://localhost:5173/editor/", { waitUntil: "networkidle" });
await p.getByText("$STACK_NAME", { exact: true }).first().click();
await p.getByRole("button", { name: /^Install / }).first().click();
const block = p.locator('[data-slot="command-block"]').filter({ hasText: /init --from \\S+/ });
await block.first().waitFor({ timeout: 20000 });
const t = await block.first().innerText();
console.log(t.match(/init --from (\S+)/)[1]); await b.close();
JS
ID=$(node $W/mint.mjs); echo "editor minted id: $ID"
curl -s http://localhost:8787/configs/$ID > $W/payload.json
python3 - "$CAT" $W/payload.json $STACK_ID <<'PY'
import json, sys
cat = json.load(open(sys.argv[1])); p = json.load(open(sys.argv[2]))
st = [s for s in cat['suggestedStacks'] if s['id'] == sys.argv[3]][0]
declared = sorted(st['skills']); empty = sorted(a for a, v in st['skills'].items() if not v)
carried = sorted({a for s in p['skills'].values() for a in s['assignments']} | {a for a, v in p['agents'].items() if v.get('on')})
print('catalog stack sub-agents (%d): %s' % (len(declared), declared))
print('  of which declared with no skills: %s' % empty)
print('editor payload sub-agents (%d): %s' % (len(carried), carried))
print('MISSING from the configuration:', sorted(set(declared) - set(carried)))
PY
# 3. install it and list what was compiled
(cd $W/proj && agents-inc init --from $ID > $W/init.log 2>&1); echo "init --from exit=$?"
echo "compiled sub-agents: $(ls $HOME/.claude/agents | sed 's/\.md$//' | tr '\n' ' ')"
echo "(work dir: $W)"
