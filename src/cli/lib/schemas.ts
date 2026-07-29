import { z } from "zod";
import { partition } from "remeda";
import type { LocalSkillMetadata } from "./skills/skill-metadata";
import type { LocalRawMetadata } from "./skills/local-skill-loader";
import { AUTHOR_HANDLE_PATTERN, KEBAB_CASE_PATTERN, LOCAL_PSEUDO_CATEGORY } from "../consts";
import { formatZodIssue } from "./schema-validator";
import { warn } from "../utils/logger";
import { SKILL_IDS, SKILL_SLUGS, CATEGORIES } from "../types/generated/source-types";
import { MODEL_NAMES, PERMISSION_MODES } from "../types/matrix";
import type {
  AgentHookAction,
  AgentHookDefinition,
  AgentName,
  AgentYamlConfig,
  AlternativeGroup,
  BoundSkill,
  CategoryDefinition,
  CategoryMap,
  CategoryPath,
  CompatibilityGroup,
  ConflictRule,
  DiscourageRule,
  Domain,
  Marketplace,
  MarketplaceMetadata,
  MarketplaceOwner,
  MarketplacePlugin,
  MarketplaceRemoteSource,
  ModelName,
  PermissionMode,
  PluginAuthor,
  PluginManifest,
  Recommendation,
  RelationshipDefinitions,
  RequireRule,
  SkillAssignment,
  SkillId,
  SkillSlug,
  Category,
} from "../types";

export const boundSkillSchema: z.ZodType<BoundSkill> = z.object({
  id: z.string() as z.ZodType<SkillId>,
  sourceUrl: z.string(),
  sourceName: z.string(),
  boundTo: z.string(),
  description: z.string().optional(),
});

export const modelNameSchema = z.enum(MODEL_NAMES) as z.ZodType<ModelName>;

export const permissionModeSchema = z.enum(PERMISSION_MODES) as z.ZodType<PermissionMode>;

export const skillSlugSchema = z.enum(SKILL_SLUGS) as z.ZodType<SkillSlug>;

/** Validates category: strict categoryPathSchema by default, any kebab-case string when custom: true */
function validateCategoryField(
  val: { category?: string; custom?: boolean },
  ctx: z.RefinementCtx,
): void {
  if (!val.category) return;

  if (val.custom) {
    if (!KEBAB_CASE_PATTERN.test(val.category)) {
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "Custom category must be kebab-case",
      });
    }
    return;
  }

  const result = categoryPathSchema.safeParse(val.category);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ["category"] });
    }
  }
}

// Accepts: known category, "local", or any kebab-case string (custom categories)
export const categoryPathSchema = z.string().refine(
  (val): val is CategoryPath => {
    if (val === LOCAL_PSEUDO_CATEGORY) return true;
    if ((CATEGORIES as readonly string[]).includes(val)) return true;
    // Accept any kebab-case string for custom categories
    return KEBAB_CASE_PATTERN.test(val);
  },
  {
    message: "Must be a valid category path (e.g., 'web-framework', 'shared-testing', or 'local')",
  },
) as z.ZodType<CategoryPath>;

export const agentHookActionSchema: z.ZodType<AgentHookAction> = z.object({
  type: z.enum(["command", "script", "prompt"]),
  command: z.string().optional(),
  script: z.string().optional(),
  prompt: z.string().optional(),
});

export const agentHookDefinitionSchema: z.ZodType<AgentHookDefinition> = z.object({
  matcher: z.string().optional(),
  hooks: z.array(agentHookActionSchema).optional(),
});

export const hooksRecordSchema = z.record(z.string(), z.array(agentHookDefinitionSchema));

/** Strict hook definition — hooks array is required and must have at least one action */
const strictAgentHookDefinitionSchema = z.object({
  matcher: z.string().optional(),
  hooks: z.array(agentHookActionSchema).min(1),
});

/** Strict hooks record for validation schemas (requires at least one hook action per definition) */
export const strictHooksRecordSchema = z.record(
  z.string(),
  z.array(strictAgentHookDefinitionSchema),
);

