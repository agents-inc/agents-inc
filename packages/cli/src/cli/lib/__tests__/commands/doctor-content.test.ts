import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TEST_SOURCE_URL } from "../test-constants.js";
import path from "path";
import { chmod, mkdir, rm, writeFile } from "fs/promises";
import { stringify as stringifyYaml } from "yaml";
import { runCliCommand } from "../helpers/cli-runner.js";
import { compactCliOutput } from "../helpers/flatten-cli-output.js";
import {
  writeRawTestConfig,
  writeTestPackageJson,
  writeTestTsConfig,
} from "../helpers/config-io.js";
import {
  writeTestInstalledPluginsRegistry,
  writeTestPluginManifest,
} from "../helpers/disk-writers.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import {
  fingerprintSharedCheckout,
  SHARED_CHECKOUT_ETAG,
} from "../helpers/shared-marketplace-checkout.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { renderUnparseableConfigTs } from "../factories/unloadable-config-factories.js";
import { buildSkillConfigs, type FixtureProjectConfig } from "../helpers/skill-config-builders.js";
import { createTempDir, cleanupTempDir } from "../test-fs-utils";
import { validateSource } from "../../source-validator";
import { getInstalledPluginsRegistryPath } from "../../plugins/plugin-settings";
import { validatePlugin } from "../../plugins/plugin-validator";
import {
  DEFAULT_PUBLIC_SOURCE_NAME,
  MARKETPLACE_JSON,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  PLUGINS_SUBDIR,
  PUBLIC_CATALOGUE_PACKAGE,
  CLAUDE_DIR,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
  marketplaceManifestPath,
  UI_SYMBOLS,
} from "../../../consts";
import {
  createMockMarketplace,
  createMockMarketplacePlugin,
} from "../factories/plugin-factories.js";
import type { AgentName, RelationshipDefinitions } from "../../../types";
import { resolveInstallPaths } from "../../installation/index.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import {
  agentsDir as hostAgentsDir,
  skillsDir as hostSkillsDir,
} from "../../installation/install-layout.js";
import {
  TEST_MARKETPLACE_NAME,
  testMarketplaceSkillId,
  type TestSkill,
} from "../fixtures/create-test-source";
import { renderAgentMd, renderConfigTs, renderSkillMd } from "../content-generators";
import { stampProvenanceMarker } from "../../agents/agent-provenance.js";
import {
  VALID_EMBEDDED_SKILL_METADATA_FILE,
  VALID_SKILL_CATEGORIES_FILE,
  VALID_SKILL_RULES_FILE,
} from "../mock-data/mock-source-files.js";
import { EXIT_CODES } from "../../exit-codes";
import { firstElement } from "../helpers/element-at.js";

const INSTALLED_SKILLS_SUBDIR = path.join(CLAUDE_DIR, STANDARD_DIRS.SKILLS);
const INSTALLED_AGENTS_SUBDIR = path.join(CLAUDE_DIR, "agents");

const CONTENT_SECTION = "Content checks";
const OPERATIONAL_SECTION = "Operational checks";
const SKIP_AFTER_CONTENT_ERRORS = "Skipped — fix the content errors above first";

const ROW_CONFIG_VALID = "Config Valid";
const ROW_SKILLS_RESOLVED = "Skills Resolved";
const ROW_AGENTS_COMPILED = "Agents Compiled";
const ROW_NO_ORPHANS = "No Orphans";
const ROW_SKILLS_INSTALLED = "Skills Installed";
const ROW_PLUGINS_INSTALLED = "Plugins Installed";
const ROW_MARKETPLACE_REACHABLE = "Marketplace Reachable";

/** One row standing down; the blanket notice has no row name or status column, so never matches. */
function skippedRow(name: string): RegExp {
  return new RegExp(`${name}\\s+${UI_SYMBOLS.SKIPPED}\\s+Skipped`);
}

const CONFIGURED_AGENT_NAME = "web-developer";

const ORPHANED_AGENT_NAME = "orphan-agent";

/** Namespaced: a custom marketplace shipping a public-catalogue id is refused whole at load. */
const CONFIGURED_SKILL_ID = testMarketplaceSkillId("web-framework-react");

/** Content the operational rows must survive, so nothing else in the fixture may read it. */
const UNRELATED_INSTALLED_SKILL_ID = "web-framework-vue-composition-api";

/** A marketplace origin rather than eject, which makes a skill plugin-mode. */
const PLUGIN_MODE_ORIGIN = "agents-inc";

/** A name Claude Code will not register plugins under, and the same name in the accepted form. */
const MANIFEST_NAME_REFUSED = "Acme_Skills";
const MANIFEST_NAME_ACCEPTED = "acme-skills";

const MARKETPLACES_ROW_CLEAN = "1 marketplace validated";

/** The cloud metadata service: an address the marketplace check refuses wherever it is named. */
const PRIVATE_ADDRESS_MARKETPLACE = "http://169.254.169.254/latest";

/** Printed by a run that finished, not by an aborted one. */
const SUMMARY_LINE = "Summary:";

const MARKETPLACE_MANIFEST_FILE = path.join(PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON);

const MANIFEST_DEFECTS = ["absent", "unparseable", "refused by the schema"] as const;

// Doctor asks the marketplace itself, which here confirms the shared checkout current.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { headers: { etag: SHARED_CHECKOUT_ETAG } })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function breakMarketplaceManifest(
  sourceDir: string,
  defect: (typeof MANIFEST_DEFECTS)[number],
): Promise<void> {
  const manifestPath = marketplaceManifestPath(sourceDir);
  if (defect === "absent") {
    await rm(manifestPath, { force: true });
    return;
  }
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    // A marketplace listing no plugin is the shape the schema refuses outright.
    defect === "unparseable" ? "{ this is not json" : JSON.stringify(createMockMarketplace([])),
  );
}

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

const UNPARSEABLE_REGISTRY = "{ not valid json !!!";

const AGENT_MD_WITHOUT_FRONTMATTER = "# Just a plain markdown file, no frontmatter here.\n";

const DANGLING_RULE_SLUG = "angular-standalone";

/** Pairs a shipped slug with an unshipped one; the merge drops it and records the typo. */
const RULES_WITH_DANGLING_SLUG: Partial<RelationshipDefinitions> = {
  conflicts: [
    {
      skills: ["react", DANGLING_RULE_SLUG],
      reason: "Deliberately names a slug no skill in this marketplace carries",
    },
  ],
};

/** This CLI's file, not the marketplace's: verdicts the matrix contradicts are recorded there. */
const AUDIT_MANIFEST_FILE = "src/cli/lib/configuration/skill-audit.ts";

/**
 * Recorded as `universal`, so an exclusive category contradicts it: the control error finding. Its
 * id is bare (the manifest keys catalogue ids), so only a catalogue source may ship it.
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

/** Installed by something else: an MCP helper skill with no metadata.yaml. */
const FOREIGN_SKILL_DIR = "context7-mcp";

/** Its presence is one of the two things that make a directory this installation's to judge. */
const CLI_PROVENANCE = {
  skillId: "web-framework-react",
  contentHash: "abc1234",
  date: "2026-01-01",
};

/** Provenance is always stamped: a skill directory without it is someone else's. */
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

/** A category may omit `domain`, which the health check reports as `category-missing-domain`. */
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

async function buildValidSource(sourceDir: string): Promise<void> {
  const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
  const configDir = path.join(sourceDir, "config");
  await mkdir(configDir, { recursive: true });

  // Directory name equals the skill id, so the source is warning-free.
  await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);

  await writeTestMatrix(configDir, {
    "web-framework": { domain: "web", displayName: "Framework" },
  });
  await writeMarketplaceManifest(sourceDir, TEST_MARKETPLACE_NAME);
}

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
  await writeMarketplaceManifest(sourceDir, TEST_MARKETPLACE_NAME);
}

