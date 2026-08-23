import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TEST_SOURCE_URL } from "../test-constants.js";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { stringify as stringifyYaml } from "yaml";
import { runCliCommand } from "../helpers/cli-runner.js";
import { writeCorruptTestConfig, writeTestTsConfig } from "../helpers/config-io.js";
import {
  writeTestInstalledPluginsRegistry,
  writeTestPluginManifest,
} from "../helpers/disk-writers.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { buildAgentConfigs } from "../factories/config-factories.js";
import { buildSkillConfigs } from "../helpers/wizard-simulation.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { validateSource } from "../../source-validator";
import { getInstalledPluginsRegistryPath } from "../../plugins/plugin-settings";
import { validatePlugin } from "../../plugins/plugin-validator";
import {
  MARKETPLACE_JSON,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  PLUGINS_SUBDIR,
  PUBLIC_CATALOGUE_PACKAGE,
  CLAUDE_DIR,
  CLAUDE_SRC_DIR,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
  marketplaceManifestPath,
} from "../../../consts";
import {
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "../factories/plugin-factories.js";
import type { RelationshipDefinitions } from "../../../types";
import { testMarketplaceSkillId, type TestSkill } from "../fixtures/create-test-source";
import { renderAgentMd, renderConfigTs, renderSkillMd } from "../content-generators";
import {
  VALID_EMBEDDED_SKILL_METADATA_FILE,
  VALID_SKILL_CATEGORIES_FILE,
  VALID_SKILL_RULES_FILE,
} from "../mock-data/mock-source-files.js";
import { EXIT_CODES } from "../../exit-codes";
import { firstElement } from "../helpers/element-at.js";

const INSTALLED_SKILLS_SUBDIR = path.join(CLAUDE_DIR, STANDARD_DIRS.SKILLS);
const INSTALLED_AGENTS_SUBDIR = path.join(CLAUDE_DIR, "agents");

/** Section headings and skip notice of doctor's layered output. */
const CONTENT_SECTION = "Content checks";
const OPERATIONAL_SECTION = "Operational checks";
const SKIP_AFTER_CONTENT_ERRORS = "Skipped — fix the content errors above first";

/** The operational rows, as the report heads them. */
const ROW_CONFIG_VALID = "Config Valid";
const ROW_SKILLS_RESOLVED = "Skills Resolved";
const ROW_AGENTS_COMPILED = "Agents Compiled";
const ROW_NO_ORPHANS = "No Orphans";
const ROW_SKILLS_INSTALLED = "Skills Installed";
const ROW_PLUGINS_INSTALLED = "Plugins Installed";
const ROW_MARKETPLACE_REACHABLE = "Marketplace Reachable";

/**
 * One operational row standing down: the name, the `-` its skip status prints, and the word.
 * The blanket notice carries no row name and no status column, so it never matches this.
 */
function skippedRow(name: string): RegExp {
  return new RegExp(`${name}\\s+-\\s+Skipped`);
}

/** The agent `setupValidatedProject` declares, and the compiled file that satisfies it. */
const CONFIGURED_AGENT_NAME = "web-developer";

/** A compiled agent file no configuration declares — what the orphan row exists to name. */
const ORPHANED_AGENT_NAME = "orphan-agent";

/**
 * The skill the fixtures configure, which the registered marketplace provides.
 *
 * Namespaced, because the marketplace these fixtures build IS a custom one and a
 * custom marketplace shipping a public-catalogue id is refused whole at load.
 */
const CONFIGURED_SKILL_ID = testMarketplaceSkillId("web-framework-react");

/**
 * An installed skill directory the configuration never mentions. It is the unrelated content the
 * operational rows are asserted to survive, so it must be a skill nothing else in the fixture reads.
 */
const UNRELATED_INSTALLED_SKILL_ID = "web-framework-vue-composition-api";

/** A marketplace name rather than the eject origin, which is what makes a skill plugin-mode. */
const PLUGIN_MODE_ORIGIN = "agents-inc";

/**
 * A marketplace name Claude Code will not register plugins under, and the same name
 * written the way it accepts.
 */
const MANIFEST_NAME_REFUSED = "Acme_Skills";
const MANIFEST_NAME_ACCEPTED = "acme-skills";

/** The Marketplaces row's clean verdict — the tick a refused manifest must not earn. */
const MARKETPLACES_ROW_CLEAN = "1 marketplace validated";

/** Gives a source a `.claude-plugin/marketplace.json` publishing under `name`. */
async function writeMarketplaceManifest(sourceDir: string, name: string): Promise<void> {
  const manifestPath = marketplaceManifestPath(sourceDir);
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    JSON.stringify({
      ...createMockMarketplace([createMockMarketplacePlugin(CONFIGURED_SKILL_ID)]),
      name,
    }),
  );
}

/** A registry file the JSON parser refuses, so nothing can be read out of it. */
const UNPARSEABLE_REGISTRY = "{ not valid json !!!";

/** An agent file carrying no frontmatter — content the agents pass reports and nothing else reads. */
const AGENT_MD_WITHOUT_FRONTMATTER = "# Just a plain markdown file, no frontmatter here.\n";

