import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  CLAUDE_SOURCE_REL,
  CODEX_SOURCE_REL,
  PROVIDER_CLAUDE,
  PROVIDER_CODEX,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import { codexConfigFile } from "../fixtures/codex-plugin-switch.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  directoryExists,
  fileExists,
  flattenCliOutput,
  listFiles,
  readTestFile,
  readTreeSnapshot,
  renderSkillMd,
} from "../helpers/test-utils.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * Codex reads a project's own sub-agents only while its global `config.toml` trusts the project,
 * so a project install adds that trust. Uninstalling the Codex installation takes it out again.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const IN_THE_PROJECT = buildSeedPayload({
  skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill({ scope: "project" }) },
  agents: { [WEB_DEV]: { scope: "project" } },
});

const CODEX_ID = "CdxUntr1";
const CLAUDE_ID = "ClaUntr1";

const THEIR_OWN_CODEX_CONFIG = 'model_reasoning_effort = "high"\n';

const THEIR_OWN_PROJECT_CODEX_CONFIG = 'model_reasoning_effort = "low"\n';

const FOREIGN_SKILL = "a-skill-this-cli-never-installed";

/** Where Codex reads a project's skills from, the folder above them. */
const PROJECT_AGENTS_FOLDER = path.dirname(DIRS.CODEX_PROJECT_SKILLS);

type CodexLeftovers = {
  codexConfig: boolean;
  projectCodexFolder: boolean;
  projectAgentsFolder: boolean;
};

type ProjectUnderAHome = Required<ProjectHandle>;

/** The table a project install appends below the user's own lines. */
function trustTableFor(projectDir: string): string {
  return `[projects."${projectDir}"]\ntrust_level = "trusted"\n`;
}

