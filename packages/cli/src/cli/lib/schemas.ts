import { z } from "zod";
import { partition } from "remeda";
import type { LocalSkillMetadata } from "./skills/skill-metadata";
import type { LocalRawMetadata } from "./skills/local-skill-loader";
import {
  AUTHOR_HANDLE_PATTERN,
  KEBAB_CASE_PATTERN,
  LOCAL_PSEUDO_CATEGORY,
  STANDARD_FILES,
} from "../consts";
import { METADATA_KEYS } from "./metadata-keys";
import { formatZodIssue } from "./schema-validator";
import { isRecord } from "../utils/type-guards";
import { warn } from "../utils/logger";
import { SKILL_SLUGS, CATEGORIES } from "../types/generated/source-types";
import {
  AGENT_ISOLATIONS,
  CACHE_TTLS,
  CODEX_MODEL_NAMES,
  EFFORT_NAMES,
  MODEL_NAMES,
  PERMISSION_MODES,
} from "../types/matrix";
import type {
  AgentHookAction,
  AgentHookDefinition,
  AgentIsolation,
  AgentName,
  AgentYamlConfig,
  AlternativeGroup,
  CategoryDefinition,
  CategoryPath,
  CodexModelName,
  ConflictRule,
  DiscourageRule,
  Domain,
  EffortLevel,
  Marketplace,
  MarketplaceMetadata,
  MarketplaceOwner,
  MarketplacePlugin,
  MarketplaceRemoteSource,
  ModelName,
  PermissionMode,
  PluginAuthor,
  PluginManifest,
  ProjectConfig,
  RelationshipDefinitions,
  RequireRule,
  SkillAssignment,
  SkillConfig,
  SkillId,
  SkillSlug,
  Category,
} from "../types";

export const modelNameSchema = z.enum(MODEL_NAMES) as z.ZodType<ModelName>;

const codexModelNameSchema = z.enum(CODEX_MODEL_NAMES) as z.ZodType<CodexModelName>;

export const effortLevelSchema = z.enum(EFFORT_NAMES) as z.ZodType<EffortLevel>;

export const permissionModeSchema = z.enum(PERMISSION_MODES) as z.ZodType<PermissionMode>;

export const skillSlugSchema = z.enum(SKILL_SLUGS) as z.ZodType<SkillSlug>;

export const categoryPathSchema = z.string().refine(
  (val): val is CategoryPath => {
    if (val === LOCAL_PSEUDO_CATEGORY) return true;
    if ((CATEGORIES as readonly string[]).includes(val)) return true;
    return KEBAB_CASE_PATTERN.test(val);
  },
  {
    message: "Must be a valid category path (e.g., 'web-framework', 'shared-testing', or 'local')",
  },
) as z.ZodType<CategoryPath>;

export const agentHookActionSchema: z.ZodType<AgentHookAction> = z.object({
  type: z.enum(["command", "script", "prompt"]),
  command: z.string().exactOptional(),
  script: z.string().exactOptional(),
  prompt: z.string().exactOptional(),
});

/** `Partial`: nothing reads a manifest's hooks, and refusing one would drop the whole plugin. */
export const agentHookDefinitionSchema: z.ZodType<Partial<AgentHookDefinition>> = z.object({
  matcher: z.string().exactOptional(),
  hooks: z.array(agentHookActionSchema).exactOptional(),
});

export const hooksRecordSchema = z.record(z.string(), z.array(agentHookDefinitionSchema));

/**
 * `z.enum` rather than a cast literal, so it moves with the vocabulary: a narrower schema still
 * satisfies `z.ZodType<AgentIsolation>`, so `tsc` would not catch a missing mode.
 */
export const agentIsolationSchema = z.enum(AGENT_ISOLATIONS) as z.ZodType<AgentIsolation>;

/** `.strict()`: a plain object empties an unknown key to `{}`, leaving nothing to refuse. */
export const agentExperimentalSchema = z
  .object({
    cacheTtl: z.enum(CACHE_TTLS).exactOptional(),
  })
  .strict();

const strictAgentHookDefinitionSchema = z.object({
  matcher: z.string().exactOptional(),
  hooks: z.array(agentHookActionSchema).min(1),
});

export const strictHooksRecordSchema = z.record(
  z.string(),
  z.array(strictAgentHookDefinitionSchema),
);

