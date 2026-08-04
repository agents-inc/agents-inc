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
root_cause: scope-discipline-deferred
status: open
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

## Status Update — 2026-04-21

Reclassified `open`. Current line refs verified on `main`:

**`src/cli/lib/installation/local-installer.ts`**

- Line 20–21: `import type { InstallMode } from "./installation"` + `deriveInstallMode`.
- Line 940: `installMode?: InstallMode,` — dead positional param on `compileAndWriteAgents`.
- Lines 959–962: D-217 comment explaining the retained-but-dead param.
- Lines 1050, 1153: `deriveInstallMode(finalConfig.skills),` at both call sites
  (`installPluginConfig` and `installEject` respectively).

**`src/cli/lib/agents/agent-recompiler.ts`**

- Line 15: `import { type InstallMode, deriveInstallMode } from "../installation/installation"`.
- Line 36: `installMode?: InstallMode;` on `RecompileAgentsOptions`.
- Line 89: `installMode?: InstallMode;` on `CompileAndWriteParams`.
- Lines 107–110: D-217 comment explaining the retained-but-dead param.
- Line 239: `installMode: options.installMode ?? deriveInstallMode(filteredConfig?.skills ?? []),`
  — threaded into `compileAndWriteAgents` but never read downstream.

**Tests touching the dead surface**

- `src/cli/lib/installation/local-installer.test.ts`:
  - Line 118: mock accessor comment still references `installMode` passthrough.
  - Lines 340, 353: "should derive local installMode from skill configs" test + comment.
  - Lines 382, 440: D-217 comments in the two per-skill `source` replacement tests.
- No test file covers `agent-recompiler.ts`'s dead params — removal there is
  pure production-code cleanup.

### Pickup Direction

Scope is unchanged from the "Proposed Standard" above. Concrete edits:

1. `local-installer.ts`: drop `installMode?` param (line 940) + D-217 comment
   (959–962); drop `deriveInstallMode(...)` arg at both call sites (1050, 1153);
   remove `InstallMode`/`deriveInstallMode` imports (line 20–21) if no other
   consumer remains in the file.
2. `agent-recompiler.ts`: drop `installMode?` from `RecompileAgentsOptions` (36)
   and `CompileAndWriteParams` (89); drop the D-217 comment (107–110); drop the
   `installMode: options.installMode ?? deriveInstallMode(...)` line (239);
   remove the `InstallMode`/`deriveInstallMode` import (line 15) if no other
   consumer remains.
3. `local-installer.test.ts`: rename the "should derive local installMode from
   skill configs" test (line 340) to describe the per-skill `source`
   invariant it actually asserts; refresh the line-118 mock comment; leave the
   D-217 reference comments on the per-skill-source tests (lines 382, 440) or
   strip them per CLAUDE.md "NEVER put TODO/task IDs in test names".
4. Verify: `tsc --noEmit` + `npm test -- local-installer agent-recompiler`.

No new tests needed — the per-skill `source` assertions at lines 381–437 and
439+ already cover the leaf contract. Ready for a `cli-developer` delegation.

## Docs Slice Audit — 2026-04-21

No docs-only slice. The Proposed Standard says "No rule change needed
— CLAUDE.md 'NEVER introduce new workflow patterns' already covers
the scope-discipline rationale for deferring." The D-217 per-skill
`source` leaf contract is already documented in
`.ai-docs/reference/features/agent-system.md` (Related Findings cites
this file). Pickup is pure code cleanup: production-file param
removal + one test rename. Finding stays `open` until the
`cli-developer` delegation lands.