export const skillAssignmentSchema: z.ZodType<SkillAssignment> = z.object({
  id: z.string() as z.ZodType<SkillId>,
  preloaded: z.boolean().optional(),
  local: z.boolean().optional(),
  path: z.string().optional(),
});

// Lenient: accepts any string for `name` since local/custom skills may not follow strict SkillId pattern
export const skillFrontmatterLoaderSchema = z.object({
  /** Lenient (any string): local/custom skills have non-builtin IDs */
  name: z.string() as z.ZodType<SkillId>,
  description: z.string(),
  model: modelNameSchema.optional(),
});

// Loader schema: category strictness depends on custom field (see validateCategoryField)
export const skillMetadataLoaderSchema = z
  .object({
    // Field accepts any string; cross-field validation in superRefine enforces strict/custom rules
    category: (z.string() as z.ZodType<CategoryPath>).optional(),
    author: z.string().optional(),
    domain: z.string() as z.ZodType<Domain>,
    custom: z.boolean().optional(),
  })
  .passthrough()
  .superRefine(validateCategoryField);

/**
 * Raw metadata.yaml shape read by the matrix loader during skill extraction.
 * DELIBERATE DIFFERENCE from skillMetadataLoaderSchema / localRawMetadataSchema:
 * this schema validates `category` with categoryPathSchema directly and does NOT
 * run the validateCategoryField superRefine, so a `custom: true` category is not
 * cross-checked against the kebab-case rule. Preserved verbatim on the move from
 * matrix-loader.ts — do not add the superRefine without an explicit decision.
 */
export const matrixRawMetadataSchema = z.object({
  category: categoryPathSchema,
  author: z.string(),
  displayName: z.string().optional(),
  slug: z.string() as z.ZodType<SkillSlug>,
  cliDescription: z.string().optional(),
  usageGuidance: z.string().optional(),
  // Boundary cast: domain is a string at the YAML parse boundary; narrowed to Domain type
  domain: z.string() as z.ZodType<Domain>,
  custom: z.boolean().optional(),
});

export const pluginAuthorSchema: z.ZodType<PluginAuthor> = z.object({
  name: z.string().min(1),
  email: z.string().optional(),
});

// Shared plugin.json shape — the lenient (strip) and strict variants below differ only in unknown-key policy
const pluginManifestObjectSchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  description: z.string().optional(),
  author: pluginAuthorSchema.optional(),
  keywords: z.array(z.string()).optional(),
  commands: z.union([z.string(), z.array(z.string())]).optional(),
  agents: z.union([z.string(), z.array(z.string())]).optional(),
  skills: z.union([z.string(), z.array(z.string())]).optional(),
  hooks: z.union([z.string(), hooksRecordSchema]).optional(),
});

/** Lenient plugin.json schema (strips unknown keys; used at load boundaries) */
export const pluginManifestSchema: z.ZodType<PluginManifest> = pluginManifestObjectSchema;

/** Strict plugin.json schema — rejects unrecognized keys (used by plugin-validator) */
export const pluginManifestValidationSchema = pluginManifestObjectSchema.strict();

export const agentYamlConfigSchema: z.ZodType<AgentYamlConfig> = z.object({
  id: z.string() as z.ZodType<AgentName>,
  title: z.string(),
  description: z.string(),
  model: modelNameSchema.optional(),
  tools: z.array(z.string()),
  disallowedTools: z.array(z.string()).optional(),
  permissionMode: permissionModeSchema.optional(),
  hooks: hooksRecordSchema.optional(),
  outputFormat: z.string().optional(),
  domain: (z.string() as z.ZodType<Domain>).optional(),
  custom: z.boolean().optional(),
});

// Defined before projectConfigLoaderSchema so it can reference stackAgentConfigSchema
// Single skill assignment element: either a bare SkillId string or an object { id, preloaded? }
const skillAssignmentElementSchema = z.union([
  z.string() as z.ZodType<SkillId>,
  skillAssignmentSchema,
]);

