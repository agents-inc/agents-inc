# Roster realignment — the sixteen remaining agents and the eighty-four web skills

Progress file for the programme that carries the 2026-09-03 summoner refactor out across the rest
of the roster. The two summoners, the shared `agent.liquid` template, its one surviving methodology
partial and three standards documents were rewritten in
[`summoner-context-engineering-2026-09-03.md`](./summoner-context-engineering-2026-09-03.md);
nothing else moved. This programme moves everything else.

**Started 2026-09-03.** One line per dispatch, appended as each lane lands — a correction read once
and discarded measures nothing.

---

## Scope

| Lane | Subject                                 | Count | Acting as                      | Owns                                           |
| ---- | --------------------------------------- | ----- | ------------------------------ | ---------------------------------------------- |
| A    | the agents that have not been realigned | 16    | `agent-summoner`, Improve mode | `packages/cli/src/agents/<category>/<name>/**` |
| B    | the marketplace's web skills            | 84    | `skill-summoner`, Improve mode | `/home/vince/dev/skills/src/skills/<skill>/**` |

Re-derive both rosters rather than trusting the counts above:

```
ls -d packages/cli/src/agents/*/*/ | grep -vE '_templates|agent-summoner|skill-summoner'
ls -d /home/vince/dev/skills/src/skills/web-*/
```

## The authority chain

The five rules and the rulings recorded in `summoner-context-engineering-2026-09-03.md` outrank
every standards document wherever they conflict. Under them: `skill-atomicity-primer.md` outranks
`skill-atomicity-bible.md`; `prompt-bible.md` governs agent prompts and the skill-content tags.

## What "realign" means, and what it does not

Lane A is the agent-summoner's `<improve_workflow>` run against an agent that has never seen it.
Lane B is the skill-summoner's Improve workflow scoped to **alignment with the rewritten standards**
— structure, atomicity, voice, concision, progressive disclosure — rather than a full re-research of
every technology. An API contradicted by the sources gets fixed; a technology whose surface merely
moved gets reported. The distinction is what keeps 84 lanes finite, and it is an orchestrator
decision recorded here rather than an owner ruling.

## Shared files no lane may touch

Reported back as an exact change instead, and applied once by the orchestrator:

- `packages/cli/src/agents/_templates/**`
- `packages/cli/.claude-src/config.ts` and `packages/cli/.ai-docs/standards/**`
- `packages/cli/.ai-docs/agent-findings/INDEX.md`
- `todo/**`
- every generated artefact — `bun run generate`, `npx agents-inc compile`, the marketplace build

## Dispatch log

| #   | Lane | Subject | Verdict | Corrections reported |
| --- | ---- | ------- | ------- | -------------------- |
