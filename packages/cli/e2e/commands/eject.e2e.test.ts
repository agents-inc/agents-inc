import path from "path";
import { chmod, mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  DIRS,
  EXIT_CODES,
  FILES,
  MANIFEST_REFUSAL_BUILDS_IN_ORDER,
  STEP_TEXT,
  TIMEOUTS,
} from "../pages/constants.js";
import {
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  createTempDir,
  directoryExists,
  fileExists,
  flattenCliOutput,
  listFiles,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
  sourceFolderIn,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { createE2EPluginSource } from "../helpers/create-e2e-plugin-source.js";
import { CLI } from "../fixtures/cli.js";
import {
  codexGlobalSkillsDir,
  codexProjectSkillsDir,
  PROVIDER_CLAUDE,
  PROVIDER_CODEX,
  runInitFromOnClaude,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL, E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import "../matchers/setup.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * Named because `eject agent-partials` copies the bundled tree verbatim; a member is what tells the
 * right tree from any tree.
 */
const EJECTED_PARTIAL_CATEGORY = "developer";
const EJECTED_PARTIAL_AGENT = "web-developer";

describe("eject command", () => {
  let tempDir: string;
  let readOnlyDir: string | undefined;
  let sourceDir: string;
  let e2eSourceTempDir: string;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
  });

  afterAll(async () => {
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    if (readOnlyDir) {
      await chmod(readOnlyDir, 0o755);
      readOnlyDir = undefined;
    }
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  /**
   * `eject` takes no marketplace flag or env, so HOME's global config names the source; the project
   * stays config-less for `eject` to invent one.
   */
  async function projectUnderGlobalSource(
    dir: string,
    source: string = sourceDir,
  ): Promise<ProjectHandle> {
    const globalHome = path.join(dir, "home");
    await mkdir(globalHome, { recursive: true });
    await writeProjectConfig(
      globalHome,
      buildProjectConfig({ name: "global-install", marketplace: source, skills: [], agents: [] }),
    );
    return { dir, globalHome };
  }

  it("should error when no eject type is specified", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["eject"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("specify what to eject");
  });

  it("should error with invalid eject type", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["eject", "invalid-type"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("Expected");
  });

  it("should eject agent-partials to project directory", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "agent-partials"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Eject");
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    const agentsDir = path.join(sourceFolderIn(tempDir), "agents");
    expect(await directoryExists(agentsDir)).toBe(true);
    // The top level holds category directories, so a named member is asserted rather than a count.
    expect(await listFiles(agentsDir)).toContain(EJECTED_PARTIAL_CATEGORY);
    const partialDir = path.join(agentsDir, EJECTED_PARTIAL_CATEGORY, EJECTED_PARTIAL_AGENT);
    const partialFiles = await listFiles(partialDir);
    expect(partialFiles).toContain(FILES.IDENTITY_MD);
    expect(partialFiles).toContain(FILES.PLAYBOOK_MD);
    expect(partialFiles).toContain(FILES.METADATA_YAML);

    await expect({ dir: tempDir }).toHaveConfig();
  });

  it("should eject templates to project directory", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "templates"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    await expect({ dir: tempDir }).toHaveEjectedTemplate();
    const templatePath = path.join(sourceFolderIn(tempDir), "agents", "_templates", "agent.liquid");
    const templateContent = await readTestFile(templatePath);
    expect(templateContent).toContain("---");

    expect(templateContent).toContain("{{");

    await expect({ dir: tempDir }).toHaveConfig();
  });

  it("should eject agent-partials to custom output directory", async () => {
    tempDir = await createTempDir();
    const outputDir = path.join(tempDir, "custom-output");

    const { exitCode, stdout } = await CLI.run(["eject", "agent-partials", "-o", outputDir], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
    expect(await directoryExists(outputDir)).toBe(true);

    const entries = await listFiles(outputDir);
    expect(entries.length).toBeGreaterThan(0);

    const partialFiles = await listFiles(path.join(outputDir, firstElement(entries)));
    expect(partialFiles.length).toBeGreaterThan(0);

    const defaultAgentsDir = path.join(sourceFolderIn(tempDir), "agents");
    expect(await directoryExists(defaultAgentsDir)).toBe(false);
  });

  it("should warn when ejecting agent-partials twice without --force", async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(["eject", "agent-partials"], {
      dir: tempDir,
    });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, output } = await CLI.run(["eject", "agent-partials"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("already exist");
  });

  it("should allow re-eject with --force", async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(["eject", "agent-partials"], {
      dir: tempDir,
    });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, stdout } = await CLI.run(["eject", "agent-partials", "--force"], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
  });

  it("should eject every skill from a local source, save the source and touch nothing else", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(
      ["eject", "skills"],
      await projectUnderGlobalSource(tempDir),
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("skills ejected");

    const skillsDir = skillsPath(tempDir);
    expect(await directoryExists(skillsDir)).toBe(true);
    // The whole roster: a count passes on wrong directories.
    expect((await listFiles(skillsDir)).sort()).toStrictEqual([...E2E_SKILL_IDS].sort());

    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.react.id);
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.vitest.id);
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.zustand.id);
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.hono.id);

    const skillMdPath = path.join(skillsDir, E2E_SKILL.react.id, FILES.SKILL_MD);
    const skillContent = await readTestFile(skillMdPath);
    expect(skillContent).toContain(E2E_SKILL.react.id);

    await expect({ dir: tempDir }).toHaveConfig({ marketplace: sourceDir });
    expect(await readTestFile(configTsPath(tempDir))).toContain(sourceDir);

    expect(await directoryExists(path.join(sourceFolderIn(tempDir), "agents"))).toBe(false);
  });

  it("should count a single ejected skill in the singular", async () => {
    tempDir = await createTempDir();
    const oneSkill = await createE2ESource({
      withoutSkills: E2E_SKILL_IDS.filter((id) => id !== E2E_SKILL.react.id),
      withoutStacks: true,
    });

    try {
      const { exitCode, stdout } = await CLI.run(
        ["eject", "skills"],
        await projectUnderGlobalSource(tempDir, oneSkill.sourceDir),
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(stdout).toContain("1 skill ejected to");
      expect(await listFiles(skillsPath(tempDir))).toStrictEqual([E2E_SKILL.react.id]);
    } finally {
      await cleanupTempDir(oneSkill.tempDir);
    }
  });

  /**
   * Project from one marketplace under global plugins from another: `eject skills` copies only what
   * the project's marketplace carries and leaves the global installation alone. Observed red
   * against a build that seated the global skill in the project's catalogue: it read that skill out
   * of the project marketplace's folder and exited 1 on ENOENT.
   */
  describe("beside a global plugin installation from another marketplace", () => {
    const ONLY_IN_GLOBAL_MARKETPLACE = E2E_SKILL["visual-regression"];

    let projectMarketplace: E2ESource;

    beforeAll(async () => {
      projectMarketplace = await createE2ESource({
        withoutSkills: [ONLY_IN_GLOBAL_MARKETPLACE.id],
      });
    });

    afterAll(async () => {
      await cleanupFixture(projectMarketplace);
    });

    it("should eject only the skills the project's marketplace carries", async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "project");
      const globalMarketplace = await createE2EPluginSource();
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "global-install",
          marketplace: globalMarketplace.sourceDir,
          skills: buildSkillConfigs([ONLY_IN_GLOBAL_MARKETPLACE.id], {
            scope: "global",
            origin: globalMarketplace.marketplaceName,
          }),
          agents: [],
        }),
      );
      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "project",
          marketplace: projectMarketplace.sourceDir,
          skills: [],
          agents: [],
        }),
      );
      const globalBefore = await readTreeSnapshot(globalHome);
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      const { exitCode, output } = await CLI.run(
        ["eject", "skills"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.EJECT_SUCCESS);
      expect(
        (await listFiles(skillsPath(projectDir))).sort(),
        "the project marketplace's skills, without the one only the global's ships",
      ).toStrictEqual(E2E_SKILL_IDS.filter((id) => id !== ONLY_IN_GLOBAL_MARKETPLACE.id).sort());
      expect(await readTestFile(configTsPath(projectDir))).toBe(projectConfigBefore);
      expect(await readTreeSnapshot(globalHome)).toStrictEqual(globalBefore);
    });
  });

  it("should eject all phases from a local source", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(
      ["eject", "all"],
      await projectUnderGlobalSource(tempDir),
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("ejected");
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    const agentsDir = path.join(sourceFolderIn(tempDir), "agents");
    expect(await directoryExists(agentsDir)).toBe(true);
    const agentEntries = await listFiles(agentsDir);
    expect(agentEntries.length).toBeGreaterThan(1);

    await expect({ dir: tempDir }).toHaveEjectedTemplate();
    const templatePath = path.join(agentsDir, "_templates", "agent.liquid");
    const templateContent = await readTestFile(templatePath);
    expect(templateContent).toContain("---");

    await expect({ dir: tempDir }).toHaveLocalSkills([E2E_SKILL.react.id]);
    await expect({ dir: tempDir }).toHaveSkillCopied(E2E_SKILL.react.id);

    await expect({ dir: tempDir }).toHaveConfig({ marketplace: sourceDir });
  });

  it("should create config.ts in a fresh directory after eject", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(["eject", "agent-partials"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    const configContent = await readTestFile(configTsPath(tempDir));
    expect(configContent).toContain("name");
    expect(configContent).toContain("export default");
  });

  it("should display help text with --help flag", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "--help"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("USAGE");
    expect(stdout).toContain("agent-partials");
    expect(stdout).toContain("templates");
    expect(stdout).toContain("skills");
    expect(stdout).toContain("all");
  });

  // A directory without `.claude-plugin/marketplace.json` is refused, not ejected from as an empty
  // marketplace.
  it("should handle corrupt source without crashing", async () => {
    tempDir = await createTempDir();
    const corruptSourceDir = path.join(tempDir, "corrupt-source");
    await mkdir(corruptSourceDir, { recursive: true });
    await writeFile(path.join(corruptSourceDir, "garbage.txt"), "not a valid source");

    const { exitCode, output } = await CLI.run(
      ["eject", "skills"],
      await projectUnderGlobalSource(tempDir, corruptSourceDir),
    );

    expect(exitCode, "a directory that is no marketplace must not be ejected from").not.toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(
      flattenCliOutput(output),
      "the refusal must name the builds that would make it a marketplace",
    ).toMatch(MANIFEST_REFUSAL_BUILDS_IN_ORDER);
  });

  it("should refuse a --marketplace flag — it reads the source the installation is configured with", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["eject", "skills", "--marketplace", sourceDir], {
      dir: tempDir,
    });

    // Withdrawn, not ignored: accepting it would eject from one source and record another.
    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("--marketplace");
    expect(await directoryExists(skillsPath(tempDir))).toBe(false);
  });

  it("should error when ejecting to a read-only directory", async () => {
    tempDir = await createTempDir();
    readOnlyDir = path.join(tempDir, "read-only");
    await mkdir(readOnlyDir, { recursive: true });
    await chmod(readOnlyDir, 0o444);

    const { exitCode } = await CLI.run(["eject", "agent-partials", "-o", readOnlyDir], {
      dir: tempDir,
    });

    expect(exitCode).not.toBe(EXIT_CODES.SUCCESS);
  });

  it("should eject templates and produce only the template file, not agent partials", async () => {
    tempDir = await createTempDir();

    const { exitCode, stdout } = await CLI.run(["eject", "templates"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("Agent templates ejected");
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);

    await expect({ dir: tempDir }).toHaveEjectedTemplate();

    const agentsDir = path.join(sourceFolderIn(tempDir), "agents");
    const contents = await listFiles(agentsDir);
    expect(contents).toContain("_templates");
    const nonTemplateEntries = contents.filter((entry) => entry !== "_templates");
    expect(nonTemplateEntries.length).toBe(0);
  });

  it("should warn when ejecting templates twice without --force", async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(["eject", "templates"], { dir: tempDir });
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, output } = await CLI.run(["eject", "templates"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("already exist");
  });

  it("should warn when ejecting skills twice without --force", async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(
      ["eject", "skills"],
      await projectUnderGlobalSource(tempDir),
    );
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, output } = await CLI.run(
      ["eject", "skills"],
      await projectUnderGlobalSource(tempDir),
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("already exist");
  });

  // Known bug: a re-eject with --force exits 0, but `copySkillsToLocalFlattened` returns nothing,
  // so no "skills ejected" line.
  it.fails("should overwrite existing skills with --force", { retry: 0 }, async () => {
    tempDir = await createTempDir();

    const { exitCode: setupExitCode } = await CLI.run(
      ["eject", "skills"],
      await projectUnderGlobalSource(tempDir),
    );
    expect(setupExitCode).toBe(EXIT_CODES.SUCCESS);

    const { exitCode, stdout } = await CLI.run(
      ["eject", "skills", "--force"],
      await projectUnderGlobalSource(tempDir),
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("skills ejected");
  });

  it("should eject templates to custom output directory", async () => {
    tempDir = await createTempDir();
    const outputDir = path.join(tempDir, "custom-templates");

    const { exitCode, stdout } = await CLI.run(["eject", "templates", "-o", outputDir], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
    expect(stdout).toContain("Output directory:");
    expect(await directoryExists(outputDir)).toBe(true);

    const entries = await listFiles(outputDir);
    expect(entries).toContain("agent.liquid");
    const templateContent = await readTestFile(path.join(outputDir, "agent.liquid"));
    expect(templateContent).toContain("---");

    const defaultTemplatePath = path.join(sourceFolderIn(tempDir), "agents", "_templates");
    expect(await directoryExists(defaultTemplatePath)).toBe(false);
  });

  it("should eject skills to custom output directory", async () => {
    tempDir = await createTempDir();
    const outputDir = path.join(tempDir, "custom-skills");

    const { exitCode, stdout } = await CLI.run(
      ["eject", "skills", "-o", outputDir],
      await projectUnderGlobalSource(tempDir),
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain("skills ejected");
    expect(stdout).toContain(STEP_TEXT.EJECT_SUCCESS);
    expect(await directoryExists(outputDir)).toBe(true);
    expect((await listFiles(outputDir)).sort()).toStrictEqual([...E2E_SKILL_IDS].sort());

    const skillMdPath = path.join(outputDir, E2E_SKILL.react.id, FILES.SKILL_MD);
    expect(await fileExists(skillMdPath)).toBe(true);
    const skillContent = await readTestFile(skillMdPath);
    expect(skillContent).toContain(E2E_SKILL.react.id);
  });

  it("should error when --output points to an existing file", async () => {
    tempDir = await createTempDir();
    const filePath = path.join(tempDir, "not-a-dir");
    await writeFile(filePath, "I am a file, not a directory");

    const { exitCode, output } = await CLI.run(["eject", "agent-partials", "-o", filePath], {
      dir: tempDir,
    });

    expect(exitCode).toBe(EXIT_CODES.INVALID_ARGS);
    expect(output).toContain("exists as a file");
  });

  /**
   * On Codex `eject skills` copies into `<repo>/.agents/skills` (project) or `$CODEX_HOME/skills`
   * (global), never `.claude/skills`. Observed red before the fix at all of the first three: each
   * run wrote `.claude/skills`, creating `.claude/` in a Codex-only project and filling the Claude
   * installation's folder when `--provider codex` chose Codex in a scope holding both. The first
   * three install sub-agents with no skill; the last pair is about the copies.
   */
  describe("on a Codex installation", () => {
    const WEB_DEV = E2E_AGENT["web-developer"].name;
    const EVERY_SKILL = [...E2E_SKILL_IDS].sort();
    const ALL_BUT_THE_INSTALLED_COPY = E2E_SKILL_IDS.filter(
      (id) => id !== E2E_SKILL.react.id,
    ).sort();

    let store: SeedConfigStore;

    beforeAll(async () => {
      store = await startSeedConfigStore();
    });

    afterAll(async () => {
      await store.close();
    });

    afterEach(() => {
      store.reset();
    });

    function skillLess(agentScope: "global" | "project") {
      return buildSeedPayload({ agents: { [WEB_DEV]: { on: true, scope: agentScope } } });
    }

    function reactEjectedGlobally() {
      return buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            install: "eject",
            scope: "global",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      });
    }

    async function freshEnvironment(): Promise<TestEnvironment> {
      const env = await createTestEnvironment({ permissions: false });
      tempDir = env.tempDir;
      return env;
    }

    it(
      "copies a project's skills into <repo>/.agents/skills and creates no .claude/",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const env = await freshEnvironment();
        const project = { dir: env.projectDir, globalHome: env.fakeHome };
        store.publish("CdxEjPr1", skillLess("project"));
        const installed = await runInitFromOnCodex(store, "CdxEjPr1", project, sourceDir);
        expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

        const { exitCode, stdout, output } = await CLI.run(["eject", "skills"], project);

        expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
        expect(stdout).toContain(`ejected to ${codexProjectSkillsDir(env.projectDir)}`);
        expect((await listFiles(codexProjectSkillsDir(env.projectDir))).sort()).toStrictEqual(
          EVERY_SKILL,
        );
        expect(await directoryExists(path.join(env.projectDir, DIRS.CLAUDE))).toBe(false);
      },
    );

    it(
      "copies a global's skills into $CODEX_HOME/skills and creates no ~/.claude/",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const env = await freshEnvironment();
        const home = { dir: env.fakeHome, globalHome: env.fakeHome };
        store.publish("CdxEjGl1", skillLess("global"));
        const installed = await runInitFromOnCodex(store, "CdxEjGl1", home, sourceDir);
        expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

        const { exitCode, stdout, output } = await CLI.run(["eject", "skills"], home);

        expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
        expect(stdout).toContain(`ejected to ${codexGlobalSkillsDir(env.fakeHome)}`);
        expect((await listFiles(codexGlobalSkillsDir(env.fakeHome))).sort()).toStrictEqual(
          EVERY_SKILL,
        );
        expect(await directoryExists(path.join(env.fakeHome, DIRS.CLAUDE))).toBe(false);
      },
    );

    it(
      "copies into the folder of the installation --provider names, in a project holding both",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const env = await freshEnvironment();
        const project = { dir: env.projectDir, globalHome: env.fakeHome };
        store.publish("BthEjCl1", skillLess("project"));
        store.publish("BthEjCd1", skillLess("project"));
        const claude = await runInitFromOnClaude(store, "BthEjCl1", project, sourceDir);
        expect(claude.exitCode, flattenCliOutput(claude.output)).toBe(EXIT_CODES.SUCCESS);
        const codex = await runInitFromOnCodex(store, "BthEjCd1", project, sourceDir);
        expect(codex.exitCode, flattenCliOutput(codex.output)).toBe(EXIT_CODES.SUCCESS);

        const claudeSide = () =>
          Promise.all([
            readTreeSnapshot(path.join(env.projectDir, DIRS.CLAUDE)),
            readTreeSnapshot(path.join(env.projectDir, DIRS.SOURCE_CLAUDE)),
            readTreeSnapshot(path.join(env.fakeHome, DIRS.CLAUDE)),
          ]);
        const codexSide = () =>
          Promise.all([
            readTreeSnapshot(codexProjectSkillsDir(env.projectDir)),
            readTreeSnapshot(path.join(env.projectDir, DIRS.SOURCE_CODEX)),
            readTreeSnapshot(path.join(env.fakeHome, DIRS.CODEX)),
          ]);
        const claudeBefore = await claudeSide();
        // Subject guard: the Claude side compiled something, so an unchanged snapshot is not two
        // empty reads.
        expect(Object.keys(claudeBefore[0]).length).toBeGreaterThan(0);

        const toCodex = await CLI.run(["eject", "skills", ...PROVIDER_CODEX], project);

        expect(toCodex.exitCode, flattenCliOutput(toCodex.output)).toBe(EXIT_CODES.SUCCESS);
        expect((await listFiles(codexProjectSkillsDir(env.projectDir))).sort()).toStrictEqual(
          EVERY_SKILL,
        );
        expect(await claudeSide(), "the Codex eject moved the Claude installation").toStrictEqual(
          claudeBefore,
        );

        // Control: same scope, the other provider named, and Claude's own folder fills.
        const codexBefore = await codexSide();
        const toClaude = await CLI.run(["eject", "skills", ...PROVIDER_CLAUDE], project);

        expect(toClaude.exitCode, flattenCliOutput(toClaude.output)).toBe(EXIT_CODES.SUCCESS);
        expect((await listFiles(skillsPath(env.projectDir))).sort()).toStrictEqual(EVERY_SKILL);
        expect(await codexSide(), "the Claude eject moved the Codex installation").toStrictEqual(
          codexBefore,
        );
      },
    );

    it(
      "leaves out the skill a Claude global already holds as its own copy",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const env = await freshEnvironment();
        const project = { dir: env.projectDir, globalHome: env.fakeHome };
        store.publish("ClaEjCp1", reactEjectedGlobally());
        const installed = await runInitFromOnClaude(store, "ClaEjCp1", project, sourceDir);
        expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

        const { exitCode, output } = await CLI.run(["eject", "skills"], project);

        expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
        expect((await listFiles(skillsPath(env.projectDir))).sort()).toStrictEqual(
          ALL_BUT_THE_INSTALLED_COPY,
        );
      },
    );

    /**
     * KNOWN GAP: `discoverLocalSkills` finds local copies only under `<root>/.claude/skills`, so a
     * Codex global copy in `$CODEX_HOME/skills` is not seen and React is copied into the project.
     */
    it.fails(
      "leaves out the skill a Codex global already holds as its own copy",
      { retry: 0, timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const env = await freshEnvironment();
        const project = { dir: env.projectDir, globalHome: env.fakeHome };
        store.publish("CdxEjCp1", reactEjectedGlobally());
        const installed = await runInitFromOnCodex(store, "CdxEjCp1", project, sourceDir);
        expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);

        const { exitCode, output } = await CLI.run(["eject", "skills"], project);

        expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);
        expect((await listFiles(codexProjectSkillsDir(env.projectDir))).sort()).toStrictEqual(
          ALL_BUT_THE_INSTALLED_COPY,
        );
      },
    );
  });
});