/**
 * Agent config within a stack: maps category to skill assignment(s).
 * Lenient: accepts bare string, object, or array from YAML.
 * Consumers normalize all values to SkillAssignment[] after parsing.
 */
export const stackAgentConfigSchema = z.record(
  z.string(),
  z.union([skillAssignmentElementSchema, z.array(skillAssignmentElementSchema)]),
);

/**
 * Lenient loader for .claude-src/config.ts (ProjectConfig).
 * name/agents optional since partial configs are valid at load time.
 * Full validation happens in validateProjectConfig().
 */
export const projectConfigLoaderSchema = z
  .object({
    /** Project/plugin name in kebab-case */
    name: z.string().optional(),
    description: z.string().optional(),
    /** Per-agent configuration with scope (e.g., [{ name: "web-developer", scope: "project" }]) */
    agents: z
      .array(
        z.object({
          name: z.string(),
          scope: z.enum(["project", "global"]),
          excluded: z.boolean().optional(),
        }),
      )
      .optional(),
    /** Per-skill configuration with scope and source */
    skills: z
      .array(
        z.object({
          id: z.string() as z.ZodType<SkillId>,
          scope: z.enum(["project", "global"]),
          source: z.string(),
          excluded: z.boolean().optional(),
        }),
      )
      .optional(),

    /** Author handle (e.g., "@vince") */
    author: z.string().optional(),
    /** Selected domains from the wizard (persisted for edit mode restoration) */
    domains: z.array(z.string() as z.ZodType<Domain>).optional(),
    /** Selected agents from the wizard (persisted for edit mode restoration) */
    selectedAgents: z.array(z.string()).optional(),
    /** Agent-to-category-to-skill mappings from selected stack (accepts same formats as stacks.ts) */
    stack: z.record(z.string(), stackAgentConfigSchema).optional(),
    /** Skills source path or URL (e.g., "github:my-org/skills") */
    source: z.string().optional(),
    /** Marketplace identifier for plugin installation */
    marketplace: z.string().optional(),
    /** Separate source for agents when different from skills source */
    agentsSource: z.string().optional(),
    /** Tracked project installation paths (global config only) */
    projects: z.array(z.string()).optional(),
  })
  .passthrough();

const categoryDefinitionSchema: z.ZodType<CategoryDefinition> = z.object({
  id: z.string() as z.ZodType<Category>,
  displayName: z.string(),
  description: z.string(),
  domain: (z.string() as z.ZodType<Domain>).optional() as z.ZodType<Domain | undefined>,
  exclusive: z.boolean(),
  required: z.boolean(),
  order: z.number(),
  icon: z.string().optional(),
});

// Skill references in relationship rules: slugs resolved to canonical IDs by matrix-loader
const skillRefInRules = skillSlugSchema;

// Shared shape for conflict/discourage/compatibility rules: 2+ slugs plus a reason
const skillGroupRuleSchema = z.object({
  skills: z.array(skillRefInRules).min(2),
  reason: z.string(),
});

const conflictRuleSchema: z.ZodType<ConflictRule> = skillGroupRuleSchema;

const discourageRuleSchema: z.ZodType<DiscourageRule> = skillGroupRuleSchema;

const recommendationSchema: z.ZodType<Recommendation> = z.object({
  skill: skillRefInRules,
  reason: z.string(),
});

export const compatibilityGroupSchema: z.ZodType<CompatibilityGroup> = skillGroupRuleSchema;

const requireRuleSchema: z.ZodType<RequireRule> = z.object({
  skill: skillRefInRules,
  needs: z.array(skillRefInRules).min(1),
  needsAny: z.boolean().optional(),
  reason: z.string(),
});

const alternativeGroupSchema: z.ZodType<AlternativeGroup> = z.object({
  purpose: z.string(),
  skills: z.array(skillRefInRules).min(1),
});

