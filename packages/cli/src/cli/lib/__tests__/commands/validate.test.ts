import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TEST_SOURCE_URL } from "../test-constants.js";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { stringify as stringifyYaml } from "yaml";
import { runCliCommand } from "../helpers/cli-runner.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import {
  writeTestInstalledPluginsRegistry,
  writeTestPluginManifest,
} from "../helpers/disk-writers.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { validateSource } from "../../source-validator";
import { getInstalledPluginsRegistryPath } from "../../plugins/plugin-settings";
import { validatePlugin } from "../../plugins/plugin-validator";
import {
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  PLUGINS_SUBDIR,
  CLAUDE_DIR,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../../consts";
import type { TestSkill } from "../fixtures/create-test-source";
import { renderAgentMd, renderConfigTs, renderSkillMd } from "../content-generators";
import {
  VALID_EMBEDDED_SKILL_METADATA_FILE,
  VALID_SKILL_CATEGORIES_FILE,
  VALID_SKILL_RULES_FILE,
} from "../mock-data/mock-source-files.js";
import { EXIT_CODES } from "../../exit-codes";

const INSTALLED_SKILLS_SUBDIR = path.join(CLAUDE_DIR, STANDARD_DIRS.SKILLS);
const INSTALLED_AGENTS_SUBDIR = path.join(CLAUDE_DIR, "agents");

/** Write a valid installed skill under `<skillsDir>/<dirName>/` with strict-schema metadata. */
async function writeValidInstalledSkill(
  skillsDir: string,
  dirName: string,
  overrides?: Record<string, unknown>,
): Promise<void> {
  const skillDir = path.join(skillsDir, dirName);
  await mkdir(skillDir, { recursive: true });

  await writeFile(
    path.join(skillDir, STANDARD_FILES.SKILL_MD),
    renderSkillMd("web-framework-react", "React framework"),
  );

  const metadata: Record<string, unknown> = {
    ...VALID_EMBEDDED_SKILL_METADATA_FILE,
    domain: "web",
    ...overrides,
  };

  await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), stringifyYaml(metadata));
}

/** Write a valid installed agent `.md` file with real markdown frontmatter. */
async function writeValidInstalledAgent(
  agentsDir: string,
  name: string,
  overrides?: { description?: string; tools?: string[]; rawFrontmatter?: Record<string, unknown> },
): Promise<void> {
  await mkdir(agentsDir, { recursive: true });
  const filePath = path.join(agentsDir, `${name}.md`);

  if (overrides?.rawFrontmatter) {
    const frontmatterYaml = stringifyYaml(overrides.rawFrontmatter);
    await writeFile(filePath, `---\n${frontmatterYaml}---\n\n# ${name}\n`);
    return;
  }

  await writeFile(
    filePath,
    renderAgentMd(name, overrides?.description, { tools: overrides?.tools }),
  );
}

const REACT_SOURCE_SKILL: TestSkill = {
  id: "web-framework-react",
  description: "React framework",
  category: "web-framework",
  domain: "web",
  displayName: "react",
  cliDescription: "React JavaScript framework",
  usageGuidance: "Use React for building component-based UIs",
  slug: "react",
  author: "@test",
};

/**
 * Creates a valid skill directory with full metadata.yaml fields
 * that pass the strict metadataValidationSchema.
 */
async function writeValidSourceSkill(
  skillsDir: string,
  dirPath: string,
  config: TestSkill,
): Promise<void> {
  const skillDir = path.join(skillsDir, dirPath);
  await mkdir(skillDir, { recursive: true });

  await writeFile(
    path.join(skillDir, STANDARD_FILES.SKILL_MD),
    renderSkillMd(config.id, config.description),
  );

  const domain = config.domain;
  const slug = config.slug;
  const metadata: Record<string, unknown> = {
    category: config.category,
    domain,
    author: config.author ?? "@test",
    displayName: config.displayName,
    cliDescription: config.cliDescription,
    usageGuidance: config.usageGuidance,
    slug,
  };

  await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), stringifyYaml(metadata));
}

