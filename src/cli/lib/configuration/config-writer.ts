import os from "os";
import path from "path";
import type { ProjectConfig } from "../../types";
import { CLAUDE_SRC_DIR, DEFAULT_PLUGIN_NAME, STANDARD_FILES } from "../../consts";
import { fileExists, ensureDir, writeFile } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { isSkillAssignment } from "../../utils/type-guards";
import { PROJECT_CONFIG_TYPES_BEFORE, PROJECT_CONFIG_INTERFACE_AFTER } from "./config-types-writer";

export type ConfigSourceOptions = {
  /**
   * When true, generates a project config that imports and extends the global config.
   * The global config import path is resolved internally via `getGlobalConfigImportPath()`.
   */
  isProjectConfig?: boolean;

  /**
   * When provided alongside `isProjectConfig`, inlines global skills/agents directly
   * instead of generating `import globalConfig` and spread syntax.
   * Produces a self-contained, readable config snapshot.
   */
  globalConfig?: ProjectConfig;
};

/** Fields that are extracted into typed named variables below the export default */
const EXTRACTED_FIELDS = new Set(["skills", "agents", "stack", "domains", "selectedAgents"]);

/** One config entry as an indented array-element line. */
function renderEntryLine(entry: unknown): string {
  return `  ${JSON.stringify(entry)},`;
}

/** One scalar field as an indented object-property line. */
function renderScalarField(key: string, value: unknown): string {
  return `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`;
}

type ConfigArrays = {
  skills: unknown[];
  agents: unknown[];
  stack: Record<string, unknown> | undefined;
  domains: unknown[];
  selectedAgents: string[];
};

/** The five extracted array/stack fields of a cleaned config, defaulted for emission. */
function extractConfigArrays(cleaned: Record<string, unknown>): ConfigArrays {
  // Boundary cast: cleaned comes from JSON.parse(JSON.stringify(...)) so arrays are plain JSON values
  return {
    skills: (cleaned.skills as unknown[]) ?? [],
    agents: (cleaned.agents as unknown[]) ?? [],
    stack: cleaned.stack as Record<string, unknown> | undefined,
    domains: (cleaned.domains as unknown[]) ?? [],
    selectedAgents: (cleaned.selectedAgents as string[]) ?? [],
  };
}

/**
 * Generates a TypeScript config file source from a ProjectConfig object.
 * The export default sits at the top as a table of contents, with typed named
 * variables (skills, agents, stack, domains) declared below it.
 *
 * When `options.isProjectConfig` is true, the generated config imports from the global
 * config and spreads global arrays into skills, agents, and domains.
 */
/**
 * Shared pre-emission cleanup: JSON round-trip (drops undefined values), optional
 * `projects` removal (project configs never emit the global tracking list), and
 * stack compaction (strip `{ id, preloaded: false }` to bare strings while
 * preserving SkillAssignment[] arrays).
 */
function cleanForEmission(
  config: ProjectConfig,
  options: { dropProjects: boolean },
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = JSON.parse(JSON.stringify(config));
  if (options.dropProjects) {
    delete cleaned.projects;
  }
  if (cleaned.stack) {
    // Boundary cast: cleaned comes from JSON.parse(JSON.stringify(...)), so the stack
    // is a plain JSON record of agent -> category -> assignment arrays
    cleaned.stack = compactStackAssignments(
      cleaned.stack as Record<string, Record<string, unknown[]>>,
    );
  }
  return cleaned;
}

export function generateConfigSource(config: ProjectConfig, options?: ConfigSourceOptions): string {
  if (options?.isProjectConfig && options.globalConfig) {
    return generateProjectConfigWithInlinedGlobal(
      cleanForEmission(config, { dropProjects: true }),
      cleanForEmission(options.globalConfig, { dropProjects: true }),
    );
  }

  if (options?.isProjectConfig) {
    return generateProjectConfigWithGlobalImport(
      cleanForEmission(config, { dropProjects: true }),
      getGlobalConfigImportPath(),
    );
  }

  return generateStandaloneConfig(cleanForEmission(config, { dropProjects: false }));
}

/**
 * Generates a standalone config source with typed named variables above the export default.
 * The export default at the bottom acts as a table of contents, referencing the named variables.
 */
