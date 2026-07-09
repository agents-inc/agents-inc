import os from "os";
import path from "path";
import { unique } from "remeda";
import type { AgentName, MergedSkillsMatrix, ProjectConfig, SkillId, Category } from "../../types";
import { loadProjectConfigFromDir } from "./project-config";
import {
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  GLOBAL_INSTALL_ROOT,
  PROJECT_ROOT,
  STANDARD_FILES,
} from "../../consts";
import { directoryExists, fileExists, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedKeys } from "../../utils/typed-object";

const MULTI_LINE_THRESHOLD = 6;

/**
 * Returns the absolute path to the global config-types.ts if it exists, or null.
 * Used to determine whether a project config-types.ts should import from global.
 */
export async function getGlobalConfigTypesPath(): Promise<string | null> {
  const globalConfigTypesPath = path.join(
    GLOBAL_INSTALL_ROOT,
    CLAUDE_SRC_DIR,
    STANDARD_FILES.CONFIG_TYPES_TS,
  );
  if (await fileExists(globalConfigTypesPath)) {
    return globalConfigTypesPath;
  }
  return null;
}

/**
 * Computes a relative import path from a project's .claude-src/ to the global .claude-src/.
 * Returns a POSIX-style relative path suitable for TypeScript import statements.
 */
function computeGlobalTypesImportPath(projectDir: string): string {
  const projectClaudeSrc = path.join(projectDir, CLAUDE_SRC_DIR);
  const globalClaudeSrc = path.join(GLOBAL_INSTALL_ROOT, CLAUDE_SRC_DIR);
  const relativePath = path.relative(projectClaudeSrc, globalClaudeSrc);
  // Convert to POSIX separators for TypeScript imports
  return relativePath.split(path.sep).join("/");
}

/** Max skills per category before switching to multi-line format in StackAgentConfig */
const STACK_AGENT_CONFIG_INLINE_THRESHOLD = 3;

/**
 * Types emitted before the dynamically-generated StackAgentConfig.
 * Includes InstallMode, SkillConfig, AgentScopeConfig, and the generic SkillAssignment.
 */
export const PROJECT_CONFIG_TYPES_BEFORE = `export type InstallMode = "eject" | "plugin" | "mixed";

export type SkillConfig = {
  id: SkillId;
  scope: "project" | "global";
  source: string;
  excluded?: boolean;
};

export type AgentScopeConfig = {
  name: AgentName;
  scope: "project" | "global";
  excluded?: boolean;
};

export type SkillAssignment<S extends SkillId = SkillId> = S | { id: S; preloaded: boolean };
`;

/**
 * The ProjectConfig interface, emitted after StackAgentConfig.
 */
export const PROJECT_CONFIG_INTERFACE_AFTER = `export interface ProjectConfig {
  /** Project/plugin name (kebab-case) */
  name: string;

  /** Project description */
  description?: string;

  /** Per-agent configuration with scope */
  agents: AgentScopeConfig[];

  /** Per-skill configuration with scope and source */
  skills: SkillConfig[];

  /** Author handle (e.g., "@vince") */
  author?: string;

  /** Stack configuration: agent -> category -> skill assignment */
  stack?: Partial<Record<ProjectAgentName, StackAgentConfig>>;

  /** Skills source path or URL */
  source?: string;

  /** Marketplace identifier for plugin installation */
  marketplace?: string;

  /** Agents source path or URL (when agents come from a different source than skills) */
  agentsSource?: string;

  /** Selected domains from the wizard */
  domains?: Domain[];

  /** Selected agents from the wizard */
  selectedAgents?: SelectedAgentName[];

  /** Tracked project installation paths (global config only) */
  projects?: string[];
}
`;

function formatSkillUnion(skills: SkillId[]): string {
  const sorted = [...skills].sort();
  const quoted = sorted.map((s) => `"${s}"`);
  if (quoted.length <= STACK_AGENT_CONFIG_INLINE_THRESHOLD) {
    return quoted.join(" | ");
  }
  return "\n" + quoted.map((q) => `    | ${q}`).join("\n") + "\n  ";
}

/**
 * Generates a per-category constrained StackAgentConfig type from skill-by-category groupings.
 * Falls back to the loose `Partial<Record<Category, SkillAssignment[]>>` when no categories have skills.
 */
