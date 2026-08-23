import { parse as parseYaml } from "yaml";
import path from "path";
import { getErrorMessage } from "../../utils/errors";
import { extractFrontmatter } from "../../utils/frontmatter";
import { glob, readFile, directoryExists, fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import {
  CLAUDE_SRC_DIR,
  DIRS,
  LOCAL_PSEUDO_CATEGORY,
  STANDARD_DIRS,
  STANDARD_FILES,
  PROJECT_ROOT,
} from "../../consts";
import type { AgentDefinition, AgentName, SkillDefinitionMap, SkillFrontmatter } from "../../types";
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
  /** Relative base recorded on each definition (project agents live under .claude-src/agents). */
  agentBaseDir?: string;
  /** Propagate the `custom: true` metadata flag (source/CLI agents only). */
  includeCustomFlag?: boolean;
  /** Label for the per-agent verbose line. */
  verboseLabel: string;
};

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
      const config = agentYamlConfigSchema.parse(parseYaml(content));

      agents[config.id] = {
        title: config.title,
        description: config.description,
        ...(config.model !== undefined && { model: config.model }),
        tools: config.tools,
        path: path.dirname(file),
        sourceRoot,
        ...(options.agentBaseDir ? { agentBaseDir: options.agentBaseDir } : {}),
        ...(config.domain ? { domain: config.domain } : {}),
        ...(options.includeCustomFlag && config.custom === true ? { custom: true } : {}),
      };

      verbose(`Loaded ${options.verboseLabel}: ${config.id} from ${file}`);
    } catch (error) {
      warn(`Skipping invalid metadata.yaml at '${fullPath}': ${getErrorMessage(error)}`);
    }
  }

  return agents;
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
  const projectAgentsDir = path.join(projectRoot, CLAUDE_SRC_DIR, STANDARD_DIRS.AGENTS);

  if (!(await directoryExists(projectAgentsDir))) {
    verbose(`No project agents directory at ${projectAgentsDir}`);
    const noAgents: Record<string, AgentDefinition> = {};
    return noAgents;
  }

  return loadAgentsFromDir(projectAgentsDir, projectRoot, {
    // Project agents are in .claude-src/agents/
    agentBaseDir: `${CLAUDE_SRC_DIR}/agents`,
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
    const skillPath = path.join(skillsDir, skillFile);
    const skillDir = path.dirname(skillPath);
    const relativePath = path.relative(skillsDir, skillDir);
    const skillDirName = path.basename(skillDir);
    const displayPath = pathPrefix ? `${pathPrefix}/${relativePath}/` : `${relativePath}/`;

    if (requireMetadata) {
      const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
      if (!(await fileExists(metadataPath))) {
        warn(
          `Skill '${skillDirName}' in '${displayPath}' is missing ${STANDARD_FILES.METADATA_YAML} — skipped. Add ${STANDARD_FILES.METADATA_YAML} to register it with the CLI.`,
        );
        continue;
      }

      // A metadata.yaml that describes no skill is reported to the caller rather
      // than loaded around: the local-skill discovery behind config-types
      // generation refuses the same file, and compile refuses the whole run over it.
      const read = await readSkillMetadata(metadataPath);
      if (!read.usable) {
        unusableMetadata.push({ skillDirName, metadataPath, reason: read.reason });
        verbose(`  Unusable ${STANDARD_FILES.METADATA_YAML} in '${skillDirName}'`);
        continue;
      }

      // Skipped rather than reported, and silently: the file is intact, so there is nothing
      // here to repair or refuse a run over — and the sentence telling the user which field
      // to fix is `extractLocalSkill`'s, which every command reaching here also runs.
      if (namesPlaceholderCategory(read.metadata)) {
        verbose(`  Placeholder ${METADATA_KEYS.CATEGORY} in '${skillDirName}'`);
        continue;
      }
    }

    try {
      const content = await readFile(skillPath);
      const frontmatter = parseFrontmatter(content, skillPath);

      if (!frontmatter?.name) {
        warn(`Skipping skill in '${skillDirName}': missing or invalid frontmatter name`);
        continue;
      }

      const canonicalId = frontmatter.name;
      skills[canonicalId] = {
        id: canonicalId,
        path: displayPath,
        description: frontmatter.description || "",
      };

      verbose(`  Loaded skill: ${canonicalId}`);
    } catch (error) {
      verbose(`  Failed to load skill: ${skillFile} - ${getErrorMessage(error)}`);
    }
  }

  return { skills, unusableMetadata };
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
