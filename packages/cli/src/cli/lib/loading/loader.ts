import { parse as parseYaml } from "yaml";
import path from "path";
import { unique } from "remeda";
import { getErrorMessage } from "../../utils/errors";
import { extractFrontmatter } from "../../utils/frontmatter";
import { glob, readFile, directoryExists, fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { CLAUDE_SRC_DIR, DIRS, STANDARD_DIRS, STANDARD_FILES, PROJECT_ROOT } from "../../consts";
import type {
  AgentDefinition,
  AgentName,
  SkillDefinition,
  SkillDefinitionMap,
  SkillFrontmatter,
  SkillId,
} from "../../types";
import { formatZodIssues, skillFrontmatterLoaderSchema, agentYamlConfigSchema } from "../schemas";
import { typedKeys } from "../../utils/typed-object";

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
): Promise<Record<AgentName, AgentDefinition>> {
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
        model: config.model,
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
): Promise<Record<AgentName, AgentDefinition>> {
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
): Promise<Record<AgentName, AgentDefinition>> {
  const [cliAgents, sourceAgents] = await Promise.all([
    loadAllAgents(PROJECT_ROOT),
    loadAllAgents(sourcePath),
  ]);
  return { ...cliAgents, ...sourceAgents };
}

export async function loadProjectAgents(
  projectRoot: string,
): Promise<Record<AgentName, AgentDefinition>> {
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

async function buildIdToDirectoryPathMap(
  skillsDir: string,
): Promise<Partial<Record<SkillId, string>>> {
  const files = await glob(`**/${STANDARD_FILES.SKILL_MD}`, skillsDir);
  const parsed = await Promise.all(
    files.map(async (file) => {
      const fullPath = path.join(skillsDir, file);
      return { file, frontmatter: parseFrontmatter(await readFile(fullPath), fullPath) };
    }),
  );

  // Each skill is reachable by its frontmatter name AND its directory path
  return Object.fromEntries(
    parsed
      .filter((entry): entry is { file: string; frontmatter: SkillFrontmatter } =>
        Boolean(entry.frontmatter?.name),
      )
      .flatMap(({ file, frontmatter }) => {
        const directoryPath = file.replace(`/${STANDARD_FILES.SKILL_MD}`, "");
        return [
          [frontmatter.name, directoryPath],
          [directoryPath, directoryPath],
        ];
      }),
  );
}

export async function loadSkillsByIds(
  skillIds: Array<{ id: SkillId }>,
  projectRoot: string,
): Promise<SkillDefinitionMap> {
  const skills: SkillDefinitionMap = {};
  const skillsDir = path.join(projectRoot, DIRS.skills);

  const idToDirectoryPath = await buildIdToDirectoryPathMap(skillsDir);

  /** A directory reference expands to every skill under it; warns when nothing matches. */
  const expandDirectoryRef = (skillId: SkillId): SkillId[] => {
    const childSkills = typedKeys(idToDirectoryPath).filter((id) =>
      idToDirectoryPath[id]?.startsWith(`${skillId}/`),
    );
    if (childSkills.length === 0) {
      warn(`Unknown skill reference '${skillId}'`);
      return [];
    }
    verbose(`Expanded directory '${skillId}' to ${childSkills.length} skills`);
    return childSkills;
  };

  const uniqueSkillIds = unique(
    skillIds.flatMap(({ id }) => (idToDirectoryPath[id] ? [id] : expandDirectoryRef(id))),
  );

  for (const skillId of uniqueSkillIds) {
    const directoryPath = idToDirectoryPath[skillId];
    if (!directoryPath) {
      warn(`Could not find skill '${skillId}': no matching skill found`);
      continue;
    }

    const skillPath = path.join(skillsDir, directoryPath);
    const skillMdPath = path.join(skillPath, STANDARD_FILES.SKILL_MD);

    try {
      const content = await readFile(skillMdPath);
      const frontmatter = parseFrontmatter(content, skillMdPath);

      if (!frontmatter) {
        warn(`Skipping '${skillId}': missing or invalid frontmatter`);
        continue;
      }

      const canonicalId = frontmatter.name;
      const skillDef: SkillDefinition = {
        id: canonicalId,
        path: `${DIRS.skills}/${directoryPath}/`,
        description: frontmatter.description,
      };

      skills[canonicalId] = skillDef;

      verbose(`Loaded skill: ${canonicalId} (from ${directoryPath})`);
    } catch (error) {
      warn(`Could not load skill '${skillId}': ${error}`);
    }
  }

  return skills;
}

export type LoadSkillsFromDirOptions = {
  /** Path prefix recorded on each skill's `path` (e.g. LOCAL_SKILLS_PATH or "skills"). */
  pathPrefix?: string;
  /**
   * When true, a SKILL.md without a sibling metadata.yaml is skipped with a warning
   * (local-skill registration rule). Plugin discovery passes false — plugin skills
   * carry no metadata.yaml.
   */
  requireMetadata?: boolean;
};

/**
 * Loads SKILL.md files from a directory, parsing frontmatter for skill metadata.
 * Returns a map of skillId -> SkillDefinition. Missing/invalid frontmatter and
 * per-file read errors are logged and skipped, never thrown.
 */
export async function loadSkillsFromDir(
  skillsDir: string,
  options: LoadSkillsFromDirOptions = {},
): Promise<SkillDefinitionMap> {
  const { pathPrefix = "", requireMetadata = false } = options;
  const skills: SkillDefinitionMap = {};

  if (!(await directoryExists(skillsDir))) {
    return skills;
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
      verbose(`  Failed to load skill: ${skillFile} - ${error}`);
    }
  }

  return skills;
}

/**
 * Loads skills from a plugin's `skills/` subdirectory. Plugin skills carry no
 * metadata.yaml, so metadata is not required here.
 */
export async function loadPluginSkills(pluginDir: string): Promise<SkillDefinitionMap> {
  return loadSkillsFromDir(path.join(pluginDir, "skills"), {
    pathPrefix: "skills",
    requireMetadata: false,
  });
}
