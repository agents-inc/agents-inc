import os from "os";
import { unique } from "remeda";
import path from "path";
import {
  DEFAULT_BRANDING,
  PROJECT_ROOT,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  LOCAL_PSEUDO_CATEGORY,
} from "../../consts";
import { defaultCategories } from "../configuration/default-categories";
import { defaultRules } from "../configuration/default-rules";
import { defaultStacks } from "../configuration/default-stacks";
import { LOCAL_DEFAULTS } from "../metadata-keys";
import type {
  AgentDefinition,
  AgentName,
  CategoryMap,
  Domain,
  MergedSkillsMatrix,
  RelationshipDefinitions,
  ResolvedSkill,
  ResolvedStack,
  SkillAssignment,
  SkillId,
  Stack,
  Category,
} from "../../types";
import { fileExists } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedEntries, typedFromEntries, typedKeys } from "../../utils/typed-object";
import {
  DEFAULT_SOURCE,
  isLocalSource,
  loadProjectSourceConfig,
  resolveSource,
  type ResolvedConfig,
} from "../configuration";
import { discoverLocalSkills, type LocalSkillDiscoveryResult } from "../skills";
import {
  checkMatrixHealth,
  extractAllSkills,
  loadSkillCategories,
  loadSkillRules,
  mergeMatrixWithSkills,
} from "../matrix";
import { loadAllAgents } from "./loader";
import { fetchFromSource, fetchMarketplace } from "./source-fetcher";
import { loadSkillsFromAllSources } from "./multi-source-loader";
import { loadStacks, resolveAgentConfigToSkills } from "../stacks";
import { initializeMatrix, matrix as currentMatrix } from "../matrix/matrix-provider";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";

export type SourceLoadOptions = {
  sourceFlag?: string;
  projectDir?: string;
  forceRefresh?: boolean;
  devMode?: boolean;
  /** Skip loading skills from extra sources (multi-source). Only needed for wizard UI tagging. */
  skipExtraSources?: boolean;
};

export type SourceLoadResult = {
  matrix: MergedSkillsMatrix;
  sourceConfig: ResolvedConfig;
  sourcePath: string;
  isLocal: boolean;
  marketplace?: string;
  marketplaceDisplayName?: string;
};

export async function loadSkillsMatrixFromSource(
  options: SourceLoadOptions = {},
): Promise<SourceLoadResult> {
  const { sourceFlag, projectDir, forceRefresh = false, devMode = false } = options;

  const sourceConfig = await resolveSource(sourceFlag, projectDir);
  const { source } = sourceConfig;

  verbose(`Loading skills from source: ${source}`);

  const result = await resolveBaseResult(source, sourceConfig, devMode, forceRefresh);

  const resolvedProjectDir = projectDir || process.cwd();

  // Load global local skills first, then project local skills — project wins on conflict
  const homeDir = os.homedir();
  if (resolvedProjectDir !== homeDir) {
    result.matrix = await mergeDiscoveredLocalSkills(result.matrix, homeDir, "global");
  }
  result.matrix = await mergeDiscoveredLocalSkills(result.matrix, resolvedProjectDir, "project");

  if (!options.skipExtraSources) {
    await loadSkillsFromAllSources(
      result.matrix,
      sourceConfig,
      resolvedProjectDir,
      forceRefresh,
      result.marketplace,
      result.marketplaceDisplayName,
    );
  }

  checkMatrixHealth(result.matrix);
  initializeMatrix(result.matrix);

  return result;
}

/**
 * Resolves the base matrix for the configured source: the pre-computed
 * BUILT_IN_MATRIX for the default source, otherwise a local or remote load.
 */
