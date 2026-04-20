---
type: convention-drift
severity: low
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/agents/agent-recompiler.ts
standards_docs:
  - CLAUDE.md
date: 2026-04-20
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: scope-boundary-preserved
---

## What Was Wrong

After the D-217 fix, `compileAgentForPlugin` no longer accepts an `installMode`
parameter — per-skill `source` on each `SkillReference` is authoritative. But
the two wrapper functions that call it (`compileAndWriteAgents` in
`local-installer.ts` and `compileAndWriteAgents` in `agent-recompiler.ts`)
still accept `installMode` in their params/options surfaces, and callers still
compute `deriveInstallMode(finalConfig.skills)` to fill it in:

- `local-installer.ts` has an `installMode?: InstallMode` positional param on
  `compileAndWriteAgents` that is now read nowhere inside the function body.
  `installEject` and `installPluginConfig` still pass `deriveInstallMode(...)`
  to it at the call sites.
- `agent-recompiler.ts` has `installMode?: InstallMode` on
  `RecompileAgentsOptions` and `CompileAndWriteParams` which is similarly
  vestigial now. The field is still computed and threaded from
  `options.installMode ?? deriveInstallMode(filteredConfig?.skills ?? [])`.

This plumbing is dead — the leaf consumer is gone — but removing it would touch
multiple production files and several tests that assert on the threading.

## Fix Applied

None — discovery only. The D-217 plan scoped out consolidation explicitly:
"Do NOT delete `compileAgent` / `compileAllAgents` or rename
`compileAgentForPlugin`. Keep the scope minimal — only the D-217 semantic fix.
Consolidation is a separate follow-up."

Dropping `installMode` from wrapper surfaces, plus the matching
`deriveInstallMode` computations at call sites and their unit-test assertions,
is the natural companion cleanup. The existing precedent finding
(`2026-04-06-duplicate-buildCompileConfig-in-recompiler.md`) already flags the
broader consolidation opportunity.

## Proposed Standard

Add a follow-up task (companion to D-217) that:

1. Removes `installMode` from `CompileAndWriteParams` and
   `RecompileAgentsOptions` in `agent-recompiler.ts`.
2. Removes the `installMode?: InstallMode` positional param from
   `compileAndWriteAgents` in `local-installer.ts`.
3. Drops the `deriveInstallMode(finalConfig.skills)` call at the two
   `compileAndWriteAgents` invocations in `installEject`/`installPluginConfig`.
4. Removes the `InstallMode` type import from both files if no other consumer
   remains.
5. Updates `local-installer.test.ts`'s "should pass installMode to
   compileAgentForPlugin" tests — rewrite as per-skill `source` assertions
   mirroring the new leaf semantics.

No rule change needed — CLAUDE.md "NEVER introduce new workflow patterns"
already covers the scope-discipline rationale for deferring.
