---
scope: reference
area: types
keywords: [type-system, pointer, split]
related:
  - reference/types/core-types.md
  - reference/types/operations-types.md
  - reference/types/zod-schemas.md
last_validated: 2026-07-30
---

<!-- VALIDATED 2026-07-30 · SYNC to product v0.146.0 — all four generated unions re-counted against src/cli/types/generated/source-types.ts. -->

# Type System (Pointer)

**Last Updated:** 2026-07-30
**Last Validated:** 2026-07-30

> This file was **split** in Phase 2+3 of the documentation restructure. All content now lives in the three files below. This pointer exists because inbound links (CLAUDE.md, agent findings, older docs) still reference `reference/type-system.md` — do NOT delete without sweeping those references first.

## Where the content lives now

| Topic                                                                                   | File                                                     |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Type module structure, generated unions (SkillId/SkillSlug/Domain/Category/AgentName)   | [types/core-types.md](./types/core-types.md)             |
| Named aliases, ResolvedSkill, MergedSkillsMatrix, ProjectConfig, SkillConfig, Skill     | [types/core-types.md](./types/core-types.md)             |
| Type guards, typed-object helpers, type narrowing rules                                 | [types/core-types.md](./types/core-types.md)             |
| Operations-layer result types (LoadedSource, PluginInstallResult, CompilationResult, …) | [types/operations-types.md](./types/operations-types.md) |
| Edit-command types (ConfigChanges, PluginScopeMigrationResult, detectConfigChanges)     | [types/operations-types.md](./types/operations-types.md) |
| Zod schemas (bridge / loader / structural / strict) + bridge pattern                    | [types/zod-schemas.md](./types/zod-schemas.md)           |

## Recent semantic shifts (quick index)

- **D-279** (0.146.0) — Cross-scope conflict **masking**. One shared reconciliation step runs immediately before both project-config write paths and stamps `excluded: true` on a live global entry that collides with the project's own state. Reads `exclusive` from the **merged matrix**, so the `Category` flags are now load-bearing outside the wizard. See `concepts/tombstone-pattern.md` (mask vs. tombstone) and `types/core-types.md` (Category).
- **D-273** (0.145.0) — New `ConfigLoadError` class (`src/cli/lib/configuration/project-config.ts`). `loadProjectConfigFromDir` no longer collapses "missing" and "corrupt" into `null`: missing still returns `null`, unloadable throws. See `types/core-types.md` (ConfigLoadError) and `types/zod-schemas.md` (Loader Schemas).
- **`InstallationInfo.version` removed** (0.145.0) — the field only ever held the install mode, and the formatter prefixed it with `v` (`Installation: agents-inc vplugin`). Documented in `features/plugin-system.md`, cross-referenced from `types/core-types.md` (Installation).
- **Shared base types** — `SkillCore`, `BaseAgentFields`, and `SkillGroupRule` are intersection bases; their derivatives are written `Base & { extras }`. See `types/core-types.md` (Shared Base Types).
- **D-231** — `ProjectConfig.version` and `projectConfigLoaderSchema.version` removed. `.claude-src/config.ts` is a TypeScript module, not a versioned schema. See `types/core-types.md` (ProjectConfig) and `types/zod-schemas.md` (Recent changes).
- **D-217** — Per-skill `source` field on `SkillConfig`, `SkillReference`, and resolved `Skill`. Drives plugin-reference rendering (`source !== "eject"` → `${id}:${id}`). See `types/core-types.md` (SkillConfig, SkillReference, Skill).
- **D-229** — `PluginInstallResult.failed` is a hard-error contract; consumers must not proceed to config write. See `types/operations-types.md` (PluginInstallResult).

## Counts (verified against generated source)

Re-counted from source on **2026-07-30** (product v0.146.0). Every count below was already correct at the previous sweep and is unchanged.

| Union       | Members | Backing declaration                      |
| ----------- | ------- | ---------------------------------------- |
| `SkillId`   | 222     | values of `SKILL_MAP` (also `SKILL_IDS`) |
| `SkillSlug` | 222     | keys of `SKILL_MAP` (also `SKILL_SLUGS`) |
| `Category`  | 89      | `CATEGORIES`                             |
| `Domain`    | 9       | `DOMAINS`                                |
| `AgentName` | 23      | `AGENT_NAMES`                            |

Authoritative source: `src/cli/types/generated/source-types.ts`. Regenerate with `bun run generate:types`.

**Category definitions (separate file, separate count).** `defaultCategories` in `src/cli/lib/configuration/default-categories.ts` defines **all 89** members as of 0.145.0 — previously 51, with the other 38 auto-synthesized at load time (humanized name, `order: 999`, `exclusive: false`). Of the 89: **27 are `exclusive: true`**, **6 are `required: true`**. Pinned against the generated union by `src/cli/lib/configuration/__tests__/default-categories.test.ts`.

**Zod schemas:** 35 exported (4 bridge / 8 loader / 16 structural / 7 strict), re-counted 2026-07-30. See `types/zod-schemas.md`.

> **Inbound drift — closed 2026-07-30.** `.ai-docs/standards/documentation-bible.md` used to annotate `types/zod-schemas.md` as "All 39 Zod schemas" while the true count had been 35 since the 2026-07-23 sweep. Rather than correcting the number, the index annotation now carries **no count at all**, and the bible gained a count-ownership registry naming `types/zod-schemas.md` as the single owner of this figure. Restate a count outside its owning doc only with a pointer like this one.