async function resolveBaseResult(
  source: string,
  sourceConfig: SourceLoadResult["sourceConfig"],
  devMode: boolean,
  forceRefresh: boolean,
): Promise<SourceLoadResult> {
  if (source === DEFAULT_SOURCE && !devMode) {
    // Default source: use pre-computed BUILT_IN_MATRIX instead of loading from disk.
    // Still resolve sourcePath via fetchFromSource so skill files can be read
    // (e.g. for eject-mode copy). The fetch is cached, so no network call if
    // the clone already exists.
    const fetchResult = await fetchFromSource(source, { forceRefresh });
    return {
      matrix: {
        ...BUILT_IN_MATRIX,
        skills: { ...BUILT_IN_MATRIX.skills },
        categories: { ...BUILT_IN_MATRIX.categories },
        suggestedStacks: [...BUILT_IN_MATRIX.suggestedStacks],
      },
      sourceConfig,
      sourcePath: fetchResult.path,
      isLocal: false,
      marketplace: sourceConfig.marketplace,
      marketplaceDisplayName: DEFAULT_BRANDING.NAME,
    };
  }

  const isLocal = isLocalSource(source) || devMode === true;
  return isLocal
    ? loadFromLocal(source, sourceConfig)
    : loadFromRemote(source, sourceConfig, forceRefresh);
}

/** Merges relationship rule sets: source rules first, so they win first-match lookups. */
function mergeRelationships(
  source: RelationshipDefinitions,
  defaults: RelationshipDefinitions,
): RelationshipDefinitions {
  return {
    conflicts: [...source.conflicts, ...defaults.conflicts],
    discourages: [...source.discourages, ...defaults.discourages],
    recommends: [...source.recommends, ...defaults.recommends],
    requires: [...source.requires, ...defaults.requires],
    alternatives: [...source.alternatives, ...defaults.alternatives],
    compatibleWith: [...(source.compatibleWith ?? []), ...(defaults.compatibleWith ?? [])],
  };
}

/** Merges any discovered local skills for `dir` into the matrix, logging the find. */
async function mergeDiscoveredLocalSkills(
  matrix: MergedSkillsMatrix,
  dir: string,
  label: "global" | "project",
): Promise<MergedSkillsMatrix> {
  const discovered = await discoverLocalSkills(dir);
  if (!discovered || discovered.skills.length === 0) return matrix;
  verbose(
    `Found ${discovered.skills.length} ${label} local skill(s) in ${discovered.localSkillsPath}`,
  );
  return mergeLocalSkillsIntoMatrix(matrix, discovered);
}

async function loadFromLocal(
  source: string,
  sourceConfig: ResolvedConfig,
): Promise<SourceLoadResult> {
  const skillsPath = !isLocalSource(source)
    ? PROJECT_ROOT
    : path.isAbsolute(source)
      ? source
      : path.resolve(process.cwd(), source);

  verbose(`Loading skills from local path: ${skillsPath}`);

  const mergedMatrix = await loadAndMergeFromBasePath(skillsPath);

  return {
    matrix: mergedMatrix,
    sourceConfig,
    sourcePath: skillsPath,
    isLocal: true,
    marketplace: sourceConfig.marketplace,
  };
}

async function loadFromRemote(
  source: string,
  sourceConfig: ResolvedConfig,
  forceRefresh: boolean,
): Promise<SourceLoadResult> {
  verbose(`Fetching skills from remote source: ${source}`);

  const fetchResult = await fetchFromSource(source, { forceRefresh });

  verbose(`Fetched to: ${fetchResult.path}`);

  const mergedMatrix = await loadAndMergeFromBasePath(fetchResult.path);

  // Try to read marketplace name from the source's .claude-plugin/marketplace.json.
  // This handles the case where sourceConfig.marketplace is undefined (e.g. during
  // `agentsinc init --source github:user/repo` before any project config exists).
  let marketplace = sourceConfig.marketplace;
  let marketplaceDisplayName: string | undefined;
  try {
    const marketplaceResult = await fetchMarketplace(source, { forceRefresh });
    marketplace ??= marketplaceResult.marketplace.name;
    marketplaceDisplayName = marketplaceResult.marketplace.owner.name;
    verbose(`Using marketplace name from marketplace.json: ${marketplace}`);
  } catch {
    verbose(`Source does not have a marketplace.json — using source name as label`);
  }

  return {
    matrix: mergedMatrix,
    sourceConfig,
    sourcePath: fetchResult.path,
    isLocal: false,
    marketplace,
    marketplaceDisplayName,
  };
}

