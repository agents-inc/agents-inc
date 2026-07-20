---
type: architectural-drift
severity: high
affected_files:
  - src/cli/commands/edit.tsx
  - src/cli/lib/installation/local-installer.ts
  - e2e/lifecycle/project-tracking-propagation.e2e.test.ts
  - e2e/lifecycle/edit-global-fallback.e2e.test.ts
  - e2e/fixtures/dual-scope-helpers.ts
standards_docs:
  - .ai-docs/standards/e2e/anti-patterns.md
date: 2026-07-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: convention-undocumented
status: resolved
resolved_by: "Owner ruled `cc init` and bare `cc edit` express different intentions. `init`'s dashboard flow now threads that intent into Edit via the hidden `--project-setup` flag (`EDIT_PROJECT_SETUP_FLAG`), and Edit materialises on a no-op only when the intent is present and cwd is not the home root. Both suites pass with their original assertions — the byte-equality assertion was NOT narrowed. See 2026-07-20-command-delegation-must-carry-caller-intent.md."
---

## What Was Wrong

Project materialisation — writing `<project>/.claude-src/config.ts` and `config-types.ts`, and
registering the project path in the global config's `projects[]` — has never had an explicit
trigger in `cc edit`. It happens only as a side effect of `writeConfigAndCompile`, which runs only
when `hasAnyChanges(changes)` is true. There is no code path that says "this project has no config
of its own, so materialise it".

That went unnoticed because a separate bug kept the diff artificially non-empty. Until this round,
a project-context edit that migrated globally-scoped skills to eject performed the migration on
disk under `$HOME` but never recorded the new `source` in the global config. The global config
stayed stale at `source: "<marketplace>"` forever.

The E2E helper `initProjectAllGlobal` presses `l` (set-all-local) at the sources step. Against a
stale global config that keypress always produced a marketplace→eject `sourceChanges` diff, so
`hasAnyChanges` was always true and every project materialised. Materialisation was riding on a
config/filesystem disagreement.

`recordGlobalSourceMigrations` (added to `edit.tsx` this round) fixed the disagreement: the global
config now records the eject migration the run actually performed. The first project init still
produces a genuine diff; every subsequent one is now a true no-op, takes the `"No changes made."`
early return, and is never materialised or registered.

Observed signature: in `project-tracking-propagation.e2e.test.ts`, project-1 always registers and
project-2 never does. Tests using a single project pass. The failure is deterministic, not flaky.

The obvious fix — gating the early return on "the project has no `.claude-src/config.ts` yet" —
is blocked by a **direct contract conflict between two currently-green E2E files**:

- `project-tracking-propagation.e2e.test.ts` requires a project-context edit against an
  unmaterialised project to write the project config and register the path in global `projects[]`.
- `edit-global-fallback.e2e.test.ts` → "edit with global fallback preserves global skills"
  asserts `expect(globalConfigAfter).toStrictEqual(globalConfigBefore)` after **exactly** that
  scenario (project-context edit, no project config, no roster change).

`registerProjectPath` unconditionally appends an unregistered path and returns `changed: true`, so
materialisation always rewrites the global config (adding `projects` and normalising key order).
Both expectations cannot hold. The two flows are indistinguishable from inside `edit.tsx`: the only
difference is a set-all-local keypress that is semantically inert once the global config is already
eject.

## Fix Applied

None — discovery only, plus empirical proof of the conflict.

The candidate fix (gate the no-op early return on
`!(await fileExists(resolveInstallPaths(cwd, "project").configPath))`, then call
`writeConfigAndCompile`) was implemented, built and run against both suites, then fully reverted
(working-tree blob restored byte-identical). Result:

- `project-tracking-propagation.e2e.test.ts` — 5/5 pass
- `edit-global-fallback.e2e.test.ts` — "edit with global fallback preserves global skills" fails at
  the `toStrictEqual` line; the global config gained `"projects": ["<tmp>/fake-home/project"]`

Reverted rather than landed because it would leave a currently-green test red, which requires a
product decision about which contract is authoritative — not a unilateral one.

## Proposed Standard

Two rules, both for `.ai-docs/standards/`:

1. **A state transition must have an explicit trigger, never an incidental one.** Creating a
   project's config, registering it in global tracking, or any other materialisation step must be
   gated on a condition that _states its own precondition_ ("this project has no config yet"), not
   on an unrelated signal that merely happens to be true ("the roster diff is non-empty"). When a
   bug fix makes an incidental signal accurate, the behaviour riding on it silently disappears.
   Belongs in `.ai-docs/standards/` alongside the existing "no silent fallbacks / asserting
   lookups" rules in `CLAUDE.md` — this is the control-flow counterpart.

2. **Byte-equality assertions on config files over-specify the contract.** The failing assertion in
   `edit-global-fallback.e2e.test.ts` is `toStrictEqual` on raw config text used as a proxy for
   "global skills were preserved". It also pins key order and the absence of unrelated additive
   fields like `projects`. Per the existing CLAUDE.md rule against regex/text scanning of config,
   such tests should load structurally (`loadProjectConfigFromDir`) and assert the _invariant_
   (`skills` and `agents` unchanged), letting additive project-tracking fields vary. Belongs in
   `.ai-docs/standards/e2e/anti-patterns.md`.

**Decision required before any code fix:** is a project-context edit against an unmaterialised
project allowed to register that project in the global config? If yes, the byte-equality assertion
in `edit-global-fallback.e2e.test.ts` must be narrowed to the skills/agents invariant. If no, the
`project-tracking-propagation.e2e.test.ts` flows need a materialisation trigger that does not
involve global `projects[]`, or the helper must stop using dashboard→Edit as a project-init
substitute.

## Resolution (2026-07-20)

The decision was neither branch above: the two flows are **not** indistinguishable from inside
`edit.tsx` once the caller's intent is passed in. `cc init` inside a project means "set this project
up" and must materialise; a bare `cc edit` with no changes is an inspection and must not. Proposed
standard 1 (explicit trigger over incidental signal) was adopted and is what the fix implements —
the gate now reads `flags[EDIT_PROJECT_SETUP_FLAG] && !isHomeDirectory(cwd)`, which states its own
precondition ("this run is an init-initiated project setup, and there is a project here to set up").

Proposed standard 2 (narrow the byte-equality assertion) was **rejected** and is not adopted. No
assertion in either suite was weakened; both pass unchanged. The conflict was a false dilemma
created by the missing intent signal, not by the assertion being over-specified.