/** Creates minimal skill-categories.ts and skill-rules.ts with the given categories */
async function writeTestMatrix(
  configDir: string,
  categories: Record<string, { domain: string; displayName: string }>,
): Promise<void> {
  const matrixCategories: Record<string, Record<string, unknown>> = Object.fromEntries(
    Object.entries(categories).map(([id, cat], order) => [
      id,
      {
        id,
        displayName: cat.displayName,
        description: `${cat.displayName} skills`,
        domain: cat.domain,
        exclusive: true,
        required: false,
        order,
      },
    ]),
  );

  const categoriesData = { ...VALID_SKILL_CATEGORIES_FILE, categories: matrixCategories };
  await writeFile(path.join(configDir, "skill-categories.ts"), renderConfigTs(categoriesData));

  const rulesData = {
    ...VALID_SKILL_RULES_FILE,
    relationships: {
      conflicts: [],
      discourages: [],
      recommends: [],
      requires: [],
      alternatives: [],
    },
  };
  await writeFile(path.join(configDir, "skill-rules.ts"), renderConfigTs(rulesData));
}

/** Build a valid minimal source at the given path. */
async function buildValidSource(sourceDir: string): Promise<void> {
  const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
  const configDir = path.join(sourceDir, "config");
  await mkdir(configDir, { recursive: true });

  // Directory name equals the skill id (marketplace convention) so the source is warning-free
  await writeValidSourceSkill(skillsDir, "web-framework-react", REACT_SOURCE_SKILL);

  await writeTestMatrix(configDir, {
    "web-framework": { domain: "web", displayName: "Framework" },
  });
}

/** Build a source with a metadata schema violation (missing required fields). */
async function buildInvalidSource(sourceDir: string): Promise<void> {
  const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
  const skillDir = path.join(skillsDir, "web", "framework", "react");
  await mkdir(skillDir, { recursive: true });

  await writeFile(
    path.join(skillDir, STANDARD_FILES.SKILL_MD),
    renderSkillMd("web-framework-react", "React"),
  );

  // Missing required fields: displayName, cliDescription, usageGuidance, slug
  await writeFile(
    path.join(skillDir, STANDARD_FILES.METADATA_YAML),
    stringifyYaml({ category: "web-framework", author: "@test" }),
  );
}

/**
 * Standard arrange: builds a valid minimal source under `<tempDir>/source` and
 * registers it as the project's primary source in an otherwise-empty config.
 * Returns the source directory.
 */
async function setupValidatedProject(tempDir: string, projectDir: string): Promise<string> {
  const sourceDir = path.join(tempDir, "source");
  await buildValidSource(sourceDir);
  await writeTestTsConfig(projectDir, {
    name: "test-project",
    skills: [],
    agents: [],
    source: sourceDir,
  });
  return sourceDir;
}

