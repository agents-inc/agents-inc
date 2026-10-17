import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { stringify as stringifyYaml } from "yaml";
import {
  CLAUDE_DIR,
  DEFAULT_PLUGIN_NAME,
  PLUGINS_SUBDIR,
  STANDARD_DIRS,
  STANDARD_FILES,
  marketplaceManifestPath,
} from "../../../consts";
import type {
  AgentScopeConfig,
  CategoryDefinition,
  ExtractedSkillMetadata,
  SkillConfig,
  SkillId,
  SkillSlug,
} from "../../../types";
import { computeSkillFolderHash } from "../../versioning";
import { fileExists, directoryExists, createTempDir, cleanupTempDir } from "../test-fs-utils";
import { readTestYaml } from "../helpers/config-io.js";
import { writeSourceAgent, writeTestPluginManifest } from "../helpers/disk-writers.js";
import { renderSkillMd, renderConfigTs } from "../content-generators";
import { createMockMarketplace, createMockMarketplacePlugin } from "../factories/plugin-factories";
import type { SkillRulesFile } from "../content-generators";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { DEFAULT_TEST_AGENTS } from "../mock-data/mock-agents";
import { sourceFolderInUse } from "../../installation/install-layout.js";

// Fixtures name their own ids, categories and domains, so those widen to `string`.
export type TestSkill = Pick<
  ExtractedSkillMetadata,
  "description" | "author" | "displayName" | "usageGuidance"
> & {
  id: string;
  slug: SkillSlug;
  category: string;
  domain: string;
} & {
  content?: string;
  cliDescription?: string;
  skipMetadata?: boolean;
  forkedFrom?: {
    skillId: SkillId;
    contentHash: string;
    date: string;
  };
};

export type TestAgent = {
  name: string;
  title: string;
  description: string;
  tools?: string[];
  model?: string;
  permissionMode?: string;
  identityContent?: string;
  playbookContent?: string;
};

export type TestProjectConfig = {
  name: string;
  description?: string;
  agents?: AgentScopeConfig[];
  skills?: SkillConfig[];
  version?: string;
};

export type TestPluginManifest = {
  name: string;
  version?: string;
  description?: string;
  category?: string;
};

export type TestStack = {
  id: string;
  name: string;
  description: string;
  agents: Record<string, Record<string, string>>;
  philosophy?: string;
};

export type TestSourceOptions = {
  skills?: TestSkill[];
  agents?: TestAgent[];
  projectConfig?: TestProjectConfig;
  pluginManifest?: TestPluginManifest;
  /** Create as a plugin structure (in .claude/plugins/<plugin-name>) */
  asPlugin?: boolean;
  /** Create local skills in .claude/skills/ */
  localSkills?: TestSkill[];
  /** Create config/stacks.ts with these stack definitions */
  stacks?: TestStack[];
  /** Omit `.claude-plugin/marketplace.json`, as before `build marketplace`; loads refuse this. */
  unbuilt?: boolean;
};

export type TestDirs = {
  tempDir: string;
  projectDir: string;
  sourceDir: string;
  skillsDir: string;
  agentsDir: string;
  pluginDir?: string;
  configDir?: string;
};

export { fileExists, directoryExists };

/** `id` and `domain` widen for the same reason as `TestSkill`'s. */
type TestCategoryDefinition = Omit<CategoryDefinition, "id" | "domain"> & {
  id: string;
  domain: string;
};

/** The `config/skill-categories.ts` default export, in `skillCategoriesFileSchema`'s shape. */
type TestSkillCategoriesFile = {
  version: string;
  categories: Record<string, TestCategoryDefinition>;
};

/** Display-friendly category part after the domain prefix: "web-framework" -> "framework". */
function categoryPartOf(category: string): string {
  const dashIndex = category.indexOf("-");
  return dashIndex >= 0 ? category.slice(dashIndex + 1) : category;
}

/** Domain prefix of a category key: "web-framework" -> "web". */
function domainOf(category: string): string {
  const dashIndex = category.indexOf("-");
  return dashIndex >= 0 ? category.slice(0, dashIndex) : category;
}

