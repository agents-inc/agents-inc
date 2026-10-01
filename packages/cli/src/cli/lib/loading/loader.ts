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

/** A skill's metadata.yaml as the fields a skill is described by, or why it describes none. */
export type SkillMetadataRead =
  { usable: true; metadata: LocalRawMetadata } | { usable: false; reason: string };

/**
 * Reads one skill's metadata.yaml into the fields a skill is described by — the
 * metadata.yaml counterpart of {@link parseFrontmatter}.
 *
 * This is the single judgment of whether a metadata.yaml describes its skill, and
 * every pass that meets one shares it: `compile`'s skill discovery, the local-skill
 * discovery that feeds config-types generation, and `doctor`'s content layer. What
 * each does about a file that describes nothing differs — compile refuses the run,
 * discovery skips the skill, doctor reports it — but what they CALL describing does
 * not. Compile used to check only that the file existed, and then only that it
 * parsed, so it loaded from SKILL.md a skill the same run's config-types pass had
 * already skipped.
 *
 * Both ways of describing nothing are refused here: a file nothing can be parsed
 * out of, and a file that parses without the fields `localRawMetadataSchema`
 * requires. `doctor` layers its stricter published-skill checks on top of the
 * fields this returns; it does not disagree with them.
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
 * Whether this metadata names the `local` placeholder instead of a real category.
 *
 * `local` is a trapdoor rather than a category: it belongs to no domain, so a skill wearing it
 * joins no grid tab and is dropped from every sub-agent's stack. Both passes that read an
 * installed skill's metadata.yaml share this verdict — the local-skill discovery behind the
 * wizard's matrix, and the discovery behind `compile`'s skill count. One reader loading what the
 * other refused is what printed a discovery total beside a refusal about the same skill, in a
 * single run.
 *
 * The sibling of {@link readSkillMetadata}, one question over: that one asks whether the file
 * describes a skill at all, this one whether the skill it describes can be reached. A file can
 * pass the first and fail this, which is why the two verdicts are separate and why this one is
 * not repairable — nothing in the file is malformed.
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
  /** Label for the per-agent verbose line. */
  verboseLabel: string;
};

/**
 * The one sentence a user gets about an agent `metadata.yaml` this loader would not take.
 *
 * The path is the point: this is the last boundary that still knows which file the value came
 * from. Everything downstream reports against a compiled `.md` the user never wrote.
 */
function refusalOfAgentMetadata(metadataPath: string, reason: string): string {
  return `Skipping invalid ${STANDARD_FILES.AGENT_METADATA_YAML} at '${metadataPath}': ${reason}`;
}

// Boundary cast: agent keys come from agentYamlConfigSchema which types config.id as AgentName;
// custom agents (not in the union) are accepted by the schema's z.string() base
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
      // safeParse rather than parse: a ZodError's own message is a JSON dump of its issues, and
      // this warning is the only place a user is told which metadata.yaml is wrong and why.
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

/**
 * One parsed agent `metadata.yaml` as the definition the compiler reads, recording where it was
 * found: `file` is its path under the agents directory, whose parent becomes the agent's `path`.
 */
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
    // The rest of what `agent.liquid` reads. Spread conditionally, because the template
    // branches on presence — an explicit `undefined` renders as an empty frontmatter key.
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

/**
 * Loads agent definitions from the CLI repo and a skills source in parallel,
 * merged so source definitions take precedence on name collisions.
 */
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
    // The recorded base is the folder this scope is actually on, so an agent's `path` names a
    // directory the reader can open rather than the layout the product is moving to.
    agentBaseDir: `${sourceFolder.relName}/${STANDARD_DIRS.AGENTS}`,
    verboseLabel: "project agent",
  });
}

export type LoadSkillsFromDirOptions = {
  /** Path prefix recorded on each skill's `path` (e.g. LOCAL_SKILLS_PATH or "skills"). */
  pathPrefix?: string;
  /**
   * When true, a SKILL.md whose sibling metadata.yaml is missing, or present but
   * describing no skill, is skipped (local-skill registration rule). Plugin
   * discovery passes false — plugin skills carry no metadata.yaml.
   */
  requireMetadata?: boolean;
};

/** One skill directory whose metadata.yaml exists but describes no skill. */
export type UnusableSkillMetadata = {
  /** The skill's directory name, as it appears under `.claude/skills/`. */
  skillDirName: string;
  /** Absolute path to the offending metadata.yaml. */
  metadataPath: string;
  /** The YAML parser's own message, what the file holds instead of fields, or which fields it lacks. */
  reason: string;
};

export type LoadedSkills = {
  skills: SkillDefinitionMap;
  /**
   * Skill directories refused by {@link readSkillMetadata}. Only ever non-empty
   * under `requireMetadata` — a plugin skill carries no metadata.yaml to refuse.
   */
  unusableMetadata: UnusableSkillMetadata[];
};

/**
 * Loads SKILL.md files from a directory, parsing frontmatter for skill metadata.
 * Returns the skillId -> SkillDefinition map plus every skill directory whose
 * metadata.yaml describes no skill. Missing/invalid frontmatter and per-file read
 * errors are logged and skipped, never thrown.
 */
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

/** One SKILL.md the glob found, in each of the forms the loader reads or reports it by. */
type SkillLocation = {
  /** The SKILL.md relative to the skills directory, as the glob returned it. */
  skillFile: string;
  /** Absolute path to the SKILL.md. */
  skillMdPath: string;
  /** Absolute path to the directory holding it. */
  skillDir: string;
  /** That directory's own name. */
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

/**
 * What a skill's metadata.yaml says about loading it, under `requireMetadata`. Only an
 * `unusable` file is the caller's to report; a `skipped` skill is logged here and left out.
 */
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

  // A metadata.yaml that describes no skill is reported to the caller rather
  // than loaded around: the local-skill discovery behind config-types
  // generation refuses the same file, and compile refuses the whole run over it.
  const read = await readSkillMetadata(metadataPath);
  if (!read.usable) {
    verbose(`  Unusable ${STANDARD_FILES.METADATA_YAML} in '${skill.skillDirName}'`);
    return {
      kind: "unusable",
      refusal: { skillDirName: skill.skillDirName, metadataPath, reason: read.reason },
    };
  }

  // Skipped rather than reported, and silently: the file is intact, so there is nothing
  // here to repair or refuse a run over — and the sentence telling the user which field
  // to fix is `extractLocalSkill`'s, which every command reaching here also runs.
  if (namesPlaceholderCategory(read.metadata)) {
    verbose(`  Placeholder ${METADATA_KEYS.CATEGORY} in '${skill.skillDirName}'`);
    return { kind: "skipped" };
  }

  return { kind: "admitted" };
}

/**
 * The skill a SKILL.md defines, keyed by its frontmatter `name`, or undefined — logged, never
 * thrown — when the file cannot be read or names no skill.
 */
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

/**
 * Loads skills from a plugin's `skills/` subdirectory. Plugin skills carry no
 * metadata.yaml, so metadata is not required here — and nothing can be refused
 * for one, which is why only the skill map comes back.
 */
export async function loadPluginSkills(pluginDir: string): Promise<SkillDefinitionMap> {
  const { skills } = await loadSkillsFromDir(path.join(pluginDir, "skills"), {
    pathPrefix: "skills",
    requireMetadata: false,
  });
  return skills;
}
