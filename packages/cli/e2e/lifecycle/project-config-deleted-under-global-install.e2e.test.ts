import { mkdir, rm } from "fs/promises";
import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import { type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { createDualScopeEnvFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  configTsPath,
  directoryExists,
  fileExists,
  readTreeSnapshot,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { DIRS, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";

const CONFIG_ROW_PASSING = `${STEP_TEXT.DOCTOR_CONFIG_CHECK}\\s+✓\\s+`;

const CONFIG_RELATIVE = `${DIRS.SOURCE_CLAUDE}/${FILES.CONFIG_TS}`;

/** Never set up, so it inherits the global config. */
const NEVER_CONFIGURED = "never-configured";

describe("doctor's Config Valid row under a live global installation", () => {
  let store: SeedConfigStore;
  let env: DualScopeEnv;

  let ownConfig: CLIResult;
  let atHome: CLIResult;
  let neverConfigured: CLIResult;
  let deleted: CLIResult;
  let deletedTreeBefore: Record<string, TreeSnapshotEntry>;
  let deletedTreeAfter: Record<string, TreeSnapshotEntry>;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    env = await createDualScopeEnvFromSeed(store);
    const { fakeHome, projectDir } = env;
    const asUser = { env: { HOME: fakeHome } };

    ownConfig = await CLI.run(["doctor"], { dir: projectDir }, asUser);
    atHome = await CLI.run(["doctor"], { dir: fakeHome }, asUser);

    const bareDir = path.join(fakeHome, NEVER_CONFIGURED);
    await mkdir(bareDir, { recursive: true });
    neverConfigured = await CLI.run(["doctor"], { dir: bareDir }, asUser);

    const projectConfig = configTsPath(projectDir);
    expect(await fileExists(projectConfig), "the project was set up with a config of its own").toBe(
      true,
    );
    await rm(projectConfig);
    expect(await fileExists(projectConfig)).toBe(false);
    deletedTreeBefore = await readTreeSnapshot(fakeHome);
    deleted = await CLI.run(["doctor"], { dir: projectDir }, asUser);
    deletedTreeAfter = await readTreeSnapshot(fakeHome);
  }, TIMEOUTS.EXTENDED_LIFECYCLE);

  afterAll(async () => {
    await env.destroy();
    await store.close();
  });

  it("labels a project's own config as this project's", () => {
    expect(ownConfig.stdout, ownConfig.output).toMatch(
      new RegExp(
        `${CONFIG_ROW_PASSING}${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} ${CONFIG_RELATIVE} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}`,
      ),
    );
  });

  it("labels the config at the home directory as the global installation's, named from home", () => {
    expect(atHome.stdout, atHome.output).toMatch(
      new RegExp(
        `${CONFIG_ROW_PASSING}${STEP_TEXT.DOCTOR_CONFIG_THE_GLOBAL_INSTALLATION} ~/${CONFIG_RELATIVE} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}`,
      ),
    );
  });

  it("names the global installation's file in a directory under home that never had a config", () => {
    expect(neverConfigured.stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
    expect(
      neverConfigured.stdout,
      "the row names a config this directory does not have",
    ).not.toMatch(
      new RegExp(`${CONFIG_ROW_PASSING}${CONFIG_RELATIVE} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}`),
    );
    expect(neverConfigured.stdout, neverConfigured.output).toMatch(
      new RegExp(
        `${CONFIG_ROW_PASSING}${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} [^\\n]*${STEP_TEXT.DOCTOR_CONFIG_USING_GLOBAL} \\(~/${CONFIG_RELATIVE}\\)`,
      ),
    );
  });

  describe("once the project's config.ts is deleted", () => {
    it("names the global installation's file rather than the path of the one deleted", () => {
      expect(deleted.stdout).toContain(STEP_TEXT.DOCTOR_CONFIG_CHECK);
      expect(
        deleted.stdout,
        "the row calls the deleted project config valid — it read the global one",
      ).not.toMatch(
        new RegExp(`${CONFIG_ROW_PASSING}${CONFIG_RELATIVE} ${STEP_TEXT.DOCTOR_CONFIG_IS_VALID}`),
      );
      expect(deleted.stdout, deleted.output).toMatch(
        new RegExp(
          `${CONFIG_ROW_PASSING}${STEP_TEXT.DOCTOR_CONFIG_THIS_PROJECT} [^\\n]*${STEP_TEXT.DOCTOR_CONFIG_USING_GLOBAL} \\(~/${CONFIG_RELATIVE}\\)`,
        ),
      );
    });

    /**
     * What the project's own configuration put there (`DUAL_SCOPE`), now declared by nothing. Its
     * skill folder is not judged: doctor names skill folders only where no configuration exists.
     */
    it("names the project's stranded agent, which no configuration declares, and not its skill folder", async () => {
      const inTheProject = (...segments: string[]) =>
        path.join("~", path.relative(env.fakeHome, env.projectDir), ...segments);

      expect(
        await directoryExists(
          path.join(env.projectDir, DIRS.CLAUDE, DIRS.SKILLS, E2E_SKILL.hono.id),
        ),
        "the subject: the project's skill folder is still on disk",
      ).toBe(true);
      expect(deleted.stdout, deleted.output).toContain(
        [
          "    No Orphans              ✗  1 agent installed here, and no configuration declares them",
          `                               - ${inTheProject(DIRS.CLAUDE, DIRS.AGENTS, `${E2E_AGENT["api-developer"].name}.md`)}`,
          "    Skills Installed",
        ].join("\n"),
      );
    });

    it("finds nothing stranded while the project still has its own config", () => {
      expect(ownConfig.stdout, ownConfig.output).toMatch(
        /No Orphans\s+✓\s+No orphaned agent files\n/,
      );
    });

    it("writes nothing, recreating no config it names", () => {
      expect(
        Object.keys(deletedTreeBefore).length,
        "the snapshot holds the installation",
      ).toBeGreaterThan(0);
      expect(deletedTreeAfter, "doctor reports and writes to neither scope").toStrictEqual(
        deletedTreeBefore,
      );
    });
  });
});
