---
type: anti-pattern
severity: medium
affected_files:
  - src/cli/consts.ts
  - apps/www/scripts/check-editor-address.ts
  - scripts/check-mirrored-constants.ts
standards_docs:
  - .ai-docs/standards/briefing.md
date: 2026-10-21
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: rule-not-visible
status: resolved
resolved_by: >-
  check-editor-address.ts reads the literal from DEFAULT_EDITOR_URL, as check-mirrored-constants.ts
  already did; the root `bun run test` is green on www#test again.
---

## What Was Wrong

`EDITOR_URL` in `src/cli/consts.ts` became `process.env.AGENTS_INC_EDITOR_URL ?? DEFAULT_EDITOR_URL`.
Two checkers parse that file's AST and require the constant's initializer to be a string literal.
One is in this package (`scripts/check-mirrored-constants.ts`) and the lane fixed it. The other is
in another workspace (`apps/www/scripts/check-editor-address.ts`, run by `www#test`), and it
refused with `'EDITOR_URL' in packages/cli/src/cli/consts.ts is not a string literal`. turbo then
stopped `agents-inc:test` before it printed a summary.

The lane's gate ran vitest inside `packages/cli` and `packages/compile` only, so it never ran the
www checker. Nothing in `packages/cli` points at a reader in `apps/www`.

## Fix Applied

`readEditorAddress` reads `DEFAULT_EDITOR_URL`, and the messages that name the address read name
that constant too. The `editorConfigUrl` template check stays on `EDITOR_URL`. The search for every
checker of this kind, `grep -rn 'EDITOR_URL' apps/www/scripts packages/cli/scripts`, lists these
two. `consts.test.ts` holds the fallback ("is the live editor when no other address is set"), so
`EDITOR_URL` cannot quietly stop falling back to the literal the checkers read.

## Proposed Standard

None new. `briefing.md` already says a gate is the repository's unfiltered command. The root
`bun run test` caught this through `www#test`, and a package-scoped vitest run cannot. Before
changing the shape of a constant's initializer, grep its name across every workspace's `scripts/`,
not only this package's.
