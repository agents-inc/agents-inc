import path from "path";
import { mkdir } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION } from "../fixtures/seed-wire-contract.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createTempDir,
  directoryExists,
  writeCorruptConfig,
} from "../helpers/test-utils.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { renderUnparseableConfigTs } from "../../src/cli/lib/__tests__/factories/unloadable-config-factories.js";
import { CLI_INVOKE_COMMAND, DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";

const INSTALLED_AGENT = E2E_AGENT["web-developer"].name;

/**
 * `edit --ui --from <id>`: `--ui` opens whatever `--from` names, or the command's own subject
 * without it.
 */
describe("edit --ui --from", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
  });

  it("opens the id it was given", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("?fromId=se_XYZ789");
  });

  /** Opening an id reads no local state, so no installation is required. */
  it("needs no installation, because opening an id reads nothing local", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    await expectNoSourceFolder(
      tempDir,
      "opening an id in the editor is not a setup, so edit --ui installs nothing",
    );
  });

  it("applies nothing, because looking is not applying", async () => {
    tempDir = await createTempDir();

    await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], { dir: tempDir });

    expect(await directoryExists(`${tempDir}/${DIRS.CLAUDE}`)).toBe(false);
  });

  /** The offered command must run here: over an empty directory that is `init --from`. */
  it("offers init --from in a directory with nothing installed", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], {
      dir: tempDir,
    });

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(
      `To install it here instead, run '${CLI_INVOKE_COMMAND} init --from se_XYZ789'.`,
    );
    expect(output, "edit --from refuses a directory with nothing installed").not.toContain(
      `${CLI_INVOKE_COMMAND} edit --from`,
    );
  });

  /** Installed as a recipient would, with `init --from`, then a second id is opened over it. */
  describe("over a directory holding its own installation", () => {
    let sourceDir: string;
    let sourceTempDir: string;
    let store: SeedConfigStore;
    let env: TestEnvironment | undefined;

    beforeAll(async () => {
      ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
      store = await startSeedConfigStore();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await store.close();
      await cleanupTempDir(sourceTempDir);
    });

    afterEach(async () => {
      store.reset();
      if (env) await cleanupTempDir(env.tempDir);
      env = undefined;
    });

    it("offers edit --from", async () => {
      env = await createTestEnvironment({ permissions: false });
      const project = { dir: env.projectDir, globalHome: env.fakeHome };
      store.publish(
        "Installed1",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          // Eject: the local E2E source has no marketplace to install plugins from.
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              install: "eject",
              scope: "project",
              assignments: { [INSTALLED_AGENT]: "lazy" },
            }),
          },
          agents: { [INSTALLED_AGENT]: { scope: "project" } },
        }),
      );
      const installed = await runInitFrom(store, "Installed1", project, sourceDir);
      expect(installed.exitCode, installed.output).toBe(EXIT_CODES.SUCCESS);

      const { exitCode, output } = await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], project);

      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(
        `To apply it here instead, run '${CLI_INVOKE_COMMAND} edit --from se_XYZ789'.`,
      );
      expect(output, "init --from refuses a directory holding its own installation").not.toContain(
        `${CLI_INVOKE_COMMAND} init --from`,
      );
    });
  });

  /**
   * Choosing the command reads the config, so a broken one must not cost the link; the file's
   * presence still counts as an installation.
   */
  it("still opens the id over a config it cannot read", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });
    await writeCorruptConfig(projectDir, renderUnparseableConfigTs());

    const { exitCode, output } = await CLI.run(
      ["edit", "--ui", "--from", "se_XYZ789"],
      { dir: projectDir },
      { env: { HOME: home } },
    );

    expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("?fromId=se_XYZ789");
    expect(output).toContain(
      `To apply it here instead, run '${CLI_INVOKE_COMMAND} edit --from se_XYZ789'.`,
    );
  });
});
