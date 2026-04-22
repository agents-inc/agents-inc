---
scope: reference
area: types
keywords: [zod, schemas, validation, safeParse, bridge-pattern, loader-schemas, strict-schemas]
related:
  - reference/types/core-types.md
  - reference/architecture/overview.md
last_validated: 2026-04-21
---

# Zod Schema Reference

**Last Updated:** 2026-04-21
**Last Validated:** 2026-04-21

> **Split from:** `reference/type-system.md`. See also: [core-types.md](./core-types.md), [operations-types.md](./operations-types.md).

## Zod Schemas

All schemas in `src/cli/lib/schemas.ts`. 39 exported schemas total.

### Bridge Schemas (union type validation)

| Schema                  | Validates             | Pattern                          |
| ----------------------- | --------------------- | -------------------------------- |
| `domainSchema`          | Domain union          | `z.enum(DOMAINS)` bridge         |
| `categorySchema`        | Category union        | `z.enum(CATEGORIES)` bridge      |
| `agentNameSchema`       | AgentName union       | `z.enum(AGENT_NAMES)` bridge     |
| `skillSlugSchema`       | SkillSlug union       | `z.enum(SKILL_SLUGS)` bridge     |
| `skillIdSchema`         | SkillId membership    | `.refine()` against `SKILL_IDS`  |
| `categoryPathSchema`    | CategoryPath          | Custom refine + enum             |
| `modelNameSchema`       | ModelName union       | `z.enum(["sonnet", ...])` bridge |
| `permissionModeSchema`  | PermissionMode union  | `z.enum([...])` bridge           |
| `skillSourceTypeSchema` | SkillSourceType union | `z.enum(["public", ...])` bridge |

### Loader Schemas (lenient, `.passthrough()`)

| Schema                         | Validates                 | Pattern                                      |
| ------------------------------ | ------------------------- | -------------------------------------------- |
| `skillFrontmatterLoaderSchema` | SKILL.md frontmatter      | Lenient object                               |
| `skillMetadataLoaderSchema`    | metadata.yaml             | `.passthrough()` + superRefine               |
| `projectConfigLoaderSchema`    | .claude-src/config.ts     | `.passthrough()` (no `version` field; D-231) |
| `projectSourceConfigSchema`    | Source config             | `.passthrough()`                             |
| `localRawMetadataSchema`       | Local skill metadata.yaml | `.passthrough()` + superRefine               |
| `localSkillMetadataSchema`     | Local skill forkedFrom    | `.passthrough()`                             |
| `settingsFileSchema`           | settings.yaml             | `.passthrough()`                             |
| `importedSkillMetadataSchema`  | Imported skill metadata   | `.passthrough()`                             |

### Structural Schemas (data shapes)

| Schema                      | Validates                 | Pattern               |
| --------------------------- | ------------------------- | --------------------- |
| `skillCategoriesFileSchema` | skill-categories.ts       | `z.object()`          |
| `skillRulesFileSchema`      | skill-rules.ts            | `z.object()`          |
| `stacksConfigSchema`        | stacks.ts                 | `z.object()`          |
| `marketplaceSchema`         | marketplace.json          | Bridge pattern        |
| `pluginManifestSchema`      | plugin.json               | Bridge pattern        |
| `agentYamlConfigSchema`     | agent metadata.yaml       | Bridge pattern        |
| `boundSkillSchema`          | BoundSkill                | Bridge pattern        |
| `skillAssignmentSchema`     | SkillAssignment           | Bridge pattern        |
| `stackAgentConfigSchema`    | Stack agent config record | `z.record()` + union  |
| `pluginAuthorSchema`        | PluginAuthor              | Bridge pattern        |
| `compatibilityGroupSchema`  | CompatibilityGroup        | Bridge pattern        |
| `agentHookActionSchema`     | AgentHookAction           | Bridge pattern        |
| `agentHookDefinitionSchema` | AgentHookDefinition       | Bridge pattern        |
| `hooksRecordSchema`         | Hooks record (lenient)    | `z.record()` + array  |
| `strictHooksRecordSchema`   | Hooks record (strict)     | `z.record()` + min(1) |

### Strict Validation Schemas (`.strict()`, reject unknown fields)

| Schema                             | Validates              | Pattern      |
| ---------------------------------- | ---------------------- | ------------ |
| `metadataValidationSchema`         | Strict metadata        | `.strict()`  |
| `customMetadataValidationSchema`   | Custom skill metadata  | `z.object()` |
| `agentYamlGenerationSchema`        | Compiled agent output  | `.strict()`  |
| `agentFrontmatterValidationSchema` | AGENT.md frontmatter   | `.strict()`  |
| `skillFrontmatterValidationSchema` | SKILL.md frontmatter   | `.strict()`  |
| `pluginManifestValidationSchema`   | plugin.json strict     | `.strict()`  |
| `stackConfigValidationSchema`      | Published stack config | `.strict()`  |

Schema bridge pattern: `z.enum(GENERATED_ARRAY) as z.ZodType<UnionType>` ensures Zod output matches TypeScript union types from generated source.

Utility functions: `formatZodIssues()`, `validateNestingDepth()`, `isCustomMetadata()`, `warnUnknownFields()`.

### Recent changes

- **D-231** (2026-04-21): Removed `version: z.literal("1").optional()` from `projectConfigLoaderSchema`. `.claude-src/config.ts` is a TypeScript module (not a versioned schema), so the field was dead. See also `reference/types/core-types.md` (`ProjectConfig` — no `version` field).
