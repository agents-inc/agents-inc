# Agents Inc — repository root

An agent composition framework for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).
Compose specialized subagents from atomic skills: pick a stack, choose your skills in the editor,
and compile subagents that carry exactly the skills you selected. This was a single
CLI package until 2026-08-04 and is now a monorepo; `packages/cli` is still the only workspace that
publishes to npm.

| Workspace            | What it is                                                                |
| -------------------- | ------------------------------------------------------------------------- |
| `packages/cli`       | the published CLI — `agents-inc` on npm                                   |
| `apps/editor`        | the editor (Vite + React, deployed to Cloudflare)                         |
| `apps/www`           | the Astro site — docs at `/docs`; `/` redirects to the editor             |
| `apps/server`        | the API worker (Hono)                                                     |
| `packages/matrix`    | the skill catalog the web app reads                                       |
| `packages/compile`   | the pure renderers the CLI writes with and the editor previews            |
| `packages/api`       | the typed `hc<AppType>` client everything calls the worker through        |
| `packages/api-mocks` | one MSW description of that worker, resolved by every suite that mocks it |
| `packages/ui`        | the design system the editor and the site both build on                   |
| `packages/*-config`  | shared eslint, prettier, typescript and vitest configs                    |

[`README.md`](./README.md) carries how to work in the repository.

## Where things live

- **[`docs/architecture.md`](./docs/architecture.md)** is the overview — the workspaces, how a
  configuration flows from the editor to installed sub-agents, generated code, tests and gates — and
  **[`packages/cli/CLAUDE.md`](./packages/cli/CLAUDE.md)** is the guide for CLI work specifically.
  Read both when the work is in that package — neither loads from here.
- **[`packages/cli/.ai-docs/standards/commit-protocol.md`](./packages/cli/.ai-docs/standards/commit-protocol.md)**
  — commit rules and the release checklist.
