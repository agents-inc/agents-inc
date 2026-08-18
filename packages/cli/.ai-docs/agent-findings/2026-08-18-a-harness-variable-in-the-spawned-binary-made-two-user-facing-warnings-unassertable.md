---
type: anti-pattern
severity: high
affected_files:
  - packages/cli/e2e/fixtures/cli.ts
  - packages/cli/e2e/helpers/terminal-session.ts
  - packages/cli/src/cli/utils/logger.ts
  - packages/cli/src/cli/lib/stacks/stacks-loader.ts
  - packages/cli/src/cli/lib/configuration/config-generator.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-08-18
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: missing-rule
status: partial
partial_note: >-
  Code side landed — both runners now clear VITEST for the child and a spec pins it in
  each of them. Standard side pending: no rule yet states that a runner must hand the
  spawned binary a USER's environment, and nothing enforces it, so the third runner
  will reintroduce the leak.
---

## What Was Wrong

`warn(msg, { suppressInTest: true })` (`src/cli/utils/logger.ts`) drops the message when
`process.env.VITEST` is set. That is reasonable for a unit run, where `warn` executes inside the
vitest process. It was not confined there: **both** E2E runners handed their own environment to the
spawned binary — `CLI.run` through execa, which inherits `process.env` by default, and
`TerminalSession` through an explicit `...process.env` spread. So every warning carrying the flag
was suppressed in every E2E run of the real binary.

The failure mode is the dangerous one rather than the noisy one. Nothing errors, nothing is
skipped; the line simply is not printed, so **a spec asserting one of those warnings passes by not
looking**. The suppression is invisible from the spec, from the page object and from the product —
it lives in an environment variable that no file in the test's call chain mentions.

Two live call sites, both user-facing:

| Site                                                                   | Message                                                                                                                                                      | Reachable through                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `resolveAgentConfigToSkills` (`src/cli/lib/stacks/stacks-loader.ts`)   | `Skill '<id>' for category '<cat>' not found in matrix. It may be a custom or local skill.`                                                                  | `compile`, `doctor`, `base-command`, `local-installer` — every one via `getStackSkillIds` |
| `reportAbsentSkills` (`src/cli/lib/configuration/config-generator.ts`) | `Skill '<id>' is not in this marketplace — it stays in the configuration and no sub-agent is given it. Run '<cmd> update' … or remove it with '<cmd> edit'.` | `generateProjectConfigFromSkills`, i.e. the install write in `local-installer.ts`         |

**Audit result: no spec was passing blind, and that is worse than it sounds.** The unit specs that
cover these two warnings (`config-generator.test.ts`, `stacks-loader.test.ts`) mock `warn` and
assert it was _called_, so they intercept above the gate and are sound. No E2E spec asserts either
message — because none could. `standards/e2e/user-journeys.md` records exactly that against journey
31: the second screen of a kept-unplaceable id "is **TO TEST**, and it is the one row here whose
spec needs a harness change first". So the leak did not corrupt an existing assertion; it prevented
one from ever being written, and the tracker absorbed that as an ordinary coverage gap.

The asymmetry that should have given it away: `scripts/handrun.mjs` runs outside vitest, so `VITEST`
is unset there and the hand-run harness saw both warnings the whole time. The suite and the hand-run
disagreed about what the same command prints, and the disagreement read as a hand-run quirk.

`resolveAgentConfigToSkills` in particular fires on any stack entry naming an id the loaded
catalogue does not declare — which is the normal state for every fixture-marketplace spec in the
suite, since fixture ids are namespaced. The line was being generated constantly and discarded.

## Fix Applied

Both runners now clear `VITEST` for the child:

- `e2e/fixtures/cli.ts` — `VITEST: undefined` beside the existing `CC_MARKETPLACE: undefined`,
  before the caller's `options.env` spread, so a spec can deliberately re-inject it.
- `e2e/helpers/terminal-session.ts` — `VITEST: undefined` in the post-spread harness-invariant block
  beside `NO_COLOR` / `FORCE_COLOR`; the existing `isDefinedEntry` filter strips it before
  `pty.spawn`.

Chosen over the alternative (give the suppression a variable the runners do not forward) for three
reasons. `TerminalSession` spreads all of `process.env`, so "a variable the runners do not forward"
cannot exist without changing the runners anyway. The product needs no change at all this way —
`warn` is untouched. And it is not a new idea in the file it lands in: `CLI.run` already clears
`CC_MARKETPLACE` and pins `CLAUDE_CONFIG_DIR` on the identical principle, that a harness variable
which changes product behaviour must not reach a spawned binary.

Pinned by `e2e/commands/warn-suppression-stops-at-the-harness.e2e.test.ts`: the advisory through
`CLI.run`, the same through a PTY (`InteractivePrompt`), and a control that re-injects `VITEST` for
one child and asserts the line disappears again — so a green run is the runners having stopped
forwarding it, not the suppression having been deleted from the product. Watched red before the
fix, on both runners, with the same command reproduced by hand outside vitest printing the advisory
twice.

## Proposed Standard

Add to `standards/e2e/README.md` § Critical Rules:

> **A spawned binary gets a USER's environment, not the harness's.** `CLI.run` and
> `TerminalSession` build the child's environment; every variable that the PRODUCT reads and the
> HARNESS also sets must be cleared there. `CC_MARKETPLACE`, `CLAUDE_CONFIG_DIR` and `VITEST` are
> the three known instances. The failure is silent by construction: the child behaves differently
> from the binary a user runs, and a spec asserting the user's behaviour passes by not looking.
> When adding a third runner, or when the product starts reading a new environment variable, check
> both directions.

The mechanical half is cheap and worth more than the prose. `src/cli/lib/__tests__/spec-gates.test.ts`
is the existing precedent for a repository-shaped assertion: grep `src/cli/` for `process.env.<NAME>`
reads, and fail if a name that appears there is neither cleared nor explicitly pinned by both
runners. That turns "we remembered" into "it cannot regress", which is the difference between this
finding and the next one.

Second, narrower rule, for `logger.ts`: `suppressInTest` gates on the environment of whatever
process evaluates it, so it can only ever mean "quiet in a unit run". The doc comment on
`WarnOptions` should say so, because "suppresses this warning in test environments" reads as a
promise about E2E runs too, and until now it silently kept it.
