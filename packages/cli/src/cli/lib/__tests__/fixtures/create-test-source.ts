import path from "path";
import { mkdir, writeFile, readFile } from "fs/promises";
import { stringify as stringifyYaml } from "yaml";
import {
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  DEFAULT_PLUGIN_NAME,
  PLUGINS_SUBDIR,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts";
import type {
  AgentScopeConfig,
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
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { DEFAULT_TEST_AGENTS } from "../mock-data/mock-agents";

// Boundary widening: test fixtures use arbitrary skill IDs, categories, and domains for test isolation.
// Slugs and forkedFrom.skillId are narrowed to SkillSlug / SkillId; fictional values cast at definition site.
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
  /** Skip metadata.yaml creation for this local skill (for testing missing-metadata warnings) */
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

export type TestMatrix = {
  version: string;
  skills: Record<string, TestSkill>;
  categories: Record<string, { name: string; description: string }>;
  suggestedStacks: Array<{
    id: string;
    name: string;
    description: string;
    allSkillIds: string[];
  }>;
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
  matrix?: Partial<TestMatrix>;
  projectConfig?: TestProjectConfig;
  pluginManifest?: TestPluginManifest;
  /** Create as a plugin structure (in .claude/plugins/<plugin-name>) */
  asPlugin?: boolean;
  /** Create local skills in .claude/skills/ */
  localSkills?: TestSkill[];
  /** Create config/stacks.ts with these stack definitions */
  stacks?: TestStack[];
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

/**
 * Generates matrix representations from skill definitions:
 * 1. `testMatrix` — the internal TestMatrix used by test assertions
 * 2. `diskCategories` — a skill-categories.ts-compatible structure
 * 3. `diskRules` — a skill-rules.ts-compatible structure (empty relationships)
 *
 * The disk format requires `categories` as CategoryDefinition objects
 * keyed by valid Category values. Skill data is loaded separately
 * via `extractAllSkills`.
 */
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

function generateMatrix(
  skills: TestSkill[],
  overrides?: Partial<TestMatrix>,
): {
  testMatrix: TestMatrix;
  diskCategories: Record<string, unknown>;
  diskRules: Record<string, unknown>;
} {
  const skillsMap: Record<string, TestSkill> = Object.fromEntries(
    skills.map((skill) => [skill.id, skill]),
  );

  // Category keys are hyphen-separated and domain-prefixed (e.g., "web-framework", "api-api")
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

  const testMatrix: TestMatrix = {
    version: "1.0.0",
    skills: skillsMap,
    categories,
    suggestedStacks: [],
    ...overrides,
  };

  // Build skill-categories.ts-compatible structure for disk serialization.
  // Categories need full CategoryDefinition fields keyed by valid category enum values.
  // Skills carry their own category via metadata.yaml — these are only for UI grouping.
  const diskCategoriesMap: Record<string, Record<string, unknown>> = Object.fromEntries(
    Object.entries(categories).map(([category, cat], order) => [
      category,
      {
        id: category,
        displayName: cat.name,
        description: cat.description,
        domain: domainOf(category),
        exclusive: true,
        required: false,
        order,
      },
    ]),
  );

  const diskCategories = {
    version: "1.0.0",
    categories: diskCategoriesMap,
  };

  const diskRules = {
    version: "1.0.0",
    relationships: {
      conflicts: [],
      discourages: [],
      recommends: [],
      requires: [],
      alternatives: [],
    },
  };

  return { testMatrix, diskCategories, diskRules };
}

/**
 * Creates a complete test source directory structure with skills, agents,
 * categories/rules config, and optionally a plugin layout. Sets up temp
 * directories that must be cleaned up via cleanupTestSource.
 * @returns TestDirs containing all created directory paths for assertions
 */
export async function createTestSource(options: TestSourceOptions = {}): Promise<TestDirs> {
  const skills = options.skills ?? DEFAULT_TEST_SKILLS;
  const agents = options.agents ?? DEFAULT_TEST_AGENTS;
  const { diskCategories, diskRules } = generateMatrix(skills, options.matrix);

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
      // displayName is required by extractAllSkills for source-based matrix loading
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
    const projectClaudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);
    await mkdir(projectClaudeSrcDir, { recursive: true });
    await writeFile(
      path.join(projectClaudeSrcDir, STANDARD_FILES.CONFIG_TS),
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
        const localDomain = skill.domain;
        const metadata: Record<string, unknown> = {
          displayName: skill.id,
          author: skill.author,
          domain: localDomain,
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

export async function cleanupTestSource(dirs: TestDirs): Promise<void> {
  await cleanupTempDir(dirs.tempDir);
}

export async function readTestFile(filePath: string): Promise<string> {
  return readFile(filePath, "utf-8");
}

export { readTestYaml };

export async function readTestJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  // Boundary cast: JSON.parse returns `any`, caller provides expected type
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
