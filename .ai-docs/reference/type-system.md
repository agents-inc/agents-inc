---
scope: reference
area: types
keywords: [type-system, pointer, split]
related:
  - reference/types/core-types.md
  - reference/types/operations-types.md
  - reference/types/zod-schemas.md
last_validated: 2026-07-23
---

# Type System (Pointer)

**Last Updated:** 2026-07-23
**Last Validated:** 2026-07-23

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

- **D-231** — `ProjectConfig.version` and `projectConfigLoaderSchema.version` removed. `.claude-src/config.ts` is a TypeScript module, not a versioned schema. See `types/core-types.md` (ProjectConfig) and `types/zod-schemas.md` (Recent changes).
- **D-217** — Per-skill `source` field on `SkillConfig`, `SkillReference`, and resolved `Skill`. Drives plugin-reference rendering (`source !== "eject"` → `${id}:${id}`). See `types/core-types.md` (SkillConfig, SkillReference, Skill).
- **D-229** — `PluginInstallResult.failed` is a hard-error contract; consumers must not proceed to config write. See `types/operations-types.md` (PluginInstallResult).

## Counts (verified against generated source)

- **SkillId / SkillSlug:** 222 members (was 161 in the pre-split doc).
- **Category:** 89 members (was 51 in the pre-split doc).
- **Domain:** 9 members.
- **AgentName:** 23 members.

Authoritative source: `src/cli/types/generated/source-types.ts`. Regenerate with `bun run generate:types`.
