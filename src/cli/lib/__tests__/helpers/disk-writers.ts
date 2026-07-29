import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { stringify as stringifyYaml } from "yaml";
import {
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts";
import { matrix } from "../../matrix/matrix-provider";
import { getInstalledPluginsRegistryPath } from "../../plugins/plugin-settings";
import { typedEntries } from "../../../utils/typed-object";
import { computeSkillFolderHash } from "../../versioning";
import { renderSkillMd, renderAgentYaml } from "../content-generators";
import type { SkillId } from "../../../types";
import type { TestAgent, TestPluginManifest, TestSkill } from "../fixtures/create-test-source";
import type { ImportSourceSkill } from "../mock-data/mock-skills";

export async function writeTestSkill(
  skillsDir: string,
  skillId: SkillId,
  options?: {
    /** Extra fields to merge into metadata.yaml (e.g., forkedFrom, displayName) */
    extraMetadata?: Record<string, unknown>;
    /** Skip metadata.yaml creation entirely */
    skipMetadata?: boolean;
    /** Custom SKILL.md content (overrides default generated content) */
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
    const { slug, category, author } = skill;
    const domain = category.split("-")[0];

    const contentHash = await computeSkillFolderHash(skillDir);
    const baseMetadata = {
      author,
      category,
      domain,
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

/**
 * Creates a source-level skill directory with SKILL.md and rich metadata.yaml.
 * Use this when testing `extractAllSkills()` and `mergeMatrixWithSkills()`.
 *
 * Unlike `writeTestSkill()` which creates installed skills, this writes skills
 * in the source directory layout (under `src/skills/<domain>/<category>/<name>/`).
 */
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
    displayName: config.id,
    slug,
    category: config.category,
    domain,
    author: config.author ?? "@test",
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

/**
 * Writes a source-agent layout (metadata.yaml + identity.md + playbook.md) for
 * one TestAgent under a source `agents/` directory. Extracted verbatim from
 * createTestSource's agent loop — output is byte-identical.
 */
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

/**
 * Writes each skill of a local import source under `<projectDir>/<sourceName>/skills/`.
 * SKILL.md comes from `skill.content`; metadata.yaml is written only when present.
 */
export async function createImportSource(
  projectDir: string,
  sourceName: string,
  skills: ImportSourceSkill[],
): Promise<void> {
  const skillsDir = path.join(projectDir, sourceName, STANDARD_DIRS.SKILLS);

  for (const skill of skills) {
    const skillDir = path.join(skillsDir, skill.name);
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), skill.content);

    if (skill.metadata) {
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        stringifyYaml(skill.metadata),
      );
    }
  }
}

/**
 * Writes a claude CLI v2 plugin registry (`installed_plugins.json`) under
 * pluginsDir. Each entry maps a `<plugin>@<marketplace>` key to one user-scoped
 * install record per given installPath — the shape `claude plugin install`
 * (>=2.1.220) writes for its cache layout.
 */
export async function writeTestInstalledPluginsRegistry(
  pluginsDir: string,
  installPathsByKey: Record<string, string[]>,
): Promise<string> {
  const registry = {
    version: 2,
    plugins: Object.fromEntries(
      typedEntries(installPathsByKey).map(([pluginKey, installPaths]) => [
        pluginKey,
        installPaths.map((installPath) => ({
          scope: "user",
          installPath,
          version: "1.0.0",
          installedAt: "2026-01-01T00:00:00.000Z",
        })),
      ]),
    ),
  };

  const registryPath = getInstalledPluginsRegistryPath(pluginsDir);
  await mkdir(pluginsDir, { recursive: true });
  await writeFile(registryPath, JSON.stringify(registry, null, 2));
  return registryPath;
}

/**
 * Writes a plugin manifest (`.claude-plugin/plugin.json`) under pluginDir.
 * Defaults to pretty (2-space) JSON — matching createTestSource and the build
 * command tests; pass `{ pretty: false }` for the compact-form call sites.
 */
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
