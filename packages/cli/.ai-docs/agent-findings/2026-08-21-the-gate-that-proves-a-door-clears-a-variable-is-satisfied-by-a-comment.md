---
type: anti-pattern
severity: high
affected_files:
  - src/cli/lib/__tests__/e2e-runner-environment.test.ts
  - scripts/check-spawn-doors.ts
  - scripts/check-spawn-doors.test.ts
  - e2e/helpers/test-utils.ts
  - src/cli/utils/logger.ts
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-08-21
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: >-
  The per-runner clearing check now reads the syntax tree instead of the source text.
  `clearances()` in `scripts/check-spawn-doors.ts` reports, per DOOR, the variables that door sets
  to `undefined` in the environment it hands the child, following the locals a door assembles its
  env through; `e2e-runner-environment.test.ts` consumes it in place of
  `source.includes("<NAME>: undefined")`. Mutation-checked in both directions — see the measurement
  below.
---

## What Was Wrong

In plain terms: the check that proves each E2E runner strips a variable before starting the CLI
was looking for a piece of **text** in the runner's file, not at what the runner actually **does**.
A comment saying "we clear VITEST" satisfied it exactly as well as the line that clears VITEST.

The mechanism. `src/cli/lib/__tests__/e2e-runner-environment.test.ts` requires every spawn door to
hand the child `<NAME>: undefined` for each of the five variables the product reads. It asked for
that by substring:

```ts
const uncleared = EVERY_PRODUCT_ENV_VAR.filter((name) => !source.includes(`${name}: undefined`));
```

A property assignment and a sentence describing one are the same substring. This is not a shape
that had to be invented to break it — `src/cli/utils/logger.ts` already carried the sentence
"hand the spawned binary `VITEST: undefined`" in prose, so the exact string the gate hunts for
lives in this repository as a comment.

**Measured, not reasoned.** Replacing `runCLI`'s `VITEST: undefined` line with a comment saying it:

| Check                                               | Before this fix | After                       |
| --------------------------------------------------- | --------------- | --------------------------- |
| `e2e-runner-environment.test.ts`                    | **8 passed**    | red, naming `execa: VITEST` |
| `warn-suppression-stops-at-the-harness.e2e.test.ts` | red (1 of 4)    | red (1 of 4)                |

So the gate reported a clean runner while that door handed the harness's `VITEST` to every binary
it spawned. The only thing that noticed was one e2e spec, and it covers **one of the five
variables**. `CC_MARKETPLACE`, `AGENTS_INC_API_URL`, `XDG_CACHE_HOME` and `GIGET_AUTH` had this
substring scan as their sole protection, and it could be satisfied by prose.

Two further readings of the same check were also too coarse, and both are closed by the same
change. It read per FILE — a file with two spawn calls passed on whichever one was written
correctly. And it could not see WHERE the text sat, so a clearing line in an object literal that no
spawn is handed counted, which is the module-scope mistake `check()` already refuses for the
version-check guard one function away.

**No live leak exists today.** All three doors clear all five variables correctly. What was wrong
is the evidence, not the behaviour — this is the gate for a defect class (a spec that passes by not
looking), and it was itself the shape it exists to catch.

## Fix Applied

`scripts/check-spawn-doors.ts` already parsed each door and followed its environment expression
through local declarations, because the PTY harness assembles its env two locals away from its
spawn. That traversal was extracted (`envSourcesOf`) and is now shared by both questions asked of a
door:

- `check()` — does this door reach `NO_BACKGROUND_VERSION_CHECK`? (unchanged behaviour; its 13
  existing fixture contracts still pass)
- `clearances()` — which variables does this door set to `undefined`? (new)

`e2e-runner-environment.test.ts` consumes `clearances()`, judges per door rather than per file, and
gained a second subject guard: a roster entry whose doors the scan cannot see now fails loudly
instead of reporting a clean runner for a reason unrelated to the environment.

Mutation-checked, all four restored afterwards:

