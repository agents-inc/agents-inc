import { parse as parseYaml } from "yaml";
import path from "path";
import { getErrorMessage } from "../../utils/errors";
import { extractFrontmatter } from "../../utils/frontmatter";
import { glob, readFile, directoryExists, fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import {
  DIRS,
  LOCAL_PSEUDO_CATEGORY,
  STANDARD_DIRS,
  STANDARD_FILES,
  PROJECT_ROOT,
} from "../../consts";
import { providerInUse, sourceFolderInUse } from "../installation/install-layout";
import type {
  AgentDefinition,
  AgentName,
  AgentYamlConfig,
  SkillDefinition,
  SkillDefinitionMap,
  SkillFrontmatter,
} from "../../types";
import {
  describeMetadataSchemaFailure,
  formatZodIssues,
  localRawMetadataSchema,
  skillFrontmatterLoaderSchema,
  agentYamlConfigSchema,
} from "../schemas";
import type { LocalRawMetadata } from "../skills/local-skill-loader";
import { METADATA_KEYS } from "../metadata-keys";

export type SkillMetadataRead =
  { usable: true; metadata: LocalRawMetadata } | { usable: false; reason: string };

/**
 * The single judgment of whether a metadata.yaml describes its skill, shared by `compile`,
 * local-skill discovery and `doctor`. Refuses an unparseable file and one missing required fields.
 */
export async function readSkillMetadata(metadataPath: string): Promise<SkillMetadataRead> {
  let parsed: unknown;
  try {
    parsed = parseYaml(await readFile(metadataPath));
  } catch (error) {
    return { usable: false, reason: getErrorMessage(error) };
  }

  if (!isFieldMapping(parsed)) {
    return { usable: false, reason: `expected metadata fields, found ${nameYamlValue(parsed)}` };
  }

  const validated = localRawMetadataSchema.safeParse(parsed);
  if (!validated.success) {
    return { usable: false, reason: describeMetadataSchemaFailure(validated.error.issues, parsed) };
  }

  return { usable: true, metadata: validated.data };
}

/**
 * `local` belongs to no domain, so a skill wearing it is unreachable. Separate from
 * `readSkillMetadata`, and not repairable, because nothing in the file is malformed.
 */
export function namesPlaceholderCategory(metadata: LocalRawMetadata): boolean {
  return metadata.category === LOCAL_PSEUDO_CATEGORY;
}

function isFieldMapping(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Names what a metadata.yaml holds when it holds no fields — for the refusal's reason. */
function nameYamlValue(value: unknown): string {
  if (value === null || value === undefined) return "an empty file";
  if (Array.isArray(value)) return "a list";
  return `a ${typeof value}`;
}

export function parseFrontmatter(content: string, filePath?: string): SkillFrontmatter | null {
  const rawFrontmatter = extractFrontmatter(content);
  if (rawFrontmatter === null) return null;

  const parsed = skillFrontmatterLoaderSchema.safeParse(rawFrontmatter);

  if (!parsed.success) {
    const location = filePath ?? "unknown file";
    warn(`Invalid SKILL.md frontmatter in '${location}': ${formatZodIssues(parsed.error.issues)}`);
    return null;
  }
  return parsed.data;
}

type LoadAgentsFromDirOptions = {
  /** Relative base recorded on each definition (project agents live under the source folder's agents/). */
  agentBaseDir?: string;
  /** Propagate the `custom: true` metadata flag (source/CLI agents only). */
  includeCustomFlag?: boolean;
  verboseLabel: string;
};

/** Names the path: this is the last boundary that knows which file the value came from. */
function refusalOfAgentMetadata(metadataPath: string, reason: string): string {
  return `Skipping invalid ${STANDARD_FILES.AGENT_METADATA_YAML} at '${metadataPath}': ${reason}`;
}

async function loadAgentsFromDir(
  agentsDir: string,
  sourceRoot: string,
  options: LoadAgentsFromDirOptions,
): Promise<Partial<Record<AgentName, AgentDefinition>>> {
  const agents: Record<string, AgentDefinition> = {};
  const files = await glob(`**/${STANDARD_FILES.AGENT_METADATA_YAML}`, agentsDir);

  for (const file of files) {
    const fullPath = path.join(agentsDir, file);
    try {
      const content = await readFile(fullPath);
      // safeParse: a ZodError's message is a JSON dump, and this warning is the only report.
      const parsed = agentYamlConfigSchema.safeParse(parseYaml(content));
      if (!parsed.success) {
        warn(refusalOfAgentMetadata(fullPath, formatZodIssues(parsed.error.issues)));
        continue;
      }
      const config = parsed.data;

      agents[config.id] = toAgentDefinition(config, file, sourceRoot, options);
      verbose(`Loaded ${options.verboseLabel}: ${config.id} from ${file}`);
    } catch (error) {
      warn(refusalOfAgentMetadata(fullPath, getErrorMessage(error)));
    }
  }

  return agents;
}

/** `file` is the path under the agents directory; its parent becomes the agent's `path`. */
function toAgentDefinition(
  config: AgentYamlConfig,
  file: string,
  sourceRoot: string,
  options: LoadAgentsFromDirOptions,
): AgentDefinition {
  return {
    title: config.title,
    description: config.description,
    ...(config.model !== undefined && { model: config.model }),
    ...(config.effort !== undefined && { effort: config.effort }),
    tools: config.tools,
    // Spread conditionally: the template branches on presence; `undefined` renders a key.
    ...(config.disallowedTools !== undefined && {
      disallowedTools: config.disallowedTools,
    }),
    ...(config.permissionMode !== undefined && { permissionMode: config.permissionMode }),
    ...(config.isolation !== undefined && { isolation: config.isolation }),
    ...(config.hooks !== undefined && { hooks: config.hooks }),
    ...(config.experimental !== undefined && { experimental: config.experimental }),
    ...(config.outputFormat !== undefined && { outputFormat: config.outputFormat }),
    path: path.dirname(file),
    sourceRoot,
    ...(options.agentBaseDir ? { agentBaseDir: options.agentBaseDir } : {}),
    ...(config.domain ? { domain: config.domain } : {}),
    ...(options.includeCustomFlag && config.custom === true ? { custom: true } : {}),
  };
}

export async function loadAllAgents(
  projectRoot: string,
): Promise<Partial<Record<AgentName, AgentDefinition>>> {
  return loadAgentsFromDir(path.join(projectRoot, DIRS.agents), projectRoot, {
    includeCustomFlag: true,
    verboseLabel: "agent",
  });
}

/** Source definitions win name collisions. */
export async function loadMergedAgents(
  sourcePath: string,
): Promise<Partial<Record<AgentName, AgentDefinition>>> {
  const [cliAgents, sourceAgents] = await Promise.all([
    loadAllAgents(PROJECT_ROOT),
    loadAllAgents(sourcePath),
  ]);
  return { ...cliAgents, ...sourceAgents };
}

export async function loadProjectAgents(
  projectRoot: string,
): Promise<Partial<Record<AgentName, AgentDefinition>>> {
  const sourceFolder = sourceFolderInUse(projectRoot, providerInUse(projectRoot));
  const projectAgentsDir = path.join(sourceFolder.dir, STANDARD_DIRS.AGENTS);

  if (!(await directoryExists(projectAgentsDir))) {
    verbose(`No project agents directory at ${projectAgentsDir}`);
    const noAgents: Record<string, AgentDefinition> = {};
    return noAgents;
  }

  return loadAgentsFromDir(projectAgentsDir, projectRoot, {
    // The folder this scope is actually on, so `path` names a directory the reader can open.
    agentBaseDir: `${sourceFolder.relName}/${STANDARD_DIRS.AGENTS}`,
    verboseLabel: "project agent",
  });
}

export type LoadSkillsFromDirOptions = {
  /** Path prefix recorded on each skill's `path` (e.g. LOCAL_SKILLS_PATH or "skills"). */
  pathPrefix?: string;
  /**
   * Skip a SKILL.md whose metadata.yaml is missing or describes no skill; plugin skills carry none.
   */
  requireMetadata?: boolean;
};

export type UnusableSkillMetadata = {
  /** The skill's directory name, as it appears under `.claude/skills/`. */
  skillDirName: string;
  metadataPath: string;
  /** The YAML parser's own message, what the file holds instead of fields, or which fields it lacks. */
  reason: string;
};

export type LoadedSkills = {
  skills: SkillDefinitionMap;
  /** Only non-empty under `requireMetadata`. */
  unusableMetadata: UnusableSkillMetadata[];
};

/** Unreadable files and bad frontmatter are logged and skipped, never thrown. */
export async function loadSkillsFromDir(
  skillsDir: string,
  options: LoadSkillsFromDirOptions = {},
): Promise<LoadedSkills> {
  const { pathPrefix = "", requireMetadata = false } = options;
  const skills: SkillDefinitionMap = {};
  const unusableMetadata: UnusableSkillMetadata[] = [];

  if (!(await directoryExists(skillsDir))) {
    return { skills, unusableMetadata };
  }

  const skillFiles = await glob(`**/${STANDARD_FILES.SKILL_MD}`, skillsDir);

  for (const skillFile of skillFiles) {
    const skill = locateSkill(skillsDir, skillFile, pathPrefix);

    if (requireMetadata) {
      const verdict = await judgeSkillMetadata(skill);
      if (verdict.kind === "unusable") unusableMetadata.push(verdict.refusal);
      if (verdict.kind !== "admitted") continue;
    }

    const definition = await readSkillDefinition(skill);
    if (definition) skills[definition.id] = definition;
  }

  return { skills, unusableMetadata };
}

type SkillLocation = {
  skillFile: string;
  skillMdPath: string;
  skillDir: string;
  skillDirName: string;
  /** The `path` recorded on the skill: prefixed, relative, slash-terminated. */
  displayPath: string;
};

function locateSkill(skillsDir: string, skillFile: string, pathPrefix: string): SkillLocation {
  const skillMdPath = path.join(skillsDir, skillFile);
  const skillDir = path.dirname(skillMdPath);
  const relativePath = path.relative(skillsDir, skillDir);

  return {
    skillFile,
    skillMdPath,
    skillDir,
    skillDirName: path.basename(skillDir),
    displayPath: pathPrefix ? `${pathPrefix}/${relativePath}/` : `${relativePath}/`,
  };
}

/** Only an `unusable` file is the caller's to report; a `skipped` skill is logged here. */
type SkillMetadataVerdict =
  { kind: "admitted" } | { kind: "skipped" } | { kind: "unusable"; refusal: UnusableSkillMetadata };

async function judgeSkillMetadata(skill: SkillLocation): Promise<SkillMetadataVerdict> {
  const metadataPath = path.join(skill.skillDir, STANDARD_FILES.METADATA_YAML);
  if (!(await fileExists(metadataPath))) {
    warn(
      `Skill '${skill.skillDirName}' in '${skill.displayPath}' is missing ${STANDARD_FILES.METADATA_YAML} — skipped. Add ${STANDARD_FILES.METADATA_YAML} to register it with the CLI.`,
    );
    return { kind: "skipped" };
  }

  // Reported rather than loaded around: discovery and compile refuse the same file.
  const read = await readSkillMetadata(metadataPath);
  if (!read.usable) {
    verbose(`  Unusable ${STANDARD_FILES.METADATA_YAML} in '${skill.skillDirName}'`);
    return {
      kind: "unusable",
      refusal: { skillDirName: skill.skillDirName, metadataPath, reason: read.reason },
    };
  }

  // Skipped silently: the file is intact, and `extractLocalSkill` says which field to fix.
  if (namesPlaceholderCategory(read.metadata)) {
    verbose(`  Placeholder ${METADATA_KEYS.CATEGORY} in '${skill.skillDirName}'`);
    return { kind: "skipped" };
  }

  return { kind: "admitted" };
}

/** Undefined, and logged, when the file cannot be read or names no skill. */
async function readSkillDefinition(skill: SkillLocation): Promise<SkillDefinition | undefined> {
  try {
    const content = await readFile(skill.skillMdPath);
    const frontmatter = parseFrontmatter(content, skill.skillMdPath);

    if (!frontmatter?.name) {
      warn(`Skipping skill in '${skill.skillDirName}': missing or invalid frontmatter name`);
      return undefined;
    }

    const canonicalId = frontmatter.name;
    verbose(`  Loaded skill: ${canonicalId}`);
    return {
      id: canonicalId,
      path: skill.displayPath,
      description: frontmatter.description || "",
    };
  } catch (error) {
    verbose(`  Failed to load skill: ${skill.skillFile} - ${getErrorMessage(error)}`);
    return undefined;
  }
}

/** Plugin skills carry no metadata.yaml, so nothing can be refused and only the map comes back. */
export async function loadPluginSkills(pluginDir: string): Promise<SkillDefinitionMap> {
  const { skills } = await loadSkillsFromDir(path.join(pluginDir, "skills"), {
    pathPrefix: "skills",
    requireMetadata: false,
  });
  return skills;
}
