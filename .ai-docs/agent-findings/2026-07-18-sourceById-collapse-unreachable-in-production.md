---
type: audit
severity: low
affected_files:
  - src/cli/lib/installation/local-installer.ts
  - src/cli/lib/agents/agent-recompiler.ts
  - src/cli/lib/configuration/config-writer.ts
standards_docs:
  - .ai-docs/reference/concepts/tombstone-pattern.md
date: 2026-07-18
reporting_agent: cli-tester
category: architecture
domain: cli
root_cause: convention-undocumented
status: open
---

## What Was Wrong

`plugin-system.md` flagged a suspected latent bug: `buildCompileAgents`
(`src/cli/lib/installation/local-installer.ts:453`) builds

```ts
const sourceById = new Map<SkillId, string>(config.skills.map((s) => [s.id, s.source]));
```

keyed by `SkillId` ALONE (not by `(id, scope)`). For a dual-scope skill — an
active project entry `{id, scope:"project", source}` plus a global tombstone
`{id, scope:"global", excluded:true, source}` with a DIFFERENT source — this map
is last-write-wins and could theoretically stamp the WRONG source onto the
compiled `SkillReference`, rendering `X:X` where bare `X` is correct (or vice
versa). The concern: the compiled agent might misrepresent the active entry's
install form.

**Verification result: the collapse is NOT reachable through any production
command.** Two independent safeguards prevent it, and the only callers that
could theoretically hit it are dead code:

1. **Tombstones are filtered before `buildCompileAgents` in every live path.**
   `init` (`init.tsx` → `compileAgents`), `edit` (`edit.tsx` → `compileAgents`),
   and `compile` (`compile.ts` → `compileAgents`) all route through the
   operations-layer `compileAgents` → `recompileAgents`, which calls
   `filterExcludedEntries(projectConfig)` (`agent-recompiler.ts:168`) BEFORE
   `buildCompileAgents` (`agent-recompiler.ts:202`). `filterExcludedEntries`
   keeps only `!s.excluded` skills (`agent-recompiler.ts:131`), so the tombstone
   is dropped and `sourceById` never sees two entries for the same id → no
   collision. Only the active entry's source is ever used.

2. **Even without the filter, config ordering makes last-write-wins safe.** The
   real config-writer `generateProjectConfigWithInlinedGlobal`
   (`config-writer.ts:343-409`) always emits global entries (incl. the
   tombstone) FIRST, then project (active) entries SECOND. Because `sourceById`
   is last-write-wins, the active project entry (serialized last) always wins,
   so its source is the one applied — correct for both mixed-source directions.

3. **The only unfiltered callers are dead code.** `installEject`
   (`local-installer.ts:1214`) and `installPluginConfig`
   (`local-installer.ts:1122`) are the only functions that pass an unfiltered
   `finalConfig` straight into `buildCompileAgents` (lines 1266 / 1153). A
   whole-repo grep shows NO command or operation calls either function — they
   are referenced only by their own definitions in `local-installer.ts` and the
   re-export in `installation/index.ts`. They are the sole paths that could
   theoretically manifest the bug, and they are unreachable.

The format decision itself is `derivePluginRef` in
`stack-plugin-compiler.ts:49-52` (`source === undefined || "eject"` → bare id;
otherwise `id:id`), driven purely by the config `source` string attached via
`sourceById`.

Empirically confirmed via a new E2E test
(`e2e/lifecycle/dual-scope-mixed-source-compiled-ref.e2e.test.ts`): a genuine
dual-scope config compiled with the real `cc compile` command renders the active
project entry's format correctly in both mixed-source directions
(global=plugin/project=eject → bare `X`; global=eject/project=plugin → `X:X`),
and the SAME skill id renders the opposite format under the other scope's agent.

## Fix Applied

None — discovery/verification only (this was a verification-only task; no source
files were modified). Added an E2E regression test that exercises the real
compile path against a dual-scope mixed-source config and asserts the compiled
agent ref format per scope.

Two latent-but-currently-benign observations worth a follow-up (NOT fixed here):

- **Dead code:** `installEject` / `installPluginConfig` in `local-installer.ts`
  are unreachable. If they are ever revived as command entry points, they would
  reintroduce the `sourceById` collision risk because they skip
  `filterExcludedEntries`. Consider deleting them (pre-1.0, no back-compat
  shims per CLAUDE.md) or routing them through the same
  `filterExcludedEntries` guard.
- **Correctness-by-ordering fragility:** `buildCompileAgents`'s `sourceById`
  relies on `filterExcludedEntries` upstream AND/OR the config-writer's
  global-then-project ordering. Keying by `(id, scope)` (or asserting a single
  active entry per id) would make it robust in isolation rather than dependent
  on caller discipline.

## Proposed Standard

Add a note to `.ai-docs/reference/concepts/tombstone-pattern.md` (in the
"Interaction with the Config Pipeline" section) documenting that
`buildCompileAgents` MUST only ever receive a config with tombstones already
filtered (via `filterExcludedEntries`), and that its `sourceById` map is
id-keyed and therefore unsafe against dual-scope pairs. This makes the implicit
"filter excluded before compile" invariant explicit so future callers don't
bypass it. Optionally track the dead-code removal of
`installEject`/`installPluginConfig` in `todo/`.
