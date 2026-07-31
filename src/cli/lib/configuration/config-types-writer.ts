import path from "path";
import { groupBy, unique } from "remeda";
import type {
  AgentName,
  Category,
  CategoryPath,
  Domain,
  MergedSkillsMatrix,
  ProjectConfig,
  ResolvedSkill,
  SkillId,
} from "../../types";
import { loadProjectConfigFromDir } from "./project-config";
import { isHomeDirectory } from "../installation/is-home-directory";
import { activeProjectAgentNames } from "./scope-predicates";
import {
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  GLOBAL_INSTALL_ROOT,
  LOCAL_PSEUDO_CATEGORY,
  STANDARD_FILES,
} from "../../consts";
import { directoryExists, fileExists, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { typedEntries, typedKeys } from "../../utils/typed-object";

const MULTI_LINE_THRESHOLD = 6;

/**
 * Emitted for a union with no members. `never` is the identity element for a
 * union: an empty install must accept NO member, and `never | "web-framework-react"`
 * reduces to `"web-framework-react"`, so a project types file that extends an empty
 * global union still narrows. Emitting `string` here would instead absorb every
 * literal and silently disable type checking of the generated config.ts.
 * Matches generateBlankGlobalConfigTypesSource, which emits `never` for the same state.
 */
const EMPTY_UNION_TYPE = "never";

/**
 * Extra just-created skill IDs / agent names / domains / categories to fold into
 * a regenerated config-types.ts (entities that exist in config but not yet in the
 * loaded matrix). buildProjectTypesExtras returns Required<ConfigTypesExtras>.
 */
export type ConfigTypesExtras = {
  extraSkillIds?: string[];
  extraAgentNames?: string[];
  extraDomains?: string[];
  extraCategories?: string[];
};

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

/** Loose StackAgentConfig line emitted when no per-category skill constraint applies. */
export const STACK_AGENT_CONFIG_LOOSE_LINE =
  "export type StackAgentConfig = Partial<Record<Category, SkillAssignment[]>>;";

/**
 * Assembles a config-types.ts source from its per-alias union lines — the single
 * template shared by generateConfigTypesSource, generateProjectConfigTypesSource,
 * and generateBlankGlobalConfigTypesSource. Their emitted text is identical apart
 * from the alias contents, the StackAgentConfig line, and the optional
 * (project-only) import block.
 *
 * The emitted ProjectConfig interface (PROJECT_CONFIG_INTERFACE_AFTER) deliberately
 * diverges from types/config.ts: it uses the narrowed generated aliases
 * (SelectedAgentName, ProjectAgentName, per-category StackAgentConfig) so a user's
 * config.ts is type-checked against only the installed skills/agents rather than
 * the full runtime union.
 */
export function assembleConfigTypesSource(parts: {
  importBlock?: string;
  skillId: string;
  agentName: string;
  selectedAgentName: string;
  projectAgentName: string;
  domain: string;
  category: string;
  stackAgentConfig: string;
}): string {
  const importSection = parts.importBlock ? `${parts.importBlock}\n\n` : "";
  return `// AUTO-GENERATED by agentsinc — DO NOT EDIT

${importSection}export type SkillId = ${parts.skillId};

export type AgentName = ${parts.agentName};

export type SelectedAgentName = ${parts.selectedAgentName};

export type ProjectAgentName = ${parts.projectAgentName};

export type Domain = ${parts.domain};

export type Category = ${parts.category};

${PROJECT_CONFIG_TYPES_BEFORE}
${parts.stackAgentConfig}

${PROJECT_CONFIG_INTERFACE_AFTER}`;
}

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
    return STACK_AGENT_CONFIG_LOOSE_LINE;
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
  const eligible = [...new Set(skillIds)]
    .map((id) => ({ id, category: matrix.skills[id]?.category }))
    .filter(
      (entry): entry is { id: SkillId; category: Category } =>
        entry.category !== undefined &&
        entry.category !== LOCAL_PSEUDO_CATEGORY &&
        categorySet.has(entry.category),
    );

  return new Map(
    typedEntries(groupBy(eligible, (entry) => entry.category)).map(([category, entries]) => [
      category,
      entries.map((entry) => entry.id),
    ]),
  );
}

/**
 * Domains that only ever appear on custom categories — the subtraction rule:
 * a domain is custom only if it NEVER appears on a non-custom (marketplace)
 * category. Explicitly-passed extra domains are always treated as custom.
 */
