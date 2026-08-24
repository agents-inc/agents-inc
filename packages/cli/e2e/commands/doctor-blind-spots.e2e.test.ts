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
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import {
  agentsPath,
  cleanupFixture,
  cleanupTempDir,
  configTsPath,
  readTestFile,
  recordInstallSource,
  skillsPath,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * Doctor blind spots around skills it never verifies on disk, and remediation
 * advice that makes the diagnosed problem worse.
 */

describe("doctor with uninstalled plugin skills", () => {
  let pluginSource: E2EPluginSource;
  let tempDir: string;

  beforeAll(async () => {
    pluginSource = await createE2EPluginSource();
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupFixture(pluginSource);
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
        skillIds: [E2E_SKILL.react.id],
        agents: ["web-developer"],
        stack: {
          "web-developer": {
            "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
          },
        },
      });
      tempDir = path.dirname(installed.project.dir);
      // The install records its own source: no command below carries a flag or reads the
      // environment for one — naming a source is `init`'s decision.
      await recordInstallSource([installed.project.dir, installed.home], pluginSource.sourceDir);
      const doctorEnv = { HOME: installed.home };

      const firstPluginKey = firstElement(installed.pluginKeys);
      await expect(installed.project).toHavePlugin(firstPluginKey);
      await expect({ dir: installed.home }).toHavePluginInRegistry(firstPluginKey, "user");

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
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupFixture(source);
  });

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it(
    "recompiling after doctor flags a missing skill does not drop it from the agent unannounced",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await ProjectBuilder.editable({
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        agents: ["web-developer"],
        stack: {
          "web-developer": {
            "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
            "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: true }],
          },
        },
      });
      tempDir = path.dirname(project.dir);
      const fakeHome = path.join(tempDir, "home");
      await mkdir(fakeHome, { recursive: true });
      await recordInstallSource([project.dir, fakeHome], source.sourceDir);
      const commandEnv = { HOME: fakeHome };

      const firstCompile = await CLI.run(["compile"], project, { env: commandEnv });
      expect(firstCompile.exitCode).toBe(EXIT_CODES.SUCCESS);

      const agentPath = path.join(agentsPath(project.dir), "web-developer.md");
      expect(
        await readTestFile(agentPath),
        "the agent must reference the skill before it goes missing",
      ).toContain(E2E_SKILL.react.id);

      await rm(path.join(skillsPath(project.dir), E2E_SKILL.react.id), {
        recursive: true,
        force: true,
      });

      const diagnosis = await CLI.run(["doctor"], project, { env: commandEnv });
      expect(
        diagnosis.stdout,
        "doctor must flag the configured skill that is no longer on disk",
      ).toContain(E2E_SKILL.react.id);

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
      ).toContain(E2E_SKILL.react.id);
    },
  );
});