const relationshipDefinitionsSchema: z.ZodType<RelationshipDefinitions> = z.object({
  conflicts: z.array(conflictRuleSchema),
  discourages: z.array(discourageRuleSchema),
  recommends: z.array(recommendationSchema),
  requires: z.array(requireRuleSchema),
  alternatives: z.array(alternativeGroupSchema),
  compatibleWith: z.array(compatibilityGroupSchema).optional().default([]),
});

/**
 * Standalone skill-categories.ts file schema.
 * Top-level object with version string and categories map using existing categoryDefinitionSchema.
 */
export const skillCategoriesFileSchema = z.object({
  version: z.string(),
  categories: z.record(z.string(), categoryDefinitionSchema) as z.ZodType<CategoryMap>,
});

/**
 * Standalone skill-rules.ts file schema.
 * Contains version and aggregate relationship rules between skills.
 */
export const skillRulesFileSchema = z.object({
  version: z.string(),
  relationships: relationshipDefinitionsSchema.optional(),
});

/**
 * Raw metadata from a local skill's metadata.yaml.
 * displayName and category are required — the skill must declare both.
 */
export const localRawMetadataSchema = z
  .object({
    /** Short name shown in the wizard grid (e.g., "my-custom-react") */
    displayName: z.string(),
    /** Kebab-case short key for alias resolution (e.g., "react") */
    slug: z.string() as z.ZodType<SkillSlug>,
    /** One-line description for the wizard */
    cliDescription: z.string().optional(),
    /** Category to place this skill in (e.g., "web-framework") */
    // Field accepts any string; cross-field validation in superRefine enforces strict/custom rules
    category: z.string() as z.ZodType<CategoryPath>,
    /** When an AI agent should invoke this skill */
    usageGuidance: z.string().optional(),
    /** Domain this skill belongs to (e.g., "web", "api", "cli") */
    domain: z.string() as z.ZodType<Domain>,
    /** True if this skill was created outside the CLI's built-in vocabulary */
    custom: z.boolean().optional(),
  })
  .passthrough()
  // Passthrough widens the output with an index signature; LocalRawMetadata is the
  // honest declared shape consumers read (same round-1 pattern as localSkillMetadataSchema).
  .superRefine(validateCategoryField) as z.ZodType<LocalRawMetadata>;

/** Metadata for local skills that were forked/copied from a marketplace skill */
export const localSkillMetadataSchema = z
  .object({
    forkedFrom: z
      .object({
        /** Original skill ID before forking — lenient (any string) since custom/extra-source skills have non-builtin IDs */
        skillId: z.string() as z.ZodType<SkillId>,
        /** SHA hash of the original content at fork time (for diff detection) */
        contentHash: z.string(),
        /** ISO date when the fork was created */
        date: z.string(),
        /** Source URL the skill was installed from (e.g., "github:agents-inc/skills") */
        source: z.string().optional(),
      })
      .optional(),
  })
  // Passthrough widens the output with an index signature; LocalSkillMetadata carries the
  // same index signature, so this is the honest declared shape for parse results.
  .passthrough() as z.ZodType<LocalSkillMetadata>;

const stackSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  /** Maps agent IDs to their category-to-skill assignments */
  agents: z.record(z.string(), stackAgentConfigSchema),
  /** High-level philosophy guiding this stack's technology choices */
  philosophy: z.string().optional(),
});

// Pre-normalization schema: values may be string or string[].
// loadStacks() normalizes to StacksConfig (all values SkillId[]) after parsing.
export const stacksConfigSchema = z.object({
  stacks: z.array(stackSchema).min(1),
});

const marketplaceRemoteSourceSchema: z.ZodType<MarketplaceRemoteSource> = z.object({
  source: z.enum(["github", "url"]),
  repo: z.string().optional(),
  url: z.string().optional(),
  ref: z.string().optional(),
});

const marketplacePluginSchema: z.ZodType<MarketplacePlugin> = z.object({
  name: z.string().min(1),
  /** Local directory path (relative to pluginRoot) or remote source config */
  source: z.union([z.string(), marketplaceRemoteSourceSchema]),
  description: z.string().optional(),
  version: z.string().optional(),
  author: pluginAuthorSchema.optional(),
  /** Lenient: external data may have any category string or none at all */
  category: z.string().optional(),
  keywords: z.array(z.string()).optional(),
});

