---
type: standard-gap
severity: low
affected_files:
  - e2e/integration/custom-agents.e2e.test.ts
  - e2e/lifecycle/dual-scope-spacebar-reselect-restore.e2e.test.ts
  - tsconfig.json
standards_docs:
  - .ai-docs/standards/e2e/README.md
date: 2026-07-20
reporting_agent: cli-tester
category: testing
domain: e2e
root_cause: enforcement-gap
status: resolved
resolved_by: 'Proposed-Standard option 2 landed on 2026-07-30 and the gate was verified by running it, not by reading config. `eslint.config.js` now exists with `e2e/**/*.ts` in its file globs and `@typescript-eslint/no-unused-vars` set to `error`; `package.json` has `"lint": "eslint ."`, wired into `prepublishOnly`. Empirically confirmed: a probe file under `e2e/` with one unused import produced `error ''readFile'' is defined but never used @typescript-eslint/no-unused-vars` and exit code 2 (probe removed afterwards). The finding''s premise — "the repo has no ESLint config at all (no `eslint.config.*`, no `lint` script)" — is now false. Option 1 landed only in part and does NOT close the hole on its own: `e2e/tsconfig.json` exists and includes `e2e/**` plus `../src/**/*`, but sets neither `noUnusedLocals` nor `noUnusedParameters`, and `npm run typecheck` runs the ROOT tsconfig whose `include` is `src/**/*` only, with no `typecheck:e2e` script to invoke the e2e project. NOT landed: the secondary ask — `standards/e2e/README.md` still carries no line about deleting a helper''s JSDoc along with the helper, so the orphan-JSDoc re-binding hazard remains undocumented.'
---

## What Was Wrong

Two of the nine spec files in this adoption chunk carried imports that nothing in
the file referenced:

- `e2e/integration/custom-agents.e2e.test.ts` imported `agentsPath`, `fileExists`,
  `listFiles` and `readTestFile` from `e2e/helpers/test-utils.js`. All four appear
  exactly once in the file — in the import statement itself.
- `e2e/lifecycle/dual-scope-spacebar-reselect-restore.e2e.test.ts` imported
  `loadProjectConfigFromDir` from `src/cli/lib/configuration/index.js` and
  `EXIT_CODES` from `e2e/pages/constants.js`. The only remaining mention of
  `loadProjectConfigFromDir` was inside a file-header JSDoc paragraph describing
  what `readSkillEntries` does internally — prose, not code.

The same file also carried an orphan JSDoc block (`/** Load the project config's
react entries, sorted deterministically for toStrictEqual. */`) documenting a
helper that had already been deleted in an earlier pass. Because it sat directly
above the next helper's own JSDoc, deleting the intervening function would have
silently re-attached a stale description to an unrelated function.

Nothing catches any of this today:

- The repo has no ESLint config at all (no `eslint.config.*`, no `lint` script),
  so `no-unused-vars` / `unused-imports` never runs.
- `tsc --noEmit` would flag it under `noUnusedLocals`, but the repo tsconfigs do
  not include `e2e/`. E2E is only ever typechecked via an ad-hoc scratchpad
  tsconfig that individual agents create per pass, which is not a durable gate.

The practical consequence is that dead imports survive indefinitely, and — worse
for a sweep like Pass 8 — they make it genuinely hard to tell whether an import
became unused _because of your edit_ or was already dead. That ambiguity slows
down the "drop imports that become unused" step of every adoption rule.

## Fix Applied

Removed the six dead imports and the orphan JSDoc block as part of the Cluster G
phase-2 adoption. No behaviour change: none of the removed bindings were
referenced, and the removed comment documented nothing.

Discovery only for the enforcement side — no tooling was added, since build and
lint configuration is outside this pass's file ownership.

## Proposed Standard

Add a durable typecheck gate that covers `e2e/`. Concretely, either:

1. Add an `e2e/tsconfig.json` that extends the root config, sets
   `noUnusedLocals: true` / `noUnusedParameters: true`, and includes `e2e/**` plus
   the `src/cli` types it imports — then wire it into the existing
   `tsc --noEmit` step of the pre-commit checklist in `CLAUDE.md`; or
2. Add a root `eslint.config.js` with `@typescript-eslint` + `unused-imports` and
   an `npm run lint` script, and include `e2e/` in its file globs.

Option 1 is the cheaper of the two and closes the specific hole, given that every
Pass-8 agent already has to hand-roll a scratchpad tsconfig to typecheck e2e —
that recurring workaround is itself the signal that the gate belongs in the repo.

Also worth a line in `.ai-docs/standards/e2e/README.md`: when a helper is deleted
from a spec file, delete its JSDoc with it. An orphan doc comment does not just
go stale, it re-binds to whatever declaration follows it.