function generateStackAgentConfig(skillsByCategory: Map<Category, SkillId[]>): string {
  if (skillsByCategory.size === 0) {
    return "export type StackAgentConfig = Partial<Record<Category, SkillAssignment[]>>;";
  }

  const properties = [...skillsByCategory.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([category, skills]) => `  "${category}"?: SkillAssignment<${formatSkillUnion(skills)}>[];`,
    );

  return ["export type StackAgentConfig = {", ...properties, "};"].join("\n");
}

/**
 * Builds a Map of Category -> SkillId[] from the matrix, filtered to only include
 * categories and skills that are in the provided arrays.
 */
function buildSkillsByCategory(
  skillIds: SkillId[],
  categories: Category[],
  matrix: MergedSkillsMatrix,
): Map<Category, SkillId[]> {
  const categorySet = new Set(categories);
  const skillIdSet = new Set(skillIds);
  const result = new Map<Category, SkillId[]>();

  for (const id of skillIdSet) {
    const skill = matrix.skills[id];
    if (!skill?.category || skill.category === "local") continue;
    if (!categorySet.has(skill.category)) continue;
    const existing = result.get(skill.category) ?? [];
    existing.push(id);
    result.set(skill.category, existing);
  }

  return result;
}

export type ConfigTypesBackgroundData = {
  matrix: MergedSkillsMatrix;
  agentNames: AgentName[];
  customAgentNames: AgentName[];
};

/**
 * Kicks off background loading of the matrix and agents needed for config-types.ts regeneration.
 * Returns a promise that resolves with the loaded data. Callers should NOT await this immediately;
 * instead, pass the promise to `regenerateConfigTypes` after the main operation completes.
 *
 * @param sourceFlag Optional --source flag value
 * @param projectDir The project root directory
 */
export function loadConfigTypesDataInBackground(
  sourceFlag: string | undefined,
  projectDir: string,
): Promise<ConfigTypesBackgroundData> {
  // Dynamic imports to avoid circular dependency issues at module load time
  const promise = (async (): Promise<ConfigTypesBackgroundData> => {
    const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);
    if (!(await directoryExists(claudeSrcDir))) {
      throw new Error(`${CLAUDE_SRC_DIR}/ not found — run '${CLI_INVOKE_COMMAND} init' first`);
    }

    const { loadSkillsMatrixFromSource } = await import("../loading/source-loader");
    const { loadAllAgents } = await import("../loading/loader");

    const sourceResult = await loadSkillsMatrixFromSource({
      sourceFlag,
      projectDir,
      skipExtraSources: true,
    });

    const cliAgents = await loadAllAgents(PROJECT_ROOT);
    const sourceAgents = await loadAllAgents(sourceResult.sourcePath);
    const allAgents = { ...cliAgents, ...sourceAgents };
    const agentNames = typedKeys<AgentName>(allAgents);
    const customAgentNames = agentNames.filter((name) => allAgents[name]?.custom === true);

    return { matrix: sourceResult.matrix, agentNames, customAgentNames };
  })();

  // Prevent unhandled rejection if the command exits before awaiting this promise
  promise.catch(() => {});

  return promise;
}

/**
 * Regenerates config-types.ts with the latest matrix data, merging in any extra entities
 * that were just created (e.g., a new skill or agent). Errors propagate to callers.
 *
 * @param projectDir The project root directory
 * @param backgroundData Promise from loadConfigTypesDataInBackground
 * @param extras Optional extra skill IDs or agent names to include (for just-created entities)
 */
export async function regenerateConfigTypes(
  projectDir: string,
  backgroundData: Promise<ConfigTypesBackgroundData>,
  extras?: {
    extraSkillIds?: string[];
    extraAgentNames?: string[];
    extraDomains?: string[];
    extraCategories?: string[];
  },
): Promise<void> {
  const data = await backgroundData;

  const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);

  // When a global installation exists and we're regenerating for a project,
  // generate a project config-types.ts that imports from the global one
  const isProjectScope = path.resolve(projectDir) !== path.resolve(os.homedir());
  const globalConfigTypes = isProjectScope ? await getGlobalConfigTypesPath() : null;

  let source: string;
  if (globalConfigTypes) {
    const loadedConfig = await loadProjectConfigFromDir(projectDir);
    const selectedAgentNames = loadedConfig?.config?.selectedAgents as string[] | undefined;
    const projectScopedAgentNames = loadedConfig?.config?.agents
      ?.filter((a) => a.scope === "project" && !a.excluded)
      ?.map((a) => a.name) as string[] | undefined;
    source = generateProjectConfigTypesSource({
      globalTypesImportPath: computeGlobalTypesImportPath(projectDir),
      projectSkillIds: extras?.extraSkillIds ?? [],
      projectAgentNames: extras?.extraAgentNames ?? [],
      projectDomains: extras?.extraDomains ?? [],
      projectCategories: extras?.extraCategories ?? [],
      ...(selectedAgentNames?.length ? { selectedAgentNames } : {}),
      ...(projectScopedAgentNames?.length ? { projectScopedAgentNames } : {}),
    });
    verbose("Using project config-types.ts that imports from global");
  } else {
    source = generateConfigTypesSource(data.matrix, data.agentNames, data.customAgentNames, extras);
  }

  const configTypesPath = path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TYPES_TS);
  await writeFile(configTypesPath, source);
  verbose(`Regenerated ${STANDARD_FILES.CONFIG_TYPES_TS}`);
}