// MarketplaceOwner aliases PluginAuthor (identical shape, both require name.min(1))
const marketplaceOwnerSchema: z.ZodType<MarketplaceOwner> = pluginAuthorSchema;

const marketplaceMetadataSchema: z.ZodType<MarketplaceMetadata> = z.object({
  /** Base directory for resolving plugin source paths (e.g., "plugins/") */
  pluginRoot: z.string().optional(),
});

export const marketplaceSchema: z.ZodType<Marketplace> = z.object({
  $schema: z.string().optional(),
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
  owner: marketplaceOwnerSchema,
  metadata: marketplaceMetadataSchema.optional(),
  plugins: z.array(marketplacePluginSchema).min(1),
});

/** Tool permission overrides (allow/deny lists for Claude Code tool access) */
const permissionConfigSchema = z.object({
  /** Tool names or patterns to explicitly allow */
  allow: z.array(z.string()).optional(),
  /** Tool names or patterns to explicitly deny */
  deny: z.array(z.string()).optional(),
});

/** Settings file schema (.claude/settings.yaml) for project-level configuration */
export const settingsFileSchema = z
  .object({
    permissions: permissionConfigSchema.optional(),
  })
  .passthrough();

/** Parse result of importedSkillMetadataSchema — forkedFrom plus arbitrary passthrough keys */
export type ImportedSkillMetadata = {
  forkedFrom?: {
    source: string;
    skillName: string;
    contentHash: string;
    date: string;
  };
  [key: string]: unknown;
};

/** Metadata for skills imported via `agentsinc import skill` (tracks original source for updates) */
export const importedSkillMetadataSchema = z
  .object({
    forkedFrom: z
      .object({
        /** Source URL or identifier where the skill was imported from */
        source: z.string(),
        /** Original skill name in the source */
        skillName: z.string(),
        /** SHA hash of the original content at import time */
        contentHash: z.string(),
        /** ISO date when the import was performed */
        date: z.string(),
      })
      .optional(),
  })
  // Passthrough widens the output with an index signature; ImportedSkillMetadata
  // carries the same index signature, so this is the honest declared parse shape.
  .passthrough() as z.ZodType<ImportedSkillMetadata>;

/** Branding overrides for white-labeling the CLI */
const brandingConfigSchema = z.object({
  /** Custom CLI name (e.g., "Acme Dev Tools") */
  name: z.string().optional(),
  /** Custom tagline shown in wizard header */
  tagline: z.string().optional(),
});

/**
 * Project source configuration from .claude-src/config.ts.
 * Stores multi-source settings, custom directory overrides, and bound skills.
 */
export const projectSourceConfigSchema = z
  .object({
    /** Primary skills source (path or URL) */
    source: z.string().optional(),
    /** Author handle for this project's config */
    author: z.string().optional(),
    /** Marketplace identifier for plugin installation */
    marketplace: z.string().optional(),
    /** Separate source for agent definitions (when different from skills) */
    agentsSource: z.string().optional(),
    /** Additional skill sources (private marketplaces, custom repos) */
    sources: z
      .array(
        z.object({
          /** Display name for the source (shown in wizard) */
          name: z.string(),
          /** Source URL (e.g., "github:acme-corp/claude-skills") */
          url: z.string(),
          description: z.string().optional(),
          /** Git ref (branch/tag/commit) for the source */
          ref: z.string().optional(),
        }),
      )
      .optional(),
    /** Skills explicitly bound to categories via search (from Step Sources) */
    boundSkills: z.array(boundSkillSchema).optional(),
    /** Branding overrides for white-labeling the CLI */
    branding: brandingConfigSchema.optional(),
    /** Custom skills directory override (default: "src/skills") */
    skillsDir: z.string().optional(),
    /** Custom agents directory override (default: "src/agents") */
    agentsDir: z.string().optional(),
    /** Custom stacks file path override (default: "config/stacks.ts") */
    stacksFile: z.string().optional(),
    /** Custom categories file path override (default: "config/skill-categories.ts") */
    categoriesFile: z.string().optional(),
    /** Custom rules file path override (default: "config/skill-rules.ts") */
    rulesFile: z.string().optional(),
  })
  .passthrough();