describe("a Codex project uninstall and the trust its install added", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
    store.publish(CODEX_ID, IN_THE_PROJECT);
    store.publish(CLAUDE_ID, IN_THE_PROJECT);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function projectUnderTheirOwnCodexConfig(
    codexConfigFor: (projectDir: string) => string = () => THEIR_OWN_CODEX_CONFIG,
  ): Promise<ProjectUnderAHome> {
    env = await createTestEnvironment({ permissions: false });
    const configFile = codexConfigFile(env.fakeHome);
    await mkdir(path.dirname(configFile), { recursive: true });
    await writeFile(configFile, codexConfigFor(env.projectDir), "utf-8");
    return { dir: env.projectDir, globalHome: env.fakeHome };
  }

  async function succeeded(run: Promise<CLIResult>): Promise<string> {
    const { exitCode, output } = await run;
    const said = flattenCliOutput(output);
    expect(exitCode, said).toBe(EXIT_CODES.SUCCESS);
    return said;
  }

  function installOnCodex(project: ProjectUnderAHome): Promise<string> {
    return succeeded(runInitFromOnCodex(store, CODEX_ID, project, sourceDir));
  }

  function installOnClaude(project: ProjectUnderAHome): Promise<string> {
    return succeeded(runInitFrom(store, CLAUDE_ID, project, sourceDir));
  }

  function uninstalled(
    project: ProjectUnderAHome,
    provider: readonly string[] = [],
  ): Promise<string> {
    return succeeded(CLI.run(["uninstall", ...provider, "--yes"], project));
  }

  function theCodexConfig(project: ProjectUnderAHome): Promise<string> {
    return readTestFile(codexConfigFile(project.globalHome));
  }

  it(
    "takes the trust out of the Codex configuration, leaving the user's own lines, and says so",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await projectUnderTheirOwnCodexConfig();
      const installSaid = await installOnCodex(project);
      expect(installSaid).toContain(STEP_TEXT.CODEX_PROJECT_TRUSTED);
      expect(await theCodexConfig(project)).toBe(
        `${THEIR_OWN_CODEX_CONFIG}\n${trustTableFor(project.dir)}`,
      );

      const said = await uninstalled(project);

      expect(await theCodexConfig(project)).toBe(THEIR_OWN_CODEX_CONFIG);
      expect(said).toContain(STEP_TEXT.CODEX_PROJECT_TRUST_REMOVED);
    },
  );

  it(
    "takes it out even when the user had trusted the project before installing",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await projectUnderTheirOwnCodexConfig(
        (projectDir) => `${THEIR_OWN_CODEX_CONFIG}\n${trustTableFor(projectDir)}`,
      );
      const installSaid = await installOnCodex(project);
      expect(installSaid, "the install found the trust already there").not.toContain(
        STEP_TEXT.CODEX_PROJECT_TRUSTED,
      );

      const said = await uninstalled(project);

      expect(await theCodexConfig(project)).toBe(THEIR_OWN_CODEX_CONFIG);
      expect(said).toContain(STEP_TEXT.CODEX_PROJECT_TRUST_REMOVED);
    },
  );

  describe("and what it leaves holding nothing", () => {
    async function freshProject(): Promise<ProjectUnderAHome> {
      env = await createTestEnvironment({ permissions: false });
      return { dir: env.projectDir, globalHome: env.fakeHome };
    }

    async function leftovers(project: ProjectUnderAHome): Promise<CodexLeftovers> {
      return {
        codexConfig: await fileExists(codexConfigFile(project.globalHome)),
        projectCodexFolder: await directoryExists(path.join(project.dir, DIRS.CODEX)),
        projectAgentsFolder: await directoryExists(path.join(project.dir, PROJECT_AGENTS_FOLDER)),
      };
    }

    it(
      "deletes the Codex configuration the trust was all it held, and the project's .codex/ and .agents/ it emptied",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const project = await freshProject();
        expect(
          await fileExists(codexConfigFile(project.globalHome)),
          "precondition: there is no Codex configuration before the install",
        ).toBe(false);
        await installOnCodex(project);
        expect(
          await leftovers(project),
          "precondition: the install wrote the trust and filled both project folders",
        ).toStrictEqual({ codexConfig: true, projectCodexFolder: true, projectAgentsFolder: true });

        const said = await uninstalled(project);

        expect(said).toContain(STEP_TEXT.CODEX_PROJECT_TRUST_REMOVED);
        expect(
          await leftovers(project),
          "a Codex file or folder the uninstall leaves with nothing in it is removed",
        ).toStrictEqual({
          codexConfig: false,
          projectCodexFolder: false,
          projectAgentsFolder: false,
        });
      },
    );

    it(
      "keeps the Codex configuration and the project's .codex/ and .agents/ while they hold the user's own",
      { timeout: TIMEOUTS.LIFECYCLE },
      async () => {
        const project = await projectUnderTheirOwnCodexConfig();
        const theirProjectConfig = path.join(project.dir, DIRS.CODEX, FILES.CODEX_CONFIG_TOML);
        const projectSkills = path.join(project.dir, DIRS.CODEX_PROJECT_SKILLS);
        await mkdir(path.dirname(theirProjectConfig), { recursive: true });
        await writeFile(theirProjectConfig, THEIR_OWN_PROJECT_CODEX_CONFIG);
        await mkdir(path.join(projectSkills, FOREIGN_SKILL), { recursive: true });
        await writeFile(
          path.join(projectSkills, FOREIGN_SKILL, FILES.SKILL_MD),
          renderSkillMd(FOREIGN_SKILL, "A skill its author wrote by hand"),
        );
        await installOnCodex(project);

        const said = await uninstalled(project);

        expect(said).toContain(STEP_TEXT.CODEX_PROJECT_TRUST_REMOVED);
        expect(
          await leftovers(project),
          "a Codex file or folder still holding something of the user's stays",
        ).toStrictEqual({ codexConfig: true, projectCodexFolder: true, projectAgentsFolder: true });
        expect(await theCodexConfig(project)).toBe(THEIR_OWN_CODEX_CONFIG);
        expect(await readTestFile(theirProjectConfig)).toBe(THEIR_OWN_PROJECT_CODEX_CONFIG);
        expect(await listFiles(projectSkills)).toStrictEqual([FOREIGN_SKILL]);
      },
    );
  });

  describe("in a project holding a Claude installation too", () => {
    async function bothInstalled(): Promise<ProjectUnderAHome> {
      const project = await projectUnderTheirOwnCodexConfig();
      await installOnClaude(project);
      await installOnCodex(project);
      return project;
    }

    async function claudeSideOf(project: ProjectUnderAHome) {
      return {
        claudeFolder: await readTreeSnapshot(path.join(project.dir, DIRS.CLAUDE)),
        claudeConfig: await readTreeSnapshot(path.join(project.dir, CLAUDE_SOURCE_REL)),
      };
    }

    it(
      "--provider codex takes the trust out, leaves the Claude installation as it was and says nothing of .claude/",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const project = await bothInstalled();
        const before = await claudeSideOf(project);
        expect(Object.keys(before.claudeFolder).length).toBeGreaterThan(0);
        expect(Object.keys(before.claudeConfig).length).toBeGreaterThan(0);

        const said = await uninstalled(project, PROVIDER_CODEX);

        expect(
          await directoryExists(path.join(project.dir, CODEX_SOURCE_REL)),
          "the Codex installation was uninstalled",
        ).toBe(false);
        expect(await theCodexConfig(project)).toBe(THEIR_OWN_CODEX_CONFIG);
        expect(said).toContain(STEP_TEXT.CODEX_PROJECT_TRUST_REMOVED);
        expect(await claudeSideOf(project)).toStrictEqual(before);
        expect(said).not.toContain(STEP_TEXT.UNINSTALL_CLAUDE_DIR_KEPT);
        expect(said).not.toContain(STEP_TEXT.UNINSTALL_CLAUDE_DIR_REMOVED);
      },
    );

    it(
      "control: --provider claude leaves the trust while the Codex installation stays",
      { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
      async () => {
        const project = await bothInstalled();

        const said = await uninstalled(project, PROVIDER_CLAUDE);

        expect(
          await directoryExists(path.join(project.dir, CLAUDE_SOURCE_REL)),
          "the Claude installation was uninstalled",
        ).toBe(false);
        expect(await theCodexConfig(project)).toBe(
          `${THEIR_OWN_CODEX_CONFIG}\n${trustTableFor(project.dir)}`,
        );
        expect(said).not.toContain(STEP_TEXT.CODEX_PROJECT_TRUST_REMOVED);
      },
    );
  });
});
