---
type: architectural-drift
severity: high
affected_files:
  - src/cli/lib/configuration/config-generator.ts
  - src/cli/lib/configuration/config-generator.test.ts
  - src/cli/lib/stacks/stacks-loader.ts
standards_docs:
  - .ai-docs/reference/features/configuration.md
date: 2026-08-07
reporting_agent: cli-developer
category: architecture
domain: cli
root_cause: missing-rule
status: partial
partial_note: >-
  Code-side fix landed, Proposed Standard not written. `normalizeStackRecord` now re-keys every
  saved stack entry to its skill's live category at the persisted-config load boundary, so no
  consumer can miss a moved skill; the two pins below are inverted and pin survival. The rule this
  finding proposes for `reference/features/configuration.md` — that a category id inside persisted
  user data is a migration surface — is still unwritten.
---

## What Was Wrong

A user's `.claude-src/config.ts` persists `stack` as `agent -> category -> SkillAssignment[]`.
The category is baked into the saved shape; the skill id is the only thing inside it. When a skill
moves category between releases, the saved block still spells the old key while the matrix answers
with the new one, and nothing reconciles the two.

`shouldIncludeTriple` in `config-generator.ts` asks the prior save whether it carried this
`(agent, category, skill)` triple, and it asks under the **live** category:

```ts
const priorCategory = agentExistingStack[category];
if (priorCategory && priorCategory.some((a) => a.id === skillId)) return true;

if (inputs.newlyAddedSkillIds.has(skillId)) return true;
```

For a moved skill the first lookup misses — the saved block has no entry under the new key. The
skill is not new this session either, so the second check misses too, and the triple is **omitted
from the rebuilt stack**. The user's curation for that skill is silently discarded on the next
save. The skill itself survives (`config.skills` is a flat id list and is untouched); only its
per-agent stack placement is lost, which is what decides whether the compiled sub-agent carries it.

Two things make this hard to see:

- **The loader does not reject the stale key.** `stackAgentConfigSchema` is
  `z.record(z.string(), ...)` with no enum and no `superRefine`, so a config naming a category that
  no longer exists loads clean. Only the hand-maintained `project-config.schema.json` would flag
  it, and that is editor-facing IDE validation, not a runtime gate.
- **The one place the key is read downstream is cosmetic.** `resolveAgentConfigToSkills` builds
  `usage: "when working with ${category}"`, so a stale key that _does_ survive produces a sub-agent
  prompt describing the skill by a category it is no longer in — wrong, but silent.

Discovered while applying the two category splits (`shared-monorepo` -> `shared-task-runner`,
`shared-tooling` -> `shared-lint`) and the Elysia merge into `api-api`, which move four and one
skill respectively. Any user who saved a stack naming Turborepo, Nx, Biome, ESLint & Prettier or
Elysia is in this case.

## Fix Applied

None to the mechanism — the behaviour is now **pinned rather than repaired**, per instruction not
to invent a migration. Two tests in `config-generator.test.ts`, under
"a saved stack entry whose skill has since changed category", state exactly what happens: the
entry is dropped on a normal edit, and it survives only when the same save happens to call the
skill newly added.

The other half of restore is unaffected and is pinned too: `populateFromSkillIds` reads the flat
`config.skills` id list and asks the live matrix for each skill's category, so the wizard grid puts
a moved skill under its new header with no orphaning. That test is in `wizard-store.test.ts` under
"restoring a saved selection whose skill has since changed category".

So the honest summary of the audit is: **the wizard restores correctly; the stack rebuild does
not.** The release-notes line for this wave is a superset of the one the manifest anticipated for
`api-framework` alone.

### Repaired later the same day (CLI-424)

Option 2 below was taken, at the load boundary rather than in each consumer: `normalizeStackRecord`
(`stacks-loader.ts`) now re-keys every saved entry under its skill's live category before the
config leaves the loader, so `shouldIncludeTriple`, `priorLoadState`, `resolveStackProperty` and
`resolveAgentConfigToSkills` all see one coherent stack and no consumer needs category-agnostic
search logic. Unknown ids and `local`-category skills keep the key the config spells — the existing
unknown-id skip policy. `normalizeAgentConfig`, the stacks-file path, is deliberately untouched;
the sibling finding
(`2026-08-07-two-stack-normalizers-one-name-and-no-rule-for-which-boundary-reconciles-catalog-drift.md`)
records why and what rule is missing.

The two tests named above are **inverted** and now pin survival, so this section's description of
them is history, not the current suite. Both losses this finding documented are closed: the
placement (test one, which asserted `{}`) and the load flag (test two, whose expected
`{ id: MOVED_SKILL }` had quietly dropped the saved `preloaded: true` — it now asserts the flag).
Neither the reader nor the writer of a config needs to know a category ever moved.

## Proposed Standard

The project is pre-1.0 and bans back-compat shims, so a migration is the wrong shape. Two options
that are not:

1. **Make the drop loud.** In `buildAgentStack`, when a saved agent block names a category the
   current matrix does not define — or names a skill whose live category differs from the key it
   sits under — `warn()` naming the skill and both categories. A user who loses curation at least
   learns they did. This is the cheap one and matches the existing "unresolved slug" posture in
   `skill-resolution.ts`.

2. **Key the preservation lookup on the pair, not the triple.** `priorLoadState` could scan every
   category in the agent's saved block for the skill id rather than indexing by the live category.
   The category would then be purely presentational in the saved shape, which is what it already
   is everywhere downstream. This changes D-220's contract and needs an owner decision.

The rule that would have caught it belongs in
`.ai-docs/reference/features/configuration.md` -> "Merge and consumption": **a category id that
appears inside persisted user data is a migration surface, and any change to the category
vocabulary must state what happens to saved data keyed by the old id.** Today that document
describes `defaultCategories` as if the vocabulary were internal.
