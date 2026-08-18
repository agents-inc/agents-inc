---
scope: reference
area: types
keywords: [zod, schemas, validation, safeParse, bridge-pattern, loader-schemas, strict-schemas]
related:
  - reference/types/core-types.md
  - reference/architecture/overview.md
  - reference/config/configuration.md
last_validated: 2026-08-09
---

# Zod Schema Reference

> **Split from:** `reference/type-system.md`. See also: [core-types.md](./core-types.md), [operations-types.md](./operations-types.md).

## Zod Schemas

All schemas in `src/cli/lib/schemas.ts`. Zod major version **4** (`"zod": "^4.4.3"` in `package.json`) — `.passthrough()` and `.strict()` are still the idioms in use; the file does not use `z.looseObject` / `z.strictObject`.

**34 exported schemas** — `grep -cE "^export const [a-zA-Z]+Schema" src/cli/lib/schemas.ts`. The
four tables below partition them exactly; every exported schema appears in one, and none appears in
two. **Re-derive the four sub-counts and their membership in the same pass as the total** — a total
corrected alone over stale sub-tables is how this document drifts, because each table then reads as
authoritative while hiding a member.

| Table                                                                        | Count  |
| ---------------------------------------------------------------------------- | ------ |
| [Bridge](#bridge-schemas-union-type-validation)                              | 5      |
| [Loader](#loader-schemas-lenient-passthrough)                                | 7      |
| [Structural](#structural-schemas-data-shapes)                                | 15     |
| [Strict validation](#strict-validation-schemas-strict-reject-unknown-fields) | 7      |
| **Total**                                                                    | **34** |

> **This doc's scope is `src/cli/lib/schemas.ts` only** (see the first line of this section), so the count above is narrower than "every Zod schema in the CLI". The seed wire contract is a Zod schema **outside** this doc's scope, and outside this package: it lives in `packages/matrix/src/seed.ts`, imported as `@workspace/matrix/seed` — see [features/seed-contract.md](../features/seed-contract.md). Ten of the schemas below are additionally emitted as JSON Schema by `scripts/generate-json-schemas.ts`, and the JSON-Schema-visible shape differs from the Zod shape in specific ways (`superRefine` invisible, `as z.ZodType<T>` casts invisible, plain `z.object` closing to `additionalProperties: false`) — see [features/code-generation.md](../features/code-generation.md).

`schemas.ts` also exports one type (`MetadataIssueSplit`) and seven functions (`formatZodIssues`, `validateSkillMetadata`, `describeMetadataSchemaFailure`, `splitMetadataValidationIssues`, `validateNestingDepth`, `isCustomMetadata`, `warnUnknownFields`) — see [Utility Functions](#utility-functions).

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

**`SKILL_IDS` is not imported.** `schemas.ts` imports `SKILL_SLUGS` and `CATEGORIES` and nothing else from `../types/generated/source-types`. Its absence is not a loosening — nothing here has ever enum-checked a skill ID. Do not "restore" it: adding `z.enum(SKILL_IDS)` to any of the four schemas above would reject every local and custom skill at its parse boundary.

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

`localRawMetadataSchema` is the schema behind the **single judgment of whether a `metadata.yaml` describes its skill**: `readSkillMetadata` (`lib/loading/loader.ts`) runs it after the YAML parse, and `compile`, the `config-types.ts` regeneration pass and `doctor` all take their verdict from that one call. `doctor` layers `validateSkillMetadata`'s stricter published-skill checks on the fields it returns, never beside them.

The `superRefine` on `skillMetadataLoaderSchema` and `localRawMetadataSchema` is the module-internal `validateCategoryField`: it delegates to `categoryPathSchema` by default, and requires only kebab-case when the record carries `custom: true`. `matrixRawMetadataSchema` (Structural table) deliberately does **not** run it — see its doc comment in source.

**A `projectConfigLoaderSchema` failure is never silent.** `loadProjectConfigFromDir` in `src/cli/lib/configuration/project-config.ts` throws `ConfigLoadError` on a schema violation — it must not `verbose()`-log the `safeParse` failure and return `null`, which would be indistinguishable from "no config file". See [core-types.md](./core-types.md#configloaderror-srcclilibconfigurationproject-configts) for the three-way missing / content-less / unloadable distinction.

### Structural Schemas (data shapes)

| Schema                      | Validates                           | Pattern                                     |
| --------------------------- | ----------------------------------- | ------------------------------------------- |
| `matrixRawMetadataSchema`   | Raw metadata.yaml (matrix loader)   | `z.object()` (no passthrough / superRefine) |
| `skillCategoriesFileSchema` | skill-categories.ts                 | `z.object()`                                |
| `skillRulesFileSchema`      | skill-rules.ts                      | `z.object()`                                |
| `stacksConfigSchema`        | stacks.ts                           | `z.object()`                                |
| `marketplaceSchema`         | marketplace.json                    | Bridge pattern                              |
| `pluginManifestSchema`      | plugin.json                         | Bridge pattern                              |
| `agentYamlConfigSchema`     | agent metadata.yaml                 | Bridge pattern                              |
| `skillAssignmentSchema`     | SkillAssignment                     | Bridge pattern                              |
| `stackAgentConfigSchema`    | Stack agent config record           | `z.record()` + union                        |
| `pluginAuthorSchema`        | PluginAuthor                        | Bridge pattern                              |
| `agentHookActionSchema`     | AgentHookAction                     | Bridge pattern                              |
| `agentHookDefinitionSchema` | AgentHookDefinition                 | Bridge pattern                              |
| `hooksRecordSchema`         | Hooks record (lenient)              | `z.record()` + array                        |
| `strictHooksRecordSchema`   | Hooks record (strict)               | `z.record()` + min(1)                       |
| `sourceRevalidationSchema`  | `<cacheDir>.etag.json` fetch record | `z.object()`                                |

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

| Schema                            | Used by                                                                           |
| --------------------------------- | --------------------------------------------------------------------------------- |
| `strictAgentHookDefinitionSchema` | `strictHooksRecordSchema`                                                         |
| `pluginManifestObjectSchema`      | `pluginManifestSchema` (lenient) + `pluginManifestValidationSchema` (`.strict()`) |
| `skillAssignmentElementSchema`    | `stackAgentConfigSchema` (bare-string-or-object union)                            |
| `categoryDefinitionSchema`        | `skillCategoriesFileSchema`                                                       |
| `skillRefInRules`                 | Alias of `skillSlugSchema` used inside the rule schemas                           |
| `skillGroupRuleSchema`            | Backs `conflictRuleSchema` and `discourageRuleSchema`                             |
| `conflictRuleSchema`              | `relationshipDefinitionsSchema`                                                   |
| `discourageRuleSchema`            | `relationshipDefinitionsSchema`                                                   |
| `requireRuleSchema`               | `relationshipDefinitionsSchema`                                                   |
| `alternativeGroupSchema`          | `relationshipDefinitionsSchema`                                                   |
| `relationshipDefinitionsSchema`   | `skillRulesFileSchema`                                                            |
| `stackSchema`                     | `stacksConfigSchema`                                                              |
| `marketplaceRemoteSourceSchema`   | `marketplacePluginSchema`                                                         |
| `marketplacePluginSchema`         | `marketplaceSchema`                                                               |
| `marketplaceOwnerSchema`          | Alias of `pluginAuthorSchema`; `marketplaceSchema`                                |
| `marketplaceMetadataSchema`       | `marketplaceSchema`                                                               |
| `permissionConfigSchema`          | `settingsFileSchema`                                                              |
| `brandingConfigSchema`            | `projectSourceConfigSchema`                                                       |
| `forkedFromSchema`                | `skillMetadataBaseSchema`                                                         |
| `skillMetadataBaseSchema`         | `metadataValidationSchema` + `customMetadataValidationSchema`                     |
| `stackSkillAssignmentSchema`      | `stackConfigValidationSchema`                                                     |

### `forkedFrom` — two shapes, and `path` must be declared in both

`forkedFrom` is the package's single answer to "did the CLI put this skill directory here?" — the
copier stamps it into every skill directory the CLI writes, `uninstall` reads it to decide what it
may delete, and the seed producer reads it to decide what a round trip owns. It appears in
`schemas.ts` **twice**, deliberately not unified, because the two shapes differ:

| Where                                                                     | Fields                                                           |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `forkedFromSchema` (internal) -> `skillMetadataBaseSchema`                | `skillId`, `version?`, `contentHash`, `source?`, `path?`, `date` |
| The inline `forkedFrom` object inside `localSkillMetadataSchema` (loader) | `skillId`, `contentHash`, `date`, `source?`, `path?`             |

**`path` is the discriminator for a carried skill**, and it had to be declared in BOTH. `source`
names the repository the bytes came from; `path` names the directory inside it. A marketplace
resolves every id it serves, so an ejected catalogue skill needs no directory recorded and has
none — which is what makes "has a recorded directory" the property that MAKES a skill external
rather than a flag bolted on to mean it.

**Declaring it in only one is silent data loss.** Both `forkedFrom` objects are plain `z.object()`,
so each STRIPS keys it does not declare — including inside `localSkillMetadataSchema`, whose
`.passthrough()` applies to the outer record, not to this nested object. A `path` written to disk
and undeclared on the read schema is dropped on load with no error, and a producer rebuilding the
carried entry sees a skill indistinguishable from an ordinary ejected one. Consumer:
`readCarriedSkill` in `src/cli/lib/seed/external-skills.ts` — see
[features/seed-contract.md](../features/seed-contract.md).

### Utility Functions

All exported from `src/cli/lib/schemas.ts`.

| Function                        | Signature                                                                | Purpose                                                                                                                                                                                                                            |
| ------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `formatZodIssues`               | `(issues: z.ZodIssue[]) => string`                                       | Joins issues into `path: message; path: message`. Delegates per-issue to internal `formatZodIssue`.                                                                                                                                |
| `describeMetadataSchemaFailure` | `(issues: z.ZodIssue[], rawMetadata: Record<string, unknown>) => string` | Names a `metadata.yaml` failure in plain words: absent required fields as `missing required fields: a, b`, everything else per field. Absence is read off `rawMetadata`, not off Zod's message — a v4 issue carries no `received`. |
| `validateSkillMetadata`         | `(rawMetadata: unknown) => SafeParseReturn`                              | Picks `customMetadataValidationSchema` vs `metadataValidationSchema` via `isCustomMetadata()`.                                                                                                                                     |
| `splitMetadataValidationIssues` | `(error: z.ZodError, rawMetadata: unknown) => MetadataIssueSplit`        | Splits a strict-metadata failure into hard `errors` and advisory `warnings` (see below).                                                                                                                                           |
| `validateNestingDepth`          | `(value: unknown, maxDepth: number) => boolean`                          | Guards untrusted JSON/YAML nesting at security-critical boundaries (marketplace, settings).                                                                                                                                        |
| `isCustomMetadata`              | `(raw: unknown) => boolean`                                              | True when the record declares `custom: true`.                                                                                                                                                                                      |
| `warnUnknownFields`             | see source                                                               | Logs unknown keys surviving a `.passthrough()` parse.                                                                                                                                                                              |

**Exported types:**

- `MetadataIssueSplit` — `{ errors: string[]; warnings: string[] }`, the return of `splitMetadataValidationIssues`.

### `cliDescription` — Advisory Over-Length

`skillMetadataBaseSchema` declares `cliDescription: z.string().min(1).max(CLI_DESCRIPTION_MAX_LENGTH)` where the module-internal `CLI_DESCRIPTION_MAX_LENGTH = 60`. The `max` is the **declared contract**, but exceeding it is **not fatal**:

- `splitMetadataValidationIssues` partitions the `ZodError` with the internal predicate `isOverLengthCliDescription` (`issue.code === "too_big"` at path `["cliDescription"]`) and routes only that issue into `warnings`, carrying the value's actual length in the message.
- `min(1)` (empty or missing) and every other issue stay hard `errors`.

Rationale: the runtime loader schemas accept any length and the value only feeds wizard description text, so a long description must not fail a healthy install. Consumers: `src/cli/lib/content-validator.ts` (the skills row of `doctor`'s content layer) and `src/cli/lib/source-validator.ts` — both destructure `{ errors, warnings }` from it.