// Strict validation schemas enforce all constraints and use .strict() to reject unknown fields,
// unlike the lenient loader schemas above which use .passthrough() for forward compatibility at parse boundaries

/** Strict schema for compiled agent metadata.yaml output. Lenient id (any string) since marketplace agents may use custom identifiers. */
export const agentYamlGenerationSchema = z
  .object({
    $schema: z.string().optional(),
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string().min(1),
    model: modelNameSchema.optional(),
    tools: z.array(z.string()).min(1),
    disallowedTools: z.array(z.string()).optional(),
    permissionMode: permissionModeSchema.optional(),
    hooks: strictHooksRecordSchema.optional(),
    outputFormat: z.string().optional(),
    domain: (z.string() as z.ZodType<Domain>).optional(),
    custom: z.boolean().optional(),
  })
  .strict();

/** Strict validation for agent AGENT.md frontmatter (used by plugin-validator) */
export const agentFrontmatterValidationSchema = z
  .object({
    /** Agent name in kebab-case (becomes the Task tool identifier) */
    name: z.string().regex(KEBAB_CASE_PATTERN).min(1),
    description: z.string().min(1),
    /** Comma-separated list of allowed tools */
    tools: z.string().optional(),
    /** Comma-separated list of denied tools */
    disallowedTools: z.string().optional(),
    model: modelNameSchema.optional(),
    permissionMode: permissionModeSchema.optional(),
    /** Skill names to preload (embed in agent prompt) */
    skills: z.array(z.string().min(1)).optional(),
    hooks: strictHooksRecordSchema.optional(),
  })
  .strict();

/** Strict validation for SKILL.md frontmatter (matches Claude Code plugin spec) */
export const skillFrontmatterValidationSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    /** If true, Claude cannot invoke this skill on its own */
    "disable-model-invocation": z.boolean().optional(),
    /** If true, user can invoke this skill directly */
    "user-invocable": z.boolean().optional(),
    /** Comma-separated list of tools this skill can use */
    "allowed-tools": z.string().optional(),
    model: modelNameSchema.optional(),
    /** "fork" means skill runs in a forked context (separate conversation) */
    context: z.enum(["fork"]).optional(),
    /** Agent name this skill is scoped to */
    agent: z.string().optional(),
    /** Hint text shown when user invokes the skill */
    "argument-hint": z.string().optional(),
  })
  .strict();

/**
 * Provenance object shared verbatim by metadataValidationSchema and
 * customMetadataValidationSchema. The forkedFrom variants in
 * localSkillMetadataSchema (no `version`) and importedSkillMetadataSchema
 * (`skillName`/required `source`) are deliberately NOT unified here — their
 * shapes differ, so sharing would change validation behavior.
 */
const forkedFromSchema = z.object({
  /** Original skill ID */
  skillId: z.string(),
  /** Version of the original at fork time */
  version: z.number().int().min(1).optional(),
  /** Content hash of the original at fork time */
  contentHash: z.string(),
  /** Source URL or identifier */
  source: z.string().optional(),
  /** ISO date of the fork */
  date: z.string(),
});

/**
 * Recommended upper bound for cliDescription in published skills. Exceeding it is
 * advisory only — splitMetadataValidationIssues downgrades it to a warning because
 * the runtime schemas accept any length and the value only feeds wizard description
 * text. Empty (min(1)) remains a hard error.
 */
const CLI_DESCRIPTION_MAX_LENGTH = 60;

/**
 * Fields shared by metadataValidationSchema (strict, built-in vocabulary) and
 * customMetadataValidationSchema (relaxed). Only `category` and `slug` differ
 * between the two variants — each adds those via .extend().
 */