/**
 * Generates a config-types.ts source from marketplace data.
 * The generated file provides type safety for config.ts via `import type` + `satisfies`.
 *
 * @param customAgentNames Agent names that are custom (from sources with `custom: true`)
 * @param extras Optional extra skill IDs or agent names to include (for just-created entities)
 * @param config Optional ProjectConfig to narrow unions to only installed items.
 *               When provided, SkillId/AgentName/Category/Domain are derived from
 *               the config's skills[] and agents[] rather than the full matrix.
 */
export function generateConfigTypesSource(
  matrix: MergedSkillsMatrix,
  agentNames: AgentName[],
  customAgentNames: AgentName[] = [],
  extras?: {
    extraSkillIds?: string[];
    extraAgentNames?: string[];
    extraDomains?: string[];
    extraCategories?: string[];
  },
  config?: ProjectConfig,
): string {
  // Boundary cast: extra IDs from CLI args may not match strict union patterns
  const extraSkillIds = (extras?.extraSkillIds ?? []) as SkillId[];
  const extraAgentNamesArr = (extras?.extraAgentNames ?? []) as AgentName[];
  const extraDomainsArr = extras?.extraDomains ?? [];
  const extraCategoriesArr = (extras?.extraCategories ?? []) as Category[];

  let skillIds: SkillId[];
  let sortedAgents: AgentName[];
  let domains: string[];
  let categories: Category[];

  if (config) {
    // Narrow to only installed/configured items
    const configSkillIds = config.skills.map((s) => s.id);
    skillIds = unique([...configSkillIds, ...extraSkillIds]).sort();

    const configAgentNames = config.agents.map((a) => a.name);
    sortedAgents = unique([...configAgentNames, ...extraAgentNamesArr]).sort();

    // Derive categories from installed skills via matrix lookup
    const configCategories = deriveCategories(configSkillIds, matrix);
    categories = unique([...configCategories, ...extraCategoriesArr]).sort();

    // Derive domains from included categories via matrix lookup
    // Also include config.domains (user-selected domains) that may not have skills in this scope
    const configDomains = deriveDomains(categories, matrix);
    domains = unique([...configDomains, ...(config.domains ?? []), ...extraDomainsArr]).sort();
  } else {
    // Fall back to full matrix (e.g., blank global config)
    skillIds = unique([...typedKeys(matrix.skills), ...extraSkillIds]).sort();
    sortedAgents = unique([...agentNames, ...extraAgentNamesArr]).sort();
    domains = unique([...extractDomains(matrix), ...extraDomainsArr]).sort();
    categories = unique([...typedKeys(matrix.categories), ...extraCategoriesArr]).sort();
  }

  // Determine which skills are custom
  const customSkillSet = new Set<SkillId>(extraSkillIds);
  for (const id of typedKeys(matrix.skills)) {
    const skill = matrix.skills[id];
    if (skill?.custom === true) {
      customSkillSet.add(id);
    }
  }

  // Determine which agents are custom
  const customAgentSet = new Set<AgentName>([...customAgentNames, ...extraAgentNamesArr]);

  // Determine which categories are custom (referenced by custom skills or passed as extras)
  const customCategorySet = new Set<Category>(extraCategoriesArr);
  for (const id of typedKeys(matrix.skills)) {
    const skill = matrix.skills[id];
    if (skill?.custom === true && skill.category && skill.category !== "local") {
      customCategorySet.add(skill.category);
    }
  }

  // Determine which domains are custom (only appear on custom categories)
  const customDomainSet = new Set<string>();
  const marketplaceDomainSet = new Set<string>();
  for (const key of typedKeys(matrix.categories)) {
    const cat = matrix.categories[key];
    if (!cat?.domain) continue;
    if (customCategorySet.has(key)) {
      customDomainSet.add(cat.domain);
    } else {
      marketplaceDomainSet.add(cat.domain);
    }
  }
  // A domain is only custom if it NEVER appears on a non-custom category
  for (const domain of marketplaceDomainSet) {
    customDomainSet.delete(domain);
  }
  // Explicitly-passed extra domains are always treated as custom
  for (const domain of extraDomainsArr) {
    customDomainSet.add(domain);
  }

  const skillIdLine = formatMaybeSectionedUnion(skillIds, (id) => customSkillSet.has(id));
  const agentNameLine = formatMaybeSectionedUnion(sortedAgents, (name) => customAgentSet.has(name));
  const domainLine = formatMaybeSectionedUnion(domains, (d) => customDomainSet.has(d));
  const categoryLine = formatMaybeSectionedUnion(categories, (s) => customCategorySet.has(s));

  const selectedAgentNameLine = config?.selectedAgents?.length
    ? formatUnion(config.selectedAgents as string[])
    : "AgentName";

  const projectScopedAgents =
    config?.agents?.filter((a) => a.scope === "project" && !a.excluded)?.map((a) => a.name) ?? [];
  const projectAgentNameLine =
    projectScopedAgents.length > 0
      ? formatUnion(projectScopedAgents as string[])
      : "SelectedAgentName";

  const skillsByCategory = buildSkillsByCategory(skillIds, categories, matrix);
  const stackAgentConfigType = generateStackAgentConfig(skillsByCategory);

  return `// AUTO-GENERATED by agentsinc — DO NOT EDIT

export type SkillId = ${skillIdLine};

export type AgentName = ${agentNameLine};

export type SelectedAgentName = ${selectedAgentNameLine};

export type ProjectAgentName = ${projectAgentNameLine};

export type Domain = ${domainLine};

export type Category = ${categoryLine};

${PROJECT_CONFIG_TYPES_BEFORE}
${stackAgentConfigType}

${PROJECT_CONFIG_INTERFACE_AFTER}`;
}