export const skillAssignmentSchema: z.ZodType<SkillAssignment> = z.object({
  id: z.string() as z.ZodType<SkillId>,
  preloaded: z.boolean().exactOptional(),
  local: z.boolean().exactOptional(),
  path: z.string().exactOptional(),
});

export const skillFrontmatterLoaderSchema = z.object({
  /** Lenient: local/custom skills have non-builtin IDs. */
  name: z.string() as z.ZodType<SkillId>,
  description: z.string(),
  model: modelNameSchema.exactOptional(),
});

/** Whether the category is declared is asked by `mergeLocalSkillsIntoMatrix`, not here. */
export const skillMetadataLoaderSchema = z
  .object({
    category: categoryPathSchema.exactOptional(),
    author: z.string().exactOptional(),
    domain: z.string() as z.ZodType<Domain>,
    custom: z.boolean().exactOptional(),
  })
  .passthrough();

export const matrixRawMetadataSchema = z.object({
  category: categoryPathSchema,
  author: z.string(),
  displayName: z.string().exactOptional(),
  slug: z.string() as z.ZodType<SkillSlug>,
  cliDescription: z.string().exactOptional(),
  usageGuidance: z.string().exactOptional(),
  // Boundary cast: domain is a string at the YAML parse boundary; narrowed to Domain type
  domain: z.string() as z.ZodType<Domain>,
  custom: z.boolean().exactOptional(),
});

export const pluginAuthorSchema: z.ZodType<PluginAuthor> = z.object({
  name: z.string().min(1),
  email: z.string().exactOptional(),
});

// The lenient and strict variants below differ only in unknown-key policy.
const pluginManifestObjectSchema = z.object({
  name: z.string(),
  version: z.string().exactOptional(),
  description: z.string().exactOptional(),
  author: pluginAuthorSchema.exactOptional(),
  /** A plugin authored elsewhere may carry any category, or none. */
  category: z.string().exactOptional(),
  keywords: z.array(z.string()).exactOptional(),
  commands: z.union([z.string(), z.array(z.string())]).exactOptional(),
  agents: z.union([z.string(), z.array(z.string())]).exactOptional(),
  skills: z.union([z.string(), z.array(z.string())]).exactOptional(),
  hooks: z.union([z.string(), hooksRecordSchema]).exactOptional(),
});

export const pluginManifestSchema: z.ZodType<PluginManifest> = pluginManifestObjectSchema;

export const pluginManifestValidationSchema = pluginManifestObjectSchema.strict();

export const agentYamlConfigSchema: z.ZodType<AgentYamlConfig> = z.object({
  id: z.string() as z.ZodType<AgentName>,
  title: z.string(),
  description: z.string(),
  model: modelNameSchema.exactOptional(),
  effort: effortLevelSchema.exactOptional(),
  tools: z.array(z.string()),
  disallowedTools: z.array(z.string()).exactOptional(),
  permissionMode: permissionModeSchema.exactOptional(),
  isolation: agentIsolationSchema.exactOptional(),
  /** Strict, like the frontmatter reader: a lenient read silently emptied malformed hooks. */
  hooks: strictHooksRecordSchema.exactOptional(),
  experimental: agentExperimentalSchema.exactOptional(),
  outputFormat: z.string().exactOptional(),
  domain: (z.string() as z.ZodType<Domain>).exactOptional(),
  custom: z.boolean().exactOptional(),
});

const skillAssignmentElementSchema = z.union([
  z.string() as z.ZodType<SkillId>,
  skillAssignmentSchema,
]);

/** Lenient: a bare string, object or array from YAML; consumers normalize to SkillAssignment[]. */
export const stackAgentConfigSchema = z.record(
  z.string(),
  z.union([skillAssignmentElementSchema, z.array(skillAssignmentElementSchema)]),
);

/** Pre-rename top-level keys, mapped to their new field; both loader schemas refuse them. */
const RENAMED_CONFIG_FIELDS = { source: "marketplace" } as const satisfies Record<
  string,
  keyof ProjectConfig
>;

/** The same, for skill entries. */
const RENAMED_SKILL_ENTRY_FIELDS = { source: "origin" } as const satisfies Record<
  string,
  keyof SkillConfig
>;

function renamedFieldMessage(oldKey: string, newKey: string): string {
  return `"${oldKey}" was renamed to "${newKey}". Rename the key in this config — the CLI does not read "${oldKey}" any more and will not fall back to it.`;
}

