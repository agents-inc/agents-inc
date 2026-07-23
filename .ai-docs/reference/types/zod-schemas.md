---
scope: reference
area: types
keywords: [zod, schemas, validation, safeParse, bridge-pattern, loader-schemas, strict-schemas]
related:
  - reference/types/core-types.md
  - reference/architecture/overview.md
last_validated: 2026-07-23
---

# Zod Schema Reference

**Last Updated:** 2026-07-23
**Last Validated:** 2026-07-23

> **Split from:** `reference/type-system.md`. See also: [core-types.md](./core-types.md), [operations-types.md](./operations-types.md).

## Zod Schemas

All schemas in `src/cli/lib/schemas.ts`. 35 exported schemas total.

### Bridge Schemas (union type validation)

| Schema                 | Validates            | Pattern                                                 |
| ---------------------- | -------------------- | ------------------------------------------------------- |
| `skillSlugSchema`      | SkillSlug union      | `z.enum(SKILL_SLUGS)` bridge                            |
| `categoryPathSchema`   | CategoryPath         | `z.string().refine()` (category / `local` / kebab-case) |
| `modelNameSchema`      | ModelName union      | `z.enum(MODEL_NAMES)` bridge                            |
| `permissionModeSchema` | PermissionMode union | `z.enum(PERMISSION_MODES)` bridge                       |

There is no standalone `skillIdSchema`, `domainSchema`, `categorySchema`, `agentNameSchema`, or `skillSourceTypeSchema` in `schemas.ts`. `SkillId` / `Domain` values are accepted via inline `z.string() as z.ZodType<...>` casts inside the object schemas that consume them (e.g. `boundSkillSchema`, `skillFrontmatterLoaderSchema`, `matrixRawMetadataSchema`).

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

| Schema                      | Validates                         | Pattern                                     |
| --------------------------- | --------------------------------- | ------------------------------------------- |
| `matrixRawMetadataSchema`   | Raw metadata.yaml (matrix loader) | `z.object()` (no passthrough / superRefine) |
| `skillCategoriesFileSchema` | skill-categories.ts               | `z.object()`                                |
| `skillRulesFileSchema`      | skill-rules.ts                    | `z.object()`                                |
| `stacksConfigSchema`        | stacks.ts                         | `z.object()`                                |
| `marketplaceSchema`         | marketplace.json                  | Bridge pattern                              |
| `pluginManifestSchema`      | plugin.json                       | Bridge pattern                              |
| `agentYamlConfigSchema`     | agent metadata.yaml               | Bridge pattern                              |
| `boundSkillSchema`          | BoundSkill                        | Bridge pattern                              |
| `skillAssignmentSchema`     | SkillAssignment                   | Bridge pattern                              |
| `stackAgentConfigSchema`    | Stack agent config record         | `z.record()` + union                        |
| `pluginAuthorSchema`        | PluginAuthor                      | Bridge pattern                              |
| `compatibilityGroupSchema`  | CompatibilityGroup                | Bridge pattern                              |
| `agentHookActionSchema`     | AgentHookAction                   | Bridge pattern                              |
| `agentHookDefinitionSchema` | AgentHookDefinition               | Bridge pattern                              |
| `hooksRecordSchema`         | Hooks record (lenient)            | `z.record()` + array                        |
| `strictHooksRecordSchema`   | Hooks record (strict)             | `z.record()` + min(1)                       |

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

Utility functions: `formatZodIssues()`, `validateSkillMetadata()` (picks strict vs. relaxed schema via `isCustomMetadata()`), `validateNestingDepth()`, `isCustomMetadata()`, `warnUnknownFields()`.

Exported parse-result type: `ImportedSkillMetadata` (shape returned by `importedSkillMetadataSchema` — `forkedFrom?` plus arbitrary passthrough keys).

### Recent changes

- **2026-07-23 validation sweep**: Schema count corrected 39 → 35. The standalone union bridge schemas `skillIdSchema`, `domainSchema`, `categorySchema`, `agentNameSchema`, and `skillSourceTypeSchema` no longer exist in `schemas.ts` — those unions are now validated via inline `z.string() as z.ZodType<...>` casts in the consuming object schemas. New `matrixRawMetadataSchema` (raw metadata.yaml read by the matrix loader) was added to the Structural table.
- **D-231** (2026-04-21): Removed `version: z.literal("1").optional()` from `projectConfigLoaderSchema`. `.claude-src/config.ts` is a TypeScript module (not a versioned schema), so the field was dead. See also `reference/types/core-types.md` (`ProjectConfig` — no `version` field).
