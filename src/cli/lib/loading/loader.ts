import { parse as parseYaml } from "yaml";
import path from "path";
import { unique } from "remeda";
import { getErrorMessage } from "../../utils/errors";
import { glob, readFile, directoryExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { CLAUDE_SRC_DIR, DIRS, STANDARD_FILES, PROJECT_ROOT } from "../../consts";
import type {
  AgentDefinition,
  AgentName,
  SkillDefinition,
  SkillDefinitionMap,
  SkillFrontmatter,
  SkillId,
} from "../../types";
import { formatZodIssues, skillFrontmatterLoaderSchema, agentYamlConfigSchema } from "../schemas";

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/;

export function parseFrontmatter(content: string, filePath?: string): SkillFrontmatter | null {
  const match = content.match(FRONTMATTER_REGEX);
  if (!match) return null;

  const yamlContent = match[1];
  const parsed = skillFrontmatterLoaderSchema.safeParse(parseYaml(yamlContent));

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
  const projectAgentsDir = path.join(projectRoot, CLAUDE_SRC_DIR, "agents");

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

async function buildIdToDirectoryPathMap(skillsDir: string): Promise<Record<string, string>> {
  const files = await glob("**/SKILL.md", skillsDir);
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
        const directoryPath = file.replace("/SKILL.md", "");
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
    const childSkills = Object.keys(idToDirectoryPath).filter((id) =>
      idToDirectoryPath[id].startsWith(`${skillId}/`),
    );
    if (childSkills.length === 0) {
      warn(`Unknown skill reference '${skillId}'`);
      return [];
    }
    verbose(`Expanded directory '${skillId}' to ${childSkills.length} skills`);
    // Boundary cast: keys from buildIdToDirectoryPathMap are SkillId values from frontmatter
    return childSkills as SkillId[];
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

export async function loadPluginSkills(
  pluginDir: string,
): Promise<Record<string, SkillDefinition>> {
  const skills: Record<string, SkillDefinition> = {};
  const pluginSkillsDir = path.join(pluginDir, "skills");

  if (!(await directoryExists(pluginSkillsDir))) {
    return skills;
  }

  const files = await glob("**/SKILL.md", pluginSkillsDir);

  for (const file of files) {
    const fullPath = path.join(pluginSkillsDir, file);
    const content = await readFile(fullPath);

    const frontmatter = parseFrontmatter(content, fullPath);
    if (!frontmatter) {
      warn(`Skipping '${file}': missing or invalid frontmatter`);
      continue;
    }

    const folderPath = file.replace("/SKILL.md", "");
    const skillPath = `skills/${folderPath}/`;
    const skillId = frontmatter.name;

    skills[skillId] = {
      id: skillId,
      path: skillPath,
      description: frontmatter.description,
    };

    verbose(`Loaded plugin skill: ${skillId} from ${file}`);
  }

  return skills;
}