/** A config file the loader cannot evaluate — present on disk, and describing nothing. */
const UNREADABLE_CONFIG = "export default {{{ not valid typescript";

/** A slug the fixture marketplaces below never ship, so a rule naming it resolves to nothing. */
const DANGLING_RULE_SLUG = "angular-standalone";

/**
 * A conflict rule pairing a slug the source ships with one it does not. A source's own rules
 * are never narrowed to what it ships, so the merge drops the reference and records the slug —
 * the one shape that produces an author's typo.
 */
const RULES_WITH_DANGLING_SLUG: Partial<RelationshipDefinitions> = {
  conflicts: [
    {
      skills: ["react", DANGLING_RULE_SLUG],
      reason: "Deliberately names a slug no skill in this marketplace carries",
    },
  ],
};

/**
 * Where the audit manifest lives, as a reader of the report has to type it. It is this CLI's own
 * file rather than anything in the marketplace under validation, which is the point: a verdict the
 * matrix contradicts is recorded there and nowhere else.
 */
const AUDIT_MANIFEST_FILE = "src/cli/lib/configuration/skill-audit.ts";

/**
 * A skill the built-in audit manifest records as `universal`. Placed in an exclusive category it
 * contradicts its own verdict, which is the only OTHER health finding reported at error severity
 * — the control for "the reader's relationship moves this one finding and no other".
 *
 * Its id is bare, and has to be: the audit manifest is keyed by the public catalogue's own ids,
 * so a skill outside them cannot contradict a verdict nothing records for it. Only the catalogue
 * may ship such an id, which is why the one source built around this skill declares itself the
 * catalogue — see {@link buildSourceWithDanglingSlugAndAuditContradiction}.
 */
const UNIVERSAL_VERDICT_SKILL: TestSkill = {
  id: "web-forms-zod-validation",
  description: "Zod schema validation",
  category: "web-forms",
  domain: "web",
  displayName: "zod-validation",
  cliDescription: "Runtime schema validation with Zod",
  usageGuidance: "Use Zod to validate data crossing a trust boundary",
  slug: "zod-validation",
  author: "@test",
};

/**
 * A skill directory under `~/.claude/skills/` that something other than this CLI installed —
 * the shared Claude Code directory's other tenants. Named after the live example: an MCP helper
 * skill with no metadata.yaml at all.
 */
const FOREIGN_SKILL_DIR = "context7-mcp";

/**
 * The provenance block this CLI stamps into every skill directory it writes. Its presence is one
 * of the two things that make a directory this installation's to judge.
 */
const CLI_PROVENANCE = {
  skillId: "web-framework-react",
  contentHash: "abc1234",
  date: "2026-01-01",
};

/**
 * Write a valid installed skill under `<skillsDir>/<dirName>/` with strict-schema metadata.
 *
 * Provenance is part of the fixture rather than an option, because it is part of what an install
 * IS: the copier stamps `forkedFrom` into every directory it writes, and a skill directory without
 * it is one somebody else put there.
 */
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
    forkedFrom: CLI_PROVENANCE,
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
    renderAgentMd(name, overrides?.description, {
      ...(overrides?.tools !== undefined && { tools: overrides.tools }),
    }),
  );
}

const REACT_SOURCE_SKILL: TestSkill = {
  id: CONFIGURED_SKILL_ID,
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
    author: config.author,
    displayName: config.displayName,
    cliDescription: config.cliDescription,
    usageGuidance: config.usageGuidance,
    slug,
  };

  await writeFile(path.join(skillDir, STANDARD_FILES.METADATA_YAML), stringifyYaml(metadata));
}

/**
 * Creates minimal skill-categories.ts and skill-rules.ts with the given categories.
 * A category may omit its `domain` — the field is optional in the schema, and leaving it out is
 * the shape the matrix health check reports as `category-missing-domain`.
 */
async function writeTestMatrix(
  configDir: string,
  categories: Record<string, { domain?: string; displayName: string }>,
  relationships?: Partial<RelationshipDefinitions>,
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
      conflicts: relationships?.conflicts ?? [],
      discourages: relationships?.discourages ?? [],
      requires: relationships?.requires ?? [],
      alternatives: relationships?.alternatives ?? [],
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
  await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);

  await writeTestMatrix(configDir, {
    "web-framework": { domain: "web", displayName: "Framework" },
  });
}

/** Build an otherwise valid marketplace whose own relationship rules name a slug it never ships. */
async function buildSourceWithDanglingRuleSlug(sourceDir: string): Promise<void> {
  const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
  const configDir = path.join(sourceDir, "config");
  await mkdir(configDir, { recursive: true });

  await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);

  await writeTestMatrix(
    configDir,
    { "web-framework": { domain: "web", displayName: "Framework" } },
    RULES_WITH_DANGLING_SLUG,
  );
}

/**
 * The same marketplace, carrying a second health defect alongside the dangling slug: a skill the
 * audit manifest calls `universal` sitting in an exclusive category.
 *
 * This one is the PUBLIC CATALOGUE's own checkout rather than a custom marketplace, and the
 * package.json below is what says so. The audit manifest names catalogue ids and nothing else, so
 * the contradiction is only constructible for a source entitled to ship one — every other source
 * is refused for taking it.
 */
