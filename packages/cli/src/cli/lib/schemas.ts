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

export const effortLevelSchema = z.enum(EFFORT_NAMES) as z.ZodType<EffortLevel>;

export const permissionModeSchema = z.enum(PERMISSION_MODES) as z.ZodType<PermissionMode>;

export const skillSlugSchema = z.enum(SKILL_SLUGS) as z.ZodType<SkillSlug>;

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
  command: z.string().exactOptional(),
  script: z.string().exactOptional(),
  prompt: z.string().exactOptional(),
});

/**
 * A hook definition as a `plugin.json` authored elsewhere may carry one, and `Partial` because
 * nothing in this CLI reads a manifest's hooks — {@link pluginManifestSchema}'s two callers take
 * `name` and `version` and nothing else, and both degrade to skipping the plugin entirely when the
 * parse throws. Refusing a shape we never read would drop the whole plugin from discovery.
 *
 * Deliberately NOT the shape an agent declares: {@link strictHooksRecordSchema} is what both the
 * loader and the compiled-frontmatter reader take, because a definition carrying no actions fires
 * nothing and a `metadata.yaml` writing one is a mistake worth reporting rather than emptying.
 */
export const agentHookDefinitionSchema: z.ZodType<Partial<AgentHookDefinition>> = z.object({
  matcher: z.string().exactOptional(),
  hooks: z.array(agentHookActionSchema).exactOptional(),
});

/** Lenient hooks record — {@link pluginManifestObjectSchema} is its only consumer. */
export const hooksRecordSchema = z.record(z.string(), z.array(agentHookDefinitionSchema));

/**
 * The isolation modes Claude Code's sub-agent frontmatter documents.
 *
 * `z.enum(AGENT_ISOLATIONS)` rather than a literal spelling the one member out, which is the
 * bridge pattern its four siblings above use and the only form that MOVES with the vocabulary. A
 * `satisfies z.ZodType<AgentIsolation>` does not compensate: `ZodType`'s output parameter is
 * covariant, so a narrower schema satisfies a wider one and widening the array produced zero `tsc`
 * errors — while every parse of a newly-documented mode failed at runtime.
 */
export const agentIsolationSchema = z.enum(AGENT_ISOLATIONS) as z.ZodType<AgentIsolation>;

/**
 * Experimental frontmatter options; `cacheTtl` is the only one Claude Code documents today.
 *
 * `.strict()` HERE rather than at each use site, because the site that most needed it never had
 * it: `agentYamlConfigSchema` reads the `metadata.yaml` a user hand-authors, and a plain
 * `z.object` there emptied `experimental: { cacheTtlSeconds: "1h" }` to `{}` before either strict
 * reader saw it — the template then emitted `experimental: {}` (Liquid reads an empty hash as
 * truthy) and the reader had nothing left to refuse.
 */
export const agentExperimentalSchema = z
  .object({
    cacheTtl: z.enum(CACHE_TTLS).exactOptional(),
  })
  .strict();

/** Strict hook definition — hooks array is required and must have at least one action */
const strictAgentHookDefinitionSchema = z.object({
  matcher: z.string().exactOptional(),
  hooks: z.array(agentHookActionSchema).min(1),
});

/** Strict hooks record for validation schemas (requires at least one hook action per definition) */
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

// Lenient: accepts any string for `name` since local/custom skills may not follow strict SkillId pattern
export const skillFrontmatterLoaderSchema = z.object({
  /** Lenient (any string): local/custom skills have non-builtin IDs */
  name: z.string() as z.ZodType<SkillId>,
  description: z.string(),
  model: modelNameSchema.exactOptional(),
});

/**
 * Loader schema for a skill's metadata.yaml.
 *
 * `custom` buys its category NOTHING here. It used to: a `custom: true` skill's
 * category was waved through on a bare kebab-case test while every other skill's
 * went to `categoryPathSchema`. A custom skill is placed in a category that
 * already exists rather than bringing one, so the leniency described a freedom it
 * no longer has, and the same field now answers to the same schema either way.
 * Whether the category is one this installation actually declares is asked where
 * the declarations are — `mergeLocalSkillsIntoMatrix`, not here.
 */
