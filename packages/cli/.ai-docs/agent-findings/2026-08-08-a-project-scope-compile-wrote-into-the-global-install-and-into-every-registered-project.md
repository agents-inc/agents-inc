---
type: architectural-drift
severity: medium
affected_files:
  - src/cli/commands/compile.ts
standards_docs:
  - .ai-docs/standards/e2e/patterns.md
date: 2026-08-08
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: resolved
resolved_by: >-
  Owner ruling 2026-08-08 (CLI-438) made containment the contract: a project-scope compile
  touches only that project's `.claude/`, and propagation belongs to global operations.
  `buildCompilePasses` (`src/cli/commands/compile.ts`) now returns the ONE pass the invocation
  owns — the project pass alone when a project installation sits at `cwd`, the global pass only
  where none does (the home directory, or a directory with no config of its own). Dropping the
  global pass removes the three writes at once, because each hung off it: the rewrite of
  `$HOME/.claude/agents/*.md`, the refresh of `$HOME/.claude-src/config-types.ts`, and the
  fan-out, which `reconcileTypesFromDisk` performs only for a home `projectDir`. Pinned by
  `e2e/commands/compile-project-scope-containment.e2e.test.ts`, whose snapshots carry each
  file's mtime beside its bytes.
---

## What Was Wrong

Anomaly A of the 2026-08-08 flow-verification pass: every `compile` run inside a project printed
a _Global_ pass before its _Project_ pass, and the global pass did real work —
`Recompiled 11 global agents`, `Refreshed config-types.ts`, and, once a second project was
registered, `Recompiled agents in 1 registered projects`. A command issued from proj-a rewrote
`$HOME/.claude/agents/*.md`, `$HOME/.claude-src/config-types.ts` and proj-b's generated file.

Every write happened to be byte-identical, which is why no flow failed and why the blast radius
was visible only in the log. That is the property that makes this class of defect survive a test
suite: a bytes-only comparison of the global scope passes while the scope is being rewritten on
every project compile.

### Reproduction

With a global install in `<scratch>`, two registered projects, and the binary built from
`packages/cli`:

```
cd <proj-a>; HOME=<scratch> agents-inc compile --source <skills>
```

Before the fix the output carried `Compiling global agents...`, `Recompiled 11 global agents`,
`Refreshed config-types.ts` and `Recompiled agents in 1 registered projects`; after it, only the
project pass runs. Measured by snapshotting `$HOME/.claude`, `$HOME/.claude-src`,
`<proj-b>/.claude` and `<proj-b>/.claude-src` with each file's mtime: 183 files, all four trees
identical after the run.

### Code in the path

- `buildCompilePasses` (`src/cli/commands/compile.ts`) pushed a global pass whenever a global
  installation existed, regardless of where the command was invoked from.
- `refreshConfigTypes` -> `reconcileTypesFromDisk` (`src/cli/lib/config-gate/index.ts`) fans a
  home-scope refresh out to every registered project and recompiles them
  (`propagateGlobalChangesToProjects` + `recompilePropagated`). The project pass never reached
  that branch; the global pass beside it always did.

### Underlying cause

The pass set was derived from which installations EXIST, not from which scope the invocation is
in. A global installation exists for every project on the machine, so every project compile
claimed authority over it.

## Fix Applied

`buildCompilePasses` returns a single pass chosen by context (see `resolved_by`). Nothing else
changed: `compileAgentsAllScopes` — the entry `init` and `edit` use — still runs its global pass
before its project pass, because an edit that alters global-scoped entries owes that write.

## Proposed Standard

`.ai-docs/standards/e2e/patterns.md`, beside the existing scope rules (landed with this fix):

> A compile inside a project writes nothing outside that project. A spec that runs `compile` from
> a project directory and asserts on `$HOME`'s compiled agents, on the global `config-types.ts`,
> or on another registered project is asserting removed behaviour: compile each scope from a run
> in that scope.

And, for the measurement itself: a spec claiming a scope was NOT written to must compare mtimes
as well as bytes. Every write this finding is about produced identical content.