async function loadAndMergeFromBasePath(basePath: string): Promise<MergedSkillsMatrix> {
  const sourceProjectConfig = await loadProjectSourceConfig(basePath);

  const skillsDirRelPath = sourceProjectConfig?.skillsDir ?? SKILLS_DIR_PATH;
  const stacksRelFile = sourceProjectConfig?.stacksFile;

  // Load source categories and rules (if they exist)
  const sourceCategoriesPath = path.join(basePath, SKILL_CATEGORIES_PATH);
  const sourceRulesPath = path.join(basePath, SKILL_RULES_PATH);
  const hasSourceCategories = await fileExists(sourceCategoriesPath);
  const hasSourceRules = await fileExists(sourceRulesPath);

  const sourceCategories = hasSourceCategories
    ? await loadSkillCategories(sourceCategoriesPath)
    : undefined;
  if (sourceCategories) {
    verbose(
      `Loaded source categories: ${sourceCategoriesPath} (${typedKeys(sourceCategories).length} categories)`,
    );
  }
  const categories: CategoryMap = sourceCategories
    ? { ...defaultCategories, ...sourceCategories }
    : defaultCategories;

  const sourceRules = hasSourceRules ? await loadSkillRules(sourceRulesPath) : undefined;
  if (sourceRules) {
    verbose(`Loaded source rules: ${sourceRulesPath}`);
  }
  const relationships: RelationshipDefinitions = sourceRules
    ? mergeRelationships(sourceRules.relationships, defaultRules.relationships)
    : defaultRules.relationships;

  if (hasSourceCategories || hasSourceRules) {
    verbose(`Matrix merged: CLI (${typedKeys(defaultCategories).length} categories) + source`);
  } else {
    verbose(`Matrix from CLI only (source has no categories/rules files)`);
  }

  const skillsDir = path.join(basePath, skillsDirRelPath);
  verbose(`Skills from source: ${skillsDir}`);

  const skills = await extractAllSkills(skillsDir);
  const mergedMatrix = mergeMatrixWithSkills(categories, relationships, skills);
  initializeMatrix(mergedMatrix);

  // Load stacks from source first, fall back to CLI's built-in defaults
  const sourceStacks = await loadStacks(basePath, stacksRelFile);
  const stacks = sourceStacks.length > 0 ? sourceStacks : defaultStacks;
  if (stacks.length > 0) {
    mergedMatrix.suggestedStacks = stacks.map((stack) => convertStackToResolvedStack(stack));
    const stackSource = sourceStacks.length > 0 ? "source" : "CLI";
    verbose(`Loaded ${stacks.length} stacks from ${stackSource}`);
  }

  // Collect explicit domain definitions from agent metadata.yaml files
  const agents = await loadAllAgents(basePath);
  const agentDefinedDomains = typedFromEntries(
    typedEntries<AgentName, AgentDefinition>(agents).flatMap(([agentId, agentDef]) =>
      agentDef.domain ? [[agentId, agentDef.domain] as const] : [],
    ),
  );
  const domainCount = typedKeys(agentDefinedDomains).length;
  if (domainCount > 0) {
    mergedMatrix.agentDefinedDomains = agentDefinedDomains;
    verbose(`Loaded ${domainCount} agent domain definition(s)`);
  }

  return mergedMatrix;
}

// Stack values are already skill IDs — no alias resolution needed
export function convertStackToResolvedStack(stack: Stack): ResolvedStack {
  const agentConfigs = typedKeys<AgentName>(stack.agents).flatMap((agentId) => {
    const agentConfig = stack.agents[agentId];
    return agentConfig ? [{ agentId, agentConfig }] : [];
  });

  const skills = typedFromEntries(
    agentConfigs.map(
      ({ agentId, agentConfig }) => [agentId, resolveStackAgentSkills(agentConfig)] as const,
    ),
  );

  // First-seen order across agents, matching the historical seen-Set accumulation
  const allSkillIds = unique(
    agentConfigs.flatMap(({ agentConfig }) =>
      resolveAgentConfigToSkills(agentConfig).map((ref) => ref.id),
    ),
  );

  const agentCount = typedKeys<AgentName>(stack.agents).length;
  verbose(`Stack '${stack.id}' has ${allSkillIds.length} skills from ${agentCount} agents`);

  return {
    id: stack.id,
    name: stack.name,
    description: stack.description,
    skills,
    allSkillIds,
    philosophy: stack.philosophy || "",
  };
}