/** The `config/skill-categories.ts` and `config/skill-rules.ts` exports for these skills. */
function generateMatrix(skills: TestSkill[]): {
  diskCategories: TestSkillCategoriesFile;
  diskRules: SkillRulesFile;
} {
  const uniqueCategories = [...new Set(skills.map((skill) => skill.category))];
  const categories: Record<string, { name: string; description: string }> = Object.fromEntries(
    uniqueCategories.map((category) => {
      const categoryPart = categoryPartOf(category);
      return [
        category,
        {
          name: categoryPart.charAt(0).toUpperCase() + categoryPart.slice(1),
          description: `${categoryPart} skills`,
        },
      ];
    }),
  );

  // The tuple annotation makes each entry a checked literal, so a stale field is flagged.
  const diskCategoriesMap: Record<string, TestCategoryDefinition> = Object.fromEntries(
    Object.entries(categories).map(([category, cat], order): [string, TestCategoryDefinition] => [
      category,
      {
        id: category,
        displayName: cat.name,
        description: cat.description,
        domain: domainOf(category),
        exclusive: true,
        order,
      },
    ]),
  );

  const diskCategories: TestSkillCategoriesFile = {
    version: "1.0.0",
    categories: diskCategoriesMap,
  };

  const diskRules: SkillRulesFile = {
    version: "1.0.0",
    relationships: {
      conflicts: [],
      discourages: [],
      requires: [],
      alternatives: [],
    },
  };

  return { diskCategories, diskRules };
}

/**
 * A custom marketplace may not ship catalogue ids, so loaded fixtures namespace theirs here. Avoids
 * "marketplace" and "source", which `search` would print and prose assertions would then match.
 */
export const TEST_MARKETPLACE_NAME = "test-fixture";

/** Only the id is namespaced; slugs and categories are already per-source. */
export function inTestMarketplace(skills: TestSkill[]): TestSkill[] {
  return skills.map((skill) => ({ ...skill, id: testMarketplaceSkillId(skill.id) }));
}

export function testMarketplaceSkillId(bareId: string): string {
  return `${TEST_MARKETPLACE_NAME}-${bareId}`;
}