function extractDomains(matrix: MergedSkillsMatrix): string[] {
  const domainSet = new Set<string>();
  for (const key of typedKeys(matrix.categories)) {
    const category = matrix.categories[key];
    if (category?.domain) {
      domainSet.add(category.domain);
    }
  }
  return [...domainSet].sort();
}

/**
 * Derives the set of categories that the given skill IDs belong to,
 * by looking up each skill's category in the matrix.
 */
function deriveCategories(skillIds: SkillId[], matrix: MergedSkillsMatrix): Category[] {
  const categorySet = new Set<Category>();
  for (const id of skillIds) {
    const skill = matrix.skills[id];
    if (skill?.category && skill.category !== "local") {
      // Boundary cast: CategoryPath to Category for matrix key lookup
      categorySet.add(skill.category as Category);
    }
  }
  return [...categorySet];
}

/**
 * Derives the set of domains that the given categories belong to,
 * by looking up each category's domain in the matrix.
 */
function deriveDomains(categories: Category[], matrix: MergedSkillsMatrix): string[] {
  const domainSet = new Set<string>();
  for (const cat of categories) {
    const def = matrix.categories[cat];
    if (def?.domain) {
      domainSet.add(def.domain);
    }
  }
  return [...domainSet];
}

/**
 * Renders a union type with optional // Custom and // Marketplace section comments.
 * If all members are in one group, only that group's header is shown.
 * If both groups exist, renders with section comments and always uses multi-line format.
 */
function formatSectionedUnion(custom: string[], marketplace: string[]): string {
  if (custom.length === 0 && marketplace.length === 0) {
    return "string";
  }

  // Only one group present: show single header
  if (marketplace.length === 0) {
    const lines = custom.map((m) => `  | "${m}"`);
    return "\n  // Custom\n" + lines.join("\n");
  }
  if (custom.length === 0) {
    const lines = marketplace.map((m) => `  | "${m}"`);
    return "\n  // Marketplace\n" + lines.join("\n");
  }

  // Both groups: custom first, then marketplace
  const customLines = custom.map((m) => `  | "${m}"`);
  const marketplaceLines = marketplace.map((m) => `  | "${m}"`);
  return (
    "\n  // Custom\n" +
    customLines.join("\n") +
    "\n  // Marketplace\n" +
    marketplaceLines.join("\n")
  );
}