/**
 * Adds a `universal` skill in an exclusive category. Built as the public catalogue's checkout (see
 * package.json below), since only the catalogue may ship the catalogue ids the manifest names.
 */
async function buildSourceWithDanglingSlugAndAuditContradiction(sourceDir: string): Promise<void> {
  const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
  const configDir = path.join(sourceDir, "config");
  await mkdir(configDir, { recursive: true });
  await writeTestPackageJson(sourceDir, { name: PUBLIC_CATALOGUE_PACKAGE });

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
  await writeMarketplaceManifest(sourceDir, DEFAULT_PUBLIC_SOURCE_NAME);
}

async function buildInvalidSource(sourceDir: string): Promise<void> {
  const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
  const skillDir = path.join(skillsDir, "web", "framework", "react");
  await mkdir(skillDir, { recursive: true });

  await writeFile(
    path.join(skillDir, STANDARD_FILES.SKILL_MD),
    renderSkillMd("web-framework-react", "React"),
  );

  // Missing required fields: displayName, cliDescription, usageGuidance, slug.
  await writeFile(
    path.join(skillDir, STANDARD_FILES.METADATA_YAML),
    stringifyYaml({ category: "web-framework", author: "@test" }),
  );
  await writeMarketplaceManifest(sourceDir, TEST_MARKETPLACE_NAME);
}

/** The config declares an agent, since a content-less config is not detected as an installation. */
async function setupValidatedProject(
  tempDir: string,
  projectDir: string,
  configOverrides: Partial<FixtureProjectConfig> = {},
): Promise<string> {
  const sourceDir = path.join(tempDir, "source");
  await buildValidSource(sourceDir);
  await writeTestTsConfig(
    projectDir,
    buildProjectConfig({
      name: "test-project",
      skills: [],
      agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
      marketplace: sourceDir,
      ...configOverrides,
    }),
  );
  return sourceDir;
}

