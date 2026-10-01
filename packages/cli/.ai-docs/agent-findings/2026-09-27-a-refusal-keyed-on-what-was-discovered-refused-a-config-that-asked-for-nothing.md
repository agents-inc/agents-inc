---
type: anti-pattern
severity: high
affected_files:
  - src/cli/commands/compile.ts
  - e2e/commands/compile.e2e.test.ts
standards_docs:
  - CLAUDE.md
date: 2026-09-27
reporting_agent: general-purpose
category: testing
domain: cli
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  compile.ts runs a zero-skill pass whose config declares no skill and pins an agent on
  (`declaresOnlyBaseAgents`), and the refusal is kept for a config whose declared skills are all
  missing. Pinned by e2e/commands/compile-a-skill-less-installation.e2e.test.ts and the "a pass
  that discovers no skills" pair in src/cli/lib/__tests__/commands/compile.test.ts.
---

## What Was Wrong

`compile` refused any run in which no pass DISCOVERED a skill, which conflated two installations:
one whose config declares skills that are all gone (a lost install — refusing is right), and one
whose config declares no skill at all but pins sub-agents on as base agents, which the editor
produces and `init --from` installs by compiling them. The second could never be recompiled, so a
hand edit to `model` or `effort` never reached the compiled agent and a deleted agent file never
came back.

Two specs in `e2e/commands/compile.e2e.test.ts` ("should fail when no skills are available" and
"missing skills directory") pinned exactly that case — `skills: []` beside a pinned agent — as a
refusal with no agents directory. The defect was consistent, so the pin read as an ordinary green
invariant: CLAUDE.md's "never encode a known gap in an assertion's ARITY, LENGTH or ABSENCE". The
user-facing troubleshooting page already described the narrower rule ("the config declares skills
and none of them are installed under it"), so the page was right and the product was not.

## Fix Applied

The refusal now keys on what the config asks for as well as what was discovered. Both specs' fixtures
now declare a skill that is not on disk, which is the case the refusal still exists for.

## Proposed Standard

None new. The existing ABSENCE rule covered this; the pin sat in a spec whose comment described the
fixture ("declare an agent so the project is a detected installation") rather than the behaviour,
which is the shape to look for.