export const skillMetadataLoaderSchema = z
  .object({
    category: categoryPathSchema.exactOptional(),
    author: z.string().exactOptional(),
    domain: z.string() as z.ZodType<Domain>,
    custom: z.boolean().exactOptional(),
  })
  .passthrough();

/**
 * Raw metadata.yaml shape read by the matrix loader during skill extraction.
 * Preserved verbatim on the move from matrix-loader.ts.
 */
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

// Shared plugin.json shape — the lenient (strip) and strict variants below differ only in unknown-key policy
const pluginManifestObjectSchema = z.object({
  name: z.string(),
  version: z.string().exactOptional(),
  description: z.string().exactOptional(),
  author: pluginAuthorSchema.exactOptional(),
  /** Lenient: a plugin authored elsewhere may carry any category string or none at all */
  category: z.string().exactOptional(),
  keywords: z.array(z.string()).exactOptional(),
  commands: z.union([z.string(), z.array(z.string())]).exactOptional(),
  agents: z.union([z.string(), z.array(z.string())]).exactOptional(),
  skills: z.union([z.string(), z.array(z.string())]).exactOptional(),
  hooks: z.union([z.string(), hooksRecordSchema]).exactOptional(),
});

/** Lenient plugin.json schema (strips unknown keys; used at load boundaries) */
export const pluginManifestSchema: z.ZodType<PluginManifest> = pluginManifestObjectSchema;

/** Strict plugin.json schema — rejects unrecognized keys (used by plugin-validator) */
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
  /**
   * The same contract `agentFrontmatterValidationSchema` reads the compiled agent back through.
   * The lenient {@link hooksRecordSchema} used to sit here, and every key its definition declares
   * is optional — so a block written with its actions one level flat was stripped to `{}` with no
   * error, `agent.liquid` emitted the empty definition, and the refusal arrived from the
   * frontmatter reader against a compiled `.md` the user never wrote. This is the last boundary
   * that still knows which `metadata.yaml` the value came from.
   */
  hooks: strictHooksRecordSchema.exactOptional(),
  experimental: agentExperimentalSchema.exactOptional(),
  outputFormat: z.string().exactOptional(),
  domain: (z.string() as z.ZodType<Domain>).exactOptional(),
  custom: z.boolean().exactOptional(),
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
 * The top-level keys a saved config carried before the marketplace fields were renamed, each
 * mapped to the field its value lives on now. Data rather than a check per key because both
 * loader schemas read the same file and have to refuse the same keys — and `satisfies` ties every
 * replacement to a field that really exists, so the next rename cannot leave this list stale.
 */
const RENAMED_CONFIG_FIELDS = { source: "marketplace" } as const satisfies Record<
  string,
  keyof ProjectConfig
>;

/** The same, for the keys a saved config's SKILL ENTRIES carried. */
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
 * Refuses a saved config that still names a field by the key it had before the rename.
 *
 * Reads the raw document rather than parse output because neither schema would show it one: both
 * are `.passthrough()`, so a stale top-level key survives as unrecognised data, and the skills
 * array is declared, so a stale key on an entry is stripped before any refinement runs. Either way
 * the run would look for the value under its NEW name, find nothing, and quietly install from the
 * default marketplace instead of the one the config named.
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

/**
 * Both loader schemas behind the same refusal, piped so it runs on the file as written. A failure
 * here short-circuits the shape check, so a config carrying an old key is answered with the rename
 * it needs rather than with the missing-field noise the rename causes.
 */
const renamedFieldGuard = z.unknown().superRefine(refuseRenamedFields);