const skillMetadataBaseSchema = z.object({
  /** Author handle — must start with @ (e.g., "@vince") */
  author: z.string().regex(AUTHOR_HANDLE_PATTERN),
  /** Short display name for the wizard grid (max 30 chars) */
  displayName: z.string().min(1).max(30),
  /** One-line description for the wizard (max 60 chars recommended; over-length is a validation warning) */
  cliDescription: z.string().min(1).max(CLI_DESCRIPTION_MAX_LENGTH),
  /** When an AI agent should invoke this skill (min 10 chars to ensure usefulness) */
  usageGuidance: z.string().min(10),
  /** 7-char hex SHA of skill content (for change detection) */
  contentHash: z
    .string()
    .regex(/^[a-f0-9]{7}$/)
    .optional(),
  /** ISO date of last update */
  updated: z.string().optional(),
  /** Provenance tracking when skill was forked from another */
  forkedFrom: forkedFromSchema.optional(),
  /** Domain assignment from metadata */
  domain: (z.string() as z.ZodType<Domain>).optional(),
  /** True if this skill was created outside the CLI's built-in vocabulary */
  custom: z.boolean().optional(),
});

/** Strict validation for metadata.yaml in published skills (enforces author format, enum-validated category/slug) */
export const metadataValidationSchema = skillMetadataBaseSchema
  .extend({
    /** Domain-prefixed category — must be a known built-in category */
    category: z.enum(CATEGORIES) as z.ZodType<Category>,
    /** Kebab-case short key — must be a known built-in slug */
    slug: z.enum(SKILL_SLUGS) as z.ZodType<SkillSlug>,
  })
  .strict();

/** Relaxed validation for custom skill metadata.yaml (any category string, kebab-case slug, allows extra fields) */
export const customMetadataValidationSchema = skillMetadataBaseSchema.extend({
  /** Any string category — custom skills may define their own categories */
  category: z.string(),
  /** Kebab-case short key for alias resolution, search, and relationship rules */
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9-]*$/)
    .min(1)
    .max(50),
});

const stackSkillAssignmentSchema = z
  .object({
    id: z.string().min(1),
    /** If true, skill content is embedded in the compiled agent prompt */
    preloaded: z.boolean().optional(),
  })
  .strict();

/** Strict validation for published stack config.yaml (marketplace stacks) */
export const stackConfigValidationSchema = z
  .object({
    /** Unique stack identifier in kebab-case */
    id: z.string().regex(KEBAB_CASE_PATTERN).optional(),
    name: z.string().min(1),
    version: z.string(),
    author: z.string().min(1),
    description: z.string().optional(),
    /** ISO date when this stack was first created */
    created: z.string().optional(),
    /** ISO date of last update */
    updated: z.string().optional(),
    /** Primary framework this stack is designed for (e.g., "nextjs", "remix") */
    framework: z.string().optional(),
    /** All skills used in this stack (flat list, at least one required) */
    skills: z.array(stackSkillAssignmentSchema).min(1),
    /** Agent IDs this stack compiles (at least one required) */
    agents: z.array(z.string().regex(KEBAB_CASE_PATTERN)).min(1),
    /** Per-agent skill assignments: { agentId: { category: [skillAssignment] } } */
    agentSkills: z
      .record(z.string(), z.record(z.string(), z.array(stackSkillAssignmentSchema)))
      .optional(),
    /** High-level philosophy guiding technology choices */
    philosophy: z.string().optional(),
    /** Guiding principles for agents using this stack */
    principles: z.array(z.string().min(1)).optional(),
    tags: z.array(z.string().regex(KEBAB_CASE_PATTERN)).optional(),
    /** Per-skill overrides: alternative suggestions and lock status */
    overrides: z
      .record(
        z.string(),
        z
          .object({
            /** Suggested alternative skill IDs if this one is swapped */
            alternatives: z.array(z.string().min(1)).optional(),
            /** If true, this skill cannot be swapped by the user */
            locked: z.boolean().optional(),
          })
          .strict(),
      )
      .optional(),
    /** Community metrics for sorting/ranking */
    metrics: z
      .object({
        upvotes: z.number().int().min(0).optional(),
        downloads: z.number().int().min(0).optional(),
      })
      .strict()
      .optional(),
    /** Lifecycle hooks triggered by file changes or commands */
    hooks: strictHooksRecordSchema.optional(),
  })
  .strict();