async function buildSourceWithDanglingSlugAndAuditContradiction(sourceDir: string): Promise<void> {
  const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
  const configDir = path.join(sourceDir, "config");
  await mkdir(configDir, { recursive: true });
  await writeFile(
    path.join(sourceDir, STANDARD_FILES.PACKAGE_JSON),
    JSON.stringify({ name: PUBLIC_CATALOGUE_PACKAGE, version: "1.0.0" }),
  );

  await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);
  await writeValidSourceSkill(skillsDir, UNIVERSAL_VERDICT_SKILL.id, UNIVERSAL_VERDICT_SKILL);

  await writeTestMatrix(
    configDir,
    {
      "web-framework": { domain: "web", displayName: "Framework" },
      "web-forms": { domain: "web", displayName: "Forms" },
    },
    RULES_WITH_DANGLING_SLUG,
  );
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
 * registers it as the project's primary source. The config declares an agent
 * because a config declaring neither skills nor agents is content-less and does
 * not detect as an installation at all — doctor's operational layer would then
 * report a missing config rather than checking the one that is there.
 * Returns the source directory.
 */
async function setupValidatedProject(
  tempDir: string,
  projectDir: string,
  configOverrides?: Record<string, unknown>,
): Promise<string> {
  const sourceDir = path.join(tempDir, "source");
  await buildValidSource(sourceDir);
  await writeTestTsConfig(projectDir, {
    name: "test-project",
    skills: [],
    agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
    marketplace: sourceDir,
    ...configOverrides,
  });
  return sourceDir;
}