function reportRenamedKeys(
  record: Record<string, unknown>,
  renames: Record<string, string>,
  path: PropertyKey[],
  ctx: z.RefinementCtx,
): void {
  for (const [oldKey, newKey] of Object.entries(renames)) {
    if (!(oldKey in record)) continue;
    ctx.addIssue({
      code: "custom",
      path: [...path, oldKey],
      message: renamedFieldMessage(oldKey, newKey),
    });
  }
}

/**
 * Reads the raw document: `.passthrough()` keeps a stale top-level key as unknown data and the
 * declared skills array strips one, so the run would silently use the default marketplace.
 */
function refuseRenamedFields(config: unknown, ctx: z.RefinementCtx): void {
  if (!isRecord(config)) return;

  reportRenamedKeys(config, RENAMED_CONFIG_FIELDS, [], ctx);

  const { skills } = config;
  if (!Array.isArray(skills)) return;
  for (const [index, entry] of skills.entries()) {
    if (!isRecord(entry)) continue;
    reportRenamedKeys(entry, RENAMED_SKILL_ENTRY_FIELDS, ["skills", index], ctx);
  }
}

/** Piped so a stale key is answered with its rename rather than missing-field noise. */
const renamedFieldGuard = z.unknown().superRefine(refuseRenamedFields);

const projectConfigFields = z
  .object({
    name: z.string().exactOptional(),
    description: z.string().exactOptional(),
    agents: z
      .array(
        z.object({
          name: z.string(),
          scope: z.enum(["project", "global"]),
          model: modelNameSchema.exactOptional(),
          codexModel: codexModelNameSchema.exactOptional(),
          effort: effortLevelSchema.exactOptional(),
          excluded: z.boolean().exactOptional(),
        }),
      )
      .exactOptional(),
    skills: z
      .array(
        z.object({
          id: z.string() as z.ZodType<SkillId>,
          scope: z.enum(["project", "global"]),
          origin: z.string(),
          excluded: z.boolean().exactOptional(),
        }),
      )
      .exactOptional(),

    author: z.string().exactOptional(),
    selectedDomains: z.array(z.string() as z.ZodType<Domain>).exactOptional(),
    stack: z.record(z.string(), stackAgentConfigSchema).exactOptional(),
    /** A path or URL (e.g., "github:my-org/skills") */
    marketplace: z.string().exactOptional(),
    /** The name the marketplace's manifest gives it, which plugins are registered under */
    marketplaceName: z.string().exactOptional(),
    agentsSource: z.string().exactOptional(),
    /** Global config only */
    projects: z.array(z.string()).exactOptional(),
  })
  .passthrough();

/** Lenient: partial configs are valid at load time; validateProjectConfig() validates fully. */
export const projectConfigLoaderSchema = renamedFieldGuard.pipe(projectConfigFields);

const categoryDefinitionSchema: z.ZodType<CategoryDefinition> = z.object({
  id: z.string() as z.ZodType<Category>,
  displayName: z.string(),
  description: z.string(),
  domain: (z.string() as z.ZodType<Domain>).exactOptional(),
  exclusive: z.boolean(),
  order: z.number(),
  icon: z.string().exactOptional(),
});

/** Names the slug the author wrote: Zod's enum message lists ~250 options and never the input. */
function unknownSkillSlugRefusal(input: unknown): string {
  const named = typeof input === "string" ? `'${input}'` : "That value";
  return (
    `${named} is not a slug the public catalogue carries, and a relationship rule may only ` +
    `name skills the public catalogue carries — this marketplace's own skills cannot be named ` +
    `in one yet. Name a catalogue slug, or leave 'relationships' out: it is optional, and a ` +
    `marketplace shipping no relationship rules loads and installs like any other.`
  );
}

// Slugs, resolved to canonical IDs by matrix-loader
const skillRefInRules = z.enum(SKILL_SLUGS, {
  error: (issue) => unknownSkillSlugRefusal(issue.input),
}) as z.ZodType<SkillSlug>;

const skillGroupRuleSchema = z.object({
  skills: z.array(skillRefInRules).min(2),
  reason: z.string(),
});

const conflictRuleSchema: z.ZodType<ConflictRule> = skillGroupRuleSchema;

const discourageRuleSchema: z.ZodType<DiscourageRule> = skillGroupRuleSchema;