function generateStandaloneConfig(cleaned: Record<string, unknown>): string {
  const { skills, agents, stack, domains, selectedAgents } = extractConfigArrays(cleaned);

  const hasSkills = skills.length > 0;
  const hasAgents = agents.length > 0;
  const hasStack = stack != null && Object.keys(stack).length > 0;
  const hasDomains = domains.length > 0;
  const hasSelectedAgents = selectedAgents.length > 0;

  // Build type imports based on what's used
  const typeImports = buildTypeImports({
    hasSkills,
    hasAgents,
    hasStack,
    hasDomains,
    hasSelectedAgents,
  });

  const lines: string[] = [`import type { ${typeImports} } from "./config-types";`];

  // Add named variable declarations above the export default
  if (hasSkills) {
    lines.push(``);
    lines.push(`const skills: SkillConfig[] = [`);
    lines.push(skills.map(renderEntryLine).join("\n"));
    lines.push(`];`);
  }

  if (hasAgents) {
    lines.push(``);
    lines.push(`const agents: AgentScopeConfig[] = [`);
    lines.push(agents.map(renderEntryLine).join("\n"));
    lines.push(`];`);
  }

  if (hasStack) {
    lines.push(``);
    const stackBody = JSON.stringify(stack, null, 2);
    lines.push(`const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = ${stackBody};`);
  }

  if (hasDomains) {
    lines.push(``);
    const items = domains.map((d) => JSON.stringify(d)).join(", ");
    lines.push(`const domains: Domain[] = [${items}];`);
  }

  if (hasSelectedAgents) {
    lines.push(``);
    const items = selectedAgents.map((a) => JSON.stringify(a)).join(", ");
    lines.push(`const selectedAgents: SelectedAgentName[] = [${items}];`);
  }

  // Extracted fields reference their named variable (or an empty literal when the
  // variable was not emitted); `stack`/`selectedAgents` are omitted entirely when absent.
  const renderExportField = (key: string, value: unknown): string[] => {
    if (!EXTRACTED_FIELDS.has(key)) return [renderScalarField(key, value)];
    if (key === "skills") return [`  skills${hasSkills ? "" : ": []"},`];
    if (key === "agents") return [`  agents${hasAgents ? "" : ": []"},`];
    if (key === "stack") return hasStack ? [`  stack,`] : [];
    if (key === "domains") return [`  domains${hasDomains ? "" : ": []"},`];
    return hasSelectedAgents ? [`  selectedAgents,`] : [];
  };
  const exportFields = Object.entries(cleaned).flatMap(([key, value]) =>
    renderExportField(key, value),
  );

  lines.push(``);
  lines.push(`export default {`);
  lines.push(...exportFields);
  lines.push(`} satisfies ProjectConfig;`);

  lines.push(``);
  return lines.join("\n");
}

/**
 * Builds the type import list based on which extracted fields are present.
 * ProjectConfig is always included. Other types are included only when used.
 */
function buildTypeImports(flags: {
  hasSkills: boolean;
  hasAgents: boolean;
  hasStack: boolean;
  hasDomains: boolean;
  hasSelectedAgents?: boolean;
}): string {
  return [
    flags.hasDomains && "Domain",
    "ProjectConfig",
    flags.hasStack && "ProjectAgentName",
    (flags.hasStack || flags.hasSelectedAgents) && "SelectedAgentName",
    flags.hasAgents && "AgentScopeConfig",
    flags.hasSkills && "SkillConfig",
    flags.hasStack && "StackAgentConfig",
  ]
    .filter((t): t is string => Boolean(t))
    .join(", ");
}

/**
 * Generates a project config source that imports from the global config and extends it.
 * Typed named variables are declared above the export default. The export default at
 * the bottom acts as a table of contents. Arrays (skills, agents, domains) are spread
 * with globalConfig first, then project items.
 */
