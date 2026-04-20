# D-217: Plugin skill reference format in compiled agents

> **Status 2026-04-20: DONE.** Per-skill `source`-based pluginRef landed — `compileAgentForPlugin` decides `${id}:${id}` (plugin) vs bare `${id}` (eject/local) per-skill via `derivePluginRef`. Mixed-mode agents now emit correct per-skill formats. `installMode` param dropped from `compileAgentForPlugin`; `SkillReference` / `Skill` carry optional `source?: string` threaded through `buildCompileAgents` → `resolver.ts` → compiler. Unit coverage: 5 new `stack-plugin-compiler.test.ts` cases + 2 `resolver.test.ts` cases + 2 rewritten `local-installer.test.ts` cases. E2E: `e2e/lifecycle/mixed-mode-skill-ref-format.e2e.test.ts` (new). Dead `installMode` plumbing retained on wrapper types (`RecompileAgentsOptions`, `CompileAndWriteParams`) as a documented follow-up in `.ai-docs/agent-findings/2026-04-20-d217-installmode-plumbing-dead-in-wrappers.md`.
>
> **Known latent dual-scope edge case (deferred, not shipping blocker)**: `sourceById` in `buildCompileAgents` is keyed by `id` alone. For a dual-scope config with distinct per-scope sources (e.g., project-eject + global-agents-inc), `Map` last-write-wins produces the wrong source tag. Doesn't bite in practice because canonical agents-inc configs use `"eject"` on both sides. Defensive fix (key by `${scope}:${id}`) tracked as D-217 follow-up.
>
> **Original investigation note (pre-implementation)**: Plan substantially wrong — rewrite required.
>
> **Key corrections from 10-agent investigation**:
>
> 1. **Wrong bug site.** Plan frames `compileAgent` (`compiler.ts::buildAgentTemplateContext`) as the buggy path used by `cc init/edit/compile`. FALSE — `compileAgent` has **zero production callers** (only exercised by `compiler.test.ts`). All production flows (`cc init`, `cc edit`, `cc compile`, `cc update`) route through `compileAgentForPlugin` via `agent-recompiler.ts::recompileAgents` and `local-installer.ts`.
> 2. **Real bug is in `compileAgentForPlugin`'s whole-agent gate.** `stack-plugin-compiler.ts:110` switches on `installMode === "plugin"` at the whole-agent level. In **mixed mode** (agent with some plugin-source skills + some eject-source skills), the current code takes either branch but applies the transform uniformly → all skills get `skillId:skillId` OR all get bare IDs, both wrong.
> 3. **Proposed fix `s.source !== "eject"` will not compile.** `Skill` type (`src/cli/types/skills.ts:64-71`) has no `source` field; `source` lives on `SkillConfig` (`config.ts:26`). Fix requires threading `source` from `SkillConfig` onto `Skill` via the resolver (`resolver.ts:40`) BEFORE the compiler can key off it. Dead code in `compileAgent` is a separate cleanup.
> 4. **Severity: HIGH for mixed-mode users; not P1 ship-blocker.** Pure plugin-mode and pure eject-mode work correctly through the install path. Mixed-mode is the broken case.
> 5. **Ready-made regression test**: `e2e/interactive/init-wizard-stack.e2e.test.ts:89-91` already asserts `skills: ["web-framework-react:web-framework-react"]` on installed agent frontmatter. Verify status — if currently passing, the pure-plugin install path IS already correct (reinforcing that only mixed mode is broken).
>
> **Additional edge cases uncovered (must be addressed in rewrite)**:
> - **Same skill id across different marketplaces** — install format is `${id}@${marketplace}` but compile format is `${id}:${id}`. Ambiguous for duplicate ids. Need `${marketplace}:${id}` or explicit uniqueness assumption.
> - **Prose-embedded skill refs** in playbooks (e.g., `src/agents/pattern/web-pattern-critique/playbook.md:135-138`) are copied verbatim into compiled output — bypass any `pluginRef` transform.
> - **Local (user-authored) skills** at `.claude/skills/` without `SkillConfig` entry — `s.source !== "eject"` would misclassify them.
> - **Stale skill references** — resolver silently drops missing skills; frontmatter `skills:` loses them without signal.
> - **Same-id, different-scope** (project eject + global plugin of same id) — needs per-skill disambiguation by scope too.
>
> **Consolidation opportunity**: 10-agent angle 7 recommends merging `compileAgent` + `compileAgentForPlugin` into a single `compileAgent(..., installMode?)` using already-extracted `readAgentFiles()` + `buildAgentTemplateContext()` helpers. ~65 lines of duplicate file I/O would collapse. Companion to D-217 fix, not prerequisite.
>
> **Related findings**:
> - `.ai-docs/agent-findings/2026-04-06-duplicate-buildCompileConfig-in-recompiler.md` — precedent for the exact anti-pattern (duplicated compile helper drifting from canonical).
> - `.ai-docs/agent-findings/2026-04-16-silent-plugin-install-skip-on-missing-marketplace.md` — canonical use of `source !== "eject"` as plugin-intent signal.
>
> **Plan rewrite needed**: re-target at `compileAgentForPlugin` mixed-mode; add `source` threading to resolver; account for edge cases G3-G7 above; cite `init-wizard-stack.e2e.test.ts:89-91` as existing regression test.


