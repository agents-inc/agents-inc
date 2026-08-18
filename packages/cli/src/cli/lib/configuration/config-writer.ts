import os from "os";
import path from "path";
import type { Category, ProjectConfig, SkillAssignment } from "../../types";
import { CLAUDE_SRC_DIR, DEFAULT_PLUGIN_NAME, GLOBAL_CONFIG_NAME } from "../../consts";
import { isSkillAssignment } from "../../utils/type-guards";
import { matrix } from "../matrix/matrix-provider";
import { assembleConfigTypesSource, STACK_AGENT_CONFIG_LOOSE_LINE } from "./config-types-writer";

/**
 * This module renders config sources; it writes nothing. The partial-config
 * writer and the blank-global-pair creator that used to live here are
 * `writeProjectPartial` and `ensureBlankPair` in `config-gate/`, which is the
 * only code allowed to put either half of the pair on disk.
 */

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
const EXTRACTED_FIELDS = new Set(["skills", "agents", "stack", "selectedDomains"]);

/**
 * The loader schema's own field order, which is the order a config read back off
 * disk arrives in. Emitting in it is what makes the writer a fixed point: the
 * three producers of an in-memory config — the wizard's literal, a Zod-parsed
 * load, a merge that appends at the tail — insert their keys in three different
 * orders, and without this the same values would emit as three different files.
 */
const CANONICAL_FIELD_ORDER = [
  "name",
  "description",
  "agents",
  "skills",
  "author",
  "selectedDomains",
  "stack",
  "marketplace",
  "marketplaceName",
  "agentsSource",
  "projects",
] as const satisfies readonly (keyof ProjectConfig)[];

const CANONICAL_FIELDS = new Set<string>(CANONICAL_FIELD_ORDER);

/**
 * The cleaned record rebuilt in canonical order. A key the schema does not name
 * is passthrough data the writer has no order of its own to impose, so those
 * keep the order they arrived in, after every field the schema does name.
 */
function canonicalizeFieldOrder(cleaned: Record<string, unknown>): Record<string, unknown> {
  const inSchemaOrder: [string, unknown][] = CANONICAL_FIELD_ORDER.filter(
    (key) => key in cleaned,
  ).map((key) => [key, cleaned[key]]);
  const passthrough = Object.entries(cleaned).filter(([key]) => !CANONICAL_FIELDS.has(key));

  return Object.fromEntries([...inSchemaOrder, ...passthrough]);
}

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
  selectedDomains: unknown[];
};

/** The four extracted array/stack fields of a cleaned config, defaulted for emission. */
function extractConfigArrays(cleaned: Record<string, unknown>): ConfigArrays {
  // Boundary cast: cleaned comes from JSON.parse(JSON.stringify(...)) so arrays are plain JSON
  // values. The `??` runs BEFORE the cast on purpose — `cleaned` is a Record of `unknown`, and
  // casting first would tell the checker the value is present when the round-trip drops any key
  // whose value was undefined.
  return {
    skills: (cleaned.skills ?? []) as unknown[],
    agents: (cleaned.agents ?? []) as unknown[],
    stack: cleaned.stack as Record<string, unknown> | undefined,
    selectedDomains: (cleaned.selectedDomains ?? []) as unknown[],
  };
}

/**
 * Generates a TypeScript config file source from a ProjectConfig object.
 * The export default sits at the top as a table of contents, with typed named
 * variables (skills, agents, stack, selectedDomains) declared below it.
 *
 * When `options.isProjectConfig` is true, the generated config imports from the global
 * config and spreads global arrays into skills, agents, and selectedDomains.
 */
/**
 * Shared pre-emission cleanup: JSON round-trip (drops undefined values), optional
 * `projects` removal (project configs never emit the global tracking list),
 * stack compaction (strip flag-less assignments to bare strings while preserving
 * SkillAssignment[] arrays), and canonical field ordering so the emitted bytes
 * are decided by the config's values alone.
 */
