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

/** The one sub-agent the installation below carries, pinned to the project it is installed in. */
const INSTALLED_AGENT = E2E_AGENT["web-developer"].name;

/**
 * `edit --ui --from <id>` — the pairing that makes a shared id something a recipient can LOOK at.
 *
 * The two flags were refused together until 2026-08-24, on the reading that they were opposite
 * ends of one round trip: `--ui` handed THIS installation out and `--from` applied one back. The
 * owner's ruling replaced that with one rule for both commands — **`--ui` opens whatever `--from`
 * names, and the command's own subject when `--from` is absent** — under which the combination is
 * the obvious thing rather than a contradiction.
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

  /**
   * No installation is required, and that is the owner's ruling rather than an oversight: opening
   * an id in a browser reads no local state, so requiring one would be arbitrary. It is the same
   * reasoning that puts `init --ui` above `ensureConfigReadable` — a directory's condition cannot
   * decide whether you may look at somebody else's configuration.
   *
   * `edit` refuses a directory with nothing installed on every OTHER path, so this spec is what
   * says the exemption is deliberate.
   */
  it("needs no installation, because opening an id reads nothing local", async () => {
    tempDir = await createTempDir();

    const { exitCode } = await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], { dir: tempDir });

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    await expectNoSourceFolder(
      tempDir,
      "opening an id in the editor is not a setup, so edit --ui installs nothing",
    );
  });

  /** Applying is what `--from` does WITHOUT `--ui`; naming an id to look at must change nothing. */
  it("applies nothing, because looking is not applying", async () => {
    tempDir = await createTempDir();

    await CLI.run(["edit", "--ui", "--from", "se_XYZ789"], { dir: tempDir });

    expect(await directoryExists(`${tempDir}/${DIRS.CLAUDE}`)).toBe(false);
  });

  /**
   * The command it offers instead has to be one that runs HERE. `edit --from` refuses a directory
   * with nothing installed, so over one it offers `init --from`, the command that installs an id
   * into an empty directory — and the case below is the other half: over a directory holding its
   * own installation, `init --from` is the one that refuses, so it offers `edit --from`.
   */
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

  /**
   * The other half of the pair above. The installation is made the way a recipient makes one —
   * `init --from` an id somebody shared — and then a SECOND id is opened over it.
   */
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
          // Eject, because the E2E source is local and has no marketplace to install plugins from.
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
   * Choosing the command reads this directory's config, on a path that otherwise reads nothing
   * local — so a config too broken to load must not cost the link. The file is there, so the
   * directory counts as holding its own installation.
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
