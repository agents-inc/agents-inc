import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { stringify as stringifyYaml } from "yaml";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE, STANDARD_FILES } from "../../../consts";
import { matrix } from "../../matrix/matrix-provider";
import { getInstalledPluginsRegistryPath } from "../../plugins/plugin-settings";
import { typedEntries } from "../../../utils/typed-object";
import { computeSkillFolderHash } from "../../versioning";
import { renderSkillMd, renderAgentYaml } from "../content-generators";
import {
  buildUserPluginInstallation,
  renderInstalledPluginsRegistry,
} from "../factories/plugin-registry-factories";
import type { SkillId } from "../../../types";
import type { TestAgent, TestPluginManifest, TestSkill } from "../fixtures/create-test-source";

export async function writeTestSkill(
  skillsDir: string,
  skillId: SkillId,
  options?: {
    extraMetadata?: Record<string, unknown>;
    skipMetadata?: boolean;
    skillContent?: string;
  },
): Promise<string> {
  const skill = matrix.skills[skillId];

  if (!options?.skipMetadata && !skill) {
    throw new Error(
      `writeTestSkill: "${skillId}" not found in matrix store — populate the store in beforeEach`,
    );
  }

  const skillDir = path.join(skillsDir, skillId);
  await mkdir(skillDir, { recursive: true });

  await writeFile(
    path.join(skillDir, STANDARD_FILES.SKILL_MD),
    options?.skillContent ?? renderSkillMd(skillId, skill?.description),
  );

  if (!options?.skipMetadata && skill) {
    const { slug, category, author, displayName } = skill;
    const domain = category.split("-")[0];

    const contentHash = await computeSkillFolderHash(skillDir);
    const baseMetadata = {
      author,
      category,
      domain,
      displayName,
      slug,
      contentHash,
    };
    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      stringifyYaml({ ...baseMetadata, ...options?.extraMetadata }),
    );
  }

  return skillDir;
}

/** Writes a skill in the source layout, where `writeTestSkill` writes an installed one. */
export async function writeSourceSkill(
  skillsDir: string,
  directoryPath: string,
  config: TestSkill,
): Promise<string> {
  const skillDir = path.join(skillsDir, directoryPath);
  await mkdir(skillDir, { recursive: true });

  await writeFile(
    path.join(skillDir, STANDARD_FILES.SKILL_MD),
    renderSkillMd(config.id, config.description),
  );

  const domain = config.domain;
  const slug = config.slug;
  const metadata: Record<string, unknown> = {
    displayName: config.displayName,
    slug,
    category: config.category,
    domain,
    author: config.author,
  };

  await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), stringifyYaml(metadata));

  return skillDir;
}

export async function writeTestAgent(
  agentsDir: string,
  agentName: string,
  options?: { description?: string },
): Promise<string> {
  const agentDir = path.join(agentsDir, agentName);
  await mkdir(agentDir, { recursive: true });

  await writeFile(
    path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
    renderAgentYaml(agentName, options?.description),
  );

  return agentDir;
}

export async function writeSourceAgent(agentsDir: string, agent: TestAgent): Promise<string> {
  const agentDir = path.join(agentsDir, agent.name);
  await mkdir(agentDir, { recursive: true });

  const agentYaml = {
    id: agent.name,
    title: agent.title,
    description: agent.description,
    tools: agent.tools ?? ["Read", "Write", "Edit"],
    model: agent.model ?? "opus",
    permissionMode: agent.permissionMode ?? "default",
  };
  await writeFile(
    path.join(agentDir, STANDARD_FILES.AGENT_METADATA_YAML),
    stringifyYaml(agentYaml),
  );

  await writeFile(
    path.join(agentDir, STANDARD_FILES.IDENTITY_MD),
    agent.identityContent ?? `# ${agent.title}\n\n${agent.description}`,
  );

  await writeFile(
    path.join(agentDir, STANDARD_FILES.PLAYBOOK_MD),
    agent.playbookContent ?? "## Workflow\n\n1. Analyze\n2. Implement",
  );

  return agentDir;
}

/** One user-scoped install record per installPath, keyed `<plugin>@<marketplace>`. */
export async function writeTestInstalledPluginsRegistry(
  pluginsDir: string,
  installPathsByKey: Record<string, string[]>,
): Promise<string> {
  const plugins = Object.fromEntries(
    typedEntries(installPathsByKey).map(([pluginKey, installPaths]) => [
      pluginKey,
      installPaths.map((installPath) => buildUserPluginInstallation(installPath)),
    ]),
  );

  const registryPath = getInstalledPluginsRegistryPath(pluginsDir);
  await mkdir(pluginsDir, { recursive: true });
  await writeFile(registryPath, renderInstalledPluginsRegistry(plugins));
  return registryPath;
}

export async function writeTestPluginManifest(
  pluginDir: string,
  manifest: TestPluginManifest,
  options?: { pretty?: boolean },
): Promise<string> {
  const manifestDir = path.join(pluginDir, PLUGIN_MANIFEST_DIR);
  await mkdir(manifestDir, { recursive: true });
  const manifestPath = path.join(manifestDir, PLUGIN_MANIFEST_FILE);
  const json =
    options?.pretty === false ? JSON.stringify(manifest) : JSON.stringify(manifest, null, 2);
  await writeFile(manifestPath, json);
  return manifestPath;
}
