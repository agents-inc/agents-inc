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
cat > "$W/eject-global.json" <<'JSON'
{"v":6,"matrixVersion":"1.0.0","stackId":"cli-ink-oclif","skills":{"cli-framework-oclif-ink":{"install":"eject","scope":"global","assignments":{"cli-developer":"preloaded","reviewer":"preloaded","cli-tester":"preloaded","cli-researcher":"preloaded","pm":"preloaded","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-framework-react":{"install":"eject","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"preloaded","cli-tester":"lazy","cli-researcher":"lazy","pm":"preloaded","web-researcher":"preloaded","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-state-zustand":{"install":"eject","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"preloaded","web-researcher":"preloaded","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"meta-design-expressive-typescript":{"install":"eject","scope":"global","assignments":{"cli-developer":"preloaded","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"preloaded","skill-summoner":"preloaded","codex-keeper":"preloaded"}},"meta-reviewing-reviewing":{"install":"eject","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"preloaded","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"shared-tooling-typescript-config":{"install":"eject","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"shared-tooling-git-hooks":{"install":"eject","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"shared-tooling-eslint-prettier":{"install":"eject","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-forms-zod-validation":{"install":"eject","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"preloaded","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-testing-vitest":{"install":"eject","scope":"global","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}}},"agents":{"web-developer":{"on":true},"web-tester":{"on":true},"api-developer":{"on":true},"api-researcher":{"on":true},"api-tester":{"on":true},"ai-developer":{"on":true},"ai-researcher":{"on":true},"ai-tester":{"on":true},"convention-keeper":{"on":true},"cli-developer":{"effort":"high"},"pm":{"codexModel":"gpt-5.6-sol"}}}
JSON
ID=$(mint "$W/eject-global.json"); echo "payload id: $ID (editor: CLI Tool stack, Codex, every skill eject+global, every sub-agent global)"
cd "$HOME"
agents-inc init --from="$ID" --provider codex >/dev/null 2>&1 && echo "global eject install: ok; \$CODEX_HOME/skills: $(ls $CODEX_HOME/skills | wc -l) dirs"
agents-inc uninstall --yes 2>&1 | grep -E "Removed|complete|skills"
echo "after uninstall, \$CODEX_HOME/skills still holds: $(ls $CODEX_HOME/skills | tr '\n' ' ')"
mkdir -p "$HOME/code/x" && cd "$HOME/code/x"
echo "and Codex still loads them: $(codex debug prompt-input 2>/dev/null | grep -o 'web-framework-react' | head -1)"
