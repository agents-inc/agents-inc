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

# Type System (Pointer)

> **Pointer.** The content lives in the files below. This path is kept because inbound links (CLAUDE.md, agent findings, other docs) still use it — do not delete it without sweeping those references first.

## Where the content lives now

| Topic                                                                                   | File                                                     |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Type module structure, generated unions (SkillId/SkillSlug/Domain/Category/AgentName)   | [types/core-types.md](./types/core-types.md)             |
| Named aliases, ResolvedSkill, MergedSkillsMatrix, ProjectConfig, SkillConfig, Skill     | [types/core-types.md](./types/core-types.md)             |
| Type guards, typed-object helpers, type narrowing rules                                 | [types/core-types.md](./types/core-types.md)             |
| Operations-layer result types (LoadedSource, PluginInstallResult, CompilationResult, …) | [types/operations-types.md](./types/operations-types.md) |
| Edit-command types (ConfigChanges, PluginScopeMigrationResult, detectConfigChanges)     | [types/operations-types.md](./types/operations-types.md) |
| Zod schemas (bridge / loader / structural / strict) + bridge pattern                    | [types/zod-schemas.md](./types/zod-schemas.md)           |

## Semantics worth knowing before reading the children

- Cross-scope conflict **masking**. One shared reconciliation step runs immediately before both project-config write paths and stamps `excluded: true` on a live global entry that collides with the project's own state. Reads `exclusive` from the **merged matrix**, so the `Category` flags are now load-bearing outside the wizard. See `concepts/tombstone-pattern.md` (mask vs. tombstone) and `types/core-types.md` (Category).
- New `ConfigLoadError` class (`src/cli/lib/configuration/project-config.ts`). `loadProjectConfigFromDir` no longer collapses "missing" and "corrupt" into `null`: missing still returns `null`, unloadable throws. See `types/core-types.md` (ConfigLoadError) and `types/zod-schemas.md` (Loader Schemas).
- **`InstallationInfo.version` removed** — the field only ever held the install mode, and the formatter prefixed it with `v` (`Installation: agents-inc vplugin`). Documented in `features/plugin-system.md`, cross-referenced from `types/core-types.md` (Installation).
- **Shared base types** — `SkillCore`, `BaseAgentFields`, and `SkillGroupRule` are intersection bases; their derivatives are written `Base & { extras }`. See `types/core-types.md` (Shared Base Types).
- `ProjectConfig.version` and `projectConfigLoaderSchema.version` removed. `.claude-src/config.ts` is a TypeScript module, not a versioned schema. See `types/core-types.md` (ProjectConfig) and `types/zod-schemas.md` (Recent changes).
- Per-skill `source` field on `SkillConfig`, `SkillReference`, and resolved `Skill`. Drives plugin-reference rendering (`source !== "eject"` → `${id}:${id}`). See `types/core-types.md` (SkillConfig, SkillReference, Skill).
- `PluginInstallResult.failed` is a hard-error contract; consumers must not proceed to config write. See `types/operations-types.md` (PluginInstallResult).

## Counts (verified against generated source)

| Union       | Members | Backing declaration                      |
| ----------- | ------- | ---------------------------------------- |
| `SkillId`   | 237     | values of `SKILL_MAP` (also `SKILL_IDS`) |
| `SkillSlug` | 237     | keys of `SKILL_MAP` (also `SKILL_SLUGS`) |
| `Category`  | 102     | `CATEGORIES`                             |
| `Domain`    | 9       | `DOMAINS`                                |
| `AgentName` | 18      | `AGENT_NAMES`                            |

`AGENT_NAMES` in full: `agent-summoner`, `ai-developer`, `ai-researcher`, `ai-tester`,
`api-developer`, `api-researcher`, `api-tester`, `cli-developer`, `cli-researcher`, `cli-tester`,
`codex-keeper`, `convention-keeper`, `pm`, `reviewer`, `skill-summoner`, `web-developer`,
`web-researcher`, `web-tester`. There is **one** `reviewer` and **one** `pm` — no per-domain
reviewer or PM name exists in the union, so a roster naming `web-reviewer` or `api-pm` names
nothing.

Authoritative source: `src/cli/types/generated/source-types.ts`. Regenerate with `bun run generate:types` — pipeline, phase ordering and traps: [features/code-generation.md](./features/code-generation.md).

**Category definitions (separate file, separate count).** `defaultCategories` in `src/cli/lib/configuration/default-categories.ts` must define a member for every `Category`. Any member it omits is auto-synthesized at load time with a humanized name, `order: 999` and `exclusive: false` — which is why the file must stay exhaustive. Pinned against the generated union by `src/cli/lib/configuration/__tests__/default-categories.test.ts`. Its size and the exclusive/required split are owned by [`features/skills-and-matrix.md`](./features/skills-and-matrix.md) ("Current Counts").

**Zod schemas:** four families — bridge, loader, structural, strict. `types/zod-schemas.md` owns the count per the count-ownership registry in `standards/documentation-bible.md`; no index, tree annotation or cross-reference anywhere else may carry the number.