function collectCustomDomains(
  matrix: MergedSkillsMatrix,
  customCategorySet: Set<string>,
  extraDomains: string[],
): Set<string> {
  const categories = typedKeys(matrix.categories)
    .map((key) => ({ key, domain: matrix.categories[key]?.domain }))
    .filter((c): c is { key: Category; domain: Domain } => c.domain !== undefined);

  const marketplaceDomains = new Set(
    categories.filter((c) => !customCategorySet.has(c.key)).map((c) => c.domain),
  );
  const customOnlyDomains = categories
    .filter((c) => customCategorySet.has(c.key))
    .map((c) => c.domain)
    .filter((domain) => !marketplaceDomains.has(domain));

  return new Set<string>([...customOnlyDomains, ...extraDomains]);
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
    const { loadMergedAgents } = await import("../loading/loader");

    const sourceResult = await loadSkillsMatrixFromSource({
      sourceFlag,
      projectDir,
      skipExtraSources: true,
    });

    const allAgents = await loadMergedAgents(sourceResult.sourcePath);
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
  extras?: ConfigTypesExtras,
): Promise<void> {
  const data = await backgroundData;

  const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);

  // When a global installation exists and we're regenerating for a project,
  // generate a project config-types.ts that imports from the global one
  const isProjectScope = !isHomeDirectory(projectDir);
  const globalConfigTypes = isProjectScope ? await getGlobalConfigTypesPath() : null;

  let source: string;
  if (globalConfigTypes) {
    const loadedConfig = await loadProjectConfigFromDir(projectDir);
    const selectedAgentNames = loadedConfig?.config?.selectedAgents;
    const agents = loadedConfig?.config?.agents;
    const projectScopedAgentNames = agents ? activeProjectAgentNames(agents) : undefined;
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
  extras?: ConfigTypesExtras,
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
  const customSkillSet = new Set<SkillId>([
    ...extraSkillIds,
    ...typedKeys(matrix.skills).filter((id) => matrix.skills[id]?.custom === true),
  ]);

  // Determine which agents are custom
  const customAgentSet = new Set<AgentName>([...customAgentNames, ...extraAgentNamesArr]);

  // Determine which categories are custom (referenced by custom skills or passed as extras)
  const customCategorySet = new Set<Category>([
    ...extraCategoriesArr,
    ...typedKeys(matrix.skills)
      .map((id) => matrix.skills[id])
      .filter((skill): skill is ResolvedSkill => skill?.custom === true)
      .map((skill) => skill.category)
      .filter(isNonLocalCategory),
  ]);

  const customDomainSet = collectCustomDomains(matrix, customCategorySet, extraDomainsArr);

  const skillIdLine = formatMaybeSectionedUnion(skillIds, (id) => customSkillSet.has(id));
  const agentNameLine = formatMaybeSectionedUnion(sortedAgents, (name) => customAgentSet.has(name));
  const domainLine = formatMaybeSectionedUnion(domains, (d) => customDomainSet.has(d));
  const categoryLine = formatMaybeSectionedUnion(categories, (s) => customCategorySet.has(s));

  const selectedAgentNameLine = config?.selectedAgents?.length
    ? formatUnion(config.selectedAgents)
    : "AgentName";

  const projectScopedAgents = config?.agents ? activeProjectAgentNames(config.agents) : [];
  const projectAgentNameLine =
    projectScopedAgents.length > 0 ? formatUnion(projectScopedAgents) : "SelectedAgentName";

  const skillsByCategory = buildSkillsByCategory(skillIds, categories, matrix);
  const stackAgentConfigType = generateStackAgentConfig(skillsByCategory);

  return assembleConfigTypesSource({
    skillId: skillIdLine,
    agentName: agentNameLine,
    selectedAgentName: selectedAgentNameLine,
    projectAgentName: projectAgentNameLine,
    domain: domainLine,
    category: categoryLine,
    stackAgentConfig: stackAgentConfigType,
  });
}

// Sorted deriveDomains over every category — kept separate: this is the full-matrix domain
// union for the standalone types file, not a per-selection derivation.
function extractDomains(matrix: MergedSkillsMatrix): string[] {
  return deriveDomains(typedKeys(matrix.categories), matrix).sort();
}

/**
 * Derives the set of categories that the given skill IDs belong to,
 * by looking up each skill's category in the matrix.
 */
/** Category present and not the "local" pseudo-category. */
const isNonLocalCategory = (category: CategoryPath | undefined): category is Category =>
  Boolean(category) && category !== LOCAL_PSEUDO_CATEGORY;

export function deriveCategories(skillIds: SkillId[], matrix: MergedSkillsMatrix): Category[] {
  return unique(
    skillIds
      .map((id) => matrix.skills[id]?.category)
      // Boundary cast: CategoryPath to Category for matrix key lookup
      .filter(isNonLocalCategory),
  );
}

/**
 * Derives the set of domains that the given categories belong to,
 * by looking up each category's domain in the matrix.
 */
export function deriveDomains(categories: Category[], matrix: MergedSkillsMatrix): string[] {
  return unique(
    categories
      .map((cat) => matrix.categories[cat]?.domain)
      .filter((domain): domain is Domain => domain !== undefined),
  );
}

/**
 * Renders a union type with optional // Custom and // Marketplace section comments.
 * If all members are in one group, only that group's header is shown.
 * If both groups exist, renders with section comments and always uses multi-line format.
 */
function formatSectionedUnion(custom: string[], marketplace: string[]): string {
  if (custom.length === 0 && marketplace.length === 0) {
    return EMPTY_UNION_TYPE;
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
    return EMPTY_UNION_TYPE;
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
    return EMPTY_UNION_TYPE;
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

  const projectCategories = options.projectCategories ?? [];
  const categoryUnion =
    projectCategories.length > 0
      ? formatExtendedUnion("GlobalCategory", projectCategories)
      : "GlobalCategory";

  const selectedAgentNameUnion = options.selectedAgentNames?.length
    ? formatUnion(options.selectedAgentNames)
    : "AgentName";

  const projectAgentNameUnion = options.projectScopedAgentNames?.length
    ? formatUnion(options.projectScopedAgentNames)
    : "SelectedAgentName";

  // Import Category as GlobalCategory when we have project categories or need to re-export it
  const categoryImport = `  Category as GlobalCategory,\n`;

  const importBlock = `import type {
  SkillId as GlobalSkillId,
  AgentName as GlobalAgentName,
  Domain as GlobalDomain,
${categoryImport}} from "${importPath}";`;

  return assembleConfigTypesSource({
    importBlock,
    skillId: skillIdUnion,
    agentName: agentNameUnion,
    selectedAgentName: selectedAgentNameUnion,
    projectAgentName: projectAgentNameUnion,
    domain: domainUnion,
    category: categoryUnion,
    stackAgentConfig: STACK_AGENT_CONFIG_LOOSE_LINE,
  });
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