| Mutation                                           | Result                                           |
| -------------------------------------------------- | ------------------------------------------------ |
| Delete `VITEST: undefined` from `runCLI`           | red — `["VITEST"]`                               |
| Replace that line with a comment saying it         | red — `["execa: VITEST"]` (**was green**)        |
| Point a roster entry at a file that is not a door  | red on the new subject guard, by its own message |
| Fixture door naming the variable only in a comment | `clears: []`                                     |

Also corrected: the `suppressInTest` docblock in `src/cli/utils/logger.ts` said "Both E2E runners"
after the third door landed. The count is removed rather than incremented — it points at the
derived roster instead, which is the only place the number is correct by construction.

## Proposed Standard

For `.ai-docs/standards/e2e/README.md`, beside the existing rule that a verdict is judged on the
specific signal that answers its question (already applied there in this change):

> **A gate that asserts code DOES something reads the syntax tree, never the source text.** A
> substring is satisfied by a comment, by a string literal, by a disabled block and by a sibling
> function — all four of which are ways of not doing the thing. Where the claim is "this call
> passes X", parse it; `scripts/check-spawn-doors.ts` is the worked example, and it already had to
> parse for a neighbouring question, so the textual check sat one import away from a correct one.

This does not conflict with CLAUDE.md's "No parser/extractor helpers in test files" — it is that
rule's other half. The parsing lives in `scripts/`, with its own suite, and the spec imports a
named function; a regex scan inlined into the test file would have violated both rules at once.

**Census, not a sample.** `.includes(` against a template literal across `src/cli/lib/__tests__`,
`scripts` and `e2e` returns five hits, and four are not this class — three in
`e2e/assertions/four-surfaces.ts` and one in `selected-agent-name-excluded.e2e.test.ts` call
`.includes` on an ARRAY, where it is exact membership rather than a substring.

```
grep -rnE '\.includes\(`' src/cli/lib/__tests__ scripts e2e --include='*.ts' --include='*.tsx'
```

The one genuine sibling is `src/cli/lib/__tests__/toast-assertion-surface.test.ts`, whose staleness
guard asks whether `e2e/pages/constants.ts` still declares each toast key by looking for
`` `${key}:` `` in its text — satisfiable by a comment naming the key. It is graded lower than the
subject of this finding rather than waved through: it guards a roster rather than a spawned
environment, and its failure mode is a roster going stale unnoticed, which is the thing it exists
to prevent. Converting it means parsing `constants.ts` for actual declarations.

## The Second Defect, Found by the Fix

The derived roster earned its keep the same afternoon. An ad-hoc hand-run script appeared at the
package root — untracked, referenced by nothing — and it is a fourth spawn door:

```js
env: { ...process.env, HOME: home, NO_BACKGROUND_VERSION_CHECK: "1", FORCE_COLOR: "0" },
```

Two defects in one line. It spreads `process.env`, so it hands the child all five variables. And
`NO_BACKGROUND_VERSION_CHECK` is the **JS constant's** identifier, not an environment variable —
the real one is `AGENTS_INC_SKIP_NEW_VERSION_CHECK`, which that constant holds as its single key.
So oclif's update plugin was never suppressed, and the detached-child race the constant exists to
prevent was live for every run of that script.

`check()` reported the door **guarded**, because `identifiersIn` collected identifiers written as
property KEYS alongside those standing for values. Naming the constant and spreading it are
opposites, and the scan could not tell them apart — a false GUARDED, which is worse than a false
unguarded, because a hit can be argued with and a silence cannot be seen. Fixed:
`valueIdentifiersIn` skips a `PropertyAssignment`'s name, and a fixture door spelling the guard as
a key is now reported unguarded.

The general form is worth more than the instance: **where a constant's value is what matters, a
check that matches its NAME accepts every use that hands over nothing** — the name appears in a
key, a comment, an import it never spreads, and a log line, and only one of those is the thing.

CLAUDE.md § Test Assertions already records the same defect at `toHaveConfig`, whose `skillIds`
check is `content.includes(id)` while the fields beside it load the artefact structurally. That
entry and this finding are the same rule arriving from two directions, which is the argument for
writing it down once as a general one.
