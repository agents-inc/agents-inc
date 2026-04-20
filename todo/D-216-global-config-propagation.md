# D-216: Global → project config propagation & scope defaults

> **Status note 2026-04-20**: partial 10-agent sweep, 8/10 rate-limited, 1 substantive return. Plan's **Regression #1** (project `config-types.ts` missing global import because `writeScopedConfigs` calls `writeStandaloneConfigTypes` instead of `regenerateConfigTypes`) matches the user-filed symptom at top of TODO.md ("Installing a skill in the global scope, [...] the project scopes, their config types.ts and config.ts files don't reflect the newly installed global skill"). Still unaddressed.
>
> **Plan's Regression #2** (scope hardcoded to `"global"` at creation sites) — per user clarification 2026-04-20, defaulting to global is CORRECT intended behavior; scope is explicitly toggled via `s`. Therefore Regression #2 is likely obsolete and should be removed from this plan.
>
> **Also cross-reference**: `.ai-docs/agent-findings/2026-04-18-mergeConfigs-drops-projects-field.md` — `mergeConfigs` drops `projects` field on HOME-context edit; adjacent propagation failure.
>
> **New user-filed items at top of TODO.md** (likely related but distinct):
> - Plugin install failure leaves config.ts entry without the actual install.
> - Info panel shows `-` next to global skill when toggling scope to project (global install is NOT removed, only project added — `-` is wrong signal).
> - Info panel shows `+` for already-globally-installed skill toggled to project on next edit (wizard incorrectly tags it as new rather than already installed).
>
> These are related to the scope-toggle + info-panel cluster (D-223/D-224/D-225) but may need their own tickets once the rate limit resets.


Two distinct regressions surfaced together. They're independent but share symptoms — skills added at global scope appear not to "reach" project-level configs, and project configs emit wrong type narrowing.

Investigated via 10-agent parallel sweep. Root causes pinpointed with file:line citations; fixes are narrow and well-scoped.

## Regression #1 — Project `config-types.ts` never imports from global

### Symptom

After running `cc init` or `cc edit` in a project directory, the generated `.claude-src/config-types.ts` does NOT import types from the global installation's `config-types.ts`. User expected:

```ts
import type {
  SkillId as GlobalSkillId,
  AgentName as GlobalAgentName,
  Domain as GlobalDomain,
  Category as GlobalCategory,
} from "../../.claude/claude-src/config-types";

export type SkillId = GlobalSkillId | "project-only-skill-1";
export type AgentName = GlobalAgentName | "project-only-agent";
// etc.
```

Actual: a standalone file with inlined unions and no import from global.

### Root cause

`writeScopedConfigs` in `src/cli/lib/installation/local-installer.ts` line 678 unconditionally calls:

```ts
await writeStandaloneConfigTypes(projectConfigPath, matrix, agents, finalConfig);
```

This bypasses the global-aware logic that already exists in `regenerateConfigTypes` (in `src/cli/lib/configuration/config-types-writer.ts` lines 240–264). That function does:

```ts
const isProjectScope = path.resolve(projectDir) !== path.resolve(os.homedir());
const globalConfigTypes = isProjectScope ? await getGlobalConfigTypesPath() : null;

if (globalConfigTypes) {
  source = generateProjectConfigTypesSource({ ..., importPath: ... });
} else {
  source = generateConfigTypesSource(...); // standalone
}
```

The generator `generateProjectConfigTypesSource` (same file, ~lines 569–590) emits the `import type { SkillId as GlobalSkillId, ... }` pattern and the `SkillId = GlobalSkillId | "project-only"` extensions. Fully working. Just not being invoked from the write path.

### History

- Introduced in commit `e0cc321` (2026-03-10) — D-76/D-80, "scope-aware config splitting with writeScopedConfigs"
- Reinforced in `f2006d3` (2026-04-08) — "scope-pure project config and edit/uninstall commands"
- Still in HEAD as of 2026-04-15 — feature is live, just not wired from one write site

### Fix

In `local-installer.ts` at line 678, replace the standalone call with a call to `regenerateConfigTypes` (or inline its gate). Concrete shape:

```ts
// BEFORE
await writeStandaloneConfigTypes(projectConfigPath, matrix, agents, finalConfig);

// AFTER
await regenerateConfigTypes(projectDir, {
  matrix,
  agentNames: agents.map(a => a.name),
  customAgentNames: [], // or however these are derived today
  // ...pass whatever `regenerateConfigTypes` needs per its current signature
});
```

Verify the exact signature of `regenerateConfigTypes` before writing the replacement — it may need background data loaded via `loadConfigTypesDataInBackground` or similar. Match the pattern used when `regenerateConfigTypes` is invoked from other sites (grep for callers).

### Verification

- After `cc init` in a project with an existing global install, the generated `.claude-src/config-types.ts` contains `import type { SkillId as GlobalSkillId, ... }`.
- Existing test coverage: `config-types-writer.test.ts` lines 648–815 already validate the import emission — those tests pass today, so the generator is fine. The new coverage needed is at the `writeScopedConfigs` layer.
- Add an integration test: seed a global install, seed a project, run the write flow, assert the emitted project `config-types.ts` contains the global import line.