function generateProjectConfigWithGlobalImport(
  cleaned: Record<string, unknown>,
  globalImportPath: string,
): string {
  const importPath = `${globalImportPath}/config`;

  const { skills, agents, stack, domains, selectedAgents } = extractConfigArrays(cleaned);

  const hasProjectDomains = domains.length > 0;
  const hasStack = stack != null && Object.keys(stack).length > 0;
  const hasProjectSelectedAgents = selectedAgents.length > 0;

  // Build type imports
  const typeImports = buildTypeImports({
    hasSkills: true, // Always present (spread from global)
    hasAgents: true, // Always present (spread from global)
    hasStack,
    hasDomains: hasProjectDomains,
    hasSelectedAgents: hasProjectSelectedAgents,
  });

  const lines: string[] = [
    `import globalConfig from "${importPath}";`,
    `import type { ${typeImports} } from "./config-types";`,
  ];

  // Skills variable (always present with global spread)
  lines.push(``);
  const skillItems = skills.map(renderEntryLine).join("\n");
  lines.push(`const skills: SkillConfig[] = [`);
  lines.push(`  ...globalConfig.skills,`);
  if (skillItems) lines.push(skillItems);
  lines.push(`];`);

  // Agents variable (always present with global spread)
  lines.push(``);
  const agentItems = agents.map(renderEntryLine).join("\n");
  lines.push(`const agents: AgentScopeConfig[] = [`);
  lines.push(`  ...globalConfig.agents,`);
  if (agentItems) lines.push(agentItems);
  lines.push(`];`);

  // Stack variable (only if project has stack assignments)
  if (hasStack) {
    lines.push(``);
    const stackBody = JSON.stringify(stack, null, 2);
    lines.push(`const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = ${stackBody};`);
  }

  // Domains variable (only if project has domains)
  if (hasProjectDomains) {
    lines.push(``);
    const domainItems = domains.map(renderEntryLine).join("\n");
    lines.push(`const domains: Domain[] = [`);
    lines.push(`  ...(globalConfig.domains ?? []),`);
    if (domainItems) lines.push(domainItems);
    lines.push(`];`);
  }

  // selectedAgents variable (only if project has selectedAgents)
  if (hasProjectSelectedAgents) {
    lines.push(``);
    const items = selectedAgents.map((a) => JSON.stringify(a)).join(", ");
    lines.push(
      `const selectedAgents: SelectedAgentName[] = [...(globalConfig.selectedAgents ?? []), ${items}];`,
    );
  }

  // Build scalar fields (everything that isn't an extracted field or name)
  const scalarFields = Object.entries(cleaned)
    .filter(([key]) => !EXTRACTED_FIELDS.has(key) && key !== "name")
    .map(([key, value]) => renderScalarField(key, value))
    .join("\n");

  // Build export default (table of contents at bottom)
  const exportFields: string[] = [
    `  ...globalConfig,`,
    `  name: ${JSON.stringify(resolveProjectName(cleaned))},`,
    `  skills,`,
    `  agents,`,
    ...(hasStack ? [`  stack,`] : []),
    ...(hasProjectDomains ? [`  domains,`] : []),
    ...(hasProjectSelectedAgents ? [`  selectedAgents,`] : []),
    ...(scalarFields ? [scalarFields] : []),
  ];

  lines.push(``);
  lines.push(`export default {`);
  lines.push(...exportFields);
  lines.push(`} satisfies ProjectConfig;`);

  lines.push(``);
  return lines.join("\n");
}

/** Project configs never inherit "global" as their name from the globalConfig spread. */
function resolveProjectName(cleaned: Record<string, unknown>): unknown {
  return cleaned.name && cleaned.name !== "global" ? cleaned.name : DEFAULT_PLUGIN_NAME;
}

type InlinedGlobalPartition = {
  /** Global entries with active entries replaced by their project tombstones. */
  globalSkills: unknown[];
  globalAgents: unknown[];
  /** Active (non-excluded) project entries. */
  projectSkills: unknown[];
  projectAgents: unknown[];
  /** Project stack filtered to project-scoped agents only. */
  filteredStack: Record<string, unknown> | undefined;
  /** Merged unique global + project values. */
  domains: unknown[];
  selectedAgents: string[];
};

/**
 * Pure partition of project + global entries for the inlined snapshot.
 *
 * Excluded globals are routed to the project partition by splitConfigByScope,
 * but render under "// global" in the output for readability. When inlining,
 * active global entries are replaced by their excluded tombstones — the
 * tombstone masks the global entry for this project; the active project entry
 * (if any) appears separately in the project section. The project stack keeps
 * only project-scoped agents: global agents' stack entries live in the global
 * config only.
 */
