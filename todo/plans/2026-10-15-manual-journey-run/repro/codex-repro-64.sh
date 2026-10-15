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
cat > "$W/eject-project.json" <<'JSON'
{"v":6,"matrixVersion":"1.0.0","stackId":"cli-ink-oclif","skills":{"cli-framework-oclif-ink":{"install":"eject","scope":"project","assignments":{"cli-developer":"preloaded","reviewer":"preloaded","cli-tester":"preloaded","cli-researcher":"preloaded","pm":"preloaded","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-framework-react":{"install":"eject","scope":"project","assignments":{"cli-developer":"lazy","reviewer":"preloaded","cli-tester":"lazy","cli-researcher":"lazy","pm":"preloaded","web-researcher":"preloaded","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-forms-zod-validation":{"install":"eject","scope":"project","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"preloaded","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-state-zustand":{"install":"eject","scope":"project","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"preloaded","web-researcher":"preloaded","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"web-testing-vitest":{"install":"eject","scope":"project","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"meta-design-expressive-typescript":{"install":"eject","scope":"project","assignments":{"cli-developer":"preloaded","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"preloaded","skill-summoner":"preloaded","codex-keeper":"preloaded"}},"meta-reviewing-reviewing":{"install":"eject","scope":"project","assignments":{"cli-developer":"lazy","reviewer":"preloaded","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"shared-tooling-typescript-config":{"install":"eject","scope":"project","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"shared-tooling-git-hooks":{"install":"eject","scope":"project","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}},"shared-tooling-eslint-prettier":{"install":"eject","scope":"project","assignments":{"cli-developer":"lazy","reviewer":"lazy","cli-tester":"lazy","cli-researcher":"lazy","pm":"lazy","web-researcher":"lazy","agent-summoner":"lazy","skill-summoner":"lazy","codex-keeper":"lazy"}}},"agents":{"web-developer":{"on":true,"scope":"project"},"web-tester":{"on":true,"scope":"project"},"api-developer":{"on":true,"scope":"project"},"api-researcher":{"on":true,"scope":"project"},"api-tester":{"on":true,"scope":"project"},"ai-developer":{"on":true,"scope":"project"},"ai-researcher":{"on":true,"scope":"project"},"ai-tester":{"on":true,"scope":"project"},"convention-keeper":{"on":true,"scope":"project"},"web-researcher":{"scope":"project"},"cli-developer":{"effort":"high","scope":"project"},"cli-researcher":{"scope":"project"},"cli-tester":{"scope":"project"},"agent-summoner":{"scope":"project"},"codex-keeper":{"scope":"project"},"pm":{"codexModel":"gpt-5.6-sol","scope":"project"},"reviewer":{"scope":"project"},"skill-summoner":{"scope":"project"}}}
JSON
ID=$(mint "$W/eject-project.json"); echo "payload id: $ID (editor: CLI Tool stack, Codex, 16 sub-agents, every skill eject+project)"
mkdir -p "$HOME/code/p" && cd "$HOME/code/p" && echo '{"name":"p"}' > package.json
agents-inc init --from "$ID" >/dev/null 2>&1 && echo "claude install: ok"
agents-inc init --from "$ID" --provider codex >/dev/null 2>&1 && echo "codex install: ok"
echo; echo "== 1. bare init (dashboard, piped) — counts are Claude's, nothing names the Codex installation:"
agents-inc init < /dev/null
echo; echo "== 2. break the Codex half: delete 2 role files and 1 Codex skill"
rm .codex/agents/pm.toml .codex/agents/reviewer.toml; rm -rf .agents/skills/web-framework-react
echo "== doctor (expected: the missing roles/skill reported; actual: every operational row is Claude's):"
agents-inc doctor 2>&1 | sed -n '/Operational/,$p'
echo "== doctor --provider codex:"
agents-inc doctor --provider codex 2>&1 | head -2
