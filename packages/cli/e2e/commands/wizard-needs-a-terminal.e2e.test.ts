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
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * A command that can only run in a terminal refuses cleanly where there is none — a CI job, a
 * script, a pipe — rather than mounting the wizard and dying on Ink's raw-mode error.
 *
 * The owner's ruling: a command that cannot run without a terminal "should break because it's not
 * a valid command". So it breaks on purpose: a non-zero exit, a sentence saying there is no
 * terminal here, nothing written, and no stack trace. `init`'s refusal names `init --from <id>`,
 * the one install that needs no terminal at all, and that remedy is RUN here too — it is the
 * control that makes the refusal a statement about the wizard rather than about the missing
 * terminal in general. The dashboard `init` prints over an installation is the other control: it
 * already prints text and exits 0 without a terminal, and that is kept.
 *
 * `CLI.run` hands the child an inherited stdin, which under vitest is not a terminal, so every run
 * here is the CI case by construction.
 *
 * `init` is driven with `--marketplace` naming the shared fixture rather than bare. The route is
 * the same — `selectionFromWizard` either way — and the flag keeps the run offline, where a bare
 * `init` would fetch the default public marketplace before it reached the wizard.
 *
 * The refusal's exit is pinned to `ERROR`, the code `edit --from`'s own terminal refusal
 * (`sharedConfigNeedsTerminal`) exits with — the pattern this one follows.
 *
 * `uninstall` is the third command here, though it opens no wizard: what needs the terminal is its
 * confirm, which crashed the same way. Its refusal names `--yes`, the person answering the confirm
 * in advance, and that run is its control.
 *
 * Observed red against the unfixed build: `init` printed `Raw mode is not supported on the current
 * process.stdin` over a React stack and exited 4 (CANCELLED), and `edit` the same. Both controls
 * are green there and must stay green.
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

describe("a command that needs a terminal, run without one", () => {
  let store: SeedConfigStore;
  let environment: TestEnvironment | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(SHARED_ID, SHARED_CONFIGURATION);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    if (environment) {
      await cleanupTempDir(environment.tempDir);
      environment = undefined;
    }
  });

  /** A project installed by `init --from` — the remedy itself — under an empty global HOME. */
  async function installedWithoutATerminal(): Promise<TestEnvironment> {
    const made = await createTestEnvironment({ permissions: false });
    environment = made;
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
    "refuses init in an empty folder, naming init --from as the install that needs no terminal",
    { timeout: TIMEOUTS.INSTALL },
    async () => {
      environment = await createTestEnvironment({ permissions: false });
      const { fakeHome, projectDir } = environment;
      const before = await readTreeSnapshot(fakeHome);

      const refused = await CLI.run(
        ["init", "--marketplace", E2E_SOURCE.sourceDir],
        { dir: projectDir },
        { env: { HOME: fakeHome } },
      );

      const said = flattenCliOutput(refused.output);
      expect(said, "the wizard must not be mounted where it cannot be driven").not.toContain(
        STEP_TEXT.INK_RAW_MODE_UNSUPPORTED,
      );
      expect(said, "the refusal says why").toContain(STEP_TEXT.WIZARD_NEEDS_TERMINAL);
      expect(said, "and names the install that runs without one").toContain(
        `${CLI_INVOKE_COMMAND} ${STEP_TEXT.WIZARD_NEEDS_TERMINAL_REMEDY}`,
      );
      expect(refused.exitCode, refused.output).toBe(EXIT_CODES.ERROR);
      // One snapshot for both scopes: the project is nested inside the fake HOME.
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );

  it(
    "installs with init --from in an empty folder, which is the run the refusal names",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { projectDir } = await installedWithoutATerminal();

      expect(
        (await loadConfigOrFail(projectDir)).skills.map((skill) => skill.id),
        "the shared configuration's skill is installed in the project",
      ).toStrictEqual([E2E_SKILL.hono.id]);
      expect(await listFiles(skillsPath(projectDir))).toStrictEqual([E2E_SKILL.hono.id]);
    },
  );

  it(
    "refuses edit over an installation, and leaves the installation as it was",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const { fakeHome, projectDir } = await installedWithoutATerminal();
      const before = await readTreeSnapshot(fakeHome);

      const refused = await CLI.run(["edit"], { dir: projectDir }, { env: { HOME: fakeHome } });

      const said = flattenCliOutput(refused.output);
      expect(said, "the wizard must not be mounted where it cannot be driven").not.toContain(
        STEP_TEXT.INK_RAW_MODE_UNSUPPORTED,
      );
      expect(said, "the refusal says why").toContain(STEP_TEXT.WIZARD_NEEDS_TERMINAL);
      expect(refused.exitCode, refused.output).toBe(EXIT_CODES.ERROR);
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
      expect(run.output).not.toContain(STEP_TEXT.WIZARD_NEEDS_TERMINAL);
      expect(await readTreeSnapshot(fakeHome)).toStrictEqual(before);
    },
  );
});