const requireRuleSchema: z.ZodType<RequireRule> = z.object({
  skill: skillRefInRules,
  needs: z.array(skillRefInRules).min(1),
  needsAny: z.boolean().exactOptional(),
  reason: z.string(),
});

const alternativeGroupSchema: z.ZodType<AlternativeGroup> = z.object({
  purpose: z.string(),
  skills: z.array(skillRefInRules).min(1),
});

const relationshipDefinitionsSchema: z.ZodType<RelationshipDefinitions> = z.object({
  conflicts: z.array(conflictRuleSchema),
  discourages: z.array(discourageRuleSchema),
  requires: z.array(requireRuleSchema),
  alternatives: z.array(alternativeGroupSchema),
});

export const skillCategoriesFileSchema = z.object({
  version: z.string(),
  categories: z.record(z.string(), categoryDefinitionSchema),
});

export const skillRulesFileSchema = z.object({
  version: z.string(),
  relationships: relationshipDefinitionsSchema.exactOptional(),
});

export const localRawMetadataSchema = z
  .object({
    displayName: z.string(),
    slug: z.string() as z.ZodType<SkillSlug>,
    cliDescription: z.string().exactOptional(),
    category: categoryPathSchema,
    usageGuidance: z.string().exactOptional(),
    domain: z.string() as z.ZodType<Domain>,
    /** True if this skill was created outside the CLI's built-in vocabulary */
    custom: z.boolean().exactOptional(),
  })
  // Passthrough adds an index signature; LocalRawMetadata is the declared shape consumers read.
  .passthrough() as z.ZodType<LocalRawMetadata>;

/** Metadata for local skills that were forked/copied from a marketplace skill */
export const localSkillMetadataSchema = z
  .object({
    forkedFrom: z
      .object({
        /** Lenient: custom and extra-source skills have non-builtin IDs */
        skillId: z.string() as z.ZodType<SkillId>,
        /** SHA hash of the original content at fork time (for diff detection) */
        contentHash: z.string(),
        date: z.string(),
        source: z.string().exactOptional(),
        /** Directory inside that repository, for a skill only its own bytes can install again */
        path: z.string().exactOptional(),
      })
      .exactOptional(),
  })
  // Passthrough adds an index signature, which LocalSkillMetadata declares too.
  .passthrough() as z.ZodType<LocalSkillMetadata>;

const stackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  agents: z.record(z.string(), stackAgentConfigSchema),
  philosophy: z.string().exactOptional(),
});

// Values may be string or string[]; loadStacks() normalizes them to SkillId[].
export const stacksConfigSchema = z.object({
  stacks: z.array(stackSchema).min(1),
});

const marketplaceRemoteSourceSchema: z.ZodType<MarketplaceRemoteSource> = z.object({
  source: z.enum(["github", "url"]),
  repo: z.string().exactOptional(),
  url: z.string().exactOptional(),
  ref: z.string().exactOptional(),
});

const marketplacePluginSchema: z.ZodType<MarketplacePlugin> = z.object({
  name: z.string().min(1),
  /** Local directory path (relative to pluginRoot) or remote source config */
  source: z.union([z.string(), marketplaceRemoteSourceSchema]),
  description: z.string().exactOptional(),
  version: z.string().exactOptional(),
  author: pluginAuthorSchema.exactOptional(),
  /** Lenient: external data may have any category string or none at all */
  category: z.string().exactOptional(),
  keywords: z.array(z.string()).exactOptional(),
});

// MarketplaceOwner aliases PluginAuthor (identical shape, both require name.min(1))
const marketplaceOwnerSchema: z.ZodType<MarketplaceOwner> = pluginAuthorSchema;

const marketplaceMetadataSchema: z.ZodType<MarketplaceMetadata> = z.object({
  /** Base directory for resolving plugin source paths (e.g., "plugins/") */
  pluginRoot: z.string().exactOptional(),
});

/** A `regex` message rather than a `refine`, so the generated JSON Schema keeps its `pattern`. */
const MARKETPLACE_NAME_REFUSAL =
  "A marketplace name is kebab-case: lowercase letters, numbers and hyphens, starting with a letter (e.g. 'acme-skills'). Rename it in this manifest — Claude Code registers every plugin under it and accepts no other shape.";

