---
type: architectural-drift
severity: medium
affected_files:
  - packages/matrix/scripts/generate-from-cli.mjs
  - packages/matrix/src/generated/stack-preloads.ts
  - todo/plans/D-239-web-ui-shared-matrix-package.md
standards_docs:
  - .ai-docs/reference/features/code-generation.md
date: 2026-08-06
reporting_agent: cli-tester
category: architecture
domain: infra
root_cause: rule-not-specific-enough
status: open
---

## What Was Wrong

`packages/matrix/scripts/generate-from-cli.mjs` writes **three** things, not two:

1. `src/vendor/**` — seven type files copied from `packages/cli/src/cli/types/`
2. `src/generated/agents.ts` — `AGENT_DEFINITIONS`, derived from `src/agents/*/*/metadata.yaml`
3. `src/generated/stack-preloads.ts` — `STACK_PRELOADS`, derived from
   `src/cli/lib/configuration/default-stacks.ts` (97 flags across the current stacks)

The plan for the replacement generator lists only the first two as outputs, and then instructs
deleting `generate-from-cli.mjs`. Taken literally that leaves `stack-preloads.ts` a generated file
with **no generator** — a committed artefact nothing can regenerate or check, which is the exact
condition the item exists to remove. The file is not dead: it exists because flattening a stack into
`BUILT_IN_MATRIX.suggestedStacks` drops the per-assignment `preloaded` flag, so the editor would
show every skill as not-preloaded without it.

The third output is easy to miss because the plan's own outputs table reads as exhaustive and the
old script's header comment advertises only "two outputs" while the body writes three.

## Fix Applied

None — discovery only, and the tests were written so this stays open rather than being decided by
accident. `scripts/generate-matrix-package.test.ts` pins the vendor set and `src/generated/agents.ts`
explicitly, but its byte-identity check iterates whatever `generate()` reports in `written`. If the
implementer adds `src/generated/stack-preloads.ts` to the outputs it is covered automatically and
must match the committed bytes; if they do not, no test fails. The decision is the owner's, not the
test suite's.

Confirmed by regenerating the whole matrix package into a scratchpad copy
(`AGENTS_INC_CLI=… bun scripts/generate-from-cli.mjs`) and diffing: all three outputs, including
`stack-preloads.ts`, are currently in sync with what is committed, so either choice starts from a
clean base.

## Proposed Standard

Two changes, both small:

1. **In the plan** (`todo/plans/D-239-web-ui-shared-matrix-package.md`, "The work (phase 1)" step 2):
   name all three outputs of the script being retired, or state explicitly that
   `stack-preloads.ts` is being dropped and why. A replacement's output list should be derived by
   reading the retiring script's write calls, not its header comment.
2. **In `.ai-docs/reference/features/code-generation.md`**: when the new generator lands, record its
   full output set in the generator table alongside `generate:types` and `generate:schemas`. That
   table is where a reader learns which committed files have a writer; a generated file absent from
   it is invisible.

More generally: **when a step deletes a generator, enumerate its writes before enumerating the
replacement's.** Any output present in the first list and absent from the second is either a
deliberate deletion (say so) or an orphan.