function partitionInlinedConfigEntries(
  cleaned: Record<string, unknown>,
  cleanedGlobal: Record<string, unknown>,
): InlinedGlobalPartition {
  const project = extractConfigArrays(cleaned);
  const global = extractConfigArrays(cleanedGlobal);

  const isExcluded = (entry: unknown): boolean =>
    (entry as { excluded?: boolean }).excluded === true;
  const idOf = (entry: unknown): string => (entry as { id: string }).id;
  const nameOf = (entry: unknown): string => (entry as { name: string }).name;

  const excludedGlobalSkills = project.skills.filter(isExcluded);
  const excludedGlobalAgents = project.agents.filter(isExcluded);
  const projectSkills = project.skills.filter((s) => !isExcluded(s));
  const projectAgents = project.agents.filter((a) => !isExcluded(a));

  const excludedSkillIds = new Set(excludedGlobalSkills.map(idOf));
  const excludedAgentNames = new Set(excludedGlobalAgents.map(nameOf));
  const globalSkills = [
    ...global.skills.filter((s) => !excludedSkillIds.has(idOf(s))),
    ...excludedGlobalSkills,
  ];
  const globalAgents = [
    ...global.agents.filter((a) => !excludedAgentNames.has(nameOf(a))),
    ...excludedGlobalAgents,
  ];

  const projectAgentNames = new Set(projectAgents.map(nameOf));
  const filteredStack: Record<string, unknown> | undefined = project.stack
    ? Object.fromEntries(
        Object.entries(project.stack).filter(([agent]) => projectAgentNames.has(agent)),
      )
    : undefined;

  return {
    globalSkills,
    globalAgents,
    projectSkills,
    projectAgents,
    filteredStack,
    domains: [...new Set([...global.domains, ...project.domains])],
    selectedAgents: [...new Set([...global.selectedAgents, ...project.selectedAgents])],
  };
}

/**
 * Generates a project config with global skills/agents inlined directly.
 * No `import globalConfig` — the output is a self-contained readable snapshot.
 * Global items appear first with a `// global` comment, followed by project items
 * with a `// project` comment (only when project items exist).
 */
function generateProjectConfigWithInlinedGlobal(
  cleaned: Record<string, unknown>,
  cleanedGlobal: Record<string, unknown>,
): string {
  const partition = partitionInlinedConfigEntries(cleaned, cleanedGlobal);
  const { globalSkills, globalAgents, projectSkills, projectAgents, filteredStack } = partition;

  const hasGlobalSkills = globalSkills.length > 0;
  const hasProjectSkills = projectSkills.length > 0;
  const hasSkills = hasGlobalSkills || hasProjectSkills;

  const hasGlobalAgents = globalAgents.length > 0;
  const hasProjectAgents = projectAgents.length > 0;
  const hasAgents = hasGlobalAgents || hasProjectAgents;

  const hasStack = filteredStack != null && Object.keys(filteredStack).length > 0;
  const hasDomains = partition.domains.length > 0;
  const hasSelectedAgents = partition.selectedAgents.length > 0;

  const typeImports = buildTypeImports({
    hasSkills,
    hasAgents,
    hasStack,
    hasDomains,
    hasSelectedAgents,
  });

  const lines: string[] = [`import type { ${typeImports} } from "./config-types";`];

  // Skills variable
  if (hasSkills) {
    lines.push(``);
    lines.push(`const skills: SkillConfig[] = [`);
    lines.push(
      ...(hasGlobalSkills ? [`  // global`, ...globalSkills.map(renderEntryLine)] : []),
      ...(hasProjectSkills ? [`  // project`, ...projectSkills.map(renderEntryLine)] : []),
    );
    lines.push(`];`);
  }

  // Agents variable
  if (hasAgents) {
    lines.push(``);
    lines.push(`const agents: AgentScopeConfig[] = [`);
    lines.push(
      ...(hasGlobalAgents ? [`  // global`, ...globalAgents.map(renderEntryLine)] : []),
      ...(hasProjectAgents ? [`  // project`, ...projectAgents.map(renderEntryLine)] : []),
    );
    lines.push(`];`);
  }

  // Stack variable (project agents only)
  if (hasStack) {
    lines.push(``);
    const stackBody = JSON.stringify(filteredStack, null, 2);
    lines.push(`const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = ${stackBody};`);
  }

  // Domains variable
  if (hasDomains) {
    lines.push(``);
    const items = partition.domains.map((d) => JSON.stringify(d)).join(", ");
    lines.push(`const domains: Domain[] = [${items}];`);
  }

  // selectedAgents variable (merged global + project, deduplicated)
  if (hasSelectedAgents) {
    lines.push(``);
    const items = partition.selectedAgents.map((a) => JSON.stringify(a)).join(", ");
    lines.push(`const selectedAgents: SelectedAgentName[] = [${items}];`);
  }

  // Scalar fields: project values take precedence; global values emit first when not overridden
  const projectScalarFields = Object.entries(cleaned).filter(
    ([key]) => !EXTRACTED_FIELDS.has(key) && key !== "name",
  );
  const projectScalarKeys = new Set(projectScalarFields.map(([key]) => key));
  const globalScalarFields = Object.entries(cleanedGlobal).filter(
    ([key]) => !EXTRACTED_FIELDS.has(key) && key !== "name" && !projectScalarKeys.has(key),
  );

  const exportFields: string[] = [
    `  name: ${JSON.stringify(resolveProjectName(cleaned))},`,
    ...globalScalarFields.map(([key, value]) => renderScalarField(key, value)),
    ...projectScalarFields.map(([key, value]) => renderScalarField(key, value)),
    hasSkills ? `  skills,` : `  skills: [],`,
    hasAgents ? `  agents,` : `  agents: [],`,
    ...(hasStack ? [`  stack,`] : []),
    ...(hasDomains ? [`  domains,`] : []),
    ...(hasSelectedAgents ? [`  selectedAgents,`] : []),
  ];

  lines.push(``);
  lines.push(`export default {`);
  lines.push(...exportFields);
  lines.push(`} satisfies ProjectConfig;`);

  lines.push(``);
  return lines.join("\n");
}