export const marketplaceSchema: z.ZodType<Marketplace> = z.object({
  $schema: z.string().exactOptional(),
  /** Kebab-case: the namespace Claude Code registers plugins under. */
  name: z.string().min(1).regex(KEBAB_CASE_PATTERN, { message: MARKETPLACE_NAME_REFUSAL }),
  version: z.string().min(1),
  description: z.string().exactOptional(),
  owner: marketplaceOwnerSchema,
  metadata: marketplaceMetadataSchema.exactOptional(),
  plugins: z.array(marketplacePluginSchema).min(1),
});

/**
 * Written beside a cached remote source so the next load can revalidate it in one request. No
 * `etag` means the host returned none, so the copy cannot be revalidated.
 */
export const sourceRevalidationSchema = z.object({
  /** The tarball URL giget resolved for this source. */
  tar: z.string().min(1),
  etag: z.string().min(1).exactOptional(),
});

const permissionConfigSchema = z.object({
  allow: z.array(z.string()).exactOptional(),
  deny: z.array(z.string()).exactOptional(),
});

/** Settings file schema (.claude/settings.yaml) for project-level configuration */
export const settingsFileSchema = z
  .object({
    permissions: permissionConfigSchema.exactOptional(),
  })
  .passthrough();

const brandingConfigSchema = z.object({
  name: z.string().exactOptional(),
});

const projectSourceConfigFields = z
  .object({
    /** A path or URL */
    marketplace: z.string().exactOptional(),
    author: z.string().exactOptional(),
    /** The name the marketplace's manifest gives it, which plugins are registered under */
    marketplaceName: z.string().exactOptional(),
    agentsSource: z.string().exactOptional(),
    branding: brandingConfigSchema.exactOptional(),
    /** Custom skills directory override (default: "src/skills") */
    skillsDir: z.string().exactOptional(),
    /** Custom agents directory override (default: "src/agents") */
    agentsDir: z.string().exactOptional(),
    /** Custom stacks file path override (default: "config/stacks.ts") */
    stacksFile: z.string().exactOptional(),
    /** Custom categories file path override (default: "config/skill-categories.ts") */
    categoriesFile: z.string().exactOptional(),
    /** Custom rules file path override (default: "config/skill-rules.ts") */
    rulesFile: z.string().exactOptional(),
  })
  .passthrough();

export const projectSourceConfigSchema = renamedFieldGuard.pipe(projectSourceConfigFields);

// The strict schemas below reject unknown fields; the loaders above pass them through.

/** A source agent's `metadata.yaml`; generates `agent.schema.json`. Custom ids allowed. */
export const agentYamlGenerationSchema = z
  .object({
    $schema: z.string().exactOptional(),
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    model: modelNameSchema.exactOptional(),
    effort: effortLevelSchema.exactOptional(),
    tools: z.array(z.string()).min(1),
    disallowedTools: z.array(z.string()).exactOptional(),
    permissionMode: permissionModeSchema.exactOptional(),
    isolation: agentIsolationSchema.exactOptional(),
    hooks: strictHooksRecordSchema.exactOptional(),
    experimental: agentExperimentalSchema.exactOptional(),
    outputFormat: z.string().exactOptional(),
    domain: (z.string() as z.ZodType<Domain>).exactOptional(),
    custom: z.boolean().exactOptional(),
  })
  .strict();

/** A compiled agent's frontmatter, sharing the loader's sub-schemas so whatever compiles reads. */
export const agentFrontmatterValidationSchema = z
  .object({
    /** Agent name in kebab-case (becomes the Task tool identifier) */
    name: z.string().regex(KEBAB_CASE_PATTERN).min(1),
    description: z.string().min(1),
    /** Comma-separated list of allowed tools */
    tools: z.string().exactOptional(),
    /** Comma-separated list of denied tools */
    disallowedTools: z.string().exactOptional(),
    model: modelNameSchema.exactOptional(),
    effort: effortLevelSchema.exactOptional(),
    permissionMode: permissionModeSchema.exactOptional(),
    isolation: agentIsolationSchema.exactOptional(),
    experimental: agentExperimentalSchema.exactOptional(),
    /** Skill names to preload (embed in agent prompt) */
    skills: z.array(z.string().min(1)).exactOptional(),
    hooks: strictHooksRecordSchema.exactOptional(),
  })
  .strict();