/** Builds a source and project under a temp dir; pair with `cleanupTestSource`. */
export async function createTestSource(options: TestSourceOptions = {}): Promise<TestDirs> {
  const skills = options.skills ?? DEFAULT_TEST_SKILLS;
  const agents = options.agents ?? DEFAULT_TEST_AGENTS;
  const { diskCategories, diskRules } = generateMatrix(skills);

  const tempDir = await createTempDir("ai-test-");
  const projectDir = path.join(tempDir, "project");
  const sourceDir = path.join(tempDir, "source");
  const skillsDir = path.join(sourceDir, "src", "skills");
  const agentsDir = path.join(sourceDir, "src", "agents");
  const configDir = path.join(sourceDir, "config");

  await mkdir(projectDir, { recursive: true });
  await mkdir(skillsDir, { recursive: true });
  await mkdir(agentsDir, { recursive: true });
  await mkdir(configDir, { recursive: true });

  await writeFile(path.join(configDir, "skill-categories.ts"), renderConfigTs(diskCategories));
  await writeFile(path.join(configDir, "skill-rules.ts"), renderConfigTs(diskRules));

  if (options.stacks && options.stacks.length > 0) {
    await writeFile(path.join(configDir, "stacks.ts"), renderConfigTs({ stacks: options.stacks }));
  }

  if (!options.unbuilt) {
    await writeMarketplaceManifest(sourceDir, skills);
  }

  for (const skill of skills) {
    const skillDir = path.join(skillsDir, skill.category, skill.id);
    await mkdir(skillDir, { recursive: true });

    const content = skill.content ?? renderSkillMd(skill.id, skill.description);
    await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), content);

    const contentHash = await computeSkillFolderHash(skillDir);
    const domain = skill.domain;
    const slug = skill.slug;
    const metadata = {
      author: skill.author,
      category: skill.category,
      domain,
      // extractAllSkills requires displayName
      displayName: skill.id,
      slug,
      contentHash,
    };
    await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), stringifyYaml(metadata));
  }

  const templatesDir = path.join(agentsDir, "_templates");
  await mkdir(templatesDir, { recursive: true });

  const agentTemplate = `---
name: {{ agent.name }}
description: {{ agent.description }}
tools: {{ agent.tools | join: ", " }}
model: {{ agent.model }}
permissionMode: {{ agent.permissionMode }}
{% if agent.preloadedSkills %}skills: {{ agent.preloadedSkills | join: ", " }}{% endif %}
---

{% include "_partials/intro.liquid" %}

{% for skill in skills %}
{{ skill.content }}
{% endfor %}
`;
  await writeFile(path.join(templatesDir, "agent.liquid"), agentTemplate);

  for (const agent of agents) {
    await writeSourceAgent(agentsDir, agent);
  }

  const dirs: TestDirs = {
    tempDir,
    projectDir,
    sourceDir,
    skillsDir,
    agentsDir,
    configDir,
  };

  if (options.asPlugin) {
    const pluginDir = path.join(projectDir, CLAUDE_DIR, PLUGINS_SUBDIR, DEFAULT_PLUGIN_NAME);
    await mkdir(pluginDir, { recursive: true });
    await mkdir(path.join(pluginDir, "agents"), { recursive: true });
    await mkdir(path.join(pluginDir, STANDARD_DIRS.SKILLS), { recursive: true });

    const manifest = options.pluginManifest ?? {
      name: DEFAULT_PLUGIN_NAME,
      version: "1.0.0",
      description: "Test plugin",
    };
    await writeTestPluginManifest(pluginDir, manifest);

    for (const skill of skills) {
      const categoryPath = skill.category;
      const srcSkillDir = path.join(skillsDir, categoryPath, skill.id);
      const destSkillDir = path.join(pluginDir, STANDARD_DIRS.SKILLS, skill.id);
      await mkdir(destSkillDir, { recursive: true });

      const skillMdContent = await readFile(
        path.join(srcSkillDir, STANDARD_FILES.SKILL_MD),
        "utf-8",
      );
      await writeFile(path.join(destSkillDir, STANDARD_FILES.SKILL_MD), skillMdContent);

      const metadataContent = await readFile(
        path.join(srcSkillDir, STANDARD_FILES.METADATA_YAML),
        "utf-8",
      );
      await writeFile(path.join(destSkillDir, STANDARD_FILES.METADATA_YAML), metadataContent);
    }

    if (options.projectConfig) {
      await writeFile(
        path.join(pluginDir, STANDARD_FILES.CONFIG_TS),
        renderConfigTs(options.projectConfig),
      );
    }

    dirs.pluginDir = pluginDir;
  }

  if (options.projectConfig) {
    const projectSourceDir = sourceFolderInUse(projectDir, "claude").dir;
    await mkdir(projectSourceDir, { recursive: true });
    await writeFile(
      path.join(projectSourceDir, STANDARD_FILES.CONFIG_TS),
      renderConfigTs(options.projectConfig),
    );
  }

  if (options.localSkills && options.localSkills.length > 0) {
    const localSkillsDir = path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
    await mkdir(localSkillsDir, { recursive: true });

    for (const skill of options.localSkills) {
      const skillDir = path.join(localSkillsDir, skill.id);
      await mkdir(skillDir, { recursive: true });

      const content = skill.content ?? renderSkillMd(skill.id, skill.description);
      await writeFile(path.join(skillDir, STANDARD_FILES.SKILL_MD), content);

      if (!skill.skipMetadata) {
        // The fields every product path writes; `compile` refuses a local skill without them.
        const metadata: Record<string, unknown> = {
          displayName: skill.id,
          author: skill.author,
          domain: skill.domain,
          category: skill.category,
          slug: skill.slug,
        };
        if (skill.forkedFrom) {
          metadata.forkedFrom = skill.forkedFrom;
        }
        await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), stringifyYaml(metadata));
      }
    }
  }

  return dirs;
}

/** One plugin per skill, as `build marketplace` writes; the schema refuses an empty listing. */
async function writeMarketplaceManifest(sourceDir: string, skills: TestSkill[]): Promise<void> {
  const manifestPath = marketplaceManifestPath(sourceDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...createMockMarketplace(skills.map((skill) => createMockMarketplacePlugin(skill.id))),
      name: TEST_MARKETPLACE_NAME,
    }),
  );
}

/**
 * Accepts `undefined`: a `beforeAll` can throw before assigning `dirs`, and a TypeError here would
 * mask that failure.
 */
export async function cleanupTestSource(dirs: TestDirs | undefined): Promise<void> {
  if (dirs !== undefined) await cleanupTempDir(dirs.tempDir);
}

export async function readTestFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

export { readTestYaml };

export async function readTestJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  // JSON.parse returns `any`; the caller names the type
  return JSON.parse(content) as T;
}

export async function writeTestFile(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

export async function writeTestYaml(filePath: string, data: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, stringifyYaml(data));
}
