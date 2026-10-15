import path from "path";
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
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  directoryExists,
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  skillsPath,
} from "../helpers/test-utils.js";
import { CLI_INVOKE_COMMAND, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * Commands run where there is no terminal — a CI job, a script, a pipe.
 *
 * `init` and `edit` need none: each opens the editor by printing its address, so both exit 0 and
 * write nothing. `uninstall` does need one, for its confirm, so it refuses cleanly rather than
 * dying on Ink's raw-mode error, naming `--yes` — the person answering the confirm in advance —
 * and that run is its control. The dashboard `init` prints over an installation is text and exits
 * 0 as well.
 *
 * `CLI.run` hands the child an inherited stdin, which under vitest is not a terminal, so every run
 * here is the CI case by construction.
 */

const API_DEV = E2E_AGENT["api-developer"].name;

/** A configuration somebody shared: one skill on one sub-agent, both pinned to the project. */
const SHARED_CONFIGURATION = buildSeedPayload({
  v: PINNED_WIRE_VERSION,
  skills: {
    [E2E_SKILL.hono.id]: buildSeedSkill({
      install: "eject",
      scope: "project",
      assignments: { [API_DEV]: "lazy" },
    }),
  },
  agents: { [API_DEV]: { scope: "project" } },
});

const SHARED_ID = "NoTerm01";

describe("a command run without a terminal", () => {
  let store: SeedConfigStore;
  let environment: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (environment) {
      await cleanupTempDir(environment.tempDir);
      environment = undefined;
    }
  });

  /** A project installed by `init --from` under an empty global HOME. */
  async function installedWithoutATerminal(): Promise<TestEnvironment> {
    const made = await createTestEnvironment({ permissions: false });
    environment = made;
    store.publish(SHARED_ID, SHARED_CONFIGURATION);
    const install = await runInitFrom(
      store,
      SHARED_ID,
      { dir: made.projectDir, globalHome: made.fakeHome },
      E2E_SOURCE.sourceDir,
    );
    expect(install.exitCode, install.output).toBe(EXIT_CODES.SUCCESS);
    return made;
  }

  it(
    "opens the editor for init --marketplace in an empty folder, and writes nothing",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      environment = await createTestEnvironment({ permissions: false });
      const { fakeHome, projectDir } = environment;
      const before = await readTreeSnapshot(fakeHome);

      const run = await CLI.run(
        ["init", "--marketplace", E2E_SOURCE.sourceDir],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      expect(flattenCliOutput(run.output)).not.toContain(STEP_TEXT.INK_RAW_MODE_UNSUPPORTED);
      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
      expect(run.stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
      expect(run.stdout).toContain(
        `${E2E_SOURCE.sourceDir} is a folder on this machine, which the editor cannot read — push it to GitHub, then add it from the editor's Marketplace button.`,
      );
      // One snapshot for both scopes: the project is nested inside the fake HOME.
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );

  it("installs with init --from in an empty folder", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    const { projectDir } = await installedWithoutATerminal();

    expect(
      (await loadConfigOrFail(projectDir)).skills.map((skill) => skill.id),
      "the shared configuration's skill is installed in the project",
    ).toStrictEqual([E2E_SKILL.hono.id]);
    expect(await listFiles(skillsPath(projectDir))).toStrictEqual([E2E_SKILL.hono.id]);
  });

  it(
    "opens the editor for edit over an installation, and leaves the installation as it was",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await installedWithoutATerminal();
      store.reset();
      const before = await readTreeSnapshot(fakeHome);

      const run = await CLI.run(
        ["edit"],
        { dir: projectDir },
        { env: { HOME: fakeHome, AGENTS_INC_API_URL: store.url } },
      );

      expect(flattenCliOutput(run.output)).not.toContain(STEP_TEXT.INK_RAW_MODE_UNSUPPORTED);
      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
      expect(store.minted).toHaveLength(1);
      expect(run.output).toContain(`Shared as ${firstElement(store.minted)}`);
      expect(run.output).toContain(STEP_TEXT.EDITOR_URL);
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );

  it(
    "refuses uninstall without --yes, naming --yes, and removes nothing",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await installedWithoutATerminal();
      const before = await readTreeSnapshot(fakeHome);

      const refused = await CLI.run(
        ["uninstall"],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      const said = flattenCliOutput(refused.output);
      expect(said, "the confirm must not be mounted where it cannot be answered").not.toContain(
        STEP_TEXT.INK_RAW_MODE_UNSUPPORTED,
      );
      expect(said, "the refusal says why").toContain(STEP_TEXT.UNINSTALL_NEEDS_TERMINAL);
      expect(said, "and names the run that answers the confirm in advance").toContain(
        `${CLI_INVOKE_COMMAND} ${STEP_TEXT.UNINSTALL_NEEDS_TERMINAL_REMEDY}`,
      );
      expect(refused.exitCode, refused.output).toBe(EXIT_CODES.ERROR);
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );

  it(
    "uninstalls with --yes without a terminal, which is the run the refusal names",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await installedWithoutATerminal();

      const run = await CLI.run(
        ["uninstall", "--yes"],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
      expect(run.output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);
      await expectNoSourceFolder(projectDir, "the installation's config is gone");
      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.hono.id)),
        "and so is the skill it installed",
      ).toBe(false);
    },
  );

  it(
    "still prints the dashboard for init over an installation, and exits 0",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await installedWithoutATerminal();
      const before = await readTreeSnapshot(fakeHome);

      const run = await CLI.run(["init"], { dir: projectDir }, { env: { HOME: fakeHome } });

      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
      expect(run.output, "the dashboard is text, and needs no terminal").toContain(
        STEP_TEXT.DASHBOARD,
      );
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );
});