/**
 * Compacts individual SkillAssignment objects within stack arrays
 * WITHOUT collapsing single-element arrays to bare values.
 * - { id: "...", preloaded: false } → "..." (bare string in array)
 * - { id: "...", preloaded: true } → { id: "...", preloaded: true } (preserved)
 *
 * This is used for the inlined TypeScript config path where arrays must remain
 * as arrays to satisfy the StackAgentConfig type (SkillAssignment[]).
 */
function compactAssignment(assignment: unknown): unknown {
  if (isSkillAssignment(assignment) && "preloaded" in assignment) {
    return assignment.preloaded ? { id: assignment.id, preloaded: true } : assignment.id;
  }
  return assignment;
}

function compactCategories(categories: Record<string, unknown[]>): Record<string, unknown[]> {
  return Object.fromEntries(
    Object.entries(categories)
      .filter(([, assignments]) => Array.isArray(assignments) && assignments.length > 0)
      .map(([category, assignments]) => [category, assignments.map(compactAssignment)]),
  );
}

function compactStackAssignments(
  stack: Record<string, Record<string, unknown[]>>,
): Record<string, Record<string, unknown[]>> {
  return Object.fromEntries(
    Object.entries(stack)
      .map(([agent, categories]) => [agent, compactCategories(categories)] as const)
      .filter(([, categories]) => Object.keys(categories).length > 0),
  );
}

/**
 * Returns the absolute path to the global .claude-src directory.
 * Used as the import path for project configs that extend global.
 */
export function getGlobalConfigImportPath(): string {
  return path.join(os.homedir(), CLAUDE_SRC_DIR);
}

/**
 * Generates a blank global config source (empty arrays, no import preamble).
 */
export function generateBlankGlobalConfigSource(): string {
  return `import type { ProjectConfig } from "./config-types";

export default {
  "name": "global",
  "skills": [],
  "agents": [],
  "domains": []
} satisfies ProjectConfig;\n`;
}

/**
 * Generates blank global config-types source (all types are `never`).
 */
export function generateBlankGlobalConfigTypesSource(): string {
  return `// AUTO-GENERATED by agentsinc — DO NOT EDIT

export type SkillId = never;

export type AgentName = never;

export type SelectedAgentName = never;

export type ProjectAgentName = SelectedAgentName;

export type Domain = never;

export type Category = never;

${PROJECT_CONFIG_TYPES_BEFORE}
export type StackAgentConfig = Partial<Record<Category, SkillAssignment[]>>;

${PROJECT_CONFIG_INTERFACE_AFTER}`;
}

/**
 * Ensures a blank global config exists at ~/.claude-src/.
 * Creates config.ts (empty arrays) and config-types.ts (never types) if they don't exist.
 * Returns true if files were created, false if they already existed.
 */
export async function ensureBlankGlobalConfig(): Promise<boolean> {
  const globalConfigDir = path.join(os.homedir(), CLAUDE_SRC_DIR);
  const configPath = path.join(globalConfigDir, STANDARD_FILES.CONFIG_TS);

  if (await fileExists(configPath)) {
    verbose("Global config already exists, skipping blank creation");
    return false;
  }

  await ensureDir(globalConfigDir);

  const configSource = generateBlankGlobalConfigSource();
  const typesSource = generateBlankGlobalConfigTypesSource();

  await writeFile(configPath, configSource);
  await writeFile(path.join(globalConfigDir, STANDARD_FILES.CONFIG_TYPES_TS), typesSource);

  verbose(`Created blank global config at ${globalConfigDir}`);
  return true;
}