/** The shape {@link projectConfigLoaderSchema} admits once the rename guard has passed. */
const projectConfigFields = z
  .object({
    /** Project/plugin name in kebab-case */
    name: z.string().exactOptional(),
    description: z.string().exactOptional(),
    /** Per-agent configuration with scope (e.g., [{ name: "web-developer", scope: "project" }]) */
    agents: z
      .array(
        z.object({
          name: z.string(),
          scope: z.enum(["project", "global"]),
          /** Per-agent overrides of the agent's own metadata defaults */
          model: modelNameSchema.exactOptional(),
          effort: effortLevelSchema.exactOptional(),
          excluded: z.boolean().exactOptional(),
        }),
      )
      .exactOptional(),
    /** Per-skill configuration with scope and provenance */
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

    /** Author handle (e.g., "@vince") */
    author: z.string().exactOptional(),
    /** Selected domains from the wizard (persisted for edit mode restoration) */
    selectedDomains: z.array(z.string() as z.ZodType<Domain>).exactOptional(),
    /** Agent-to-category-to-skill mappings from selected stack (accepts same formats as stacks.ts) */
    stack: z.record(z.string(), stackAgentConfigSchema).exactOptional(),
    /** The marketplace this install reads skills from, as a path or URL (e.g., "github:my-org/skills") */
    marketplace: z.string().exactOptional(),
    /** The name that marketplace's manifest gives it, which plugins are registered under */
    marketplaceName: z.string().exactOptional(),
    /** Separate source for agents when different from skills source */
    agentsSource: z.string().exactOptional(),
    /** Tracked project installation paths (global config only) */
    projects: z.array(z.string()).exactOptional(),
  })
  .passthrough();

/**
 * Lenient loader for .claude-src/config.ts (ProjectConfig).
 * name/agents optional since partial configs are valid at load time.
 * Full validation happens in validateProjectConfig().
 */
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

/**
 * What a relationship rule naming an unknown skill says back, in place of the whole
 * generated slug union it was tested against.
 *
 * A rule names skills by slug and every one is held to the PUBLIC catalogue's generated
 * union, so a marketplace author naming a skill they themselves ship is handed roughly 250
 * names belonging to somebody else — which answers a question they did not ask and does not
 * contain the answer to the one they did. Zod's own text for an enum reports the options and
 * never the input, so the slug they actually wrote was the one thing missing from it; the
 * function form is what puts it back.
 *
 * It says "yet" deliberately. The constraint is this schema's rather than the loader's — a
 * source's own rules are resolved against that source's own slug map — so the refusal names a
 * limit rather than a law. Whether slugs leave the closed union is a separate question.
 */
function unknownSkillSlugRefusal(input: unknown): string {
  const named = typeof input === "string" ? `'${input}'` : "That value";
  return (
    `${named} is not a slug the public catalogue carries, and a relationship rule may only ` +
    `name skills the public catalogue carries — this marketplace's own skills cannot be named ` +
    `in one yet. Name a catalogue slug, or leave 'relationships' out: it is optional, and a ` +
    `marketplace shipping no relationship rules loads and installs like any other.`
  );
}

// Skill references in relationship rules: slugs resolved to canonical IDs by matrix-loader
const skillRefInRules = z.enum(SKILL_SLUGS, {
  error: (issue) => unknownSkillSlugRefusal(issue.input),
}) as z.ZodType<SkillSlug>;

// Shared shape for conflict/discourage/compatibility rules: 2+ slugs plus a reason
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

/**
 * Standalone skill-categories.ts file schema.
 * Top-level object with version string and categories map using existing categoryDefinitionSchema.
 */
export const skillCategoriesFileSchema = z.object({
  version: z.string(),
  categories: z.record(z.string(), categoryDefinitionSchema),
});

/**
 * Standalone skill-rules.ts file schema.
 * Contains version and aggregate relationship rules between skills.
 */
export const skillRulesFileSchema = z.object({
  version: z.string(),
  relationships: relationshipDefinitionsSchema.exactOptional(),
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
    cliDescription: z.string().exactOptional(),
    /** Category to place this skill in (e.g., "web-framework") */
    category: categoryPathSchema,
    /** When an AI agent should invoke this skill */
    usageGuidance: z.string().exactOptional(),
    /** Domain this skill belongs to (e.g., "web", "api", "cli") */
    domain: z.string() as z.ZodType<Domain>,
    /** True if this skill was created outside the CLI's built-in vocabulary */
    custom: z.boolean().exactOptional(),
  })
  // Passthrough widens the output with an index signature; LocalRawMetadata is the
  // honest declared shape consumers read (same round-1 pattern as localSkillMetadataSchema).
  .passthrough() as z.ZodType<LocalRawMetadata>;

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
        source: z.string().exactOptional(),
        /** Directory inside that repository, for a skill only its own bytes can install again */
        path: z.string().exactOptional(),
      })
      .exactOptional(),
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
  philosophy: z.string().exactOptional(),
});

