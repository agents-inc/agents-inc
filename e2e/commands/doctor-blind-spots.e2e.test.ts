import path from "path";
import { mkdir, rm } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  createPluginInstalledProject,
  uninstallProjectPlugins,
} from "../fixtures/plugin-install-state.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";
import { EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  ensureBinaryExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";

/**
 * Doctor blind spots around skills it never verifies on disk, and remediation
 * advice that makes the diagnosed problem worse.
 */

describe("doctor with uninstalled plugin skills", () => {
  let pluginSource: E2EPluginSource;
  let tempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    pluginSource = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (pluginSource) await cleanupTempDir(pluginSource.tempDir);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it(
    "stops reporting a clean bill of health once the configured plugin skills are uninstalled",
    { timeout: TIMEOUTS.PLUGIN_TEST },
    async () => {
      const installed = await createPluginInstalledProject({
        pluginsDir: pluginSource.pluginsDir,
        marketplace: pluginSource.marketplaceName,
        skillIds: ["web-framework-react"],
        agents: ["web-developer"],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });
      tempDir = path.dirname(installed.project.dir);
      const doctorEnv = { HOME: installed.home, CC_SOURCE: pluginSource.sourceDir };

      await expect(installed.project).toHavePlugin(installed.pluginKeys[0]);
      await expect({ dir: installed.home }).toHavePluginInRegistry(installed.pluginKeys[0], "user");

      // Proof the healthy state is genuinely live: the plugin skill is
      // discoverable, so the agent on disk is compiled from a real skill.
      const compiled = await CLI.run(["compile"], installed.project, { env: doctorEnv });
      expect(compiled.exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(compiled.output, "the enabled plugin must be discoverable before uninstall").toContain(
        "from plugins",
      );

      const configBefore = await readTestFile(configTsPath(installed.project.dir));

      const healthy = await CLI.run(["doctor"], installed.project, { env: doctorEnv });
      expect(
        healthy.stdout,
        "a fully installed plugin project is the healthy baseline for this comparison",
      ).toContain("0 warnings, 0 errors");

      await uninstallProjectPlugins(installed);
      await expect(installed.project).toHaveNoPlugins();

      const afterUninstall = await CLI.run(["doctor"], installed.project, { env: doctorEnv });

      expect(
        await readTestFile(configTsPath(installed.project.dir)),
        "doctor must not rewrite config.ts",
      ).toBe(configBefore);
      await expect(installed.project).toHaveNoLocalSkills();

      expect(
        afterUninstall.stdout,
        "config.ts still declares plugin skills that are no longer installed, so doctor must not report a clean bill of health",
      ).not.toContain("0 warnings, 0 errors");
    },
  );
});

describe("doctor remediation advice for skills missing from disk", () => {
  let source: E2ESource;
  let tempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it(
    "recompiling after doctor flags a missing skill does not drop it from the agent unannounced",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react", "web-testing-vitest"],
        agents: ["web-developer"],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: true }],
          },
        },
      });
      tempDir = path.dirname(project.dir);
      const fakeHome = path.join(tempDir, "home");
      await mkdir(fakeHome, { recursive: true });
      const commandEnv = { HOME: fakeHome, CC_SOURCE: source.sourceDir };

      const firstCompile = await CLI.run(["compile"], project, { env: commandEnv });
      expect(firstCompile.exitCode).toBe(EXIT_CODES.SUCCESS);

      const agentPath = path.join(agentsPath(project.dir), "web-developer.md");
      expect(
        await readTestFile(agentPath),
        "the agent must reference the skill before it goes missing",
      ).toContain("web-framework-react");

      await rm(path.join(skillsPath(project.dir), "web-framework-react"), {
        recursive: true,
        force: true,
      });

      const diagnosis = await CLI.run(["doctor"], project, { env: commandEnv });
      expect(
        diagnosis.stdout,
        "doctor must flag the configured skill that is no longer on disk",
      ).toContain("web-framework-react");

      const configBefore = await readTestFile(configTsPath(project.dir));

      const recompile = await CLI.run(["compile"], project, { env: commandEnv });

      expect(
        await readTestFile(configTsPath(project.dir)),
        "compile must not rewrite config.ts",
      ).toBe(configBefore);
      expect(
        await readTestFile(agentPath),
        "compile must still write the agent file it was asked to recompile",
      ).toContain("name: web-developer");

      expect(
        recompile.output,
        "compile must name the configured skill it cannot resolve; dropping it from the agent without a warning leaves the user worse off than doctor found them",
      ).toContain("web-framework-react");
    },
  );
});