function cleanForEmission(
  config: ProjectConfig,
  options: { dropProjects: boolean },
): Record<string, unknown> {
  // Boundary cast: `JSON.parse` is typed `any`, and round-tripping an object always
  // yields one — dropping its undefined-valued keys is exactly why this is here.
  const cleaned = JSON.parse(JSON.stringify(config)) as Record<string, unknown>;
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
  return canonicalizeFieldOrder(cleaned);
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
  const { skills, agents, stack, selectedDomains } = extractConfigArrays(cleaned);

  const hasSkills = skills.length > 0;
  const hasAgents = agents.length > 0;
  const hasStack = stack != null && Object.keys(stack).length > 0;
  const hasSelectedDomains = selectedDomains.length > 0;

  // Build type imports based on what's used
  const typeImports = buildTypeImports({
    hasSkills,
    hasAgents,
    hasStack,
    hasSelectedDomains,
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

  if (hasSelectedDomains) {
    lines.push(``);
    const items = selectedDomains.map((d) => JSON.stringify(d)).join(", ");
    lines.push(`const selectedDomains: Domain[] = [${items}];`);
  }

  // Extracted fields reference their named variable (or an empty literal when the
  // variable was not emitted); `stack` is omitted entirely when absent.
  const renderExportField = (key: string, value: unknown): string[] => {
    if (!EXTRACTED_FIELDS.has(key)) return [renderScalarField(key, value)];
    if (key === "skills") return [`  skills${hasSkills ? "" : ": []"},`];
    if (key === "agents") return [`  agents${hasAgents ? "" : ": []"},`];
    if (key === "stack") return hasStack ? [`  stack,`] : [];
    return [`  selectedDomains${hasSelectedDomains ? "" : ": []"},`];
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
  hasSelectedDomains: boolean;
}): string {
  return [
    flags.hasSelectedDomains && "Domain",
    "ProjectConfig",
    flags.hasStack && "ProjectAgentName",
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
 * the bottom acts as a table of contents. Arrays (skills, agents, selectedDomains) are
 * spread with globalConfig first, then project items.
 */
function generateProjectConfigWithGlobalImport(
  cleaned: Record<string, unknown>,
  globalImportPath: string,
): string {
  const importPath = `${globalImportPath}/config`;

  const { skills, agents, stack, selectedDomains } = extractConfigArrays(cleaned);

  const hasProjectDomains = selectedDomains.length > 0;
  const hasStack = stack != null && Object.keys(stack).length > 0;

  // Build type imports
  const typeImports = buildTypeImports({
    hasSkills: true, // Always present (spread from global)
    hasAgents: true, // Always present (spread from global)
    hasStack,
    hasSelectedDomains: hasProjectDomains,
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

  // Selected domains variable (only if project has selected domains)
  if (hasProjectDomains) {
    lines.push(``);
    const domainItems = selectedDomains.map(renderEntryLine).join("\n");
    lines.push(`const selectedDomains: Domain[] = [`);
    lines.push(`  ...(globalConfig.selectedDomains ?? []),`);
    if (domainItems) lines.push(domainItems);
    lines.push(`];`);
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
    ...(hasProjectDomains ? [`  selectedDomains,`] : []),
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
  return cleaned.name && cleaned.name !== GLOBAL_CONFIG_NAME ? cleaned.name : DEFAULT_PLUGIN_NAME;
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
  selectedDomains: unknown[];
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
    selectedDomains: [...new Set([...global.selectedDomains, ...project.selectedDomains])],
  };
}

/**
 * Every scalar the inlined snapshot emits, as ONE canonically-ordered sequence.
 * The project's value wins where it carries one, and the global supplies the
 * rest. A global block followed by a project block could not promise this: the
 * first emission writes every global scalar into the project's own file, so on
 * the next re-emit those same keys arrive from the project half instead and two
 * blocks would order them differently for values that never changed.
 */
function mergeInlinedScalarFields(
  cleaned: Record<string, unknown>,
  cleanedGlobal: Record<string, unknown>,
): [string, unknown][] {
  return Object.entries(canonicalizeFieldOrder({ ...cleanedGlobal, ...cleaned })).filter(
    ([key]) => !EXTRACTED_FIELDS.has(key) && key !== "name",
  );
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
  const hasSelectedDomains = partition.selectedDomains.length > 0;

  const typeImports = buildTypeImports({
    hasSkills,
    hasAgents,
    hasStack,
    hasSelectedDomains,
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

  // Selected domains variable (merged global + project, deduplicated)
  if (hasSelectedDomains) {
    lines.push(``);
    const items = partition.selectedDomains.map((d) => JSON.stringify(d)).join(", ");
    lines.push(`const selectedDomains: Domain[] = [${items}];`);
  }

  const scalarFields = mergeInlinedScalarFields(cleaned, cleanedGlobal);

  const exportFields: string[] = [
    `  name: ${JSON.stringify(resolveProjectName(cleaned))},`,
    ...scalarFields.map(([key, value]) => renderScalarField(key, value)),
    hasSkills ? `  skills,` : `  skills: [],`,
    hasAgents ? `  agents,` : `  agents: [],`,
    ...(hasStack ? [`  stack,`] : []),
    ...(hasSelectedDomains ? [`  selectedDomains,`] : []),
  ];

  lines.push(``);
  lines.push(`export default {`);
  lines.push(...exportFields);
  lines.push(`} satisfies ProjectConfig;`);

  lines.push(``);
  return lines.join("\n");
}

/** True when the assignment asserts something a bare id could not say on its own. */
function carriesFlags(assignment: SkillAssignment): boolean {
  return Boolean(assignment.preloaded || assignment.local || assignment.path);
}

/**
 * Compacts one SkillAssignment down to the smallest form that still carries its information.
 * - { id: "..." } and { id: "...", preloaded: false } → "..." (the id says everything)
 * - anything carrying a flag (preloaded, local, path) keeps the object form, flags intact
 */
function compactAssignment(assignment: unknown): unknown {
  if (isSkillAssignment(assignment) && !carriesFlags(assignment)) return assignment.id;
  return assignment;
}

/**
 * True when the active matrix DECLARES this category as holding at most one skill. Read from the
 * matrix singleton so a source repo's category overrides are honoured. A category the matrix does
 * not declare is deliberately NOT treated as exclusive — the same rule local-installer applies.
 */
function isExclusiveCategory(category: string): boolean {
  // Boundary cast: category keys come from JSON-cleaned config data, not the Category union
  return matrix.categories[category as Category]?.exclusive === true;
}

/**
 * The emitted value for one category's assignments.
 *
 * An exclusive category can only ever hold one skill, so its array wrapper carries nothing the
 * reader needs and the bare value IS the assignment. Non-exclusive categories keep their array
 * even at length one — there the wrapper is load-bearing, because a second skill may join.
 *
 * Two skills in an exclusive category means the caller built something the config cannot express.
 * Dropping the extra would write a config that does not match what was selected, and nothing
 * downstream could tell, so it fails here instead.
 */
function compactCategoryAssignments(category: string, assignments: unknown[]): unknown {
  const compacted = assignments.map(compactAssignment);
  if (!isExclusiveCategory(category)) return compacted;

  if (compacted.length > 1) {
    throw new Error(
      `Category '${category}' is exclusive but holds ${compacted.length} skills: ${JSON.stringify(compacted)}`,
    );
  }
  return compacted[0];
}

function compactCategories(categories: Record<string, unknown[]>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(categories)
      .filter(([, assignments]) => Array.isArray(assignments) && assignments.length > 0)
      .map(([category, assignments]) => [
        category,
        compactCategoryAssignments(category, assignments),
      ]),
  );
}

function compactStackAssignments(
  stack: Record<string, Record<string, unknown[]>>,
): Record<string, Record<string, unknown>> {
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
  "name": "${GLOBAL_CONFIG_NAME}",
  "skills": [],
  "agents": [],
  "selectedDomains": []
} satisfies ProjectConfig;\n`;
}

/**
 * Generates blank global config-types source (all types are `never`).
 */
export function generateBlankGlobalConfigTypesSource(): string {
  return assembleConfigTypesSource({
    skillId: "never",
    agentName: "never",
    selectedAgentName: "never",
    projectAgentName: "SelectedAgentName",
    domain: "never",
    category: "never",
    stackAgentConfig: STACK_AGENT_CONFIG_LOOSE_LINE,
  });
}