describe("doctor content checks", () => {
  let tempDir: string;
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-doctor-content-"));
    await fingerprintSharedCheckout(fakeHome);
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

    /** A broken marketplace misleads only the skills row; the rest read config.ts and disk. */
    it("should stand down only the row a broken primary source can mislead", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildInvalidSource(sourceDir);
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          skills: buildSkillConfigs([CONFIGURED_SKILL_ID]),
          agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
          marketplace: sourceDir,
        }),
      );

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
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: TEST_SOURCE_URL,
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("skipped (remote)");
      expect(stdout).toContain("github:agents-inc/skills");
      expect(stdout).toContain("0 errors");
    });

    it("should validate the one source the installation reads from", async () => {
      const primarySourceDir = path.join(tempDir, "primary-source");
      await buildValidSource(primarySourceDir);

      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: primarySourceDir,
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain("1 marketplace validated");
      expect(stdout).toContain(primarySourceDir);
    });

    /** `— 1 skill` is a prefix of `— 1 skills`, so the singular is pinned from both sides. */
    it("should count the one skill a validated marketplace holds in the singular", async () => {
      const sourceDir = await setupValidatedProject(tempDir, projectDir);

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout, "the Marketplaces row names what it counted").toContain(
        `(${sourceDir}) — 1 skill`,
      );
      expect(stdout, "one skill is not counted as skills").not.toContain(
        `(${sourceDir}) — 1 skills`,
      );
    });

    /** A tick under a warning about the same file contradicts it; the accepted name still ticks. */
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

    /**
     * A custom marketplace without a valid manifest is reported against that file and the report
     * still finishes: an error for an installation, a warning in its author's repo pre-build.
     */
    describe("a marketplace with no valid marketplace.json", () => {
      it.each(MANIFEST_DEFECTS)(
        "should fail the marketplace an installation reads from when its manifest is %s",
        async (defect) => {
          const sourceDir = await setupValidatedProject(tempDir, projectDir);
          await breakMarketplaceManifest(sourceDir, defect);

          const { stdout, error } = await runCliCommand(["doctor"]);

          expect(
            stdout,
            "the finding must be filed against the manifest, as an error over an installation",
          ).toContain(`[ERROR] ${MARKETPLACE_MANIFEST_FILE}`);
          expect(
            stdout,
            "a marketplace nothing can load must not be counted as validated",
          ).not.toContain(MARKETPLACES_ROW_CLEAN);
          expect(stdout, "doctor must finish its report rather than abort on it").toContain(
            SUMMARY_LINE,
          );
          expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
        },
      );

      it("should warn its author, against the manifest, in a repository nobody has built", async () => {
        await buildValidSource(projectDir);
        await breakMarketplaceManifest(projectDir, "absent");

        const { stdout, error } = await runCliCommand(["doctor"]);

        expect(
          stdout,
          "an unbuilt repository's own author is told about the manifest as a warning against the file",
        ).toContain(`[WARN] ${MARKETPLACE_MANIFEST_FILE}`);
        expect(error, "the author's half-built repository is not a failed run").toBeUndefined();
      });
    });

    it("should exit with ERROR when a registered source path does not exist", async () => {
      const missingSourceDir = path.join(tempDir, "does-not-exist");
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: missingSourceDir,
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(missingSourceDir);
      expect(stdout).toMatch(/does not exist/);
    });

    it("should attribute each pass's own errors instead of reporting one aggregate", async () => {
      // One error each in sources, plugins and skills; a source with no skills dir is one.
      const sourceDir = path.join(tempDir, "source");
      await mkdir(sourceDir, { recursive: true });
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          // Naming the skill makes its directory this installation's to judge.
          skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: sourceDir,
        }),
      );

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

    it("should name both passes whose errors a stood-down row would only restate", async () => {
      // A source with no skills dir is a marketplace error; a skill missing metadata.yaml is a
      // skill error. The skills row reads through both.
      const sourceDir = path.join(tempDir, "source");
      await mkdir(sourceDir, { recursive: true });
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: sourceDir,
        }),
      );
      const skillDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR, "web-framework-react");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        path.join(skillDir, STANDARD_FILES.SKILL_MD),
        renderSkillMd("web-framework-react", "React"),
      );

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toMatch(
        new RegExp(
          `${ROW_SKILLS_RESOLVED}\\s+${UI_SYMBOLS.SKIPPED}\\s+Skipped — this row would only restate the marketplace and skill errors above\\n`,
        ),
      );
    });

    /** The author stands in the repo with the typo; the consumer is told about someone else's. */
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
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          skills: buildSkillConfigs([CONFIGURED_SKILL_ID]),
          agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
          marketplace: sourceDir,
        }),
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toMatch(/1 marketplace: 0 errors, 1 warning/);
      expect(stdout).toContain(DANGLING_RULE_SLUG);
      expect(stdout).toContain(`Marketplace '${sourceDir}'`);
    });

    /** The stand-down keys on a failing content pass; an unresolved rule slug drops no skill. */
    it("should stand no operational row down for a marketplace warning", async () => {
      const sourceDir = path.join(tempDir, "source");
      await buildSourceWithDanglingRuleSlug(sourceDir);
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "test-project",
          skills: buildSkillConfigs([CONFIGURED_SKILL_ID]),
          agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
          marketplace: sourceDir,
        }),
      );

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(OPERATIONAL_SECTION);
      expect(stdout).toContain(ROW_SKILLS_RESOLVED);
      expect(stdout, "a warning disables nothing — the skills row still answers").not.toMatch(
        skippedRow(ROW_SKILLS_RESOLVED),
      );
      expect(stdout).toContain("1/1 skill found");
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

      const pluginDir = path.join(projectDir, CLAUDE_DIR, PLUGINS_SUBDIR, "my-plugin");
      await writeTestPluginManifest(
        pluginDir,
        { name: "my-plugin", version: "1.0.0" },
        { pretty: false },
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      // A clean pass reads "<n> validated", one with warnings its counts; errors must be zero.
      expect(stdout).toMatch(/1 plugin(: 0 errors| validated)/);
    });

    it("should surface plugin errors in the aggregate exit code", async () => {
      await setupValidatedProject(tempDir, projectDir);

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
      expect(stdout).toMatch(/2 skills: 2 errors/);
      // The pass did not abort after the broken skill.
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

      // No metadata.yaml, so the configuration naming the id is the whole claim.
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
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          name: "test-project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"]),
          marketplace: sourceDir,
        }),
      );

      await writeValidInstalledSkill(
        path.join(fakeHome, INSTALLED_SKILLS_SUBDIR),
        "web-framework-react",
      );
      await writeValidInstalledAgent(path.join(fakeHome, INSTALLED_AGENTS_SUBDIR), "web-developer");

      // cwd === homedir().
      process.chdir(fakeHome);
      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      // Without the dedup both scopes resolve to one directory and count each file twice.
      expect(stdout).toContain("1 skill validated");
      expect(stdout).toContain("1 agent validated");
    });
  });

  /**
   * An operational row may stand down only if it reads the content a finding is about; the orphan,
   * config and marketplace rows open no skill, registry or agent frontmatter.
   */
  describe("operational rows an unrelated content error must not silence", () => {
    const userPluginsDir = () => path.join(fakeHome, CLAUDE_DIR, PLUGINS_SUBDIR);

    /** An orphaned agent and a missing eject skill: findings true whatever skill metadata says. */
    async function setupProjectWithOperationalFindings(): Promise<string> {
      const sourceDir = await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID]),
      });

      const projectAgentsDir = path.join(projectDir, INSTALLED_AGENTS_SUBDIR);
      await writeValidInstalledAgent(projectAgentsDir, CONFIGURED_AGENT_NAME);
      await writeValidInstalledAgent(projectAgentsDir, ORPHANED_AGENT_NAME);

      return sourceDir;
    }

    /** A CLI-installed skill (per its metadata) missing SKILL.md: unrelated to every row below. */
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
      expect(stdout).toContain(`.agents-inc/claude/${STANDARD_FILES.CONFIG_TS} is valid`);
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
      expect(stdout).toContain("1/1 agent compiled");
      expect(stdout).toContain(ROW_SKILLS_INSTALLED);
      expect(stdout).toContain("1 skill missing from disk");
      expect(stdout).toContain(CONFIGURED_SKILL_ID);
      expect(stdout).toContain(ROW_PLUGINS_INSTALLED);
      expect(stdout).toContain("No plugin-mode skills configured");
    });

    /** Configured ids resolve through local discovery, which drops unreadable skills. */
    it("stands the skills row down and says which finding blocked it", async () => {
      await setupProjectWithOperationalFindings();
      await installSkillMissingItsSkillMd();

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toMatch(skippedRow(ROW_SKILLS_RESOLVED));
      expect(
        stdout,
        "a row that stands down must name what blocked it, not carry a blanket notice",
      ).toMatch(
        new RegExp(`${ROW_SKILLS_RESOLVED}\\s+${UI_SYMBOLS.SKIPPED}\\s+Skipped[^\\n]*skill`, "i"),
      );
    });

    /** The skipped row must be counted nowhere: a count is the claim, so it stays a count. */
    it("counts only the rows it actually ran", async () => {
      await setupProjectWithOperationalFindings();
      await installSkillMissingItsSkillMd();

      const { stdout } = await runCliCommand(["doctor"]);

      // Four content rows pass and the skills pass fails; of the operational rows the config,
      // layout, placements, agents, plugins and marketplace rows pass, orphans and installed skills
      // warn, and the skills row stands down — counted nowhere.
      expect(stdout).toContain("Summary: 10 passed, 2 warnings, 1 error");
    });

    it("stands the plugins row down when the registry it reads cannot be parsed", async () => {
      await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID], { origin: PLUGIN_MODE_ORIGIN }),
      });
      await mkdir(userPluginsDir(), { recursive: true });
      await writeFile(getInstalledPluginsRegistryPath(userPluginsDir()), UNPARSEABLE_REGISTRY);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      // Off an unparseable registry, every plugin skill would read "no enabled plugin found".
      expect(stdout).toMatch(skippedRow(ROW_PLUGINS_INSTALLED));
      expect(
        stdout,
        "a row that stands down must name what blocked it, not carry a blanket notice",
      ).toMatch(
        new RegExp(
          `${ROW_PLUGINS_INSTALLED}\\s+${UI_SYMBOLS.SKIPPED}\\s+Skipped[^\\n]*plugin`,
          "i",
        ),
      );
      expect(stdout).not.toContain(SKIP_AFTER_CONTENT_ERRORS);
    });

    it("keeps the rows a broken plugin registry cannot mislead", async () => {
      const sourceDir = await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID], { origin: PLUGIN_MODE_ORIGIN }),
      });
      await mkdir(userPluginsDir(), { recursive: true });
      await writeFile(getInstalledPluginsRegistryPath(userPluginsDir()), UNPARSEABLE_REGISTRY);

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(`.agents-inc/claude/${STANDARD_FILES.CONFIG_TS} is valid`);
      expect(stdout).toContain(ROW_NO_ORPHANS);
      expect(stdout).toContain(`Connected to local: ${sourceDir}`);
      expect(
        stdout,
        "the matrix resolves the configured skill whatever the registry holds",
      ).toContain("1/1 skill found");
    });

    /** Neither agent row opens a file, so missing frontmatter changes neither answer. */
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
      expect(stdout).toContain(`.agents-inc/claude/${STANDARD_FILES.CONFIG_TS} is valid`);
      expect(stdout).toContain("1/1 skill found");
      expect(stdout).toContain("1/1 agent compiled");
      expect(stdout).toContain("2 orphaned agent files");
      expect(stdout).toContain("- bad-agent.md (not in config)");
      expect(stdout).toContain("1 skill missing from disk");
      expect(stdout).toContain("No plugin-mode skills configured");
      expect(stdout).toContain(`Connected to local: ${sourceDir}`);
    });

    /** Every operational row reads config.ts, so an unloadable config takes the layer down. */
    it("keeps the whole layer down when the config every row reads cannot be loaded", async () => {
      await setupProjectWithOperationalFindings();
      await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

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

    // Missing required fields: displayName, cliDescription, usageGuidance.
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

    // The skill id is its SKILL.md frontmatter name, not the directory name.
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

    const matrixCategories = {
      "web-framework": {
        id: "web-framework",
        displayName: "Framework",
        description: "Framework skills",
        domain: "web",
        exclusive: true,
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

    // Unresolved slugs are dropped during resolution, so the health check sees none.
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
    await writeMarketplaceManifest(sourceDir, TEST_MARKETPLACE_NAME);

    const result = await validateSource(sourceDir);

    expect(result.errorCount).toBe(0);
    const crossRefSkipped = result.issues.filter((i) =>
      i.message.includes("Cross-reference validation skipped"),
    );
    expect(crossRefSkipped).toHaveLength(0);
  });

  it("should report warning when cross-reference validation cannot load matrix", async () => {
    const sourceDir = path.join(tempDir, "source");
    const skillsDir = path.join(sourceDir, "src", STANDARD_DIRS.SKILLS);
    await mkdir(skillsDir, { recursive: true });

    // A malformed categories config makes Phase 3 fail.
    await writeValidSourceSkill(skillsDir, CONFIGURED_SKILL_ID, REACT_SOURCE_SKILL);

    const configDir = path.join(sourceDir, "config");
    await mkdir(configDir, { recursive: true });
    await writeFile(path.join(configDir, "skill-categories.ts"), "export default INVALID;");
    await writeMarketplaceManifest(sourceDir, TEST_MARKETPLACE_NAME);

    const result = await validateSource(sourceDir);

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

    const schemaErrors = result.issues.filter(
      (i) => i.severity === "error" && i.file.includes("my-linter"),
    );
    expect(schemaErrors).toHaveLength(0);
  });

  /** An author can fix the typo and wants the run to fail; a consumer cannot open the file. */
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

  /** Each finding must name the file its own defect is written in. */
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
      await writeMarketplaceManifest(sourceDir, TEST_MARKETPLACE_NAME);

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

/** The whole report for states a person meets, so a changed word, row or symbol is a red test. */
describe("the doctor report, line by line", () => {
  let tempDir: string;
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ tempDir, projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-doctor-report-"));
    await fingerprintSharedCheckout(fakeHome);
  });

  afterEach(async () => {
    await cleanup();
  });

  const HEADER = ["", "Agents Inc. Doctor", "", "  Checking configuration health...", ""];

  function cleanContent(sourceDir: string, { skills, agents }: { skills: number; agents: number }) {
    return [
      "  Content checks",
      "    Config                  ✓  1 config validated",
      "    Marketplaces            ✓  1 marketplace validated",
      `                               - marketplace (${sourceDir}) — 1 skill`,
      "    Plugins                 ✓  No plugins to validate",
      `    Skills                  ✓  ${skills === 0 ? "No skills to validate" : `${skills} skill validated`}`,
      `    Agents                  ✓  ${agents === 0 ? "No agents to validate" : `${agents} agent validated`}`,
      "",
    ];
  }

  function reachedLocally(sourceDir: string, namedBy: string): string[] {
    return [
      `    Marketplace Reachable   ✓  Connected to local: ${sourceDir}`,
      "                               1 skill available",
      `                               Read ${sourceDir} from disk — ${namedBy}`,
    ];
  }

  async function installEjectedReact(): Promise<string> {
    const sourceDir = await setupValidatedProject(tempDir, projectDir, {
      skills: [
        ...buildSkillConfigs([CONFIGURED_SKILL_ID], { origin: "eject" }),
        // Excluded, and installed nowhere: no row may count it.
        ...buildSkillConfigs(["web-testing-vitest"], { origin: "eject", excluded: true }),
      ],
    });
    await writeValidInstalledSkill(
      path.join(projectDir, INSTALLED_SKILLS_SUBDIR),
      CONFIGURED_SKILL_ID,
    );
    await writeValidInstalledAgent(
      path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
      CONFIGURED_AGENT_NAME,
    );
    return sourceDir;
  }

  it("reports a healthy installation row by row, with no tip", async () => {
    const sourceDir = await installEjectedReact();

    const { stdout, error } = await runCliCommand(["doctor"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        ...cleanContent(sourceDir, { skills: 1, agents: 1 }),
        "  Operational checks",
        "    Config Valid            ✓  This project: .agents-inc/claude/config.ts is valid",
        "    Layout                  ✓  This project is on .agents-inc/claude/",
        "    Placements Offered      ✓  Every configured skill is placeable",
        "    Skills Resolved         ✓  1/1 skill found",
        "    Agents Compiled         ✓  1/1 agent compiled",
        "    No Orphans              ✓  No orphaned agent files",
        "    Skills Installed        ✓  1/1 eject-mode skill installed",
        "    Plugins Installed       ✓  No plugin-mode skills configured",
        ...reachedLocally(sourceDir, "named by this project's configuration"),
        "",
        "  Summary: 14 passed, 0 warnings, 0 errors",
        "",
        "",
      ].join("\n"),
    );
  });

  it("reports a project with no configuration, skipping the rows that read one", async () => {
    const { stdout, error } = await runCliCommand(["doctor"]);

    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain(
      [
        "  Operational checks",
        "    Config Valid            ✗  This project: .agents-inc/claude/config.ts not found",
        "                               Run 'npx agents-inc init' to create a configuration",
        "    Placements Offered      ✓  Every configured skill is placeable",
        "    Skills Resolved         –  Skipped (config invalid)",
        "    Agents Compiled         –  Skipped (config invalid)",
        "    No Orphans              –  Skipped (config invalid)",
        "    Skills Installed        –  Skipped (config invalid)",
        "    Plugins Installed       –  Skipped (config invalid)",
        "    Marketplace Reachable   ✓  Connected to remote: ",
      ].join("\n"),
    );
    expect(stdout).toContain(
      "Reached github:agents-inc/skills over the network — nothing here names one, so this is the default\n",
    );
    expect(
      stdout.endsWith(
        [
          "  Summary: 7 passed, 0 warnings, 1 error",
          "",
          "  Tip: Run 'npx agents-inc init' to create or fix configuration",
          "",
          "",
        ].join("\n"),
      ),
    ).toBe(true);
  });

  it("fails the marketplace row when the marketplace does not answer, reading no saved copy", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        name: "test-project",
        skills: [],
        agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
        marketplace: TEST_SOURCE_URL,
      }),
    );
    await writeValidInstalledAgent(
      path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
      CONFIGURED_AGENT_NAME,
    );

    const { stdout, error } = await runCliCommand(["doctor"]);

    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain(
      [
        "    Skills Resolved         –  Skipped (marketplace unreachable)",
        "    Agents Compiled         ✓  1/1 agent compiled",
      ].join("\n"),
    );
    expect(stdout).toContain(
      [
        `    Marketplace Reachable   ✗  Could not reach ${TEST_SOURCE_URL}`,
        "                               fetch failed",
        "                               Doctor asks the marketplace itself, not the saved copy, which other commands still read offline",
        "",
        "  Summary:",
      ].join("\n"),
    );
  });

  it("names the global config a project without its own inherits, and the agent it must recompile", async () => {
    const sourceDir = await setupValidatedProject(tempDir, fakeHome, {
      agents: buildAgentConfigs([CONFIGURED_AGENT_NAME], { scope: "global" }),
    });

    const { stdout, error } = await runCliCommand(["doctor"]);

    expect(error).toBeUndefined();
    expect(stdout).toBe(
      [
        ...HEADER,
        ...cleanContent(sourceDir, { skills: 0, agents: 0 }),
        "  Operational checks",
        "    Config Valid            ✓  This project: no config.ts, using the global installation's (~/.agents-inc/claude/config.ts), which is valid",
        "    Layout                  ✓  The global installation is on .agents-inc/claude/",
        "    Placements Offered      ✓  Every configured skill is placeable",
        "    Skills Resolved         ✓  No skills configured",
        "    Agents Compiled         !  1 agent needs recompilation",
        "                               - web-developer (missing)",
        "    No Orphans              ✓  No orphaned agent files",
        "    Skills Installed        ✓  No eject-mode skills configured",
        "    Plugins Installed       ✓  No plugin-mode skills configured",
        ...reachedLocally(sourceDir, "named by the global configuration"),
        "",
        "  Summary: 13 passed, 1 warning, 0 errors",
        "",
        "  Tip: Run 'npx agents-inc compile' to generate missing agent files",
        "",
        "",
      ].join("\n"),
    );
  });

  it("names the home directory's own config by its home-relative path", async () => {
    await setupValidatedProject(tempDir, fakeHome);
    process.chdir(fakeHome);

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      "    Config Valid            ✓  The global installation: ~/.agents-inc/claude/config.ts is valid\n",
    );
  });

  it("names the one agent whose file is missing beside one that is compiled", async () => {
    await setupValidatedProject(tempDir, projectDir, {
      agents: buildAgentConfigs([CONFIGURED_AGENT_NAME, "api-developer"]),
    });
    const agentsDir = path.join(projectDir, INSTALLED_AGENTS_SUBDIR);
    await mkdir(agentsDir, { recursive: true });
    await writeFile(path.join(agentsDir, `${CONFIGURED_AGENT_NAME}.md`), "# compiled\n");

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    Agents Compiled         !  1 agent needs recompilation",
        "                               - api-developer (missing)",
      ].join("\n"),
    );
  });

  it("counts several agents that need recompiling in the plural", async () => {
    await setupValidatedProject(tempDir, projectDir, {
      agents: buildAgentConfigs([CONFIGURED_AGENT_NAME, "api-developer"]),
    });

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    Agents Compiled         !  2 agents need recompilation",
        "                               - web-developer (missing)",
        "                               - api-developer (missing)",
      ].join("\n"),
    );
  });

  it.each([
    ["the project's", () => projectDir],
    ["the home directory's", () => fakeHome],
  ])(
    "counts a configured skill found in %s own skills folder, and names each found nowhere",
    async (_where, rootOf) => {
      await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs([
          CONFIGURED_SKILL_ID,
          "web-framework-react",
          "web-testing-vitest",
        ]),
      });
      await writeValidInstalledSkill(
        path.join(rootOf(), INSTALLED_SKILLS_SUBDIR),
        "web-framework-react",
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(
        [
          "    Skills Resolved         ✗  2/3 skills found",
          "                               - web-testing-vitest (not found)",
          "    Agents Compiled",
        ].join("\n"),
      );
      expect(stdout).toContain("  Tip: Check skill IDs in config match available skills\n");
    },
  );

  it("names each agent file no configuration claims", async () => {
    await setupValidatedProject(tempDir, projectDir);
    await writeValidInstalledAgent(
      path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
      CONFIGURED_AGENT_NAME,
    );
    await writeValidInstalledAgent(
      path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
      ORPHANED_AGENT_NAME,
    );
    await writeValidInstalledAgent(path.join(fakeHome, INSTALLED_AGENTS_SUBDIR), "global-orphan");

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    No Orphans              !  2 orphaned agent files",
        `                               - ${ORPHANED_AGENT_NAME}.md (not in config)`,
        "                               - global-orphan.md (not in config)",
      ].join("\n"),
    );
  });

  it("counts a global agent's file as known, excluded or not, beside the project's own", async () => {
    await setupValidatedProject(tempDir, projectDir, {
      agents: [
        ...buildAgentConfigs([CONFIGURED_AGENT_NAME]),
        ...buildAgentConfigs(["api-developer"], { scope: "global", excluded: true }),
        ...buildAgentConfigs(["cli-developer"], { scope: "global" }),
      ],
    });
    await writeValidInstalledAgent(
      path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
      CONFIGURED_AGENT_NAME,
    );
    await writeValidInstalledAgent(path.join(fakeHome, INSTALLED_AGENTS_SUBDIR), "api-developer");
    await writeValidInstalledAgent(path.join(fakeHome, INSTALLED_AGENTS_SUBDIR), "cli-developer");

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain("    No Orphans              ✓  No orphaned agent files\n");
  });

  it("counts a project agent's file in the global folder as an orphan", async () => {
    await setupValidatedProject(tempDir, projectDir);
    await writeValidInstalledAgent(
      path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
      CONFIGURED_AGENT_NAME,
    );
    await writeValidInstalledAgent(
      path.join(fakeHome, INSTALLED_AGENTS_SUBDIR),
      CONFIGURED_AGENT_NAME,
    );

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    No Orphans              !  1 orphaned agent file",
        `                               - ${CONFIGURED_AGENT_NAME}.md (not in config)`,
      ].join("\n"),
    );
  });

  it("at home, counts the global agents beside the project ones in the one folder they share", async () => {
    await setupValidatedProject(tempDir, fakeHome, {
      agents: [
        ...buildAgentConfigs([CONFIGURED_AGENT_NAME], { scope: "global" }),
        ...buildAgentConfigs(["api-developer"], { scope: "project" }),
      ],
    });
    await writeValidInstalledAgent(
      path.join(fakeHome, INSTALLED_AGENTS_SUBDIR),
      CONFIGURED_AGENT_NAME,
    );
    await writeValidInstalledAgent(path.join(fakeHome, INSTALLED_AGENTS_SUBDIR), "api-developer");
    process.chdir(fakeHome);

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain("    No Orphans              ✓  No orphaned agent files\n");
  });

  it("names each plugin-mode skill no enabled plugin provides", async () => {
    await setupValidatedProject(tempDir, projectDir, {
      skills: buildSkillConfigs([CONFIGURED_SKILL_ID], { origin: PLUGIN_MODE_ORIGIN }),
    });

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    Plugins Installed       !  1 skill not installed as plugins",
        `                               - ${CONFIGURED_SKILL_ID} (no enabled plugin found)`,
      ].join("\n"),
    );
  });

  it("names the finding a second installation here makes for every acting command", async () => {
    await setupValidatedProject(tempDir, projectDir);
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: "codex-one", skills: [], agents: [] }),
      ".agents-inc/codex",
    );

    const { stdout, error } = await runCliCommand(["doctor"]);

    expect(error, "a second installation is a finding, not an error").toBeUndefined();
    expect(compactCliOutput(stdout)).toContain(
      compactCliOutput(
        [
          "  Operational checks",
          "    Installations           ✓  2 installations here, each checked below",
          `                               - ${process.cwd()} holds 2 installations — claude and codex — so every command that acts on one cannot tell which one you mean. Name it with --provider <claude|codex>. Nothing has been changed.`,
          "",
          "  The claude installation",
        ].join("\n"),
      ),
    );
  });

  it("names a placement the host of this installation cannot fill", async () => {
    const sourceDir = path.join(tempDir, "source");
    await buildValidSource(sourceDir);
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        name: "codex-one",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project", origin: "acme" }),
        agents: [],
        marketplace: sourceDir,
      }),
      ".agents-inc/codex",
    );

    const { stdout } = await runCliCommand(["doctor"]);

    expect(compactCliOutput(stdout)).toContain(
      compactCliOutput(
        [
          "    Placements Offered      ✗  1 finding would stop a command acting here",
          "                               - Refusing to install web-framework-react as plugin+project: the codex host offers plugin+global, eject+global, eject+project. Nothing has been changed.",
          "    Skills Resolved",
        ].join("\n"),
      ),
    );
  });

  describe("a Codex installation", () => {
    const CODEX_FOLDER = ".agents-inc/codex";

    async function installOnCodex(agentNames: AgentName[]): Promise<void> {
      const sourceDir = path.join(tempDir, "source");
      await buildValidSource(sourceDir);
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({
          name: "codex-one",
          skills: [],
          agents: buildAgentConfigs(agentNames),
          marketplace: sourceDir,
        }),
        CODEX_FOLDER,
      );
    }

    it("passes the agents row when Codex leaves every configured sub-agent out, naming each", async () => {
      await installOnCodex(["agent-summoner", "skill-summoner"]);

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(
        [
          "    Agents Compiled         ✓  No sub-agent in this configuration is carried by codex",
          "                               - agent-summoner (left out of codex)",
          "                               - skill-summoner (left out of codex)",
          "    No Orphans",
        ].join("\n"),
      );
    });

    it("counts only the sub-agents Codex carries, and finds them by Codex's file name", async () => {
      await installOnCodex(["agent-summoner", CONFIGURED_AGENT_NAME]);
      const { agentsDir } = resolveInstallPaths(projectDir, "project");
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, `${CONFIGURED_AGENT_NAME}.toml`), "");

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain("    Agents Compiled         ✓  1/1 agent compiled\n");
    });

    it("names an orphan by the file Codex holds, extension included", async () => {
      await installOnCodex([CONFIGURED_AGENT_NAME]);
      const { agentsDir } = resolveInstallPaths(projectDir, "project");
      await mkdir(agentsDir, { recursive: true });
      await writeFile(path.join(agentsDir, `${CONFIGURED_AGENT_NAME}.toml`), "");
      await writeFile(path.join(agentsDir, `${ORPHANED_AGENT_NAME}.toml`), "");

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(
        [
          "    No Orphans              !  1 orphaned agent file",
          `                               - ${ORPHANED_AGENT_NAME}.toml (not in config)`,
          "    Skills Installed",
        ].join("\n"),
      );
    });
  });

  it("at home, names an orphan in the one agents folder both scopes share once", async () => {
    await setupValidatedProject(tempDir, fakeHome, {
      agents: buildAgentConfigs([CONFIGURED_AGENT_NAME], { scope: "global" }),
    });
    await writeValidInstalledAgent(
      path.join(fakeHome, INSTALLED_AGENTS_SUBDIR),
      CONFIGURED_AGENT_NAME,
    );
    await writeValidInstalledAgent(
      path.join(fakeHome, INSTALLED_AGENTS_SUBDIR),
      ORPHANED_AGENT_NAME,
    );
    process.chdir(fakeHome);

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    No Orphans              !  1 orphaned agent file",
        `                               - ${ORPHANED_AGENT_NAME}.md (not in config)`,
        "    Skills Installed",
      ].join("\n"),
    );
  });

  it("reads the global agents folder when the project has none of its own", async () => {
    await setupValidatedProject(tempDir, projectDir, {
      agents: buildAgentConfigs(["cli-developer"], { scope: "global" }),
    });
    await writeValidInstalledAgent(path.join(fakeHome, INSTALLED_AGENTS_SUBDIR), "cli-developer");

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain("    No Orphans              ✓  No orphaned agent files\n");
  });

  it("counts a global agent's file in the project's folder as an orphan", async () => {
    await setupValidatedProject(tempDir, projectDir, {
      agents: buildAgentConfigs(["api-developer"], { scope: "global" }),
    });
    await writeValidInstalledAgent(path.join(projectDir, INSTALLED_AGENTS_SUBDIR), "api-developer");

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    No Orphans              !  1 orphaned agent file",
        "                               - api-developer.md (not in config)",
      ].join("\n"),
    );
  });

  describe("plugin-mode skills", () => {
    const PLUGIN_KEY = `${CONFIGURED_SKILL_ID}@${PLUGIN_MODE_ORIGIN}`;

    async function installPluginForTheProject(): Promise<void> {
      const installPath = path.join(
        fakeHome,
        CLAUDE_DIR,
        PLUGINS_SUBDIR,
        "cache",
        CONFIGURED_SKILL_ID,
      );
      await writeTestPluginManifest(installPath, { name: CONFIGURED_SKILL_ID, version: "1.0.0" });
      await writeTestInstalledPluginsRegistry(path.join(fakeHome, CLAUDE_DIR, PLUGINS_SUBDIR), {
        [PLUGIN_KEY]: [installPath],
      });
      await mkdir(path.join(projectDir, CLAUDE_DIR), { recursive: true });
      await writeFile(
        path.join(projectDir, CLAUDE_DIR, "settings.json"),
        JSON.stringify({ enabledPlugins: { [PLUGIN_KEY]: true } }),
      );
    }

    it("counts a plugin skill its scope's registry enables as installed", async () => {
      await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID], {
          origin: PLUGIN_MODE_ORIGIN,
          scope: "project",
        }),
      });
      await installPluginForTheProject();

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain("    Plugins Installed       ✓  1/1 plugin-mode skill installed\n");
    });

    it("judges each skill against its own scope's registry", async () => {
      await setupValidatedProject(tempDir, projectDir, {
        skills: [
          ...buildSkillConfigs([CONFIGURED_SKILL_ID], {
            origin: PLUGIN_MODE_ORIGIN,
            scope: "project",
          }),
          ...buildSkillConfigs(["web-framework-react"], {
            origin: PLUGIN_MODE_ORIGIN,
            scope: "global",
          }),
        ],
      });
      await installPluginForTheProject();

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(
        [
          "    Plugins Installed       !  1 skill not installed as plugins",
          "                               - web-framework-react (no enabled plugin found)",
          "    Marketplace Reachable",
        ].join("\n"),
      );
    });
  });

  // Root reads through the mode bits, so the failure under test cannot happen there.
  it.skipIf(process.getuid?.() === 0)(
    "turns a check that throws into that row's failure, with the cause, and finishes the report",
    async () => {
      await setupValidatedProject(tempDir, projectDir);
      const agentsDir = path.join(projectDir, INSTALLED_AGENTS_SUBDIR);
      await writeValidInstalledAgent(agentsDir, CONFIGURED_AGENT_NAME);
      await chmod(agentsDir, 0o000);
      try {
        const { stdout } = await runCliCommand(["doctor"]);

        expect(stdout).toContain(
          [
            "    No Orphans              ✗  Check threw",
            `                               EACCES: permission denied, scandir '${agentsDir}'`,
          ].join("\n"),
        );
        expect(stdout).toContain("  Summary:");
      } finally {
        await chmod(agentsDir, 0o755);
      }
    },
  );

  it("says a marketplace the check refused was refused, not that the check threw", async () => {
    await setupValidatedProject(tempDir, projectDir, { marketplace: PRIVATE_ADDRESS_MARKETPLACE });
    const configPath = getProjectConfigPath(projectDir, "claude");

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    Marketplaces            ✗  Refused",
        `                               The marketplace in ${configPath} points to a private or reserved IP address: "${PRIVATE_ADDRESS_MARKETPLACE}"`,
        "                               Marketplace URLs must not target private network addresses.",
        "                               Use a public hostname instead.",
        "                               Examples:",
        "                                 marketplace: 'https://github.com/user/repo'",
        "                                 marketplace: 'https://gitlab.company.com/team/skills'",
        "    Plugins                 ✓  No plugins to validate",
      ].join("\n"),
    );
  });

  it("says Refused on the reachability row too, for a marketplace the check refused", async () => {
    await setupValidatedProject(tempDir, projectDir, { marketplace: PRIVATE_ADDRESS_MARKETPLACE });
    const configPath = getProjectConfigPath(projectDir, "claude");

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    Marketplace Reachable   ✗  Refused",
        `                               The marketplace in ${configPath} points to a private or reserved IP address: "${PRIVATE_ADDRESS_MARKETPLACE}"`,
        "                               Marketplace URLs must not target private network addresses.",
        "                               Use a public hostname instead.",
        "                               Examples:",
        "                                 marketplace: 'https://github.com/user/repo'",
        "                                 marketplace: 'https://gitlab.company.com/team/skills'",
        "",
        "",
      ].join("\n"),
    );
  });

  it("marks a content row holding only warnings as a warning, and counts errors and warnings apart", async () => {
    await setupValidatedProject(tempDir, projectDir);
    const globalSkillsDir = path.join(fakeHome, INSTALLED_SKILLS_SUBDIR);
    await writeValidInstalledSkill(globalSkillsDir, "web-framework-react", {
      cliDescription: "x".repeat(75),
    });

    const warned = await runCliCommand(["doctor"]);

    expect(warned.stdout).toContain(
      "    Skills                  !  1 skill: 0 errors, 1 warning\n",
    );

    await writeValidInstalledSkill(globalSkillsDir, "web-framework-vue-composition-api", {
      cliDescription: "",
    });

    const failed = await runCliCommand(["doctor"]);

    expect(failed.stdout).toContain(
      "    Skills                  ✗  2 skills: 1 error, 1 warning\n",
    );
  });

  it("indents every line of a detail that runs to paragraphs, leaving its blank lines out", async () => {
    const goneSource = path.join(tempDir, "marketplace-that-is-gone");
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({
        name: "test-project",
        skills: [],
        agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
        marketplace: goneSource,
      }),
    );

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    Marketplace Reachable   ✗  Failed to load marketplace",
        `                               Local marketplace not found: '${goneSource}'`,
        "                               Nothing is at that path, and a local marketplace must be a directory holding skills.",
        "                               Check it for a typo, or name a marketplace that exists:",
        "                                 --marketplace github:agents-inc/skills",
        "",
        "",
      ].join("\n"),
    );
  });

  it("tells how to recreate a config it cannot read", async () => {
    await writeRawTestConfig(projectDir, renderUnparseableConfigTs());

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "    Marketplaces            –  Skipped — the configuration that names them cannot be read",
        "    Plugins                 ✓  No plugins to validate",
        "    Skills                  –  Skipped — the configuration that names them cannot be read",
        "    Agents                  ✓  No agents to validate",
        "",
        "  Operational checks",
        "    Skipped — fix the content errors above first",
        "",
        "",
      ].join("\n"),
    );

    expect(stdout).toContain(
      `  Tip: There is no automatic repair — recreate the configuration by running 'npx agents-inc uninstall' from '${process.cwd()}', which still works on a config it cannot read, then 'npx agents-inc init --from <id>' with an id from http://localhost:5173/editor\n`,
    );
  });

  it("skips the operational rows in a marketplace repository nothing is installed in", async () => {
    await buildValidSource(projectDir);

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      [
        "  Operational checks",
        "    Skipped — no installation here (marketplace repository)",
        "",
        "",
      ].join("\n"),
    );
  });

  it("still runs the operational rows in a marketplace repository that holds a config", async () => {
    await buildValidSource(projectDir);
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: "repo", skills: [], agents: [] }),
    );

    const { stdout } = await runCliCommand(["doctor"]);

    expect(stdout).toContain(
      "    Config Valid            !  This project: .agents-inc/claude/config.ts is valid but declares no skills and no agents\n",
    );
  });
  /** A compiled agent this CLI can prove it wrote, which is all `uninstall` takes without a config. */
  async function writeCompiledAgent(agentsDir: string, name: string): Promise<void> {
    await mkdir(agentsDir, { recursive: true });
    await writeFile(
      path.join(agentsDir, `${name}.md`),
      stampProvenanceMarker(renderAgentMd(name, "Compiled by this CLI")),
    );
  }

  describe("the No Orphans row beside skill folders", () => {
    async function installEjectedSkill(): Promise<string> {
      const skillsDir = path.join(projectDir, INSTALLED_SKILLS_SUBDIR);
      await setupValidatedProject(tempDir, projectDir, {
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID], { origin: "eject" }),
      });
      await writeValidInstalledSkill(skillsDir, CONFIGURED_SKILL_ID);
      await writeValidInstalledAgent(
        path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
        CONFIGURED_AGENT_NAME,
      );
      return skillsDir;
    }

    it("names no skill folder this CLI installed that the configuration does not claim, as `eject skills` leaves each one", async () => {
      const skillsDir = await installEjectedSkill();
      await writeValidInstalledSkill(skillsDir, UNRELATED_INSTALLED_SKILL_ID);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(
        ["    No Orphans              ✓  No orphaned agent files", "    Skills Installed"].join(
          "\n",
        ),
      );
    });

    it("names the orphaned agent file and not the unclaimed skill folder beside it", async () => {
      const skillsDir = await installEjectedSkill();
      await writeValidInstalledSkill(skillsDir, UNRELATED_INSTALLED_SKILL_ID);
      await writeValidInstalledAgent(
        path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
        ORPHANED_AGENT_NAME,
      );

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(
        [
          "    No Orphans              !  1 orphaned agent file",
          `                               - ${ORPHANED_AGENT_NAME}.md (not in config)`,
          "    Skills Installed",
        ].join("\n"),
      );
    });

    it("leaves a skill folder that carries no provenance alone, as the user's own", async () => {
      const skillsDir = await installEjectedSkill();
      await mkdir(path.join(skillsDir, FOREIGN_SKILL_DIR), { recursive: true });

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain("    No Orphans              ✓  No orphaned agent files\n");
    });

    it("names the stranded agent of a project whose config is gone, under a live global installation, and not its skill folder", async () => {
      await setupValidatedProject(tempDir, fakeHome, {
        agents: buildAgentConfigs([CONFIGURED_AGENT_NAME], { scope: "global" }),
      });
      await writeValidInstalledAgent(
        path.join(fakeHome, INSTALLED_AGENTS_SUBDIR),
        CONFIGURED_AGENT_NAME,
      );
      await writeValidInstalledSkill(
        path.join(projectDir, INSTALLED_SKILLS_SUBDIR),
        UNRELATED_INSTALLED_SKILL_ID,
      );
      await writeCompiledAgent(path.join(projectDir, INSTALLED_AGENTS_SUBDIR), ORPHANED_AGENT_NAME);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(
        [
          "    No Orphans              ✗  1 agent installed here, and no configuration declares them",
          `                               - ${path.join(projectDir, INSTALLED_AGENTS_SUBDIR, `${ORPHANED_AGENT_NAME}.md`)}`,
          "    Skills Installed",
        ].join("\n"),
      );
    });

    it("names no installation in the tip for files nothing declares where only one is here", async () => {
      await setupValidatedProject(tempDir, fakeHome, {
        agents: buildAgentConfigs([CONFIGURED_AGENT_NAME], { scope: "global" }),
      });
      await writeValidInstalledSkill(
        path.join(projectDir, INSTALLED_SKILLS_SUBDIR),
        UNRELATED_INSTALLED_SKILL_ID,
      );
      await writeCompiledAgent(path.join(projectDir, INSTALLED_AGENTS_SUBDIR), ORPHANED_AGENT_NAME);

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(
        [
          "  Tip: Nothing declares the files above — 'npx agents-inc init --from <id>' writes a configuration that can own them again, or 'npx agents-inc uninstall' removes them, the compiled agents included: each file listed carries this CLI's own provenance, which is what that command reads when there is no configuration left",
          "",
          "",
        ].join("\n"),
      );
    });

    it("leaves a hand-written agent in a project whose config is gone alone, as the user's own", async () => {
      await setupValidatedProject(tempDir, fakeHome, {
        agents: buildAgentConfigs([CONFIGURED_AGENT_NAME], { scope: "global" }),
      });
      await writeValidInstalledAgent(
        path.join(fakeHome, INSTALLED_AGENTS_SUBDIR),
        CONFIGURED_AGENT_NAME,
      );
      await writeValidInstalledAgent(
        path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
        ORPHANED_AGENT_NAME,
      );

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain("    No Orphans              ✓  No orphaned agent files\n");
    });
  });

  it("reports a marketplace repository whose own config it cannot read as a failed row, and finishes the report", async () => {
    await buildValidSource(projectDir);
    const configPath = await writeRawTestConfig(
      projectDir,
      renderUnparseableConfigTs(),
      ".agents-inc",
    );

    const { stdout, error } = await runCliCommand(["doctor"]);

    expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
    expect(stdout).toContain(
      ["  Operational checks", "    Marketplace Repository  ✗  Check threw"].join("\n"),
    );
    expect(stdout, "the row names the file it could not read").toContain(
      `Failed to load config from '${configPath}'`,
    );
    expect(stdout).toContain(`  ${SUMMARY_LINE}`);
  });

  describe("a project holding a Claude and a Codex installation", () => {
    const CODEX_FOLDER = ".agents-inc/codex";

    /** Both read the same marketplace, so only each installation's own files differ. */
    async function installBoth(): Promise<string> {
      const installed = {
        skills: buildSkillConfigs([CONFIGURED_SKILL_ID], { origin: "eject" }),
        agents: buildAgentConfigs([CONFIGURED_AGENT_NAME]),
      };
      const sourceDir = await setupValidatedProject(tempDir, projectDir, installed);
      await writeTestTsConfig(
        projectDir,
        buildProjectConfig({ name: "codex-one", marketplace: sourceDir, ...installed }),
        CODEX_FOLDER,
      );
      return sourceDir;
    }

    it("reports each installation in a block of its own, read off that installation's folders", async () => {
      const sourceDir = await installBoth();
      await writeValidInstalledSkill(
        path.join(projectDir, INSTALLED_SKILLS_SUBDIR),
        CONFIGURED_SKILL_ID,
      );
      await writeValidInstalledAgent(
        path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
        CONFIGURED_AGENT_NAME,
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error, "two installations are not an error, and warnings exit 0").toBeUndefined();
      expect(stdout).toBe(
        [
          ...HEADER,
          ...cleanContent(sourceDir, { skills: 1, agents: 1 }),
          "  Operational checks",
          "    Installations           ✓  2 installations here, each checked below",
          `                               - ${process.cwd()} holds 2 installations — claude and codex — so every command that acts on one cannot tell which one you mean. Name it with --provider <claude|codex>. Nothing has been changed.`,
          "",
          "  The claude installation",
          "    Config Valid            ✓  This project: .agents-inc/claude/config.ts is valid",
          "    Layout                  ✓  This project is on .agents-inc/claude/",
          "    Placements Offered      ✓  Every configured skill is placeable",
          "    Skills Resolved         ✓  1/1 skill found",
          "    Agents Compiled         ✓  1/1 agent compiled",
          "    No Orphans              ✓  No orphaned agent files",
          "    Skills Installed        ✓  1/1 eject-mode skill installed",
          "    Plugins Installed       ✓  No plugin-mode skills configured",
          ...reachedLocally(sourceDir, "named by this project's configuration"),
          "",
          "  The codex installation",
          "    Config Valid            ✓  This project: .agents-inc/codex/config.ts is valid",
          "    Layout                  ✓  This project is on .agents-inc/codex/",
          "    Placements Offered      ✓  Every configured skill is placeable",
          "    Skills Resolved         ✓  1/1 skill found",
          "    Agents Compiled         !  1 agent needs recompilation",
          `                               - ${CONFIGURED_AGENT_NAME} (missing)`,
          "    No Orphans              ✓  No orphaned agent files",
          "    Skills Installed        !  1 skill missing from disk",
          `                               - ${CONFIGURED_SKILL_ID} (not found in .agents/skills/)`,
          "    Plugins Installed       ✓  No plugin-mode skills configured",
          ...reachedLocally(sourceDir, "named by this project's configuration"),
          "",
          "  Summary: 22 passed, 2 warnings, 0 errors",
          "",
          "  Tip: Run 'npx agents-inc compile --provider codex' to generate missing agent files",
          "  Tip: Re-eject the missing skills from the marketplace to restore their files",
          "",
          "",
        ].join("\n"),
      );
    });

    it("reports a Codex config it cannot load in that installation's block, and stands its rows down", async () => {
      await setupValidatedProject(tempDir, projectDir);
      const codexConfig = await writeRawTestConfig(
        projectDir,
        renderUnparseableConfigTs(),
        CODEX_FOLDER,
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(stdout).toContain(
        [
          "  The codex installation",
          "    Config Valid            ✗  This project: .agents-inc/codex/config.ts exists but could not be loaded",
        ].join("\n"),
      );
      expect(stdout, "the reason names the file the loader could not read").toContain(
        `Failed to load config from '${codexConfig}'`,
      );
      expect(stdout).toMatch(
        /The codex installation[\s\S]*Agents Compiled\s+–\s+Skipped \(config invalid\)/,
      );
    });

    it("finds each installation whole where both are, and calls two healthy installations healthy", async () => {
      await installBoth();
      await writeValidInstalledSkill(
        path.join(projectDir, INSTALLED_SKILLS_SUBDIR),
        CONFIGURED_SKILL_ID,
      );
      await writeValidInstalledAgent(
        path.join(projectDir, INSTALLED_AGENTS_SUBDIR),
        CONFIGURED_AGENT_NAME,
      );
      const codexAgents = hostAgentsDir("codex", "project", projectDir);
      await mkdir(codexAgents, { recursive: true });
      await writeFile(path.join(codexAgents, `${CONFIGURED_AGENT_NAME}.toml`), "");
      await writeValidInstalledSkill(
        hostSkillsDir("codex", "project", projectDir),
        CONFIGURED_SKILL_ID,
      );

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(stdout).toContain("  Summary: 24 passed, 0 warnings, 0 errors\n");
      expect(error, "doctor exits 0 on two healthy installations").toBeUndefined();
    });

    it("names in the tip for files nothing declares the installation whose block found them", async () => {
      const globalAgents = buildAgentConfigs([CONFIGURED_AGENT_NAME], { scope: "global" });
      const sourceDir = await setupValidatedProject(tempDir, fakeHome, { agents: globalAgents });
      await writeTestTsConfig(
        fakeHome,
        buildProjectConfig({
          name: "codex-one",
          marketplace: sourceDir,
          skills: [],
          agents: globalAgents,
        }),
        CODEX_FOLDER,
      );
      await writeValidInstalledSkill(
        path.join(projectDir, INSTALLED_SKILLS_SUBDIR),
        UNRELATED_INSTALLED_SKILL_ID,
      );
      await writeCompiledAgent(path.join(projectDir, INSTALLED_AGENTS_SUBDIR), ORPHANED_AGENT_NAME);

      const { stdout, error } = await runCliCommand(["doctor"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      // Subject guard: the finding sits in the claude block, beside a second installation.
      expect(stdout).toContain(
        `${fakeHome} holds 2 installations — claude and codex — so every command that acts on one cannot tell which one you mean.`,
      );
      expect(stdout).toContain(
        [
          "  Tip: Nothing declares the files above — 'npx agents-inc init --from <id> --provider claude' writes a configuration that can own them again, or 'npx agents-inc uninstall --provider claude' removes them, the compiled agents included: each file listed carries this CLI's own provenance, which is what that command reads when there is no configuration left",
          "",
          "",
        ].join("\n"),
      );
    });

    it("names in each compile tip the installation whose block needs it, and a tip naming none once", async () => {
      await installBoth();

      const { stdout } = await runCliCommand(["doctor"]);

      expect(stdout).toContain(
        [
          "  Tip: Run 'npx agents-inc compile --provider claude' to generate missing agent files",
          "  Tip: Run 'npx agents-inc compile --provider codex' to generate missing agent files",
          "  Tip: Re-eject the missing skills from the marketplace to restore their files",
          "",
          "",
        ].join("\n"),
      );
    });
  });
});
