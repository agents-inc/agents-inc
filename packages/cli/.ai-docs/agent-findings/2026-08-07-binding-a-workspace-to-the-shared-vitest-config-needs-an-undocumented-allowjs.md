---
type: standard-gap
severity: low
affected_files:
  - apps/server/tsconfig.json
  - apps/editor/tsconfig.node.json
  - packages/matrix/tsconfig.json
  - packages/vitest-config/node.d.ts
  - packages/vitest-config/package.json
  - packages/cli/.ai-docs/reference/monorepo-layout.md
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: resolved
resolved_by: "Closed 2026-08-08 by Proposed Standard 2 — the requirement was removed rather than documented. packages/vitest-config now ships node.d.ts beside node.js, and all three `allowJs: true` entries and their three five-line comments are deleted (apps/server/tsconfig.json, apps/editor/tsconfig.node.json, packages/matrix/tsconfig.json). Measured, not assumed: with allowJs gone and no declaration, all three workspaces failed on TS7016 naming packages/vitest-config/node.js; with the declaration and still no allowJs, all three are green, and `bunx turbo run typecheck` is 8/8 repo-wide. A probe pinning `nodeConfig` to an incompatible type reports `UserConfig` under both routes, so the declaration loses no type fidelity against what allowJs inferred — `defineConfig(config: UserConfig): UserConfig` is what both resolve to. Suites unchanged and collecting: matrix 263, editor 207, server 17. The rot argument the three comments made does not apply to what shipped, because the file types the export as Vitest's own ViteUserConfig rather than restating the object's shape. Proposed Standard 1 was carried out too, in the third check's subsection of monorepo-layout.md: binding costs a workspace nothing in its tsconfig, with a do-not-delete note on the declaration file. Proposed Standard 3 is satisfied by there being one place left."
---

## What Was Wrong

`@workspace/vitest-config` ships `node.js` as plain JavaScript with no `types` condition and no
`.d.ts`. A workspace that imports it from `vitest.config.ts` therefore gets `TS7016: Could not find
a declaration file for module '@workspace/vitest-config/node'` from its own `tsc --noEmit` — unless
its tsconfig sets `allowJs: true`. Nothing states this. The one place it is written down is a
half-sentence inside the shared package's `//no-shared-tsconfig` value ("its consumers read it
through `allowJs`"), which is a field about a different check entirely and is not read by anyone
wiring up a suite.

The cost is that every workspace rediscovers it, and each writes its own explanation. There are now
three, and the first two are near-verbatim copies of each other:

| File                             | What it says                                                      |
| -------------------------------- | ----------------------------------------------------------------- |
| `apps/editor/tsconfig.node.json` | five-line comment: ships plain `.js`, `allowJs` on, `checkJs` off |
| `packages/matrix/tsconfig.json`  | the same five lines, reworded                                     |
| `apps/server/tsconfig.json`      | added 2026-08-07 when it bound to the shared config               |

The third one was found the way the first two must have been: the config compiled, the suite ran
green, and `tsc --noEmit` failed afterwards on a message that names neither Vitest nor the shared
config's reason for being JavaScript. The failure is loud, which is why this is low severity — but
it is loud in a place that says nothing about the fix.

`deps:check`'s third axis makes this reachable more often than it was. Binding a workspace to the
shared Vitest config is now the enforced default rather than an opt-in, so the next workspace to
grow a suite meets this on the same day it meets the check.

## Fix Applied

At the time of writing: `allowJs: true` in `apps/server/tsconfig.json`, with the sibling comment
restated a third time. The duplication is the finding, not the repair.

**2026-08-08 — the repair.** Proposed Standard 2 was taken, and it removed the requirement instead
of documenting it. `packages/vitest-config/node.d.ts` now sits beside `node.js`; all three
`allowJs` entries and all three comments are gone. The one thing worth carrying forward is why the
`.d.ts` does not rot, since that was the objection all three comments raised against it: it
declares `nodeConfig` as Vitest's own `ViteUserConfig` rather than restating the shape of the
object next door, so a setting added or changed in `node.js` never touches it. Only renaming the
export would, and that breaks every consumer's import in the same commit.

## Proposed Standard

1. **State the requirement where the rule is stated.** `.ai-docs/reference/monorepo-layout.md` now
   carries a subsection for the third check ("The third check asks the same question of every Vitest
   config"). One sentence there — a workspace that binds also needs `allowJs: true`, and `checkJs`
   stays off — puts it in front of the reader who is about to need it.

2. **Or remove the need for it.** `packages/vitest-config` could ship a `node.d.ts` beside
   `node.js`, or move to TypeScript. The three comments each argue against a hand-written `.d.ts`
   on the grounds that it would rot; that argument is weaker now that the file has three consumers
   pinned to it by a check.

3. **Whichever is chosen, the three copies of the comment should collapse to one place plus a
   pointer.** Three independently worded explanations of one mechanism is how the mechanism ends up
   remembered differently in each workspace.