describe("validate command", () => {
  let tempDir: string;
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-validate-test-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("no-args flow", () => {
    it("should iterate over the registered primary source and exit 0 when it is valid", async () => {
      const sourceDir = await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Validating sources");
      expect(stdout).toContain("Validating plugins");
      expect(stdout).toContain("Result: 0 error(s), 0 warning(s)");
      expect(stdout).toContain(sourceDir);
    });

    it("should exit with ERROR when the primary source has validation errors", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildInvalidSource(sourceDir);
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        source: sourceDir,
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Validating sources");
      expect(stdout).toMatch(/Result: [1-9]\d* error\(s\)/);
    });

    it("should iterate over plugin directories and report when absent", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Validating plugins");
      expect(stdout).toContain("not present");
    });

    it("should iterate over installed plugins when present", async () => {
      await setupValidatedProject(tempDir, projectDir);

      // Create a plugin in the project's .claude/plugins/ directory
      const pluginDir = path.join(projectDir, CLAUDE_DIR, PLUGINS_SUBDIR, "my-plugin");
      await writeTestPluginManifest(
        pluginDir,
        { name: "my-plugin", version: "1.0.0" },
        { pretty: false },
      );

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Validating plugins");
      expect(stdout).toContain("1 plugin(s)");
      expect(stdout).toContain("my-plugin");
    });

    it("should surface plugin errors in the aggregate exit code", async () => {
      await setupValidatedProject(tempDir, projectDir);

      // Create a plugin with malformed plugin.json — validator should report it as invalid
      const pluginDir = path.join(projectDir, CLAUDE_DIR, PLUGINS_SUBDIR, "broken-plugin");
      const manifestDir = path.join(pluginDir, PLUGIN_MANIFEST_DIR);
      await mkdir(manifestDir, { recursive: true });
      await writeFile(path.join(manifestDir, PLUGIN_MANIFEST_FILE), "{ not valid json !!!");

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Validating plugins");
    });

    it("should skip remote sources and not count them as errors", async () => {
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        source: TEST_SOURCE_URL,
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Validating sources");
      expect(stdout).toContain("— skipped (remote source)");
      expect(stdout).toContain("github:agents-inc/skills");
      expect(stdout).toContain("Result: 0 error(s), 0 warning(s)");
    });

    it("should continue past one broken skill and report valid skills in the same pass", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      // One valid skill alongside one broken skill in the same directory.
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react");
      const brokenSkillDir = path.join(globalSkillsDir, "web-framework-vue");
      await mkdir(brokenSkillDir, { recursive: true });
      await writeFile(
        path.join(brokenSkillDir, STANDARD_FILES.METADATA_YAML),
        stringifyYaml({
          category: "web-framework",
          domain: "web",
          author: "@test",
          displayName: "vue",
          cliDescription: "Vue framework",
          usageGuidance: "Use Vue for building component-based UIs",
          slug: "vue",
        }),
      );

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Validating skills");
      // Counter reports both skills: 2 total, 1 invalid.
      expect(stdout).toMatch(/2 skill\(s\), 1 invalid/);
      // The broken skill's error is surfaced — pass did not abort after it.
      expect(stdout).toContain("Missing SKILL.md");
    });

    it("should aggregate errors across all four passes in the final summary", async () => {
      // Seed exactly 1 error in sources + 1 in plugins + 1 in skills.
      // Source with no skills directory → 1 error.
      const sourceDir = path.join(tempDir, "source");
      await mkdir(sourceDir, { recursive: true });
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        source: sourceDir,
      });

      // Plugin with invalid JSON in plugin.json → 1 error.
      const pluginDir = path.join(projectDir, CLAUDE_DIR, PLUGINS_SUBDIR, "broken-plugin");
      const manifestDir = path.join(pluginDir, PLUGIN_MANIFEST_DIR);
      await mkdir(manifestDir, { recursive: true });
      await writeFile(path.join(manifestDir, PLUGIN_MANIFEST_FILE), "{ not valid json !!!");

      // Installed skill missing metadata.yaml → 1 error.
      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      const skillDir = path.join(globalSkillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React"),
      );

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Result: 3 error(s)");
    });

    it("should iterate over both primary and extra sources", async () => {
      const primarySourceDir = path.join(tempDir, "primary-source");
      const extraSourceDir = path.join(tempDir, "extra-source");
      await buildValidSource(primarySourceDir);
      await buildValidSource(extraSourceDir);

      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        source: primarySourceDir,
        sources: [{ name: "acme-extra", url: extraSourceDir }],
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      const sourcesBlock = stdout.slice(
        stdout.indexOf("Validating sources"),
        stdout.indexOf("Validating plugins"),
      );
      expect(sourcesBlock).toContain(primarySourceDir);
      expect(sourcesBlock).toContain(extraSourceDir);
      expect(sourcesBlock).toContain("acme-extra");
    });

    it("should exit with ERROR when a registered source path does not exist", async () => {
      const missingSourceDir = path.join(tempDir, "does-not-exist");
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: [],
        source: missingSourceDir,
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Validating sources");
      expect(stdout).toContain(missingSourceDir);
      expect(stdout).toMatch(/does not exist/);
    });
  });

  describe("installed plugins registry pass", () => {
    const userPluginsDir = () => path.join(fakeHome, CLAUDE_DIR, PLUGINS_SUBDIR);

    it("should validate installs recorded in installed_plugins.json under the cache layout", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const reactInstallPath = path.join(
        userPluginsDir(),
        "cache",
        "acme-marketplace",
        "web-framework-react",
        "1.0.0",
      );
      const honoInstallPath = path.join(
        userPluginsDir(),
        "cache",
        "other-marketplace",
        "api-framework-hono",
        "2.0.0",
      );
      await writeTestPluginManifest(
        reactInstallPath,
        { name: "web-framework-react", version: "1.0.0" },
        { pretty: false },
      );
      await writeTestPluginManifest(
        honoInstallPath,
        { name: "api-framework-hono", version: "2.0.0" },
        { pretty: false },
      );
      await writeTestInstalledPluginsRegistry(userPluginsDir(), {
        "web-framework-react@acme-marketplace": [reactInstallPath],
        "api-framework-hono@other-marketplace": [honoInstallPath],
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      const pluginsBlock = stdout.slice(
        stdout.indexOf("Validating plugins"),
        stdout.indexOf("Validating skills"),
      );
      expect(pluginsBlock).toContain("2 plugin(s), 0 invalid");
      expect(pluginsBlock).not.toContain("— no plugins");
    });

    it("should report a registry record whose installPath no longer exists as an invalid plugin", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const goneInstallPath = path.join(
        userPluginsDir(),
        "cache",
        "acme-marketplace",
        "gone-plugin",
        "1.0.0",
      );
      await writeTestInstalledPluginsRegistry(userPluginsDir(), {
        "gone-plugin@acme-marketplace": [goneInstallPath],
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("1 plugin(s), 1 invalid");
      expect(stdout).toContain("gone-plugin@acme-marketplace");
      expect(stdout).toContain("Plugin directory does not exist");
    });

    it("should fall back to the direct-children scan when the registry file is absent", async () => {
      await setupValidatedProject(tempDir, projectDir);

      await writeTestPluginManifest(
        path.join(userPluginsDir(), "manual-plugin"),
        { name: "manual-plugin", version: "1.0.0" },
        { pretty: false },
      );

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      const pluginsBlock = stdout.slice(
        stdout.indexOf("Validating plugins"),
        stdout.indexOf("Validating skills"),
      );
      expect(pluginsBlock).toContain("1 plugin(s), 0 invalid");
      expect(pluginsBlock).toContain("manual-plugin");
    });

    it("should scan direct children when the registry records no installs", async () => {
      await setupValidatedProject(tempDir, projectDir);

      await writeTestInstalledPluginsRegistry(userPluginsDir(), {});
      await writeTestPluginManifest(
        path.join(userPluginsDir(), "manual-plugin"),
        { name: "manual-plugin", version: "1.0.0" },
        { pretty: false },
      );

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      const pluginsBlock = stdout.slice(
        stdout.indexOf("Validating plugins"),
        stdout.indexOf("Validating skills"),
      );
      expect(pluginsBlock).toContain("1 plugin(s), 0 invalid");
      expect(pluginsBlock).not.toContain("— no plugins");
    });

    it("should count an unreadable registry as an error instead of scanning around it", async () => {
      await setupValidatedProject(tempDir, projectDir);

      await mkdir(userPluginsDir(), { recursive: true });
      await writeFile(getInstalledPluginsRegistryPath(userPluginsDir()), "{ not valid json !!!");

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      const pluginsBlock = stdout.slice(
        stdout.indexOf("Validating plugins"),
        stdout.indexOf("Validating skills"),
      );
      expect(pluginsBlock).toContain("failed:");
    });
  });

  describe("installed skills pass", () => {
    it("should render Validating skills header in the output", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Validating skills");
    });

    it("should render — not present when no skills dir exists", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      const skillsBlock = stdout.slice(stdout.indexOf("Validating skills"));
      expect(skillsBlock).toContain("— not present");
    });

    it("should render — none when the skills dir exists but is empty", async () => {
      await setupValidatedProject(tempDir, projectDir);
      await mkdir(path.join(fakeHome, INSTALLED_SKILLS_SUBDIR), { recursive: true });
      await mkdir(path.join(projectDir, INSTALLED_SKILLS_SUBDIR), { recursive: true });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      const skillsBlock = stdout.slice(stdout.indexOf("Validating skills"));
      expect(skillsBlock).toContain("— none");
    });

    it("should count a valid installed skill and exit 0", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react");

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Validating skills");
      expect(stdout).toMatch(/1 skill\(s\), 0 invalid/);
      expect(stdout).toContain("Result: 0 error(s)");
    });

    it("should report over-length cliDescription as a warning and exit 0", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react", {
        cliDescription: "x".repeat(75),
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      expect(stdout).toMatch(/1 skill\(s\), 0 invalid, 1 with warnings/);
      expect(stdout).toContain("75 characters");
      expect(stdout).toContain("Result: 0 error(s), 1 warning(s)");
    });

    it("should exit ERROR when an installed skill has an empty cliDescription", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react", {
        cliDescription: "",
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(/1 skill\(s\), 1 invalid/);
      expect(stdout).toContain("cliDescription");
    });

    it("should exit ERROR when an installed skill is missing SKILL.md", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      const skillDir = path.join(globalSkillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        stringifyYaml({
          category: "web-framework",
          domain: "web",
          author: "@test",
          displayName: "react",
          cliDescription: "React JavaScript framework",
          usageGuidance: "Use React for building component-based UIs",
          slug: "react",
        }),
      );

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Missing SKILL.md");
    });

    it("should exit ERROR when an installed skill is missing metadata.yaml", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      const skillDir = path.join(globalSkillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React"),
      );

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Missing metadata.yaml");
    });

    it("should exit ERROR when metadata.yaml is malformed YAML", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      const skillDir = path.join(globalSkillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React"),
      );
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        ":\n  - broken: [unclosed\n    bad",
      );

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("metadata.yaml");
    });

    it("should exit ERROR when metadata has custom: true but a non-kebab slug", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "custom-tools-my-skill", {
        custom: true,
        category: "custom-tools",
        slug: "My_Slug",
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("slug");
    });

    it("should exit ERROR when metadata has custom: false and an unknown category", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react", {
        category: "not-a-real-category",
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("category");
    });
  });

  describe("installed agents pass", () => {
    it("should render Validating agents header in the output", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Validating agents");
    });

    it("should render — not present when no agents dir exists", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      const agentsBlock = stdout.slice(stdout.indexOf("Validating agents"));
      expect(agentsBlock).toContain("— not present");
    });

    it("should count a valid installed agent and exit 0", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalAgentsDir = path.join(fakeHome, INSTALLED_AGENTS_SUBDIR);
      await writeValidInstalledAgent(globalAgentsDir, "web-developer", {
        description: "A frontend developer agent",
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("Validating agents");
      expect(stdout).toMatch(/1 agent\(s\), 0 invalid/);
      expect(stdout).toContain("Result: 0 error(s)");
    });

    it("should exit ERROR when an agent .md has no frontmatter", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalAgentsDir = path.join(fakeHome, INSTALLED_AGENTS_SUBDIR);
      await mkdir(globalAgentsDir, { recursive: true });
      await writeFile(
        path.join(globalAgentsDir, "bad-agent.md"),
        "# Just a plain markdown file, no frontmatter here.\n",
      );

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Missing or invalid YAML frontmatter");
    });

    it("should exit ERROR when an agent frontmatter has a non-kebab name", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalAgentsDir = path.join(fakeHome, INSTALLED_AGENTS_SUBDIR);
      await writeValidInstalledAgent(globalAgentsDir, "BadAgent", {
        rawFrontmatter: {
          name: "Bad_Agent",
          description: "An agent with a non-kebab name",
          tools: "Read, Write",
        },
      });

      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("name");
    });
  });

  describe("cwd === $HOME dedup", () => {
    it("should run only the global pass for skills and agents when cwd === homedir()", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildValidSource(sourceDir);
      await writeTestTsConfig(fakeHome, {
        name: "test-project",
        skills: [],
        agents: [],
        source: sourceDir,
      });

      // Install a skill and an agent under the fake-home location only.
      await writeValidInstalledSkill(
        path.join(fakeHome, INSTALLED_SKILLS_SUBDIR),
        "web-framework-react",
      );
      await writeValidInstalledAgent(path.join(fakeHome, INSTALLED_AGENTS_SUBDIR), "web-developer");

      // Run validate from the fake-home directory: cwd === homedir().
      process.chdir(fakeHome);
      const { stdout, error } = await runCliCommand(["validate"]);

      expect(error).toBeUndefined();

      const skillsBlock = stdout.slice(
        stdout.indexOf("Validating skills"),
        stdout.indexOf("Validating agents"),
      );
      const agentsBlock = stdout.slice(stdout.indexOf("Validating agents"));

      const skillRowMatches = skillsBlock.match(/\d+ skill\(s\)/g) ?? [];
      const agentRowMatches = agentsBlock.match(/\d+ agent\(s\)/g) ?? [];

      expect(skillRowMatches).toHaveLength(1);
      expect(agentRowMatches).toHaveLength(1);
    });
  });
});