/** Strict validation for SKILL.md frontmatter (matches Claude Code plugin spec) */
export const skillFrontmatterValidationSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    /** If true, Claude cannot invoke this skill on its own */
    "disable-model-invocation": z.boolean().exactOptional(),
    /** If true, user can invoke this skill directly */
    "user-invocable": z.boolean().exactOptional(),
    /** Comma-separated list of tools this skill can use */
    "allowed-tools": z.string().exactOptional(),
    model: modelNameSchema.exactOptional(),
    /** "fork" means skill runs in a forked context (separate conversation) */
    context: z.enum(["fork"]).exactOptional(),
    /** Agent name this skill is scoped to */
    agent: z.string().exactOptional(),
    /** Hint text shown when user invokes the skill */
    "argument-hint": z.string().exactOptional(),
  })
  .strict();

/** Not unified with localSkillMetadataSchema's forkedFrom, whose shape differs. */
const forkedFromSchema = z.object({
  skillId: z.string(),
  version: z.number().int().min(1).exactOptional(),
  contentHash: z.string(),
  source: z.string().exactOptional(),
  /** Directory inside that source, for a skill only its own bytes can install again */
  path: z.string().exactOptional(),
  date: z.string(),
});

/** Advisory: over-length is a warning; empty stays an error. */
const CLI_DESCRIPTION_MAX_LENGTH = 60;

/** Shared by the strict and custom metadata schemas, which differ only in `category`/`slug`. */
const skillMetadataBaseSchema = z.object({
  author: z.string().regex(AUTHOR_HANDLE_PATTERN),
  displayName: z.string().min(1).max(30),
  cliDescription: z.string().min(1).max(CLI_DESCRIPTION_MAX_LENGTH),
  usageGuidance: z.string().min(10),
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{7}$/)
    .exactOptional(),
  updated: z.string().exactOptional(),
  forkedFrom: forkedFromSchema.exactOptional(),
  domain: (z.string() as z.ZodType<Domain>).exactOptional(),
  /** True if this skill was created outside the CLI's built-in vocabulary */
  custom: z.boolean().exactOptional(),
});

/** As `unknownSkillSlugRefusal`, and points at `custom: true`. */
function unknownMetadataSlugRefusal(input: unknown): string {
  const named = typeof input === "string" ? `'${input}'` : "That value";
  return (
    `${named} is not a slug the public catalogue carries. A published skill's slug is held to ` +
    `that catalogue unless the skill declares it is not from it — add '${METADATA_KEYS.CUSTOM}: true' ` +
    `beside it in this ${STANDARD_FILES.METADATA_YAML} and the slug is read as your marketplace's ` +
    `own, any kebab-case name. That declaration is how a skill outside the catalogue's vocabulary ` +
    `is carried; a skill the catalogue does carry names its catalogue slug and leaves it off.`
  );
}

export const metadataValidationSchema = skillMetadataBaseSchema
  .extend({
    category: z.enum(CATEGORIES),
    /** A known built-in slug, unless `custom: true` routes the file to the custom schema. */
    slug: z.enum(SKILL_SLUGS, {
      error: (issue) => unknownMetadataSlugRefusal(issue.input),
    }),
  })
  .strict();

export const customMetadataValidationSchema = skillMetadataBaseSchema.extend({
  category: z.string(),
  slug: z.string().regex(KEBAB_CASE_PATTERN).min(1).max(50),
});

const stackSkillAssignmentSchema = z
  .object({
    id: z.string().min(1),
    /** If true, skill content is embedded in the compiled agent prompt */
    preloaded: z.boolean().exactOptional(),
  })
  .strict();

export const stackConfigValidationSchema = z
  .object({
    id: z.string().regex(KEBAB_CASE_PATTERN).exactOptional(),
    name: z.string().min(1),
    version: z.string(),
    author: z.string().min(1),
    description: z.string().exactOptional(),
    created: z.string().exactOptional(),
    updated: z.string().exactOptional(),
    framework: z.string().exactOptional(),
    skills: z.array(stackSkillAssignmentSchema).min(1),
    agents: z.array(z.string().regex(KEBAB_CASE_PATTERN)).min(1),
    agentSkills: z
      .record(z.string(), z.record(z.string(), z.array(stackSkillAssignmentSchema)))
      .exactOptional(),
    philosophy: z.string().exactOptional(),
    principles: z.array(z.string().min(1)).exactOptional(),
    tags: z.array(z.string().regex(KEBAB_CASE_PATTERN)).exactOptional(),
    overrides: z
      .record(
        z.string(),
        z
          .object({
            alternatives: z.array(z.string().min(1)).exactOptional(),
            locked: z.boolean().exactOptional(),
          })
          .strict(),
      )
      .exactOptional(),
    metrics: z
      .object({
        upvotes: z.number().int().min(0).exactOptional(),
        downloads: z.number().int().min(0).exactOptional(),
      })
      .strict()
      .exactOptional(),
    hooks: strictHooksRecordSchema.exactOptional(),
  })
  .strict();

