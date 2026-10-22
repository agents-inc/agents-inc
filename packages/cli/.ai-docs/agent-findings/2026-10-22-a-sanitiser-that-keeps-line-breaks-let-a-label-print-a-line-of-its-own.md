---
type: standard-gap
severity: high
affected_files:
  - packages/cli/src/cli/utils/string.ts
  - packages/cli/src/cli/lib/matrix/matrix-provider.ts
  - packages/cli/src/cli/lib/compile-seat.ts
  - packages/cli/src/cli/utils/messages.ts
  - packages/cli/src/cli/commands/edit.tsx
  - packages/cli/src/cli/lib/stacks/stacks-loader.ts
  - packages/cli/src/cli/lib/configuration/config.ts
standards_docs:
  - packages/cli/.ai-docs/standards/clean-code-standards.md
date: 2026-10-22
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: rule-not-specific-enough
status: partial
partial_note: >-
  Landed: `inertLine` in `utils/string.ts` (strip, then fold each line break into a space), used by
  `getSkillDisplayName`, edit's added-skill line, the skip warnings' `unknownKeys` and the
  compile-seat sink for every compile diagnostic. Open: `clean-code-standards.md` 5.8 still names
  `stripTerminalControls` for all foreign text and does not tell a value printed inside a line from
  a body printed on its own lines.
---

## What Was Wrong

Standard 5.8 sends every piece of text the CLI did not author through `stripTerminalControls`, and
5.8b keeps line feed and tab on purpose, because a store's multi-line refusal is honest text. That
is right for a body printed on lines of its own. It is wrong for a value printed **inside a line the
CLI writes**: a line feed in it ends the CLI's line and starts a new one at column 0, where the next
words read as the CLI's own.

A shared link carries such values, and the store's mint accepts them (`displayName` and
`codexModel` are `z.string().min(1)` in `packages/matrix/src/seed.ts`). Seen red against the build
before the fix:

- A carried skill named `House\nNothing removed.\nTool` printed the plan of `init --from` as
  `    House` / `Nothing removed.` / `Tool (external-web-testing-house)`, the middle row at column 0.
  `edit --from` at a terminal put the same sentence as its own row under `Will be overwritten:`, and
  as its own line in the change summary (`  + House` / `Nothing removed.` / `Tool [P]`).
- A sub-agent's `codexModel` reached `diagnostics().warn` in `@workspace/compile` and then the
  CLI's `console.warn` with no sanitising at all: the warning carried the OSC title sequence, the
  bell and the line break (`asks for Codex model 'm\u001b]0;CM\u0007` / `Nothing removed.', …`).
- The skip warnings' `unknownKeys` stripped controls but kept the line feed, so a payload key could
  add a line to the warning.

## Fix Applied

`inertLine(text)` in `utils/string.ts`: `stripTerminalControls(text)` with every remaining line feed
replaced by one space. The order lives inside the function, as `truncateText`'s does: folding first
turns `"a\u001B\nb"` into `"a\u001B b"`, and `OTHER_ESCAPE` then eats the space. Tab is kept. Callers:
`getSkillDisplayName`, edit's `addedSkill`, `unknownKeys`, and the `compile-seat.ts` sink, which now
passes every compile `warn` and `verbose` through it. `stripTerminalControls` is unchanged.

Held by `string.test.ts` "inertLine", `matrix-provider.test.ts` "renders a display name written
across lines on one line", `messages.test.ts` "names a configuration's own key written across lines
on one line", four cases in `a-link-carrying-terminal-controls.test.ts`, and e2e legs in
`init-from-codex-model`, `init-from-external-skills` and `interactive/edit-from`. Each was seen
failing before the change.

**What nothing catches.** The compile sink folds a diagnostic that is legitimately multi-line. Every
compile diagnostic today is a one-line template (`grep -n "diagnostics()"
packages/compile/src/*.ts`). Only the `compile-seat.ts` docblock records the one-line contract.

**Siblings, from `grep -rn "stripTerminalControls(" packages/cli/src --include='*.ts'
--include='*.tsx' | grep -v test` (a census of production call sites), not repaired here:**

- `formatZodIssue` in `lib/schema-validator.ts` prints a zod issue's path and unrecognised keys
  inside a `; `-joined line. Its callers validate a marketplace's own documents (`SKILL.md`
  frontmatter, `metadata.yaml`, a source config), so a marketplace key holding a line feed adds a
  line. A fetched seed payload never reaches it: `payloadIn` in `lib/seed/fetch-seed.ts` refuses
  with fixed text.
- `reportValidationErrors` on `BaseCommand` warns with `stripTerminalControls(error.message)`. Its
  messages quote ids. A link's catalogue ids cannot hold a line feed, and its carried ids are
  refused if they do. Whether a marketplace's ids can was not checked.
- Repaired in a later round, both missed by this census:
  - A payload's `stackId`, quoted by `stackNotOfferedMessage` (`lib/stacks/stacks-loader.ts`) in the
    refusal `init --from` and `edit --from` print, kept its line feeds. It goes through `inertLine`.
  - A payload's `marketplace` reached `validateLocalPath`'s refusal and the "Local marketplace not
    found" refusal with its line feeds. `refuseLineBreaksAndControls` in
    `lib/configuration/config.ts` now refuses any value `inertLine` would change, echoing it inert.
    On the remote branch it runs after `refuseCredentials`, which `config.test.ts` holds with "a
    line ending" in `RESPELLED_CREDENTIALS`. Every later echo, `verbose` included, sees a clean value.
  - Held by `stacks-loader.test.ts`, `config.test.ts` `SOURCE_REFUSALS`, the stack and marketplace cases in
    `a-link-carrying-terminal-controls.test.ts` and an e2e leg each in
    `from-refuses-an-unshipped-stack-before-writing` and `init-from-shared-config`.
  - Not repaired, and not reachable: `loadStackById`'s `verbose` lines and `buildInstallConfig`'s
    quote the raw `stackId`, but no command `init` or `edit` runs turns verbose output on.
- `read-piped-payload.ts`, `utils/errors.ts` and the `search` table keep line feeds correctly: the
  first two print multi-line bodies, and `@oclif/table` folds a cell itself.

## Proposed Standard

`clean-code-standards.md` 5.8: split the rule by where the text lands. A foreign **body** printed on
lines of its own goes through `stripTerminalControls`, as 5.8b says. A foreign **value** printed
inside a line the CLI writes (a label, a quoted id, an interpolated field) goes through
`inertLine`. The section's "three chokepoints carry it" sentence was already false before this
change: the display-name accessor, `unknownKeys`, `search` and `reportValidationErrors` sanitise
for themselves. Prefer deleting that sentence over listing the sites again, since a list of sites is
a count that goes stale.
