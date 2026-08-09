---
type: convention-drift
severity: medium
affected_files:
  - package.json
  - .husky/pre-commit
  - packages/cli/.ai-docs/reference/monorepo-layout.md
  - packages/cli/.ai-docs/reference/features/code-generation.md
standards_docs:
  - .ai-docs/reference/monorepo-layout.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: infra
root_cause: convention-undocumented
status: resolved
resolved_by: >-
  Both halves are closed. The four stale statements were rewritten when this was filed; the owner
  call the finding deferred was then made and executed in REPO-36 — ESLint runs in BOTH places
  rather than moving. `lint-staged` gained `eslint --fix --no-warn-ignored` over the staged files
  as the fast half (~4s), and the whole-workspace `lint` stayed on the turbo line for the reason
  this finding identified as the surviving argument: the type-aware rules read a whole TypeScript
  program, so a staged change can raise a report in a file the commit does not touch. CLI-436
  corrected the last document still describing the old placement as a choice between the two —
  `reference/features/code-generation.md`'s hooks paragraph said "ESLint runs in the hooks rather
  than in `lint-staged`", which was half-false from the day REPO-36 landed.
---

## What Was Wrong

Four places in this repository explained why ESLint runs on the `turbo` line in `.husky/pre-commit`
rather than in `lint-staged`, and all four gave the same mechanical reason:

> lint-staged runs its commands from the git root, and ESLint flat config is looked up from the
> working directory and its ancestors, never beside the file being linted.

`.husky/pre-commit` went further and recorded a verification: "from the root,
`eslint packages/cli/src/cli/consts.ts` exits 2 with 'couldn't find an eslint.config file'".

**Run that command today and it exits 0.** ESLint 10 resolves the flat config from the directory of
the **file being linted**, walking up from there. In ESLint 9 this was opt-in behind
`unstable_config_lookup_from_file`; in 10 it is the only behaviour — `LegacyConfigLoader`, the
cwd-based loader, is gone from `node_modules/eslint/lib/config/config-loader.js`, and
`lib/eslint/eslint.js` instantiates the from-file `ConfigLoader` unconditionally.

Measured, from the repository root, on ESLint 10.8.0:

| Command                                                | Result                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `eslint packages/cli/src/cli/consts.ts`                | exit 0 — loaded `packages/cli/eslint.config.js`, `projectService` carve-out included      |
| `eslint --print-config packages/cli/src/cli/consts.ts` | 479 rules, the CLI's `allowDefaultProject` and its `maximumDefaultProjectFileMatchCount`  |
| `eslint --print-config apps/editor/src/main.tsx`       | 494 rules, `react-refresh/only-export-components` on — a **different** workspace's config |
| `eslint vitest.config.mjs`                             | exit 2, "couldn't find an eslint.config file" — so there is no root fallback              |

The second half of the same argument had already died separately: the notes said "packages/cli is
on ESLint 9 while apps/\* and the other packages/\* are on ESLint 10, so no single config and no
single binary at the root could lint them all". Every workspace now declares `eslint: ^10` and one
hoisted 10.8.0 serves all of them, with no nested copy anywhere.

Found while doing CLI-427's equivalence work, which required running ESLint from both directories to
compare effective configs.

## Fix Applied

The four statements are rewritten to say what is true, and to say what changed rather than quietly
dropping the old claim — the old reason is worth keeping visible, because someone will otherwise
rediscover it from an ESLint 9 memory:

- root `package.json` -> `//lint-staged`
- `.husky/pre-commit`, the ESLint paragraph, including its now-inverted verification
- `reference/monorepo-layout.md` -> "The commit and push hooks"
- `reference/features/code-generation.md` -> the hooks paragraph, which now defers to
  monorepo-layout rather than restating the mechanism

**The placement itself was not changed.** ESLint still runs on the turbo line. What now holds it
there is a different argument: the type-aware rules read a whole TypeScript program, so a change in
a staged file can produce a report in a file the commit does not touch, and a staged-file run cannot
see it — plus turbo caches a workspace run. That argument is real, but it is weaker than the one it
replaces, because the old one made `lint-staged` _impossible_ and this one only makes it _worse_.
Moving ESLint back into `lint-staged` is now a live option rather than a blocked one, and that is an
owner decision, not something to absorb into an unrelated task.

Two measurements were corrected in passing: `.husky/pre-commit` claimed packages/cli lints in ~7s
and apps/editor in ~2s. Re-measured warm, under the type-aware rules both now carry: **18.8s** and
**5.3s**.

## Proposed Standard

1. **A comment that records "verified by running it" must name the command, and the command is the
   thing that expires.** This one did name it, which is the only reason the drift was findable at
   all — the fix is not to stop recording verifications but to re-run them when the tool's major
   changes. `monorepo-layout.md`'s own "After changing a dependency, ask the binary its version"
   section already argues the general case; it should extend to "and re-run the commands whose
   output you quoted".
2. **A major-version bump of a shared tool should sweep for prose that explains the old version's
   behaviour.** The ESLint 9 -> 10 bump (recorded in `monorepo-layout.md`'s "One answer per tool"
   table) moved config resolution, and nothing in that move touched the four documents that
   depended on the old behaviour. The version table is the natural place to note "what this bump
   invalidated", one line per bump.