// Pre-normalization schema: values may be string or string[].
// loadStacks() normalizes to StacksConfig (all values SkillId[]) after parsing.
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

/**
 * What a marketplace name being refused says back, in place of the pattern it was tested against.
 *
 * A raw Zod format issue names the regex, which tells a marketplace author what the CLI checks
 * with and nothing about what to write instead. The rule is spelled the way
 * `marketplaceNameNotPublishable` in `utils/messages.ts` already spells it on the emit side, so
 * the two directions of one rule cannot come to say different things about it.
 *
 * Stated as a `message` on the `regex` check rather than in a `refine`, deliberately: a refinement
 * is unrepresentable in JSON Schema, so `src/schemas/marketplace.schema.json` would silently lose
 * the `pattern` an editor validates `marketplace.json` against.
 */
const MARKETPLACE_NAME_REFUSAL =
  "A marketplace name is kebab-case: lowercase letters, numbers and hyphens, starting with a letter (e.g. 'acme-skills'). Rename it in this manifest — Claude Code registers every plugin under it and accepts no other shape.";

export const marketplaceSchema: z.ZodType<Marketplace> = z.object({
  $schema: z.string().exactOptional(),
  /**
   * Kebab-case, because this name is the namespace Claude Code registers plugins under and the
   * CLI piggybacks on what Claude Code accepts (owner ruling 2026-08-20). Held to the same rule
   * `build marketplace` refuses to publish under, so what this CLI emits is what it can read back.
   */
  name: z.string().min(1).regex(KEBAB_CASE_PATTERN, { message: MARKETPLACE_NAME_REFUSAL }),
  version: z.string().min(1),
  description: z.string().exactOptional(),
  owner: marketplaceOwnerSchema,
  metadata: marketplaceMetadataSchema.exactOptional(),
  plugins: z.array(marketplacePluginSchema).min(1),
});

/**
 * What a cached remote source was fetched from, written beside the cache so the
 * next load can ask whether it is still current in one request.
 *
 * `etag` is absent when the host returned none — a copy that cannot be
 * revalidated at all, which is a different state from one that has not been
 * checked yet.
 */
export const sourceRevalidationSchema = z.object({
  /** The tarball URL giget resolved for this source. */
  tar: z.string().min(1),
  etag: z.string().min(1).exactOptional(),
});

/** Tool permission overrides (allow/deny lists for Claude Code tool access) */
const permissionConfigSchema = z.object({
  /** Tool names or patterns to explicitly allow */
  allow: z.array(z.string()).exactOptional(),
  /** Tool names or patterns to explicitly deny */
  deny: z.array(z.string()).exactOptional(),
});

/** Settings file schema (.claude/settings.yaml) for project-level configuration */
export const settingsFileSchema = z
  .object({
    permissions: permissionConfigSchema.exactOptional(),
  })
  .passthrough();

/** Branding overrides for white-labeling the CLI */
const brandingConfigSchema = z.object({
  /** Custom CLI name (e.g., "Acme Dev Tools") */
  name: z.string().exactOptional(),
});

