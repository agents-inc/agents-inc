#!/bin/bash
REPO="${REPO:-$(cd "$(dirname "$0")/../../../.." && pwd)}"
# Self-contained: needs the built CLI, the pinned @openai/codex and a worker (local rig: http://localhost:8787).
set -u
API=${AGENTS_INC_API_URL:-http://localhost:8787}
CLI=${CLI:-$REPO/packages/cli/dist/index.js}
CODEX_JS=${CODEX_JS:-$REPO/node_modules/@openai/codex/bin/codex.js}
W=$(mktemp -d /tmp/repro-codex-XXXX)
mkdir -p "$W/bin" "$W/home"
printf '#!/bin/sh\nexec node %s "$@"\n' "$CLI" > "$W/bin/agents-inc"
printf '#!/bin/sh\nexec node %s "$@"\n' "$CODEX_JS" > "$W/bin/codex"
printf '#!/bin/sh\necho "$*" >> %s/opened.log\n' "$W" > "$W/bin/xdg-open"
chmod +x "$W/bin/"*
export PATH="$W/bin:$PATH" AGENTS_INC_API_URL="$API" BROWSER="$W/bin/xdg-open" HOME="$W/home" CODEX_HOME="$W/home/.codex"
# mint <payload.json>: content-addressed, so it returns the id the editor minted for the same selection
mint() { curl -s -X POST -H 'content-type: application/json' --data-binary @"$1" "$API/configs" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).id))'; }
echo "work dir: $W"
cat > "$W/plugin-global.json" <<'JSON'
{"v":6,"matrixVersion":"1.0.0","stackId":"cli-ink-oclif","skills":{"cli-framework-oclif-ink":{"install":"plugin","scope":"global","assignments":{"cli-developer":"preloaded","reviewer":"preloaded","cli-tester":"preloaded","cli-researcher":"preloaded","pm":"preloaded","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-framework-react":{"install":"plugin","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"preloaded","cli-tester":"lazy","cli-researcher":"lazy","pm":"preloaded","web-researcher":"preloaded","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-forms-zod-validation":{"install":"plugin","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"preloaded","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-state-zustand":{"install":"plugin","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"preloaded","web-researcher":"preloaded","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-testing-vitest":{"install":"plugin","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"meta-design-expressive-typescript":{"install":"plugin","scope":"global","assignments":{"cli-developer":"preloaded","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"preloaded","skill-summoner":"preloaded","codex-keeper":"preloaded"}},"meta-reviewing-reviewing":{"install":"plugin","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"preloaded","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"shared-tooling-typescript-config":{"install":"plugin","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"shared-tooling-git-hooks":{"install":"plugin","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"shared-tooling-eslint-prettier":{"install":"plugin","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}}},"agents":{"web-developer":{"on":true},"web-tester":{"on":true},"api-developer":{"on":true},"api-researcher":{"on":true},"api-tester":{"on":true},"ai-developer":{"on":true},"ai-researcher":{"on":true},"ai-tester":{"on":true},"convention-keeper":{"on":true}}}
JSON
ID=$(mint "$W/plugin-global.json"); echo "payload id: $ID (editor: CLI Tool stack, Codex, every skill plugin+global, every sub-agent global)"
cd "$HOME"
agents-inc init --from "$ID" --provider codex 2>&1 | grep "Trusted"
echo "== \$CODEX_HOME/config.toml now trusts the whole home directory:"
grep -A1 'projects\.' "$CODEX_HOME/config.toml"
