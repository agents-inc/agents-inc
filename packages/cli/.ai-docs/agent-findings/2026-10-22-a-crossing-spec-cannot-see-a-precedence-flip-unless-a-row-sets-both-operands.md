---
type: standard-gap
severity: medium
affected_files:
  - apps/editor/src/features/configure/lib/output-preview.ts
  - apps/editor/e2e/specs/preview-matches-install.spec.ts
  - packages/cli/src/cli/lib/installation/local-installer.ts
standards_docs:
  - docs/architecture.md
date: 2026-10-22
reporting_agent: cli-developer
category: testing
domain: e2e
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  The description instance is fixed and has a crossing row. No rule yet says that a
  precedence copied into both runtimes needs a crossing row setting both operands, and the model
  and effort sites below have none.
---

## What Was Wrong

`resolveDescription` exists twice: the CLI's in `local-installer.ts` and the preview's copy in
`output-preview.ts`. A CLI fix changed the CLI's from `stack ?? shared` to `shared ?? stack` and
left the preview's copy alone. From then on, a payload carrying both a `stackId` and its own
`description` drew the stack's description in the preview while `init --from` wrote the link's.

Every suite stayed green, for two reasons:

- Each side's unit specs pin that side's own order. The preview's spec "carries the applied stack's
  description" sets a stack and no link description, so either order passes it.
- `preview-matches-install.spec.ts` compares every byte, but only for the inputs its rows hold. No
  row set both a `stackId` and a `description`, so both orders gave the same bytes.

"The preview and the install share their renderers" (`docs/architecture.md`) is true of the
renderers. The rules that build the config those renderers draw are copies, and the crossing spec
checks a copy only where a row makes the two orders differ.

## Fix Applied

- The preview's `resolveDescription` is now `shared ?? stack?.description`, matching the CLI.
- `output-preview.test.ts`: "carries the link's own description over the applied stack's, as the
  install does". It was red before the fix: the preview drew the stack's description.
- `preview-matches-install.spec.ts`: row `HbrDesc7`, `HARBOR_STACK` plus a description of its own.
  It was red before the fix, with one differing line in `./.agents-inc/claude/config.ts`.

## Proposed Standard

For `apps/editor/e2e/README.md`, beside the crossing spec: where the preview chooses between two
sources (`a ?? b`), and the CLI makes the same choice in its own code, the crossing spec needs a row
in which both operands are set and differ. A row with only one operand set passes whichever way
round the copy is.

Census, `grep -n " ??" apps/editor/src/features/configure/lib/output-preview.ts`, as run here. Four
sites choose between two sources rather than falling back to an empty default:

- `resolveDescription`: now has a row.
- `agent.effort ?? definitionFields.effort` and `agent.model ?? definition.model`: no crossing row
  pins an agent's model or effort; every row's agents carry only `scope`. Unit specs pin the
  preview's order. The CLI's `assembleAgentConfig` in `packages/cli/src/cli/lib/resolver.ts` reads
  `agentConfig.model ?? definition.model` and `agentConfig.effort ?? definition.effort`, the same
  order, so nothing differs today; no crossing row would catch a flip of either
  (`grep -rn "model ??\|effort ??" packages/cli/src --include='*.ts' | grep -v test`).
- The activation description in `resolveSkill`: not checked here.

No checker is proposed. Whether a `??` copies a CLI rule cannot be read lexically.