export function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues.map(formatZodIssue).join("; ");
}

/** The one place the custom-vs-strict schema choice lives. */
export function validateSkillMetadata(rawMetadata: unknown) {
  const schema = isCustomMetadata(rawMetadata)
    ? customMetadataValidationSchema
    : metadataValidationSchema;
  return schema.safeParse(rawMetadata);
}

/**
 * Lists absent required fields as missing, where Zod says "expected string, received undefined".
 */
export function describeMetadataSchemaFailure(
  issues: z.ZodIssue[],
  rawMetadata: Record<string, unknown>,
): string {
  const [absent, malformed] = partition(issues, (issue) => isAbsentField(issue, rawMetadata));
  return [
    ...(absent.length > 0 ? [nameMissingFields(absent)] : []),
    ...malformed.map(formatZodIssue),
  ].join("; ");
}

function isAbsentField(issue: z.ZodIssue, rawMetadata: Record<string, unknown>): boolean {
  const [field, ...nested] = issue.path;
  return nested.length === 0 && typeof field === "string" && rawMetadata[field] === undefined;
}

function nameMissingFields(absent: z.ZodIssue[]): string {
  const fields = absent.map((issue) => issue.path.join("."));
  return `missing required ${fields.length === 1 ? "field" : "fields"}: ${fields.join(", ")}`;
}

export type MetadataIssueSplit = {
  errors: string[];
  warnings: string[];
};

function isOverLengthCliDescription(issue: z.ZodIssue): boolean {
  return issue.code === "too_big" && issue.path.length === 1 && issue.path[0] === "cliDescription";
}

function readCliDescription(raw: unknown): string | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  // Boundary cast: raw comes straight from YAML parsing; the typeof check above narrows to object
  const value = (raw as { cliDescription?: unknown }).cliDescription;
  return typeof value === "string" ? value : undefined;
}

/** The undefined branch is defensive: too_big only fires on a string. */
function formatOverLengthWarning(issue: z.ZodIssue, cliDescription: string | undefined): string {
  if (cliDescription === undefined) return formatZodIssue(issue);
  return `cliDescription is ${cliDescription.length} characters — exceeds the recommended maximum of ${CLI_DESCRIPTION_MAX_LENGTH}`;
}

export function splitMetadataValidationIssues(
  error: z.ZodError,
  rawMetadata: unknown,
): MetadataIssueSplit {
  const [overLength, hardFailures] = partition(error.issues, isOverLengthCliDescription);

  const cliDescription = readCliDescription(rawMetadata);
  const warnings = overLength.map((issue) => formatOverLengthWarning(issue, cliDescription));

  return { errors: hardFailures.map(formatZodIssue), warnings };
}

export function validateNestingDepth(value: unknown, maxDepth: number): boolean {
  function check(val: unknown, depth: number): boolean {
    if (depth > maxDepth) return false;
    if (Array.isArray(val)) {
      return val.every((item) => check(item, depth + 1));
    }
    if (val !== null && typeof val === "object") {
      return Object.values(val).every((v) => check(v, depth + 1));
    }
    return true;
  }
  return check(value, 0);
}

export function isCustomMetadata(raw: unknown): boolean {
  if (raw == null || typeof raw !== "object") return false;
  if (!("custom" in raw)) return false;
  return raw.custom === true;
}

/**
 * For files this CLI owns (marketplace.json), whose `.passthrough()` keeps forward compatibility.
 * Not for another tool's files: their unknown keys are that tool's business.
 */
export function warnUnknownFields(
  parsed: Record<string, unknown>,
  expectedKeys: readonly string[],
  context: string,
): void {
  const expectedSet = new Set(expectedKeys);
  const unknownKeys = Object.keys(parsed).filter((k) => !expectedSet.has(k));
  if (unknownKeys.length > 0) {
    warn(`Unknown fields in ${context}: ${unknownKeys.join(", ")}`);
  }
}