describe("doctor content checks", () => {
  let tempDir: string;
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-doctor-content-"));
  });

  afterEach(async () => {
    await cleanup();
  });

  describe("registered sources pass", () => {
    it("should validate the registered primary source and reach the operational layer", async () => {
      const sourceDir = await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(CONTENT_SECTION);
      expect(stdout).toContain("1 marketplace validated");
      expect(stdout).toContain(sourceDir);
      expect(stdout, "clean content must not stop the run at the content layer").toContain(
        OPERATIONAL_SECTION,
      );
      expect(stdout).toContain("0 errors");
    });

    /**
     * A marketplace whose content is broken is missing skills from the matrix every configured id
     * is resolved against, so the skills row would report ids as "not found" that the row above
     * has already explained. It is the only operational row that reads what the marketplace holds:
     * the rest read config.ts and the files on disk, and answer as truthfully as ever.
     */
    it("should stand down only the row a broken primary source can mislead", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildInvalidSource(sourceDir);
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID]),
        agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
        marketplace: sourceDir,
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(/1 marketplace: [1-9]\d* errors?/);
      expect(stdout).toMatch(skippedRow(ROW_SKILLS_RESOLVED));
      expect(stdout).not.toContain(SKIP_AFTER_CONTENT_ERRORS);
      expect(stdout, "the config row reads config.ts and nothing the marketplace holds").toContain(
        ROW_CONFIG_VALID,
      );
      expect(stdout).toContain(ROW_NO_ORPHANS);
      expect(stdout).toContain(ROW_SKILLS_INSTALLED);
    });

    it("should skip remote sources and not count them as errors", async () => {
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: buildAgentConfigs(["web-developer"]),
        marketplace: TEST_SOURCE_URL,
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("skipped (remote)");
      expect(stdout).toContain("github:agents-inc/skills");
      expect(stdout).toContain("0 errors");
    });

    it("should validate the one source the installation reads from", async () => {
      const primarySourceDir = path.join(tempDir, "primary-source");
      await buildValidSource(primarySourceDir);

      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: buildAgentConfigs(["web-developer"]),
        marketplace: primarySourceDir,
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 marketplace validated");
      expect(stdout).toContain(primarySourceDir);
    });

    /**
     * A green tick printed under a warning about the same file is worse than no row at all —
     * the row is the summary a reader trusts, and it contradicts the line above it. The
     * accepted-name spec beside this one is what says the row still ticks for a marketplace
     * whose only difference is a name Claude Code registers plugins under.
     */
    describe("a marketplace naming itself something Claude Code cannot register", () => {
      it("should refuse rather than tick, and name the manifest holding the name", async () => {
        const sourceDir = await setupValidatedProject(tempDir, projectDir);
        await writeMarketplaceManifest(sourceDir, MANIFEST_NAME_REFUSED);

        const { stdout, error } = await runCliCommand(["doctor"]);

        expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        expect(stdout, "a refused marketplace must not be counted as validated").not.toContain(
          MARKETPLACES_ROW_CLEAN,
        );
        expect(stdout).toMatch(/1 marketplace: [1-9]\d* errors?/);
        expect(stdout, "the manifest holding the name must be named").toContain(MARKETPLACE_JSON);
        expect(stdout, "the refusal must state the rule, not the regex").toContain("kebab-case");
      });

      it("should tick for the same marketplace once its name is one Claude Code accepts", async () => {
        const sourceDir = await setupValidatedProject(tempDir, projectDir);
        await writeMarketplaceManifest(sourceDir, MANIFEST_NAME_ACCEPTED);

        const { stdout, error } = await runCliCommand(["doctor"]);

        expect(error).toBeUndefined();
        expect(stdout).toContain(MARKETPLACES_ROW_CLEAN);
      });
    });

    it("should exit with ERROR when a registered source path does not exist", async () => {
      const missingSourceDir = path.join(tempDir, "does-not-exist");
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: [],
        agents: buildAgentConfigs(["web-developer"]),
        marketplace: missingSourceDir,
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(missingSourceDir);
      expect(stdout).toMatch(/does not exist/);
    });

    it("should attribute each pass's own errors instead of reporting one aggregate", async () => {
      // Seed exactly 1 error in sources + 1 in plugins + 1 in skills.
      // Source with no skills directory → 1 error.
      const sourceDir = path.join(tempDir, "source");
      await mkdir(sourceDir, { recursive: true });
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        // The configuration names the skill below, which is what makes its directory this
        // installation's to judge — a metadata.yaml that is gone can carry no provenance.
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"]),
        marketplace: sourceDir,
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

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(/1 marketplace: 1 error/);
      expect(stdout).toMatch(/1 plugin: 1 error/);
      expect(stdout).toMatch(/1 skill: 1 error/);
    });

    /**
     * One command, two contexts, already told apart by whether the marketplace being validated
     * is the directory the command ran in. The author is standing in the repository that holds
     * the typo; the consumer is being told about a file in someone else's.
     */
    it("should fail the run for a slug the marketplace under the cwd dangles", async () => {
      await buildSourceWithDanglingRuleSlug(projectDir);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(/1 marketplace: 1 error/);
      expect(stdout).toContain(DANGLING_RULE_SLUG);
    });

    it("should warn without failing for a slug the marketplace it reads from dangles", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildSourceWithDanglingRuleSlug(sourceDir);
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID]),
        agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
        marketplace: sourceDir,
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toMatch(/1 marketplace: 0 errors, 1 warning/);
      expect(stdout).toContain(DANGLING_RULE_SLUG);
      expect(stdout).toContain(`Marketplace '${sourceDir}'`);
    });

    /**
     * The stand-down is keyed on a content pass FAILING, and a warning does not. That is the
     * right outcome on the merits too: `blocks: ["skills"]` is justified by a broken marketplace
     * leaving skills out of the matrix, and an unresolved rule slug leaves every skill in it.
     */
    it("should stand no operational row down for a marketplace warning", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildSourceWithDanglingRuleSlug(sourceDir);
      await writeTestTsConfig(projectDir, {
        name: "test-project",
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID]),
        agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
        marketplace: sourceDir,
      });

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(OPERATIONAL_SECTION);
      expect(stdout).toContain(ROW_SKILLS_RESOLVED);
      expect(stdout, "a warning disables nothing — the skills row still answers").not.toMatch(
        skippedRow(ROW_SKILLS_RESOLVED),
      );
      expect(stdout).toContain("1/1 skills found");
    });
  });

  describe("installed plugins pass", () => {
    const userPluginsDir = () => path.join(fakeHome, CLAUDE_DIR, PLUGINS_SUBDIR);

    it("should report when no plugin directory is present", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("No plugins to validate");
    });

    it("should validate an installed plugin when present", async () => {
      await setupValidatedProject(tempDir, projectDir);

      // Create a plugin in the project's .claude/plugins/ directory
      const pluginDir = path.join(projectDir, CLAUDE_DIR, PLUGINS_SUBDIR, "my-plugin");
      await writeTestPluginManifest(
        pluginDir,
        { name: "my-plugin", version: "1.0.0" },
        { pretty: false },
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      // A pass with no issues at all reads "<n> validated"; one carrying advisory
      // warnings reads its counts instead. Either way the error count must be zero.
      expect(stdout).toMatch(/1 plugin(: 0 errors| validated)/);
    });

    it("should surface plugin errors in the aggregate exit code", async () => {
      await setupValidatedProject(tempDir, projectDir);

      // Create a plugin with malformed plugin.json — validator should report it as invalid
      const pluginDir = path.join(projectDir, CLAUDE_DIR, PLUGINS_SUBDIR, "broken-plugin");
      const manifestDir = path.join(pluginDir, PLUGIN_MANIFEST_DIR);
      await mkdir(manifestDir, { recursive: true });
      await writeFile(path.join(manifestDir, PLUGIN_MANIFEST_FILE), "{ not valid json !!!");

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(/1 plugin: 1 error/);
    });

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

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toMatch(/2 plugins(: 0 errors| validated)/);
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

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(/1 plugin: 1 error/);
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

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toMatch(/1 plugin(: 0 errors| validated)/);
    });

    it("should scan direct children when the registry records no installs", async () => {
      await setupValidatedProject(tempDir, projectDir);

      await writeTestInstalledPluginsRegistry(userPluginsDir(), {});
      await writeTestPluginManifest(
        path.join(userPluginsDir(), "manual-plugin"),
        { name: "manual-plugin", version: "1.0.0" },
        { pretty: false },
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toMatch(/1 plugin(: 0 errors| validated)/);
    });

    it("should count an unreadable registry as an error instead of scanning around it", async () => {
      await setupValidatedProject(tempDir, projectDir);

      await mkdir(userPluginsDir(), { recursive: true });
      await writeFile(getInstalledPluginsRegistryPath(userPluginsDir()), "{ not valid json !!!");

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      // The finding is about the registry file itself, so nothing was walked.
      expect(stdout).toMatch(/0 plugins: 1 error/);
      expect(stdout).toContain(path.basename(getInstalledPluginsRegistryPath(userPluginsDir())));
    });
  });

  describe("installed skills pass", () => {
    it("should report nothing to validate when no skills dir exists", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("No skills to validate");
    });

    it("should report nothing to validate when the skills dir exists but is empty", async () => {
      await setupValidatedProject(tempDir, projectDir);
      await mkdir(path.join(fakeHome, INSTALLED_SKILLS_SUBDIR), { recursive: true });
      await mkdir(path.join(projectDir, INSTALLED_SKILLS_SUBDIR), { recursive: true });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("No skills to validate");
    });

    it("should count a valid installed skill and exit 0", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react");

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 skill validated");
    });

    it("should report over-length cliDescription as a warning and exit 0", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react", {
        cliDescription: "x".repeat(75),
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 skill: 0 errors, 1 warning");
      expect(stdout).toContain("75 characters");
      expect(stdout, "a content warning must not stop the operational layer").toContain(
        OPERATIONAL_SECTION,
      );
    });

    it("should exit ERROR when an installed skill has an empty cliDescription", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react", {
        cliDescription: "",
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toMatch(/1 skill: 1 error/);
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
          forkedFrom: CLI_PROVENANCE,
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Missing SKILL.md");
    });

    it("should exit ERROR when an installed skill is missing metadata.yaml", async () => {
      await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      const skillDir = path.join(globalSkillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React"),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Missing metadata.yaml");
    });

    it("should exit ERROR when metadata.yaml is malformed YAML", async () => {
      await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

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

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(STANDARD_FILES.METADATA_YAML);
    });

    it("should exit ERROR when metadata has custom: true but a non-kebab slug", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "custom-tools-my-skill", {
        custom: true,
        category: "custom-tools",
        slug: "My_Slug",
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("slug");
    });

    it("should exit ERROR when metadata has custom: false and an unknown category", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react", {
        category: "not-a-real-category",
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("category");
    });

    it("should continue past one broken skill and count valid skills in the same pass", async () => {
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
          forkedFrom: CLI_PROVENANCE,
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      // Counter reports both skills: 2 walked, 1 error.
      expect(stdout).toMatch(/2 skills: 2 errors/);
      // The broken skill's error is surfaced — pass did not abort after it.
      expect(stdout).toContain("Missing SKILL.md");
    });
  });

  describe("installed skills this CLI did not install", () => {
    it("should not judge a directory no configuration names and no provenance claims", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await mkdir(path.join(globalSkillsDir, FOREIGN_SKILL_DIR), { recursive: true });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).not.toContain(`Missing ${STANDARD_FILES.METADATA_YAML}`);
    });

    it("should name the directory it stepped over rather than pass over it silently", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await mkdir(path.join(globalSkillsDir, FOREIGN_SKILL_DIR), { recursive: true });

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(FOREIGN_SKILL_DIR);
      expect(stdout).toContain("not installed by this CLI");
    });

    it("should count only the skills it owns when a foreign directory sits beside one", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      await writeValidInstalledSkill(globalSkillsDir, "web-framework-react", {
        forkedFrom: CLI_PROVENANCE,
      });
      await mkdir(path.join(globalSkillsDir, FOREIGN_SKILL_DIR), { recursive: true });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 skill validated");
    });

    it("should still report a broken skill the configuration names", async () => {
      await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      });

      // No metadata.yaml, so nothing in this directory can carry provenance — the configuration
      // naming the id is the whole claim.
      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      const skillDir = path.join(globalSkillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React"),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(`Missing ${STANDARD_FILES.METADATA_YAML}`);
    });

    it("should still report a broken skill whose metadata carries this CLI's provenance", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
      const skillDir = path.join(globalSkillsDir, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        stringifyYaml({
          ...VALID_EMBEDDED_SKILL_METADATA_FILE,
          domain: "web",
          forkedFrom: CLI_PROVENANCE,
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(`Missing ${STANDARD_FILES.SKILL_MD}`);
    });
  });

  describe("installed agents pass", () => {
    it("should report nothing to validate when no agents dir exists", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("No agents to validate");
    });

    it("should count a valid installed agent and exit 0", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalAgentsDir = path.join(fakeHome, INSTALLED_AGENTS_SUBDIR);
      await writeValidInstalledAgent(globalAgentsDir, "web-developer", {
        description: "A frontend developer agent",
      });

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 agent validated");
    });

    it("should exit ERROR when an agent .md has no frontmatter", async () => {
      await setupValidatedProject(tempDir, projectDir);

      const globalAgentsDir = path.join(fakeHome, INSTALLED_AGENTS_SUBDIR);
      await mkdir(globalAgentsDir, { recursive: true });
      await writeFile(
        path.join(globalAgentsDir, "bad-agent.md"),
        "# Just a plain markdown file, no frontmatter here.\n",
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

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

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("name");
    });
  });

  describe("cwd === $HOME dedup", () => {
    it("should walk the shared skills and agents directories once when cwd === homedir()", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildValidSource(sourceDir);
      await writeTestTsConfig(fakeHome, {
        name: "test-project",
        skills: [],
        agents: buildAgentConfigs(["web-developer"]),
        marketplace: sourceDir,
      });

      // Install a skill and an agent under the fake-home location only.
      await writeValidInstalledSkill(
        path.join(fakeHome, INSTALLED_SKILLS_SUBDIR),
        "web-framework-react",
      );
      await writeValidInstalledAgent(path.join(fakeHome, INSTALLED_AGENTS_SUBDIR), "web-developer");

      // Run doctor from the fake-home directory: cwd === homedir().
      process.chdir(fakeHome);
      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      // Without the dedup both scopes resolve to the same directory and each
      // file would be counted twice.
      expect(stdout).toContain("1 skill validated");
      expect(stdout).toContain("1 agent validated");
    });
  });

  /**
   * Which operational rows a content error may stand down, and which it may not. An operational row
   * is a cascade of a content finding only when it reads the content that finding is about: the
   * orphan row compares file NAMES against the config, the config row reads config.ts, and the
   * marketplace row reports whether the marketplace loads — none of them opens an installed skill,
   * a plugin registry or an agent's frontmatter, so none of them can be misled by one being broken.
   */
  describe("operational rows an unrelated content error must not silence", () => {
    /** Where the user-scoped plugin registry lives under the isolated home. */
    const userPluginsDir = () => path.join(fakeHome, CLAUDE_DIR, PLUGINS_SUBDIR);

    /**
     * A project with sound config, marketplace and plugins, carrying the two operational findings
     * a reader runs `doctor` to be told about: one compiled agent no config declares, and one
     * eject-mode skill the config names that never reached disk. Both are true of the installation
     * whatever any installed skill's metadata says.
     */
    async function setupProjectWithOperationalFindings(): Promise<string> {
      const sourceDir = await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID]),
      });

      const projectAgentsDir = path.join(projectDir, INSTALLED_AGENTS_SUBDIR);
      await writeValidInstalledAgent(projectAgentsDir, CONFIGURED_AGENT_NAME);
      await writeValidInstalledAgent(projectAgentsDir, ORPHANED_AGENT_NAME);

      return sourceDir;
    }

    /**
     * The owner's machine, reduced: one skill directory this CLI installed — its metadata says so
     — whose SKILL.md is gone. Broken, and provably this installation's without the configuration
     * having to name it, which is what keeps it unrelated to every operational row below.
     */
    async function installSkillMissingItsSkillMd(): Promise<void> {
      const skillDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR, UNRELATED_INSTALLED_SKILL_ID);
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.METADATA_YAML),
        stringifyYaml({
          ...VALID_EMBEDDED_SKILL_METADATA_FILE,
          domain: "web",
          forkedFrom: CLI_PROVENANCE,
        }),
      );
    }

    it("names the orphaned agent file a broken skill directory has nothing to do with", async () => {
      await setupProjectWithOperationalFindings();
      await installSkillMissingItsSkillMd();

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(`Missing ${STANDARD_FILES.SKILL_MD}`);
      expect(
        stdout,
        "one unreadable skill directory is not a reason to stop reporting everything else",
      ).not.toContain(SKIP_AFTER_CONTENT_ERRORS);
      expect(stdout).toContain(ROW_NO_ORPHANS);
      expect(stdout).toContain("1 orphaned agent file");
      expect(stdout).toContain(`- ${ORPHANED_AGENT_NAME}.md (not in config)`);
    });

    it("reports config validity and marketplace reachability, which read no skill content", async () => {
      const sourceDir = await setupProjectWithOperationalFindings();
      await installSkillMissingItsSkillMd();

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(ROW_CONFIG_VALID);
      expect(stdout).toContain(`${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS} is valid`);
      expect(stdout).toContain(ROW_MARKETPLACE_REACHABLE);
      expect(stdout).toContain(`Connected to local: ${sourceDir}`);
      expect(
        stdout,
        "the row says which marketplace it read and how this run came to read that one",
      ).toContain(`Read ${sourceDir} from disk — named by this project's configuration`);
    });

    it("reports the compiled agents and the eject-mode skill that never reached disk", async () => {
      await setupProjectWithOperationalFindings();
      await installSkillMissingItsSkillMd();

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(ROW_AGENTS_COMPILED);
      expect(stdout).toContain("1/1 agents compiled");
      expect(stdout).toContain(ROW_SKILLS_INSTALLED);
      expect(stdout).toContain("1 skill missing from disk");
      expect(stdout).toContain(CONFIGURED_SKILL_ID);
      expect(stdout).toContain(ROW_PLUGINS_INSTALLED);
      expect(stdout).toContain("No plugin-mode skills configured");
    });

    /**
     * The one row that genuinely cannot answer. It resolves configured ids against the local-skill
     * discovery pass, and that pass drops any skill whose metadata it cannot read — so a "not found"
     * from it would be the same finding one row above, worded as if it were a second one.
     */
    it("stands the skills row down and says which finding blocked it", async () => {
      await setupProjectWithOperationalFindings();
      await installSkillMissingItsSkillMd();

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toMatch(skippedRow(ROW_SKILLS_RESOLVED));
      expect(
        stdout,
        "a row that stands down must name what blocked it, not carry a blanket notice",
      ).toMatch(new RegExp(`${ROW_SKILLS_RESOLVED}\\s+-\\s+Skipped[^\\n]*skill`, "i"));
    });

    /**
     * Twelve rows are printed and one of them stands down, so eleven verdicts are what the counts
     * add up to. A summary that folded the skipped row into `passed` would claim one nobody reached.
     */
    it("counts only the rows it actually ran", async () => {
      await setupProjectWithOperationalFindings();
      await installSkillMissingItsSkillMd();

      const { stdout } = await runCliCommand(["doctor"]);

      // Four content rows pass and the skills pass fails; of the operational rows the config,
      // agents, plugins and marketplace rows pass, orphans and installed skills warn, and the
      // skills row stands down — counted nowhere.
      expect(stdout).toContain("Summary: 8 passed, 2 warnings, 1 error");
    });

    it("stands the plugins row down when the registry it reads cannot be parsed", async () => {
      await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID], { origin: PLUGIN_MODE_ORIGIN }),
      });
      await mkdir(userPluginsDir(), { recursive: true });
      await writeFile(getInstalledPluginsRegistryPath(userPluginsDir()), UNPARSEABLE_REGISTRY);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      // Every plugin-mode skill would read as "no enabled plugin found" off a registry nobody
      // could parse, which is the registry's finding wearing the row's words.
      expect(stdout).toMatch(skippedRow(ROW_PLUGINS_INSTALLED));
      expect(
        stdout,
        "a row that stands down must name what blocked it, not carry a blanket notice",
      ).toMatch(new RegExp(`${ROW_PLUGINS_INSTALLED}\\s+-\\s+Skipped[^\\n]*plugin`, "i"));
      expect(stdout).not.toContain(SKIP_AFTER_CONTENT_ERRORS);
    });

    it("keeps the rows a broken plugin registry cannot mislead", async () => {
      const sourceDir = await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID], { origin: PLUGIN_MODE_ORIGIN }),
      });
      await mkdir(userPluginsDir(), { recursive: true });
      await writeFile(getInstalledPluginsRegistryPath(userPluginsDir()), UNPARSEABLE_REGISTRY);

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(`${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS} is valid`);
      expect(stdout).toContain(ROW_NO_ORPHANS);
      expect(stdout).toContain(`Connected to local: ${sourceDir}`);
      expect(
        stdout,
        "the matrix resolves the configured skill whatever the registry holds",
      ).toContain("1/1 skills found");
    });

    /**
     * The content pass no operational row reads. `Agents Compiled` asks whether a file is there and
     * `No Orphans` reads the names of the files that are — neither opens one, so a file with no
     * frontmatter changes neither answer.
     */
    it("runs every operational row when the broken content is an agent file", async () => {
      const sourceDir = await setupProjectWithOperationalFindings();
      await writeFile(
        path.join(projectDir, INSTALLED_AGENTS_SUBDIR, "bad-agent.md"),
        AGENT_MD_WITHOUT_FRONTMATTER,
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("Missing or invalid YAML frontmatter");
      expect(stdout).not.toContain(SKIP_AFTER_CONTENT_ERRORS);
      expect(stdout).toContain(`${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS} is valid`);
      expect(stdout).toContain("1/1 skills found");
      expect(stdout).toContain("1/1 agents compiled");
      expect(stdout).toContain("2 orphaned agent files");
      expect(stdout).toContain("- bad-agent.md (not in config)");
      expect(stdout).toContain("1 skill missing from disk");
      expect(stdout).toContain("No plugin-mode skills configured");
      expect(stdout).toContain(`Connected to local: ${sourceDir}`);
    });

    /**
     * The boundary the scoping stops at. Every operational row is read out of config.ts, so a
     * config that cannot be loaded still takes the whole layer down — the one content finding that
     * genuinely cascades into all of them.
     */
    it("keeps the whole layer down when the config every row reads cannot be loaded", async () => {
      await setupProjectWithOperationalFindings();
      await writeCorruptTestConfig(projectDir, UNREADABLE_CONFIG);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain("exists but could not be loaded");
      expect(stdout).toContain(SKIP_AFTER_CONTENT_ERRORS);
      expect(stdout).not.toContain(ROW_CONFIG_VALID);
      expect(stdout).not.toContain(ROW_NO_ORPHANS);
      expect(stdout).not.toContain(ROW_MARKETPLACE_REACHABLE);
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
    expect(firstElement(result.issues).message).toContain("does not exist");
  });

  it("should report error when skills directory is missing", async () => {
    const sourceDir = path.join(tempDir, "source");
    await mkdir(sourceDir, { recursive: true });

    const result = await validateSource(sourceDir);

    expect(result.errorCount).toBe(1);
    expect(firstElement(result.issues).message).toContain("Skills directory does not exist");
  });

  it("should pass validation for a valid source", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);

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

    // Directory name is "react" but the skill id is its SKILL.md frontmatter name
    await writeValidSourceSkill(skillsDir, "web/framework/react", REACT_SOURCE_SKILL);

    await writeTestMatrix(configDir, {
      "web-framework": { domain: "web", displayName: "Framework" },
    });

    const result = await validateSource(sourceDir);

    const mismatchIssues = result.issues.filter((i) =>
      i.message.includes("does not match skill id"),
    );
    expect(mismatchIssues.length).toBe(1);
    expect(firstElement(mismatchIssues).severity).toBe("warning");
    expect(firstElement(mismatchIssues).message).toContain(`'${CONFIGURED_SKILL_ID}'`);
  });

  it("should not warn about a human displayName when the directory name equals the skill id", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });

    await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, {
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

    await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);

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

    await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);

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
    await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);

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
    expect(firstElement(crossRefWarnings).severity).toBe("warning");
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

  /**
   * The same defect, weighed by whether the reader can act on it. An author is standing in the
   * repository that holds the typo and wants the run to fail; a consumer is being told about a
   * file they cannot open, in a marketplace whose skills still install and still resolve.
   */
  describe("a slug the marketplace's own rules dangle", () => {
    it("is an error for the author of the marketplace being validated", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildSourceWithDanglingRuleSlug(sourceDir);

      const result = await validateSource(sourceDir, "author");

      const slugIssues = result.issues.filter((i) => i.message.includes(DANGLING_RULE_SLUG));
      expect(slugIssues).toHaveLength(1);
      expect(firstElement(slugIssues).severity).toBe("error");
    });

    it("is a warning that names the marketplace for a reader who only consumes it", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildSourceWithDanglingRuleSlug(sourceDir);

      const result = await validateSource(sourceDir, "consumer");

      const slugIssues = result.issues.filter((i) => i.message.includes(DANGLING_RULE_SLUG));
      expect(slugIssues).toHaveLength(1);
      expect(firstElement(slugIssues).severity).toBe("warning");
      expect(
        firstElement(slugIssues).message,
        "a reader who cannot open the file has to be told whose file it is",
      ).toContain(sourceDir);
      expect(result.errorCount).toBe(0);
    });

    it("moves no other health finding when the reader only consumes the marketplace", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildSourceWithDanglingSlugAndAuditContradiction(sourceDir);

      const result = await validateSource(sourceDir, "consumer");

      const auditIssues = result.issues.filter((i) =>
        i.message.includes(UNIVERSAL_VERDICT_SKILL.id),
      );
      expect(auditIssues).toHaveLength(1);
      expect(
        firstElement(auditIssues).severity,
        "only the unresolved-slug finding is under the ruling",
      ).toBe("error");
      expect(result.errorCount).toBe(1);
    });
  });

  /**
   * `doctor` prints a finding as `- [ERROR] <file>: <message>`, so the path is the file the reader
   * opens. Each health finding has to name the file its own defect is written in — a family of
   * findings sharing one path is only correct when every member lives there, and these do not.
   */
  describe("the file a cross-reference finding sends the reader to", () => {
    it("names the rules file for a slug the marketplace's rules dangle", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildSourceWithDanglingRuleSlug(sourceDir);

      const result = await validateSource(sourceDir, "author");

      const slugIssues = result.issues.filter((i) => i.message.includes(DANGLING_RULE_SLUG));
      expect(
        firstElement(slugIssues).file,
        "the typo is written in the rules file — the categories file does not contain the slug",
      ).toBe(SKILL_RULES_PATH);
    });

    it("names the rules file for a consumer of that marketplace too", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildSourceWithDanglingRuleSlug(sourceDir);

      const result = await validateSource(sourceDir, "consumer");

      const slugIssues = result.issues.filter((i) => i.message.includes(DANGLING_RULE_SLUG));
      expect(
        firstElement(slugIssues).file,
        "the reader changes the severity and the wording, never which file holds the defect",
      ).toBe(SKILL_RULES_PATH);
    });

    it("names the audit manifest for a verdict the matrix contradicts", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildSourceWithDanglingSlugAndAuditContradiction(sourceDir);

      const result = await validateSource(sourceDir, "author");

      const auditIssues = result.issues.filter((i) =>
        i.message.includes(UNIVERSAL_VERDICT_SKILL.id),
      );
      expect(
        firstElement(auditIssues).file,
        "the verdict is recorded in the audit manifest, not in the marketplace being validated",
      ).toBe(AUDIT_MANIFEST_FILE);
    });

    it("names the categories file for a category that declares no domain", async () => {
      const sourceDir = path.join(tempDir, "source");
      const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
      const configDir = path.join(sourceDir, "config");
      await mkdir(configDir, { recursive: true });

      await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);
      await writeTestMatrix(configDir, { "web-framework": { displayName: "Framework" } });

      const result = await validateSource(sourceDir, "author");

      const domainIssues = result.issues.filter((i) => i.message.includes("has no domain"));
      expect(
        firstElement(domainIssues).file,
        "the category is declared in the categories file, so this one was already right",
      ).toBe(SKILL_CATEGORIES_PATH);
    });
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