/** The shape {@link projectSourceConfigSchema} admits once the rename guard has passed. */
const projectSourceConfigFields = z
  .object({
    /** The marketplace this install reads skills from, as a path or URL */
    marketplace: z.string().exactOptional(),
    /** Author handle for this project's config */
    author: z.string().exactOptional(),
    /** The name that marketplace's manifest gives it, which plugins are registered under */
    marketplaceName: z.string().exactOptional(),
    /** Separate source for agent definitions (when different from skills) */
    agentsSource: z.string().exactOptional(),
    /** Branding overrides for white-labeling the CLI */
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

/**
 * Project source configuration from .claude-src/config.ts.
 * Stores multi-source settings, custom directory overrides, and bound skills.
 */
export const projectSourceConfigSchema = renamedFieldGuard.pipe(projectSourceConfigFields);

// Strict validation schemas enforce all constraints and use .strict() to reject unknown fields,
// unlike the lenient loader schemas above which use .passthrough() for forward compatibility at parse boundaries

/**
 * Strict schema for a source agent's `metadata.yaml` — compilation's hand-authored INPUT rather
 * than an output, since compiling an agent writes one `.md` file and no YAML at all. It generates
 * `src/schemas/agent.schema.json`, which every `metadata.yaml` points at in its
 * `yaml-language-server` line, and `validateAgents` in `lib/source-validator.ts` is its only
 * runtime caller, globbing `src/agents` and reporting each failure as a source issue.
 *
 * Lenient id (any string) since marketplace agents may use custom identifiers.
 */
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

/**
 * Strict validation for a compiled agent's `.md` frontmatter, read by two callers whose failure
 * modes differ sharply. `validateAgentFrontmatter` in `lib/plugins/plugin-validator.ts` collects
 * the issues and returns an invalid `ValidationResult`, so the agent is reported and the run
 * continues. `parseAgentFrontmatter` in `lib/agents/agent-plugin-compiler.ts` returns the refusal
 * with its reason, and `compileAgentPlugin` throws it at the agent it was asked to package — the
 * loud one, and why a key this schema omits fails a packaging run rather than merely a report.
 *
 * Its `hooks`, `isolation` and `experimental` are the same three schemas `agentYamlConfigSchema`
 * loads a `metadata.yaml` through, deliberately: `agent.liquid` writes all three from what that
 * load returned, so a value one accepts and the other refuses is a compiled agent this CLI cannot
 * read back.
 */
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

/**
 * Provenance object shared verbatim by metadataValidationSchema and
 * customMetadataValidationSchema. The forkedFrom variant in
 * localSkillMetadataSchema (no `version`) is deliberately NOT unified here —
 * its shape differs, so sharing would change validation behavior.
 */
const forkedFromSchema = z.object({
  /** Original skill ID */
  skillId: z.string(),
  /** Version of the original at fork time */
  version: z.number().int().min(1).exactOptional(),
  /** Content hash of the original at fork time */
  contentHash: z.string(),
  /** Source URL or identifier */
  source: z.string().exactOptional(),
  /** Directory inside that source, for a skill only its own bytes can install again */
  path: z.string().exactOptional(),
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
    .exactOptional(),
  /** ISO date of last update */
  updated: z.string().exactOptional(),
  /** Provenance tracking when skill was forked from another */
  forkedFrom: forkedFromSchema.exactOptional(),
  /** Domain assignment from metadata */
  domain: (z.string() as z.ZodType<Domain>).exactOptional(),
  /** True if this skill was created outside the CLI's built-in vocabulary */
  custom: z.boolean().exactOptional(),
});

/**
 * What a published skill's `slug` says back when the public catalogue does not carry it, in
 * place of the whole generated slug union it was tested against.
 *
 * The same defect `unknownSkillSlugRefusal` answers one layer over, and the one an author meets
 * FIRST: they write a `metadata.yaml` before they write a rule. Zod's text for an enum reports
 * the options and never the input, so a marketplace author naming a skill they themselves ship
 * was handed roughly 250 names belonging to somebody else with their own slug missing from it.
 *
 * It differs from the rules-side message in the one way that matters: this refusal has a way
 * out and that one does not. `validateSkillMetadata` reads `custom: true` and validates against
 * `customMetadataValidationSchema`, whose `slug` is any kebab-case name — so the flag is what a
 * skill outside the catalogue's vocabulary is CARRIED by rather than a way around the check
 * (owner ruling 2026-08-22: the union stays closed and `custom: true` is the documented
 * mechanism). Nothing said so until now, which is the whole of what made it read as a trick.
 */
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

/** Strict validation for metadata.yaml in published skills (enforces author format, enum-validated category/slug) */
export const metadataValidationSchema = skillMetadataBaseSchema
  .extend({
    /** Domain-prefixed category — must be a known built-in category */
    category: z.enum(CATEGORIES),
    /**
     * Kebab-case short key — must be a known built-in slug, unless the file declares
     * `custom: true` and is judged by {@link customMetadataValidationSchema} instead.
     */
    slug: z.enum(SKILL_SLUGS, {
      error: (issue) => unknownMetadataSlugRefusal(issue.input),
    }),
  })
  .strict();

/** Relaxed validation for custom skill metadata.yaml (any category string, kebab-case slug, allows extra fields) */
export const customMetadataValidationSchema = skillMetadataBaseSchema.extend({
  /** Any string category — custom skills may define their own categories */
  category: z.string(),
  /** Kebab-case short key for alias resolution, search, and relationship rules */
  slug: z.string().regex(KEBAB_CASE_PATTERN).min(1).max(50),
});

const stackSkillAssignmentSchema = z
  .object({
    id: z.string().min(1),
    /** If true, skill content is embedded in the compiled agent prompt */
    preloaded: z.boolean().exactOptional(),
  })
  .strict();

/** Strict validation for published stack config.yaml (marketplace stacks) */
export const stackConfigValidationSchema = z
  .object({
    /** Unique stack identifier in kebab-case */
    id: z.string().regex(KEBAB_CASE_PATTERN).exactOptional(),
    name: z.string().min(1),
    version: z.string(),
    author: z.string().min(1),
    description: z.string().exactOptional(),
    /** ISO date when this stack was first created */
    created: z.string().exactOptional(),
    /** ISO date of last update */
    updated: z.string().exactOptional(),
    /** Primary framework this stack is designed for (e.g., "nextjs", "remix") */
    framework: z.string().exactOptional(),
    /** All skills used in this stack (flat list, at least one required) */
    skills: z.array(stackSkillAssignmentSchema).min(1),
    /** Agent IDs this stack compiles (at least one required) */
    agents: z.array(z.string().regex(KEBAB_CASE_PATTERN)).min(1),
    /** Per-agent skill assignments: { agentId: { category: [skillAssignment] } } */
    agentSkills: z
      .record(z.string(), z.record(z.string(), z.array(stackSkillAssignmentSchema)))
      .exactOptional(),
    /** High-level philosophy guiding technology choices */
    philosophy: z.string().exactOptional(),
    /** Guiding principles for agents using this stack */
    principles: z.array(z.string().min(1)).exactOptional(),
    tags: z.array(z.string().regex(KEBAB_CASE_PATTERN)).exactOptional(),
    /** Per-skill overrides: alternative suggestions and lock status */
    overrides: z
      .record(
        z.string(),
        z
          .object({
            /** Suggested alternative skill IDs if this one is swapped */
            alternatives: z.array(z.string().min(1)).exactOptional(),
            /** If true, this skill cannot be swapped by the user */
            locked: z.boolean().exactOptional(),
          })
          .strict(),
      )
      .exactOptional(),
    /** Community metrics for sorting/ranking */
    metrics: z
      .object({
        upvotes: z.number().int().min(0).exactOptional(),
        downloads: z.number().int().min(0).exactOptional(),
      })
      .strict()
      .exactOptional(),
    /** Lifecycle hooks triggered by file changes or commands */
    hooks: strictHooksRecordSchema.exactOptional(),
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

/**
 * Names a metadata.yaml's schema failure in the words its author needs: the required
 * fields the file leaves out, listed as missing, and whatever else is wrong said per
 * field. Zod's own text for an absent key reads "expected string, received undefined",
 * which describes the type system rather than the file.
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

/** True for a top-level field the file never declared, as against one it declared wrongly. */
function isAbsentField(issue: z.ZodIssue, rawMetadata: Record<string, unknown>): boolean {
  const [field, ...nested] = issue.path;
  return nested.length === 0 && typeof field === "string" && rawMetadata[field] === undefined;
}

function nameMissingFields(absent: z.ZodIssue[]): string {
  const fields = absent.map((issue) => issue.path.join("."));
  return `missing required ${fields.length === 1 ? "field" : "fields"}: ${fields.join(", ")}`;
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
  return raw.custom === true;
}

/**
 * Logs warnings for unknown fields in a parsed object compared to a list of expected keys.
 * Used at security-critical parsing boundaries for files this CLI owns (marketplace.json), where
 * `.passthrough()` is kept for forward compatibility but unexpected fields should be surfaced.
 * A file owned by another tool is not such a boundary: an unfamiliar key there is that tool's
 * business, and a complete expected-key list for it cannot be maintained.
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