- **[`todo/`](./todo/)** holds everything outstanding, one file per workspace:
  [`cli.md`](./todo/cli.md), [`editor.md`](./todo/editor.md), [`www.md`](./todo/www.md),
  [`server.md`](./todo/server.md), [`repo.md`](./todo/repo.md) for the repository itself, and
  [`skills.md`](./todo/skills.md) for the skills marketplace repository, whose diffs land in
  [`agents-inc/skills`](https://github.com/agents-inc/skills) rather than here.
  [`plans/`](./todo/plans/) holds the detail for items that need it, and
  [`archive.md`](./todo/archive.md) records what has landed.
  [`ROADMAP.md`](./todo/ROADMAP.md) sequences everything outstanding across all six trackers —
  phases in execution order; the trackers stay canonical, the roadmap only orders them and is
  updated whenever a phase moves.
- **An item is deleted when it lands rather than ticked off**, and one line is appended to
  `archive.md`. There is no done column and nothing is struck through, so everything in a tracker is
  still open — and `archive.md` is the only record that a finished item ever existed.

## Repository-wide

- **Never run a git command that WRITES — read-only git is fine.** Reading is allowed and useful:
  `git status`, `log`, `show`, `diff`, `blame`, `stash list` — checking history, dating a
  regression, verifying what changed. What is forbidden is anything that mutates the index, the
  working tree, history or a remote: `git add`, `commit`, `reset`, `stash` (push/pop/drop),
  `checkout`, `restore`, `clean`, `push`, `rebase`, `merge`, amend. The user curates staging
  deliberately (clarified by the owner 2026-08-09; the rule previously read as an absolute ban).
  **The one exception is a `commit-plan` skill run** (owner, 2026-10-23: invoking it is the go):
  read-only until its plan is confirmed, writes only per that plan, push and publish only on a
  per-release confirm, and the authorization never passes to a sub-agent. This rule is in
  `packages/cli/CLAUDE.md` as well, but it is not the CLI's rule and that file does not load from
  here.
- **A commit plan is one planner and minutes, never a multi-agent run** (owner, 2026-10-22). Group
  the tree by concern into about 10–20 commits a person can review. Don't fan out analysts,
  reviewers or build simulations over it. Don't plan around the staged index: the owner unstages
  first. An hour-long, ten-agent run that produced 88 commits is what this rule forbids.
- **The CLI is deliberately narrower than the editor.** It handles a few clear use cases; the full
  experience is the editor, and the two front doors are not meant to be feature-equivalent. So a CLI
  surface that is smaller than the editor's is a design decision rather than a gap. The test is
  direction of travel: the CLI must **consume** anything the editor can produce — a payload it cannot
  install is a real defect — but it need not **author** what the editor authors. Both halves have
  already been ruled in practice: the skill-category dropdown is editor-only because nothing on the
  CLI side creates a custom skill, while the CLI installing editor-added external skills was a
  genuine blocker, because that is consumption.
- **Always compact the session at 200k context used.** Not at a hard limit, and not only when
  asked. Sessions here run long and orchestrate many sub-agents, each returning a large report, so
  context fills unevenly and a limit hit mid-programme loses the thread of what landed, what is
  running and what is still owed. Compact between units of work rather than mid-dispatch, so the
  summary records a clean state. Every orchestrator step re-reads its whole context, so a long session's context size multiplies across thousands of steps.
- **`packages/cli` formats itself** — 100 columns, semicolons, double quotes — while everything else
  uses the root config. Prettier picks the nearest config walking up, so this happens on its own; the
  reasoning is in the `//` notes in [`package.json`](./package.json).
- **Comments are few and short** (owner, 2026-10-30, after finding too many again). Write one only
  where the code cannot say it: a non-obvious why, a workaround, a constraint from outside the code.
  One line where one will do. Never narrate what the code does, restate a name or type, tell the
  code's history or the change ("now", "no longer", "previously", lane, ticket or card ids), or
  answer a reviewer. Tests too: a test's name says its behaviour. Directive comments
  (`eslint-disable` and `@ts-expect-error` with their reason, `// KNOWN GAP:`) stay. When you touch
  a file, trim its comments that fail this.

## How work gets implemented

Agreed process. It applies to every item in `todo/` except a quick fix (below), and the order is
the point.

1. **Write the tests first — end-to-end plus whatever else fits — and watch them fail.** A test
   that has never failed has not been shown to test anything.
2. Implement until they pass.
3. **Then** apply the `meta-design-expressive-typescript` skill — that skill only, no sub-agents —
   and bring the code in line with its principles.
4. **Then run it by hand through the CLI** and confirm it does what it claims. Passing tests and a
   working command are different claims; the `--from` work proved that when a green-looking path
   exited 13 on an unsettled Ink render that no assertion covered.
5. **Then update the thin docs where something became false** — `docs/`, the READMEs and the
   `CLAUDE.md` files.
6. **Then update `todo/`, in the same turn the work lands.** Delete the row from its tracker, append
   one line to [`archive.md`](./todo/archive.md), and update [`ROADMAP.md`](./todo/ROADMAP.md) if a
   phase moved. All three, always — a finished task still sitting in a tracker is indistinguishable
   from an unstarted one, and `archive.md` is the only record that it ever existed. **The roadmap is
   the half that gets forgotten**: it once ran a full day stale while eleven of its twenty rows
   landed, which would have told a fresh session the programme had not started.

No jumping to step 2, and steps 5 and 6 are not a tidy-up phase to batch at the end — they are how
the work is finished.

**A quick fix skips the chain** (owner, 2026-10-03 and 2026-10-30). It qualifies when the cause and
the fix are both clear, the change is a few lines in one place, no owner choice is involved, and
nothing else changes behaviour — a wrong string, a stale doc line, a one-line guard, a data entry an
owner ruling already decided. One developer does it: a failing test first only when behaviour
changes, the fix, the touched package's gates, a hand-run when a user sees the change, then steps 5
and 6. No separate tester, no reviewer, no expressive-typescript pass, no fix rounds. If it proves
bigger, it goes back to the full process.

**Sub-agents do not edit `todo/`.** The orchestrator does, as each agent lands. The trackers carry
curated git staging and several agents land at once, so briefs should say so explicitly.

## How work gets briefed

A **brief** is the prompt one agent hands another — a dispatch to a sub-agent, an instruction
carried between sessions, a hand-off written from a tracker row. The contract is
[`docs/briefing.md`](./docs/briefing.md) and
it binds both ends: read it before dispatching work, and before executing a dispatch.

**It is a discipline rather than a gate, because a brief is not a tracked file and no checker can
open one.** Four of its rules are restated here because everything else depends on them:

- **Re-derive before you write.** Every figure, site list and symbol name in a brief was measured
  against a tree that has since moved. An agent whose row turns out not to describe the tree stops
  on that row, reports it with evidence, and moves on — it does not invent work to justify the row.
- **A brief carries the command, not its result.** No count in a brief; write the invocation that
  produces one. A number is correct when written and wrong within days, and the reader cannot tell
  which they are holding.
- **Corrections are a required field of every report** — what in the brief proved false, with
  "nothing" written out when nothing did. A silent report is indistinguishable from a brief that
  held, and this field is the only thing that keeps the error rate visible. Its other half is the
  orchestrator's: one line per dispatch into the programme's own progress file under
  [`todo/plans/`](./todo/plans/), because a correction read once and discarded measures nothing —
  the rate is a fact about a programme, and nothing turns a per-dispatch answer into one unless it
  is written down as each lane lands.
- **Name the files each lane owns whenever more than one agent is working.** An agent needing a
  change in someone else's file reports the exact change rather than making it.

**Never build an owner decision that was not given** (owner, 2026-10-21). A question put to the owner (a
decision card, a questions page, an open ruling) is answered only by the owner. If the answer cannot be found, stop
that work and say where you looked; a recommendation is never built in its place, and no brief tells an agent to.

Three principles were ruled on 2026-08-19 and are not re-litigated: **the verifier is never the
fixer**; **a verdict carries a reproduction, not a judgement**; and **prefer deleting a claim to
rewriting it**, since every rewrite is a new claim that can rot.
