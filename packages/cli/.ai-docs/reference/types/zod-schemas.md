---
scope: reference
area: types
keywords: [zod, schemas, validation, safeParse, bridge-pattern, loader-schemas, strict-schemas]
related:
  - reference/types/core-types.md
  - reference/architecture/overview.md
  - reference/config/configuration.md
last_validated: 2026-08-01
---

# Zod Schema Reference

> **Split from:** `reference/type-system.md`. See also: [core-types.md](./core-types.md), [operations-types.md](./operations-types.md).

## Zod Schemas

All schemas in `src/cli/lib/schemas.ts`. Zod major version **4** (`"zod": "^4.3.6"` in `package.json`) — `.passthrough()` and `.strict()` are still the idioms in use; the file does not use `z.looseObject` / `z.strictObject`.

**36 exported schemas total**, verified by counting `export const *Schema` declarations in source. Breakdown, which sums to the total:

| Table                                                                        | Count  |
| ---------------------------------------------------------------------------- | ------ |
| [Bridge](#bridge-schemas-union-type-validation)                              | 5      |
| [Loader](#loader-schemas-lenient-passthrough)                                | 8      |
| [Structural](#structural-schemas-data-shapes)                                | 16     |
| [Strict validation](#strict-validation-schemas-strict-reject-unknown-fields) | 7      |
| **Total**                                                                    | **36** |

> **This doc's scope is `src/cli/lib/schemas.ts` only** (see the first line of this section), so the count above is narrower than "every Zod schema in the CLI". `src/cli/lib/seed/seed-schema.ts` is a Zod schema **outside** this doc's scope — see [features/seed-contract.md](../features/seed-contract.md). Ten of the schemas below are additionally emitted as JSON Schema by `scripts/generate-json-schemas.ts`, and the JSON-Schema-visible shape differs from the Zod shape in specific ways (`superRefine` invisible, `as z.ZodType<T>` casts invisible, plain `z.object` closing to `additionalProperties: false`) — see [features/code-generation.md](../features/code-generation.md).

`schemas.ts` also exports one type (`ImportedSkillMetadata`), one type (`MetadataIssueSplit`), and five functions — see [Utility Functions](#utility-functions).

### Bridge Schemas (union type validation)

| Schema                 | Validates            | Pattern                                                 |
| ---------------------- | -------------------- | ------------------------------------------------------- |
| `skillSlugSchema`      | SkillSlug union      | `z.enum(SKILL_SLUGS)` bridge                            |
| `categoryPathSchema`   | CategoryPath         | `z.string().refine()` (category / `local` / kebab-case) |
| `modelNameSchema`      | ModelName union      | `z.enum(MODEL_NAMES)` bridge                            |
| `effortLevelSchema`    | EffortLevel union    | `z.enum(EFFORT_NAMES)` bridge                           |
| `permissionModeSchema` | PermissionMode union | `z.enum(PERMISSION_MODES)` bridge                       |

`effortLevelSchema` has four consumers (`agentYamlConfigSchema`, `projectConfigLoaderSchema.agents`, `agentYamlGenerationSchema`, `agentFrontmatterValidationSchema`) — the full `model` / `effort` chain is in [features/model-and-effort.md](../features/model-and-effort.md).

There is no standalone `skillIdSchema`, `domainSchema`, `categorySchema`, `agentNameSchema`, or `skillSourceTypeSchema` in `schemas.ts`. `SkillId` / `Domain` values are accepted via inline `z.string() as z.ZodType<...>` casts inside the object schemas that consume them (e.g. `boundSkillSchema`, `skillFrontmatterLoaderSchema`, `skillAssignmentSchema`, `matrixRawMetadataSchema`).

#### Why slugs and categories are strict but skill IDs are not

This asymmetry is **deliberate, not an omission**. `schemas.ts` imports exactly two generated union arrays:

```ts
import { SKILL_SLUGS, CATEGORIES } from "../types/generated/source-types";
```

| Union       | Treatment in `schemas.ts`                                                                              | Why                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `SkillSlug` | Strict — `z.enum(SKILL_SLUGS)` (`skillSlugSchema`, and again in `metadataValidationSchema`)            | A slug names a skill the source repo publishes; an unknown one is an error |
| `Category`  | Strict — `z.enum(CATEGORIES)` in `metadataValidationSchema`; membership-tested in `categoryPathSchema` | Same                                                                       |
| `SkillId`   | **Lenient** — `z.string() as z.ZodType<SkillId>`, never enum-checked                                   | Local and custom skills legitimately have IDs outside the generated union  |
| `Domain`    | **Lenient** — `(z.string() as z.ZodType<Domain>)`                                                      | Custom skills declare custom domains                                       |

The rationale is written inline in source at `skillFrontmatterLoaderSchema`:

```ts
// Lenient: accepts any string for `name` since local/custom skills may not follow strict SkillId pattern
```

**`SKILL_IDS` is not imported.** It was an unused import removed's dead-code pass; its removal is a no-op for validation, not a loosening — nothing had ever enum-checked a skill ID. Do not "restore" it: adding `z.enum(SKILL_IDS)` to any of the four schemas above would reject every local and custom skill at its parse boundary.

### Loader Schemas (lenient, `.passthrough()`)

| Schema                         | Validates                 | Pattern                               |
| ------------------------------ | ------------------------- | ------------------------------------- |
| `skillFrontmatterLoaderSchema` | SKILL.md frontmatter      | Lenient object (no `.passthrough()`)  |
| `skillMetadataLoaderSchema`    | metadata.yaml             | `.passthrough()` + superRefine        |
| `projectConfigLoaderSchema`    | .claude-src/config.ts     | `.passthrough()` (no `version` field) |
| `projectSourceConfigSchema`    | Source config             | `.passthrough()`                      |
| `localRawMetadataSchema`       | Local skill metadata.yaml | `.passthrough()` + superRefine        |
| `localSkillMetadataSchema`     | Local skill forkedFrom    | `.passthrough()`                      |
| `settingsFileSchema`           | settings.yaml             | `.passthrough()`                      |
| `importedSkillMetadataSchema`  | Imported skill metadata   | `.passthrough()`                      |

The `superRefine` on `skillMetadataLoaderSchema` and `localRawMetadataSchema` is the module-internal `validateCategoryField`: it delegates to `categoryPathSchema` by default, and requires only kebab-case when the record carries `custom: true`. `matrixRawMetadataSchema` (Structural table) deliberately does **not** run it — see its doc comment in source.

**A `projectConfigLoaderSchema` failure is never silent.** `loadProjectConfigFromDir` in `src/cli/lib/configuration/project-config.ts` throws `ConfigLoadError` on a schema violation — it must not `verbose()`-log the `safeParse` failure and return `null`, which would be indistinguishable from "no config file". See [core-types.md](./core-types.md#configloaderror-srcclilibconfigurationproject-configts) for the three-way missing / content-less / unloadable distinction.

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

> **`customMetadataValidationSchema` is the one member of this table without `.strict()`.** It is `skillMetadataBaseSchema.extend({ category: z.string(), slug: kebab-case string })` with no unknown-key policy, so it **strips** unknown fields rather than rejecting them — deliberately relaxed, because custom skills may define their own categories. Every other row rejects unknown keys.

Schema bridge pattern: `z.enum(GENERATED_ARRAY) as z.ZodType<UnionType>` ensures Zod output matches TypeScript union types from generated source.

### Module-Internal Schemas (not exported)

Enumerated exhaustively — a schema absent from both this list and the four tables above does not exist in `schemas.ts`.

| Schema                            | Used by                                                                                         |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `strictAgentHookDefinitionSchema` | `strictHooksRecordSchema`                                                                       |
| `pluginManifestObjectSchema`      | `pluginManifestSchema` (lenient) + `pluginManifestValidationSchema` (`.strict()`)               |
| `skillAssignmentElementSchema`    | `stackAgentConfigSchema` (bare-string-or-object union)                                          |
| `categoryDefinitionSchema`        | `skillCategoriesFileSchema`                                                                     |
| `skillRefInRules`                 | Alias of `skillSlugSchema` used inside the rule schemas                                         |
| `skillGroupRuleSchema`            | Backs `conflictRuleSchema`, `discourageRuleSchema`, and the exported `compatibilityGroupSchema` |
| `conflictRuleSchema`              | `relationshipDefinitionsSchema`                                                                 |
| `discourageRuleSchema`            | `relationshipDefinitionsSchema`                                                                 |
| `recommendationSchema`            | `relationshipDefinitionsSchema`                                                                 |
| `requireRuleSchema`               | `relationshipDefinitionsSchema`                                                                 |
| `alternativeGroupSchema`          | `relationshipDefinitionsSchema`                                                                 |
| `relationshipDefinitionsSchema`   | `skillRulesFileSchema`                                                                          |
| `stackSchema`                     | `stacksConfigSchema`                                                                            |
| `marketplaceRemoteSourceSchema`   | `marketplacePluginSchema`                                                                       |
| `marketplacePluginSchema`         | `marketplaceSchema`                                                                             |
| `marketplaceOwnerSchema`          | Alias of `pluginAuthorSchema`; `marketplaceSchema`                                              |
| `marketplaceMetadataSchema`       | `marketplaceSchema`                                                                             |
| `permissionConfigSchema`          | `settingsFileSchema`                                                                            |
| `brandingConfigSchema`            | `projectSourceConfigSchema`                                                                     |
| `forkedFromSchema`                | `skillMetadataBaseSchema`                                                                       |
| `skillMetadataBaseSchema`         | `metadataValidationSchema` + `customMetadataValidationSchema`                                   |
| `stackSkillAssignmentSchema`      | `stackConfigValidationSchema`                                                                   |

### Utility Functions

All exported from `src/cli/lib/schemas.ts`.

| Function                        | Signature                                                         | Purpose                                                                                             |
| ------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `formatZodIssues`               | `(issues: z.ZodIssue[]) => string`                                | Joins issues into `path: message; path: message`. Delegates per-issue to internal `formatZodIssue`. |
| `validateSkillMetadata`         | `(rawMetadata: unknown) => SafeParseReturn`                       | Picks `customMetadataValidationSchema` vs `metadataValidationSchema` via `isCustomMetadata()`.      |
| `splitMetadataValidationIssues` | `(error: z.ZodError, rawMetadata: unknown) => MetadataIssueSplit` | Splits a strict-metadata failure into hard `errors` and advisory `warnings` (see below).            |
| `validateNestingDepth`          | `(value: unknown, maxDepth: number) => boolean`                   | Guards untrusted JSON/YAML nesting at security-critical boundaries (marketplace, settings).         |
| `isCustomMetadata`              | `(raw: unknown) => boolean`                                       | True when the record declares `custom: true`.                                                       |
| `warnUnknownFields`             | see source                                                        | Logs unknown keys surviving a `.passthrough()` parse.                                               |

**Exported types:**

- `ImportedSkillMetadata` — parse-result shape of `importedSkillMetadataSchema` (`forkedFrom?` plus arbitrary passthrough keys).
- `MetadataIssueSplit` — `{ errors: string[]; warnings: string[] }`, the return of `splitMetadataValidationIssues`.

### `cliDescription` — Advisory Over-Length

`skillMetadataBaseSchema` declares `cliDescription: z.string().min(1).max(CLI_DESCRIPTION_MAX_LENGTH)` where the module-internal `CLI_DESCRIPTION_MAX_LENGTH = 60`. The `max` is the **declared contract**, but exceeding it is **not fatal**:

- `splitMetadataValidationIssues` partitions the `ZodError` with the internal predicate `isOverLengthCliDescription` (`issue.code === "too_big"` at path `["cliDescription"]`) and routes only that issue into `warnings`, carrying the value's actual length in the message.
- `min(1)` (empty or missing) and every other issue stay hard `errors`.

Rationale: the runtime loader schemas accept any length and the value only feeds wizard description text, so a long description must not fail a healthy install. Consumers: `src/cli/commands/validate.ts` and `src/cli/lib/source-validator.ts` — both destructure `{ errors, warnings }` from it.
