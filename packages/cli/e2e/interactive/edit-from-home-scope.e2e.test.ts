import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  FORKED_FROM_METADATA,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
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
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";

/**
 * A global installation holds only global-scoped content, and `edit --from` is the second
 * producer that has to be told so.
 *
 * The home directory IS the global scope — both scopes resolve to one config, one skills
 * directory and one agents directory there — so a payload's `scope: "project"` entry does not
 * land somewhere else; it lands in the global config wearing a label that contradicts the file
 * it is in, and `toClaudePluginScope` maps that declared scope onward. `init --from` refuses
 * exactly this and names every offender; applying the same payload through `edit --from`
 * reaches the same state through the other door, and reaches it DESTRUCTIVELY: this command can
 * remove global entries on the way in.
 *
 * The refusal needs the decoded payload to answer — an all-global configuration is precisely
 * what a global installation is for — so it fires after the decode, which is the first moment
 * its input exists. Everything it costs by then has already been spent on the terminal check and
 * the fetch, and nothing has been written.
 *
 * Two things this must NOT do, and each has its own spec: refuse an all-global configuration
 * here (the case the invariant exists to protect), and confirm anything before it refuses.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** A sub-agent entry that keeps its agent in the project rather than at the resting default. */
const PINNED_TO_PROJECT = { scope: "project" } as const;

describe("edit --from <id> at the global root", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    await ensureBinaryExists();
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
   * A global installation at a fake home directory — every entry global-scoped, which is the
   * only shape a global install has. Built from the same writers `ProjectBuilder` uses; there
   * is no home-root factory because this is the only suite that needs one.
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

  /**
   * Both trees a global installation lives in: the config pair, and the skills, agents and
   * settings under `.claude/`. Snapshotted separately rather than as one read of `$HOME`,
   * because HOME is also where oclif's update-check plugin keeps its version cache — a file
   * written beside the installation by something that is not this command.
   */
  async function installedTrees(home: string): Promise<Record<string, unknown>> {
    return {
      configPair: await readTreeSnapshot(path.join(home, DIRS.CLAUDE_SRC)),
      claude: await readTreeSnapshot(path.join(home, DIRS.CLAUDE)),
    };
  }

  /** Starts `edit --from <id>` in a real terminal whose HOME is the directory it runs in. */
  function launchAtHome(id: string, home: string): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], home, {
      env: { AGENTS_INC_API_URL: store.url, HOME: home },
    });
  }

  describe("a configuration with project-scoped content", () => {
    const PROJECT_SCOPED_ID = "EditHome01";

    /** React pinned to the project, and the sub-agent that holds it pinned with it. */
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
      // Not `uninstall`: the configuration is installable and the location is not, so the way
      // out is another directory — the same distinction `init --from` draws.
      expect(said).toContain(STEP_TEXT.SHARED_CONFIG_PROJECT_SCOPE_HINT);
      // Named rather than counted, and both kinds: a skill's scope and a sub-agent's are
      // separate decisions in the payload, and only the sharer knows which they meant.
      expect(said).toContain(`skill ${E2E_SKILL.react.id}`);
      expect(said).toContain(`sub-agent ${WEB_DEV}`);
    });

    it("refuses before it asks permission to remove anything", async () => {
      const home = await takeInstalledHome([E2E_SKILL.react.id, E2E_SKILL.vitest.id]);
      publishProjectScoped();

      prompt = launchAtHome(PROJECT_SCOPED_ID, home);
      await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      // The confirm is this command's one gate, and a plan shown for a run that is about to be
      // refused describes removals it never intended to make.
      expect(prompt.getOutput()).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
    });

    it("leaves the global installation byte-identical", async () => {
      const home = await takeInstalledHome([E2E_SKILL.react.id, E2E_SKILL.vitest.id]);
      publishProjectScoped();
      const before = await installedTrees(home);

      prompt = launchAtHome(PROJECT_SCOPED_ID, home);
      await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      // The refusal's whole claim, and the one `init --from` never had to make: this command
      // deletes, so a refusal that arrived late would be a refusal after a removal.
      expect(await installedTrees(home)).toStrictEqual(before);
    });
  });

  describe("a configuration that is all global", () => {
    const ALL_GLOBAL_ID = "EditHome02";

    it("applies here, removing what it leaves out", async () => {
      const home = await takeInstalledHome([E2E_SKILL.react.id, E2E_SKILL.vitest.id]);
      // The case the refusal exists to protect. Every entry is global, which is the only scope
      // a global installation can hold — so this is not a payload the location refuses.
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
      // Both surfaces, because either alone can look right while the other lies: a config entry
      // for a deleted directory, or a directory nothing declares.
      const config = await loadConfigOrFail(home);
      expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
      expect(await listFiles(skillsPath(home))).toStrictEqual([E2E_SKILL.react.id]);
    });
  });
});