describe("source validation (validateSource)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-validate-source-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should report error for non-existent source directory", async () => {
    const result = await validateSource(path.join(tempDir, "nonexistent"));

    expect(result.errorCount).toBe(1);
    expect(result.issues[0].message).toContain("does not exist");
  });

  it("should report error when skills directory is missing", async () => {
    const sourceDir = path.join(tempDir, "source");
    await mkdir(sourceDir, { recursive: true });

    const result = await validateSource(sourceDir);

    expect(result.errorCount).toBe(1);
    expect(result.issues[0].message).toContain("Skills directory does not exist");
  });

  it("should pass validation for a valid source", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    await writeValidSourceSkill(skillsDir, "web-framework-react", REACT_SOURCE_SKILL);

    await writeTestMatrix(configDir, {
      "web-framework": { domain: "web", displayName: "Framework" },
    });

    const result = await validateSource(sourceDir);

    expect(result.skillCount).toBe(1);
    expect(result.errorCount).toBe(0);
  });

  it("should report error when SKILL.md is missing", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const skillDir = path.join(skillsDir, "web", "framework", "react");
    await mkdir(skillDir, { recursive: true });

    // Write metadata.yaml without SKILL.md
    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      stringifyYaml({
        category: "web-framework",
        domain: "web",
        author: "@test",
        displayName: "react",
        cliDescription: "React framework",
        usageGuidance: "Use React for building UIs",
      }),
    );

    const result = await validateSource(sourceDir);

    expect(result.errorCount).toBe(1);
    expect(result.issues.some((i) => i.message.includes("Missing SKILL.md"))).toBe(true);
  });

  it("should report error when metadata.yaml is missing", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const skillDir = path.join(skillsDir, "web", "framework", "react");
    await mkdir(skillDir, { recursive: true });

    // Write SKILL.md without metadata.yaml
    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("web-framework-react", "React"),
    );

    const result = await validateSource(sourceDir);

    expect(result.errorCount).toBe(1);
    expect(result.issues.some((i) => i.message.includes("Missing metadata.yaml"))).toBe(true);
  });

  it("should report errors for invalid metadata schema violations", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const skillDir = path.join(skillsDir, "web", "framework", "react");
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("web-framework-react", "React"),
    );

    // Missing required fields: displayName, cliDescription, usageGuidance
    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      stringifyYaml({
        category: "web-framework",
        author: "@test",
      }),
    );

    const result = await validateSource(sourceDir);

    expect(result.errorCount).toBe(4);
  });

  it("should report error for snake_case keys in metadata", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const skillDir = path.join(skillsDir, "web", "framework", "react");
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("web-framework-react", "React"),
    );

    // Use snake_case key instead of camelCase
    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      stringifyYaml({
        category: "web-framework",
        author: "@test",
        cli_name: "react",
        cli_description: "React framework",
        usage_guidance: "Use React for building UIs",
      }),
    );

    const result = await validateSource(sourceDir);

    const snakeCaseIssues = result.issues.filter((i) => i.message.includes("snake_case"));
    expect(snakeCaseIssues).toHaveLength(3);
  });

  it("should report warning when directory name does not match the skill id", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    // Directory name is "react" but the skill id (SKILL.md frontmatter name) is "web-framework-react"
    await writeValidSourceSkill(skillsDir, "web/framework/react", REACT_SOURCE_SKILL);

    await writeTestMatrix(configDir, {
      "web-framework": { domain: "web", displayName: "Framework" },
    });

    const result = await validateSource(sourceDir);

    const mismatchIssues = result.issues.filter((i) =>
      i.message.includes("does not match skill id"),
    );
    expect(mismatchIssues.length).toBe(1);
    expect(mismatchIssues[0].severity).toBe("warning");
    expect(mismatchIssues[0].message).toContain("'web-framework-react'");
  });

  it("should not warn about a human displayName when the directory name equals the skill id", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    await writeValidSourceSkill(skillsDir, "web-framework-react", {
      ...REACT_SOURCE_SKILL,
      displayName: "React",
    });

    await writeTestMatrix(configDir, {
      "web-framework": { domain: "web", displayName: "Framework" },
    });

    const result = await validateSource(sourceDir);

    const mismatchIssues = result.issues.filter((i) => i.message.includes("does not match"));
    expect(mismatchIssues).toStrictEqual([]);
    expect(result.errorCount).toBe(0);
  });

  it("should drop unresolved skill references during resolution (no dangling refs in matrix)", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    // Create skill directory
    const skillDir = path.join(skillsDir, "web", "framework", "react");
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("web-framework-react", "React"),
    );

    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      stringifyYaml({
        category: "web-framework",
        domain: "web",
        author: "@test",
        displayName: "react",
        cliDescription: "React JavaScript framework",
        usageGuidance: "Use React for building component-based UIs",
        slug: "react",
      }),
    );

    // Add a conflict rule referencing a non-existent skill
    const matrixCategories = {
      "web-framework": {
        id: "web-framework",
        displayName: "Framework",
        description: "Framework skills",
        domain: "web",
        exclusive: true,
        required: false,
        order: 0,
      },
    };

    const categoriesData = { version: "1.0.0", categories: matrixCategories };
    await writeFile(path.join(configDir, "skill-categories.ts"), renderConfigTs(categoriesData));

    const rulesData = {
      version: "1.0.0",
      relationships: {
        conflicts: [
          {
            skills: ["react", "angular-standalone"],
            reason: "Test conflict with nonexistent skill",
          },
        ],
        discourages: [],
        recommends: [],
        requires: [],
        alternatives: [],
      },
    };
    await writeFile(path.join(configDir, "skill-rules.ts"), renderConfigTs(rulesData));

    const result = await validateSource(sourceDir);

    // Unresolved slugs are now dropped during resolution (with a warning),
    // so no dangling references appear in the matrix health check
    const crossRefIssues = result.issues.filter((i) => i.message.includes("unresolved reference"));
    expect(crossRefIssues).toHaveLength(0);
  });

  it("should validate multiple skills and count them correctly", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    await writeValidSourceSkill(skillsDir, "web-framework-react", REACT_SOURCE_SKILL);

    await writeValidSourceSkill(skillsDir, "api-framework-hono", {
      id: "api-framework-hono",
      description: "Hono framework",
      category: "api-api",
      domain: "api",
      displayName: "hono",
      cliDescription: "Lightweight web framework for the edge",
      usageGuidance: "Use Hono for building edge-first APIs",
      slug: "hono",
      author: "@test",
    });

    await writeTestMatrix(configDir, {
      "web-framework": { domain: "web", displayName: "Framework" },
      "api-api": { domain: "api", displayName: "API Framework" },
    });

    const result = await validateSource(sourceDir);

    expect(result.skillCount).toBe(2);
    expect(result.errorCount).toBe(0);
  });

  it("should run cross-reference validation and report no issues for well-formed source", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    await writeValidSourceSkill(skillsDir, "web-framework-react", REACT_SOURCE_SKILL);

    await writeTestMatrix(configDir, {
      "web-framework": { domain: "web", displayName: "Framework" },
    });

    const result = await validateSource(sourceDir);

    // Phase 3 cross-reference ran and found no issues
    expect(result.errorCount).toBe(0);
    // No cross-reference skipped warnings
    const crossRefSkipped = result.issues.filter((i) =>
      i.message.includes("Cross-reference validation skipped"),
    );
    expect(crossRefSkipped).toHaveLength(0);
  });

  it("should report warning when cross-reference validation cannot load matrix", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    await mkdir(skillsDir, { recursive: true });

    // Create a valid skill but with a malformed categories config to trigger Phase 3 failure
    await writeValidSourceSkill(skillsDir, "web-framework-react", REACT_SOURCE_SKILL);

    // Write a malformed categories file so loadSkillsMatrixFromSource throws
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, "skill-categories.ts"), "export default INVALID;");

    const result = await validateSource(sourceDir);

    // Phase 3 should gracefully catch the error and report a warning
    const crossRefWarnings = result.issues.filter((i) =>
      i.message.includes("Cross-reference validation skipped"),
    );
    expect(crossRefWarnings).toHaveLength(1);
    expect(crossRefWarnings[0].severity).toBe("warning");
  });

  it("should validate custom skills with non-standard categories without errors", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    // Create a skill with custom: true and a non-standard category
    const skillDir = path.join(skillsDir, "custom-tools-my-linter");
    await mkdir(skillDir, { recursive: true });

    await writeFile(
      path.join(skillDir, STANDARD_FILES.SKILL_MD),
      renderSkillMd("custom-tools-my-linter", "My custom linter skill"),
    );

    await writeFile(
      path.join(skillDir, STANDARD_FILES.METADATA_YAML),
      stringifyYaml({
        category: "custom-tools",
        domain: "custom",
        author: "@test",
        displayName: "my-linter",
        cliDescription: "A custom linting skill",
        usageGuidance: "Use this for custom linting checks on your codebase",
        slug: "my-linter",
        custom: true,
      }),
    );

    await writeTestMatrix(configDir, {});

    const result = await validateSource(sourceDir);

    // Custom skills should not fail schema validation for non-standard categories/slugs
    const schemaErrors = result.issues.filter(
      (i) => i.severity === "error" && i.file.includes("my-linter"),
    );
    expect(schemaErrors).toHaveLength(0);
  });
});

describe("plugin-validator (validatePlugin)", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-validate-plugin-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("should report invalid JSON in plugin.json", async () => {
    const pluginDir = path.join(tempDir, "plugin");
    const manifestDir = path.join(pluginDir, PLUGIN_MANIFEST_DIR);
    await mkdir(manifestDir, { recursive: true });
    await writeFile(path.join(manifestDir, PLUGIN_MANIFEST_FILE), "{ not valid json !!!");

    const result = await validatePlugin(pluginDir);

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid JSON"))).toBe(true);
  });
});