## Problem

Compiled agents must reference skills using a format that depends on the skill's source:
- **Plugin skills** (installed via marketplace) → `skillId:skillId` (the `PluginSkillRef` format, e.g. `web-framework-react:web-framework-react`)
- **Ejected skills** (locally copied via `source: "eject"`) → bare `skillId` only (e.g. `web-framework-react`)

This convention is correctly implemented in **`compileAgentForPlugin()`** (used by `cc build plugins` to produce distributable plugin packages), but **NOT** in **`compileAgent()`** (used by `cc compile` and `cc init`/`cc edit` to produce the user's installed agent files).

The user's installed agent files in `.claude/agents/` therefore always reference skills as bare `skillId`, even when the skill is plugin-installed. This breaks Claude Code's plugin resolver, which requires the qualified `skillId:skillId` form to locate plugin-installed skills.

## Evidence

### Where the format IS applied (correct)

`src/cli/lib/stacks/stack-plugin-compiler.ts` lines 107-116:
```typescript
const skills =
  installMode === "plugin"
    ? agent.skills.map((s) => ({ ...s, pluginRef: `${s.id}:${s.id}` as const }))
    : agent.skills;

const preloadedSkills = skills.filter((s) => s.preloaded);
const dynamicSkills = skills.filter((s) => !s.preloaded);
const preloadedSkillIds = preloadedSkills.map((s) => s.pluginRef ?? s.id);
```

### Where the format IS NOT applied (bug)

`src/cli/lib/compiler.ts` lines 158-172 (regular `compileAgent`):
```typescript
const preloadedSkills = agent.skills.filter((s) => s.preloaded);
const dynamicSkills = agent.skills.filter((s) => !s.preloaded);
const preloadedSkillIds = preloadedSkills.map((s) => s.id);  // bare id, ignores install mode
```

The regular compile path never sets `pluginRef`, so:
- Frontmatter `skills:` array always contains bare IDs
- Body `<skill_activation_protocol>` invocations always use bare IDs (the template's `pluginRef | default: skill.id` always falls through to `skill.id`)

### Type definition

`src/cli/types/skills.ts:8`:
```typescript
/** Fully-qualified plugin skill reference: 'plugin-name:skill-name' for Claude Code plugin resolution */
export type PluginSkillRef = `${SkillId}:${SkillId}`;
```

The type and intent are codified — the implementation is just incomplete on the install path.

## Acceptance Criteria

1. After `cc init` or `cc edit` with plugin-mode skills, compiled `.claude/agents/{name}.md` files reference plugin skills as `skillId:skillId` in:
   - Frontmatter `skills:` array
   - Body `<skill_activation_protocol>` `skill: "..."` invocations
2. After `cc init` or `cc edit` with eject-mode skills, compiled agents reference them as bare `skillId` (unchanged from current behavior).
3. **Mixed mode** (some skills plugin, some ejected): each skill is referenced according to its own `source` field. The `pluginRef` should be set per-skill, not based on a single `installMode` flag for the whole agent.
4. Existing `compileAgentForPlugin` behavior is preserved.
5. New E2E test verifies a plugin-installed skill produces `skillId:skillId` in the compiled agent file.
6. New E2E test verifies an ejected skill produces bare `skillId` in the compiled agent file.
7. New E2E test verifies a mixed-mode agent has both formats in the same file.

## Implementation Notes

The fix should set `pluginRef` per-skill based on the skill's `source` field (not based on a derived `installMode` for the whole agent):
```typescript
const skillsWithRefs = agent.skills.map((s) => ({
  ...s,
  pluginRef: s.source !== "eject" ? `${s.id}:${s.id}` as const : undefined,
}));
```

This works in pure plugin mode, pure eject mode, and mixed mode without needing to thread `installMode` through.

The Liquid template `agent.liquid` already correctly uses `{{ skill.pluginRef | default: skill.id }}` so no template change is needed.

## Related Files

- `src/cli/lib/compiler.ts` — `compileAgent` (needs fix)
- `src/cli/lib/stacks/stack-plugin-compiler.ts` — `compileAgentForPlugin` (already correct, can serve as reference)
- `src/agents/_templates/agent.liquid` — template (no change needed)
- `src/cli/types/skills.ts` — `PluginSkillRef` type (no change needed)

## Testing Strategy

Per the new E2E standards (state-change verification rule), each new test must verify both config AND the compiled agent file content for the expected reference format. Test scenarios:

1. **Plugin-mode init**: `cc init --source <marketplace>` with plugin skills → assert `skillId:skillId` in agent .md
2. **Eject-mode init**: `cc init` with eject skills → assert bare `skillId` in agent .md
3. **Mixed-mode edit**: install some plugin + some ejected → assert both formats coexist correctly
4. **Compile after source switch**: switch a skill from eject→plugin → recompile → assert format updated