/** Format Zod validation issues into a human-readable string (e.g., "path.to.field: Expected string; other: Required") */
export function formatZodIssues(issues: z.ZodIssue[]): string {
  return issues.map(formatZodIssue).join("; ");
}

/**
 * Validates raw skill metadata using the relaxed schema for custom skills and
 * the strict schema for built-ins — the one place the custom-vs-strict
 * selection policy lives.
 */
export function validateSkillMetadata(rawMetadata: unknown) {
  const schema = isCustomMetadata(rawMetadata)
    ? customMetadataValidationSchema
    : metadataValidationSchema;
  return schema.safeParse(rawMetadata);
}

export type MetadataIssueSplit = {
  /** Hard schema violations — the metadata is broken and must be fixed */
  errors: string[];
  /** Advisory violations (over-length cliDescription) — worth fixing, never fatal */
  warnings: string[];
};

/** True for the over-length `cliDescription` issue — the only advisory metadata violation. */
function isOverLengthCliDescription(issue: z.ZodIssue): boolean {
  return issue.code === "too_big" && issue.path.length === 1 && issue.path[0] === "cliDescription";
}

/** Reads `cliDescription` from raw parsed metadata when it is a string. */
function readCliDescription(raw: unknown): string | undefined {
  if (raw == null || typeof raw !== "object") return undefined;
  // Boundary cast: raw comes straight from YAML parsing; the typeof check above narrows to object
  const value = (raw as { cliDescription?: unknown }).cliDescription;
  return typeof value === "string" ? value : undefined;
}

/**
 * Warning text for an over-length `cliDescription`, carrying the actual length.
 * The too_big issue only fires when the value is a string, so the undefined
 * branch is defensive — it falls back to the raw zod issue text.
 */
function formatOverLengthWarning(issue: z.ZodIssue, cliDescription: string | undefined): string {
  if (cliDescription === undefined) return formatZodIssue(issue);
  return `cliDescription is ${cliDescription.length} characters — exceeds the recommended maximum of ${CLI_DESCRIPTION_MAX_LENGTH}`;
}

/**
 * Splits strict-metadata validation issues into hard errors and advisory warnings.
 *
 * Over-length `cliDescription` (> CLI_DESCRIPTION_MAX_LENGTH chars) is advisory: the
 * runtime schemas accept any length and the value only feeds wizard description text,
 * so validate reports it as a warning carrying the actual length. Empty/missing
 * `cliDescription` and every other issue remain errors.
 */
export function splitMetadataValidationIssues(
  error: z.ZodError,
  rawMetadata: unknown,
): MetadataIssueSplit {
  const [overLength, hardFailures] = partition(error.issues, isOverLengthCliDescription);

  const cliDescription = readCliDescription(rawMetadata);
  const warnings = overLength.map((issue) => formatOverLengthWarning(issue, cliDescription));

  return { errors: hardFailures.map(formatZodIssue), warnings };
}

/**
 * Validates that a parsed JSON/YAML value does not exceed a maximum nesting depth.
 * Returns true if the structure is within limits, false if it exceeds maxDepth.
 */
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

/**
 * Returns true when raw parsed metadata has `custom: true`.
 * Used to pick between strict (built-in vocabulary) and relaxed (user-authored) validation schemas.
 */
export function isCustomMetadata(raw: unknown): boolean {
  if (raw == null || typeof raw !== "object") return false;
  if (!("custom" in raw)) return false;
  return (raw as { custom: unknown }).custom === true;
}

/**
 * Logs warnings for unknown fields in a parsed object compared to a list of expected keys.
 * Used at security-critical parsing boundaries (marketplace, settings) where `.passthrough()`
 * is kept for forward compatibility but unexpected fields should be surfaced.
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
