---
type: convention-drift
severity: medium
affected_files:
  - src/agents/developer/api-developer/identity.md
  - src/agents/developer/web-developer/identity.md
  - src/agents/developer/ai-developer/identity.md
  - src/agents/developer/cli-developer/identity.md
  - src/agents/researcher/web-researcher/identity.md
  - src/agents/researcher/api-researcher/identity.md
  - src/agents/researcher/ai-researcher/identity.md
  - src/agents/researcher/ai-researcher/playbook.md
  - src/agents/tester/web-tester/identity.md
  - src/agents/tester/api-tester/identity.md
  - src/agents/tester/cli-tester/identity.md
  - src/agents/tester/ai-tester/identity.md
  - src/agents/tester/ai-tester/playbook.md
  - src/agents/meta/agent-summoner/identity.md
  - src/agents/meta/codex-keeper/identity.md
standards_docs:
  - .ai-docs/standards/prompt-bible.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: CLI-431 — every dangling per-domain reviewer name rewritten to the consolidated `reviewer`; `grep -rn` for all five retired reviewer names and all five retired PM names now returns nothing across `src/` and nothing across a rebuilt `dist/`.
supersedes: 2026-08-06-cli398-consolidation-left-dangling-reviewer-names-in-pm-prompts.md
---

## What Was Wrong

The predecessor finding closes with a verifiable claim: "Grep for `-reviewer` under `src/agents/`
now matches only the `reviewer` agent itself and the `meta-reviewing-*` skill ids." Run today, that
grep returns roughly twenty hits in fifteen files, none of them the reviewer agent or a skill id:

- `api-reviewer` in api-developer, api-researcher, api-tester, web-tester, agent-summoner,
  codex-keeper
- `web-reviewer` in web-researcher, web-tester, agent-summoner, codex-keeper
- `cli-reviewer` in cli-tester, agent-summoner, codex-keeper
- `ai-reviewer` in ai-researcher, ai-tester (identity and playbook)

CLI-398's prose sweep covered the four PM directories — which is exactly what the predecessor
finding's own "Fix Applied" describes — and nothing else. The claim generalised from the ten files
that were fixed to the whole tree. Every developer, tester, researcher and meta agent still ships a
handoff line naming a sub-agent Claude Code cannot invoke.

Discovered while running the predecessor's own Proposed Standard — `grep -rn "<old-name>"
src/agents/` — as the final step of the PM consolidation (CLI-399). The grep for the four PM names
came back clean; the grep for the reviewer names it was modelled on did not.

## Fix Applied

None at the time — out of scope for CLI-399, which owns the PM names only. The PM half of the same
sweep did land: `grep -rn "web-pm\|api-pm\|cli-pm\|ai-pm" src/agents/` returns nothing, and that
claim was re-verified under CLI-431 and still holds.

**Swept under CLI-431 on 2026-08-07**, 35 references across 20 partials rewritten to the
consolidated `reviewer`. Three needed more than a name substitution, because the sentence carried a
domain split that no longer exists:

- `meta/agent-summoner/playbook.md`'s agent-category list said the `reviewer/` directory holds
  "web-reviewer, api-reviewer, cli-reviewer"; it holds one agent, and the line now reads like the
  `planning/` line beside it that CLI-399 already rewrote.
- The same file's output-format table row listed the same three as "Example Agents".
- The same file's worked example of a good boundary line routed React components to `web-reviewer`
  and CI/CD configs to `api-reviewer` — an illustration whose whole point is two distinct targets,
  so collapsing both to `reviewer` would have destroyed it. It routes to `web-developer` and
  `api-developer` instead, which is the boundary a real agent prompt draws.

**This finding's own enumeration was short, in the same way its predecessor's was.** It reported
"roughly twenty hits in fifteen files" and listed fifteen in `affected_files:`; the tree carried 35
hits in 20 files. Five files it never named: `researcher/cli-researcher/identity.md`,
`meta/convention-keeper/identity.md`, `meta/skill-summoner/identity.md`,
`meta/agent-summoner/playbook.md` and `developer/ai-developer/playbook.md`. The pattern is visible
in the list itself — it is almost entirely `identity.md`, and the three `playbook.md` entries it
does carry are the two whose identity sibling was already a hit. `affected_files:` here is a reading
of the grep, not its output.

One more reference lived outside `src/agents/` entirely, where the proposed gate would never have
looked: a comment in `src/cli/lib/configuration/config-generator.test.ts` describing a seeded agent
as `web-reviewer` while the code beside it correctly said `reviewer`. Both the short enumeration and
the out-of-scope hit are written up in
`2026-08-07-a-rename-sweeps-affected-files-list-was-a-reading-of-the-grep-not-its-output.md`.

Left in place deliberately rather than fixed in passing: several of the stale lines sit one line
away from a line CLI-399 rewrote (`tester/web-tester/identity.md` has "Code review -> web-reviewer
or api-reviewer" at line 18 and "Architectural decisions -> pm" at line 38), so the temptation to
sweep them was real and the scope rule is what held.

## Proposed Standard

Two things, both cheap:

1. **A finding's resolution claim must be the grep it quotes, run.** The predecessor asserted a
   clean grep as evidence of a fix that had never been run tree-wide. `README.md`'s "Resolution
   Model" should say: when `resolved_by:` cites a verification command, that command's output at
   the time of writing is the evidence, and a claim broader than the files listed in
   `affected_files:` needs the wider run to back it.

2. **Make the roster-rename grep a gate rather than a checklist item.** The predecessor already
   proposed the grep step for the consolidation checklist; two consolidations in, the step has been
   performed once and skipped once. The `no-restricted-syntax` rule that guards task IDs in test
   names is the shape available today: a lint rule over `src/agents/**/*.md` matching retired agent
   names would have failed CLI-398's own commit.