/**
 * Formats a union, using section comments when custom members exist,
 * or plain formatUnion when there are no custom members.
 */
function formatMaybeSectionedUnion<T extends string>(
  members: T[],
  isCustom: (member: T) => boolean,
): string {
  if (members.length === 0) {
    return "string";
  }

  const custom = members.filter(isCustom);
  const marketplace = members.filter((m) => !isCustom(m));

  // No custom members: use standard formatting (preserves single-line for small unions)
  if (custom.length === 0) {
    return formatUnion(members);
  }

  return formatSectionedUnion(custom, marketplace);
}

function formatUnion(members: string[]): string {
  if (members.length === 0) {
    return "string";
  }

  const quoted = members.map((m) => `"${m}"`);

  if (quoted.length < MULTI_LINE_THRESHOLD) {
    return quoted.join(" | ");
  }

  return "\n" + quoted.map((q) => `  | ${q}`).join("\n");
}

export type ProjectConfigTypesOptions = {
  /**
   * Absolute path to the global .claude-src directory.
   * When set, generates import statements that extend global types.
   */
  globalTypesImportPath: string;
  /** Project-only skill IDs (not including global) */
  projectSkillIds: string[];
  /** Project-only agent names (not including global) */
  projectAgentNames: string[];
  /** Project-only domains (not including global) */
  projectDomains: string[];
  /** Project-only categories (not including global) */
  projectCategories?: string[];
  /** Selected agent names from config (narrows SelectedAgentName) */
  selectedAgentNames?: string[];
  /** Project-scoped agent names (narrows ProjectAgentName for stack keys) */
  projectScopedAgentNames?: string[];
};

/**
 * Generates a project config-types.ts source that imports global types and extends them.
 * Each type union is `GlobalType | "project-item-1" | "project-item-2"`.
 * When projectCategories are provided, Category extends GlobalCategory instead of being `string`.
 */
export function generateProjectConfigTypesSource(options: ProjectConfigTypesOptions): string {
  const importPath = `${options.globalTypesImportPath}/config-types`;

  const skillIdUnion = formatExtendedUnion("GlobalSkillId", options.projectSkillIds);
  const agentNameUnion = formatExtendedUnion("GlobalAgentName", options.projectAgentNames);
  const domainUnion = formatExtendedUnion("GlobalDomain", options.projectDomains);

  const hasProjectCategories = options.projectCategories && options.projectCategories.length > 0;
  const categoryUnion = hasProjectCategories
    ? formatExtendedUnion("GlobalCategory", options.projectCategories!)
    : "GlobalCategory";

  const selectedAgentNameUnion = options.selectedAgentNames?.length
    ? formatUnion(options.selectedAgentNames)
    : "AgentName";

  const projectAgentNameUnion = options.projectScopedAgentNames?.length
    ? formatUnion(options.projectScopedAgentNames)
    : "SelectedAgentName";

  // Import Category as GlobalCategory when we have project categories or need to re-export it
  const categoryImport = `  Category as GlobalCategory,\n`;

  return `// AUTO-GENERATED by agentsinc — DO NOT EDIT

import type {
  SkillId as GlobalSkillId,
  AgentName as GlobalAgentName,
  Domain as GlobalDomain,
${categoryImport}} from "${importPath}";

export type SkillId = ${skillIdUnion};

export type AgentName = ${agentNameUnion};

export type SelectedAgentName = ${selectedAgentNameUnion};

export type ProjectAgentName = ${projectAgentNameUnion};

export type Domain = ${domainUnion};

export type Category = ${categoryUnion};

${PROJECT_CONFIG_TYPES_BEFORE}
export type StackAgentConfig = Partial<Record<Category, SkillAssignment[]>>;

${PROJECT_CONFIG_INTERFACE_AFTER}`;
}

/**
 * Formats a union that extends a global type alias.
 * Returns `GlobalType` when no project members exist, or `GlobalType | "a" | "b"` with members.
 */
function formatExtendedUnion(globalTypeName: string, projectMembers: string[]): string {
  if (projectMembers.length === 0) {
    return globalTypeName;
  }

  const sorted = [...projectMembers].sort();
  const quoted = sorted.map((m) => `"${m}"`);

  if (quoted.length < MULTI_LINE_THRESHOLD) {
    return `${globalTypeName} | ${quoted.join(" | ")}`;
  }

  return `\n  | ${globalTypeName}\n` + quoted.map((q) => `  | ${q}`).join("\n");
}
