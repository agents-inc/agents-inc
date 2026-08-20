---
scope: reference
area: types
keywords: [type-system, pointer, split, union-counts, AGENT_NAMES, enumeration-drift]
related:
  - reference/types/core-types.md
  - reference/types/operations-types.md
  - reference/types/zod-schemas.md
  - reference/features/code-generation.md
last_validated: 2026-08-18
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
- Per-skill provenance under two names: `SkillConfig.origin` on the config side, `source` on `SkillReference` and resolved `Skill` on the compile side. Drives plugin-reference rendering (`source !== "eject"` → `${id}:${id}`). See `types/core-types.md` (SkillConfig, SkillReference, Skill).
- `PluginInstallResult.failed` is a hard-error contract; consumers must not proceed to config write. See `types/operations-types.md` (PluginInstallResult).

## Counts (verified against generated source)

| Union       | Members | Backing declaration                      |
| ----------- | ------- | ---------------------------------------- |
| `SkillId`   | 238     | values of `SKILL_MAP` (also `SKILL_IDS`) |
| `SkillSlug` | 238     | keys of `SKILL_MAP` (also `SKILL_SLUGS`) |
| `Category`  | 102     | `CATEGORIES`                             |
| `Domain`    | 9       | `DOMAINS`                                |
| `AgentName` | 18      | `AGENT_NAMES`                            |

**Only `AGENT_NAMES` of the five is bound to source by `scripts/check-enumeration-drift.ts`**, and
the reason is that nothing enumerates the other four — not anything about how they are declared. All
four read fine: `CATEGORIES` (102) and `DOMAINS` (9) are plain `as const` arrays, and `SKILL_IDS` and
`SKILL_SLUGS` carry an `as const satisfies` annotation that the checker reads through exactly as it
reads through `as`. What none of them has is a **section that names its members** — this document
owns their sizes, and a count is a claim about quantity rather than the membership list a row judges.
`DOMAINS` is reproduced verbatim as a fenced code block in
[`types/core-types.md`](./types/core-types.md), which none of the checker's readers can parse — each
of the four wants either backticked constant-shaped names or a markdown table — and a table with a
row per skill is not a thing to write so that either skill union can be bound.

`AGENT_NAMES` in full — exhaustive, in source order:

| Agent               | Domain axis               |
| ------------------- | ------------------------- |
| `agent-summoner`    | meta — authors sub-agents |
| `ai-developer`      | ai                        |
| `ai-researcher`     | ai                        |
| `ai-tester`         | ai                        |
| `api-developer`     | api                       |
| `api-researcher`    | api                       |
| `api-tester`        | api                       |
| `cli-developer`     | cli                       |
| `cli-researcher`    | cli                       |
| `cli-tester`        | cli                       |
| `codex-keeper`      | meta — owns `reference/`  |
| `convention-keeper` | meta — owns `standards/`  |
| `pm`                | cross-domain, one only    |
| `reviewer`          | cross-domain, one only    |
| `skill-summoner`    | meta — authors skills     |
| `web-developer`     | web                       |
| `web-researcher`    | web                       |
| `web-tester`        | web                       |

There is **one** `reviewer` and **one** `pm` — no per-domain reviewer or PM name exists in the union,
so a roster naming `web-reviewer` or `api-pm` names nothing.

Authoritative source: `src/cli/types/generated/source-types.ts`. Regenerate with `bun run generate:types` — pipeline, phase ordering and traps: [features/code-generation.md](./features/code-generation.md).

**Category definitions (separate file, separate count).** `defaultCategories` in `src/cli/lib/configuration/default-categories.ts` must define a member for every `Category`. Any member it omits is auto-synthesized at load time with a humanized name, `order: 999` and `exclusive: false` — which is why the file must stay exhaustive. Pinned against the generated union by `src/cli/lib/configuration/__tests__/default-categories.test.ts`. Its size and the exclusive/required split are owned by [`features/skills-and-matrix.md`](./features/skills-and-matrix.md) ("Current Counts").

**Zod schemas:** four families — bridge, loader, structural, strict. `types/zod-schemas.md` owns the count per the count-ownership registry in `standards/documentation-bible.md`; no index, tree annotation or cross-reference anywhere else may carry the number.
