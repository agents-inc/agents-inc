import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  FORKED_FROM_METADATA,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
  sourceFolderIn,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

/**
 * At the home directory `edit --from` must refuse project-scoped entries, as `init --from` does. It
 * fires after the decode, before any confirm and before anything is written; an all-global
 * configuration still applies.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

const PINNED_TO_PROJECT = { scope: "project" } as const;

describe("edit --from <id> at the global root", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /**
   * Every entry global-scoped. Built from the writers `ProjectBuilder` uses; only this suite needs
   * a home-root fixture.
   */
  async function takeInstalledHome(skillIds: string[]): Promise<string> {
    const tempDir = await createTempDir();
    tempDirs.push(tempDir);
    const home = path.join(tempDir, "fake-home");

    await mkdir(path.join(home, DIRS.CLAUDE, DIRS.AGENTS), { recursive: true });
    await createPermissionsFile(home);
    await writeProjectConfig(
      home,
      buildProjectConfig({
        name: "global-install",
        marketplace: sourceDir,
        skills: buildSkillConfigs(skillIds, { scope: "global" }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        selectedDomains: ["web"],
      }),
    );
    for (const skillId of skillIds) {
      await createLocalSkill(home, skillId, {
        description: "Test skill for E2E",
        body: `# ${skillId}\n\nTest content.`,
        metadata: FORKED_FROM_METADATA,
      });
    }
    return home;
  }

  /** Snapshotted per tree, not `$HOME` whole: oclif's update check writes a version cache there. */
  async function installedTrees(home: string): Promise<Record<string, unknown>> {
    return {
      configPair: await readTreeSnapshot(sourceFolderIn(home)),
      claude: await readTreeSnapshot(path.join(home, DIRS.CLAUDE)),
    };
  }

  function launchAtHome(id: string, home: string): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], home, {
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
  }

  describe("a configuration with project-scoped content", () => {
    const PROJECT_SCOPED_ID = "EditHome01";

    function publishProjectScoped(): void {
      store.publish(
        PROJECT_SCOPED_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: PINNED_TO_PROJECT },
        }),
      );
    }

    it("refuses it, naming every project-scoped entry and the way out", async () => {
      const home = await takeInstalledHome([E2E_SKILL.react.id]);
      publishProjectScoped();

      prompt = launchAtHome(PROJECT_SCOPED_ID, home);
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      const said = prompt.getOutput();
      expect(said).toContain(STEP_TEXT.SHARED_CONFIG_PROJECT_SCOPE_AT_HOME);
      // Not `uninstall`: the configuration is installable, the location is not.
      expect(said).toContain(STEP_TEXT.SHARED_CONFIG_PROJECT_SCOPE_HINT);
      // Both kinds named: only the sharer knows which they meant.
      expect(said).toContain(`skill ${E2E_SKILL.react.display}`);
      expect(said).toContain(`sub-agent ${WEB_DEV}`);
    });

    it("refuses before it asks permission to remove anything", async () => {
      const home = await takeInstalledHome([E2E_SKILL.react.id, E2E_SKILL.vitest.id]);
      publishProjectScoped();

      prompt = launchAtHome(PROJECT_SCOPED_ID, home);
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      // Exit code and sentence first: a run that never reached the command satisfies the negative.
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      const said = prompt.getOutput();
      expect(said).toContain(STEP_TEXT.SHARED_CONFIG_PROJECT_SCOPE_AT_HOME);
      // A plan shown before a refusal would describe removals never intended.
      expect(said).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
    });

    it("leaves the global installation byte-identical", async () => {
      const home = await takeInstalledHome([E2E_SKILL.react.id, E2E_SKILL.vitest.id]);
      publishProjectScoped();
      const before = await installedTrees(home);

      prompt = launchAtHome(PROJECT_SCOPED_ID, home);
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      // Subject guard: an untouched tree is also what a run that never started leaves.
      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(prompt.getOutput()).toContain(STEP_TEXT.SHARED_CONFIG_PROJECT_SCOPE_AT_HOME);
      // This command deletes, so a late refusal would follow a removal.
      expect(await installedTrees(home)).toStrictEqual(before);
    });
  });

  describe("a configuration that is all global", () => {
    const ALL_GLOBAL_ID = "EditHome02";

    it("applies here, removing what it leaves out", async () => {
      const home = await takeInstalledHome([E2E_SKILL.react.id, E2E_SKILL.vitest.id]);
      // The protected case: every entry global.
      store.publish(
        ALL_GLOBAL_ID,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              scope: "global",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "global" } },
        }),
      );

      prompt = launchAtHome(ALL_GLOBAL_ID, home);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode, `apply at the global root failed: ${prompt.getOutput()}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      // Both surfaces: either alone can look right.
      const config = await loadConfigOrFail(home);
      expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
      expect(await listFiles(skillsPath(home))).toStrictEqual([E2E_SKILL.react.id]);
    });
  });
});