## Regression #2 — Scope hardcoded to `"global"` on all new skill additions

### Symptom

New skills added via the wizard are always tagged `scope: "global"`, regardless of whether the CLI is running at the global root or in a project dir. This is coincidentally correct at the global root but wrong at project scope — project-intended skills get routed to `~/.claude-src/config.ts` by `splitConfigByScope`.

### Root cause

Three creation sites hardcode `scope: "global"`:

1. `src/cli/stores/wizard-store.ts` line 30, `createDefaultSkillConfig`:
   ```ts
   return { id, scope: "global", source: primarySource ?? DEFAULT_PUBLIC_SOURCE_NAME };
   ```

2. `src/cli/stores/wizard-store.ts` line 160, `buildSkillConfigForId`:
   ```ts
   scope: saved?.scope ?? "global",
   ```

3. `src/cli/components/wizard/wizard.tsx` line 173, `handleComplete`:
   ```ts
   return existing ?? { id, scope: "global" as const, source: "eject" };
   ```

Agent handling in `wizard-store.ts` lines 728/734 (`populateFromStack`) and line 147 (new-agent path) also hardcodes `scope: "global"`.

None of these sites consult `isEditingFromGlobalScope`, which exists on the wizard state and correctly tracks the execution context (set from `cwd === GLOBAL_INSTALL_ROOT` in both `init.tsx` and `edit.tsx`).

### Effect per context

| Context | Hardcoded `"global"` effect | Correct? |
|---------|----------------------------|----------|
| Global root (`~/`) with scope-toggle disabled | All new skills scope="global" | Coincidentally right |
| Project dir | All new skills scope="global" → routed to global partition | **Wrong** — user has to manually S-toggle every skill |

The scope-toggle (S hotkey) is already wired — this fix changes only the default.

### Fix

Make the scope default context-sensitive at all three sites. Simplest shape: thread `isEditingFromGlobalScope` into the helper signatures, or read it from the store at the call site.

Option A — helper with scope parameter:
```ts
function createDefaultSkillConfig(id: SkillId, scope: "project" | "global"): SkillConfig {
  const skill = matrix.skills[id];
  const primarySource = skill?.availableSources?.find(s => s.primary)?.name;
  return { id, scope, source: primarySource ?? DEFAULT_PUBLIC_SOURCE_NAME };
}
```

Call sites pass `store.isEditingFromGlobalScope ? "global" : "project"`.

Option B — helper reads store directly. Avoids threading but couples helpers to the store. Probably fine here since they already live in `wizard-store.ts`.

For `wizard.tsx` line 173:
```ts
const defaultScope = store.isEditingFromGlobalScope ? "global" : "project";
return existing ?? { id, scope: defaultScope, source: "eject" };
```

### Verification

- `cc init` at `~/` + add skill → `~/.claude-src/config.ts` contains `{ id: ..., scope: "global", ... }` (unchanged from today).
- `cc init` in a project + add skill → project `.claude-src/config.ts` contains `{ id: ..., scope: "project", ... }` AND `~/.claude-src/config.ts` is unchanged.
- `cc edit` in a project with existing project-scope skills → they remain `scope: "project"` (existing behavior).
- Add unit test: `createDefaultSkillConfig` returns correct scope for each `isEditingFromGlobalScope` value.
- Add integration test: wizard flow in project scope produces skills with `scope: "project"` in the generated config.

## The "propagation" angle (tracked but not a separate bug)

Commit `c456dfc` (2026-04-05) introduced `propagateGlobalChangesToProjects()` — syncs global edits to registered projects. Works today in principle. But without Regression #1 fixed, even after propagation runs, the projects' `config-types.ts` still lack the global import — the propagated state isn't visible in the project's type surface. Fixing #1 restores the propagation story end-to-end. No separate code change needed here unless, after #1 is fixed, a test reveals `propagateGlobalChangesToProjects` doesn't fire in some path.

## Out of scope

- Config shape simplification (D-215). This task only restores the global-import pattern and fixes scope defaults — it does not simultaneously refactor config emission format.
- Dashboard detection for global-only installs (landed earlier in the session).
- First-frame flash (landed earlier in the session).

## Fix order

1. **Regression #1 first** — it's a one-line fix (swap `writeStandaloneConfigTypes` for `regenerateConfigTypes`) and it unblocks verifying propagation.
2. **Regression #2 second** — touches 3+ call sites; needs careful threading of `isEditingFromGlobalScope`.
3. **Integration test last** — seeds a global install and a project, adds a skill at each scope, asserts the resulting file shapes match expectations.

## Regression tests required

- `writeScopedConfigs` integration: project write path invokes global-aware config-types generation.
- `createDefaultSkillConfig`, `buildSkillConfigForId`, `wizard.tsx:handleComplete`: scope follows `isEditingFromGlobalScope`.
- End-to-end: global install + project → project config-types imports from global + project skills tagged `scope: "project"`.

## Non-goals

- Don't re-architect the partitioning logic in `splitConfigByScope` — it already works correctly given correctly-scoped inputs. The bug is upstream (scope assignment) and downstream (types generation call site).
- Don't remove or rewrite `writeStandaloneConfigTypes` — it's still the right choice for the global-root path.