/** Per-category skill ids for one stack agent, keeping only ids present in the current matrix. */
function resolveStackAgentSkills(
  agentConfig: Partial<Record<Category, SkillAssignment[]>>,
): Partial<Record<Category, SkillId[]>> {
  const byCategory = typedEntries<Category, SkillAssignment[]>(agentConfig)
    .map(([category, assignments]) => ({
      category,
      validIds: (assignments ?? []).filter((a) => a.id in currentMatrix.skills).map((a) => a.id),
    }))
    .filter(({ validIds }) => validIds.length > 0);
  return typedFromEntries(
    byCategory.map(({ category, validIds }) => [category, validIds] as const),
  );
}

/**
 * Extract a human-readable name from a source URL.
 * e.g. "github:agents-inc/skills" -> "agents-inc"
 *      "github:acme-corp/claude-skills" -> "acme-corp"
 */
export function extractSourceName(source: string): string {
  // Strip protocol prefix (github:, gh:, https://, etc.)
  const withoutProtocol = source.replace(/^(?:github|gh|gitlab|bitbucket|sourcehut):/, "");
  const withoutUrl = withoutProtocol.replace(/^https?:\/\/[^/]+\//, "");

  // Take the first path segment (org/owner name)
  const firstSegment = withoutUrl.split("/")[0];
  return firstSegment || source;
}

export function mergeLocalSkillsIntoMatrix(
  matrix: MergedSkillsMatrix,
  localResult: LocalSkillDiscoveryResult,
): MergedSkillsMatrix {
  for (const metadata of localResult.skills) {
    const existingSkill = matrix.skills[metadata.id];

    // If overwriting an existing remote skill, inherit its category unconditionally.
    // Otherwise, use whatever the local skill declared in its metadata.yaml.
    const category = existingSkill?.category ?? metadata.category;
    const slug = existingSkill?.slug ?? metadata.slug;
    const displayName = existingSkill?.displayName ?? metadata.displayName;

    const resolvedSkill: ResolvedSkill = {
      id: metadata.id,
      slug,
      displayName,
      description: metadata.description,
      usageGuidance: metadata.usageGuidance,

      category,

      author: LOCAL_DEFAULTS.AUTHOR,

      conflictsWith: existingSkill?.conflictsWith ?? [],
      isRecommended: existingSkill?.isRecommended ?? false,
      recommendedReason: existingSkill?.recommendedReason,
      requires: existingSkill?.requires ?? [],
      alternatives: existingSkill?.alternatives ?? [],
      discourages: existingSkill?.discourages ?? [],
      compatibleWith: existingSkill?.compatibleWith ?? [],

      path: metadata.path,

      local: true,
      localPath: metadata.localPath,
      custom: metadata.custom,
    };

    matrix.skills[metadata.id] = resolvedSkill;

    // Ensure the skill's category exists in matrix.categories so that
    // config-types generation can discover its domain and category.
    // Skip "local" — it is a pseudo-category, not a real Category union member.
    if (category !== LOCAL_PSEUDO_CATEGORY && !matrix.categories[category] && metadata.domain) {
      matrix.categories[category] = {
        id: category,
        displayName: category,
        description: `Local skill category`,
        domain: metadata.domain,
        exclusive: false,
        required: false,
        order: 0,
      };
      verbose(`Added local category: ${category} (domain: ${metadata.domain})`);
    }

    verbose(`Added local skill: ${metadata.id} (category: ${category})`);
  }

  return matrix;
}
