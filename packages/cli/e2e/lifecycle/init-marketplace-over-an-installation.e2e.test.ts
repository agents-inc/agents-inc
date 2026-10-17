import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { createE2ESource, E2E_SOURCE, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupFixture,
  cleanupTempDir,
  loadConfigOrFail,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

/**
 * `init --marketplace <Y>` without `--from` over an existing installation opens the editor and
 * says how to add Y there, leaving the installation byte for byte as it was. X is the fixture
 * without its spare skill, Y the full one.
 */

const NAMED = E2E_SOURCE;

function addItLine(ref: string): string {
  return `${ref} is a folder on this machine, which the editor cannot read — push it to GitHub, then add it from the editor's Marketplace button.`;
}

describe("init --marketplace where an installation already serves the directory", () => {
  let installedFrom: E2ESource;
  let store: SeedConfigStore;
  let environment: TestEnvironment | undefined;

  beforeAll(async () => {
    installedFrom = await createE2ESource({ withoutSkills: [E2E_SKILL["visual-regression"].id] });
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(installedFrom);
  });

  afterEach(async () => {
    store.reset();
    if (environment) {
      await cleanupTempDir(environment.tempDir);
      environment = undefined;
    }
  });

  /** A global installation from X, under a project holding nothing. */
  async function underAGlobalInstallation(): Promise<TestEnvironment> {
    const made = await createTestEnvironment();
    environment = made;
    await installFromSeed(
      store,
      "GlobalX1",
      e2eStackPayload(),
      { dir: made.fakeHome, home: made.fakeHome },
      installedFrom.sourceDir,
    );
    return made;
  }

  /** A project installation of its own from X. */
  async function withItsOwnInstallation(): Promise<TestEnvironment> {
    const made = await createTestEnvironment();
    environment = made;
    await installFromSeed(
      store,
      "ProjectX1",
      e2eStackPayload({ scope: "project" }),
      { dir: made.projectDir, home: made.fakeHome },
      installedFrom.sourceDir,
    );
    return made;
  }

  async function expectTheEditorRoute(made: TestEnvironment, ref: string): Promise<void> {
    const before = await readTreeSnapshot(made.fakeHome);

    const run = await CLI.run(
      ["init", "--marketplace", ref],
      { dir: made.projectDir },
      { env: { HOME: made.fakeHome } },
    );

    expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
    expect(run.stdout).toContain(`Build it at ${STEP_TEXT.EDITOR_URL}`);
    expect(run.stdout).toContain(addItLine(ref));
    expect(run.output, "the dashboard has nowhere to put a marketplace").not.toContain(
      STEP_TEXT.DASHBOARD,
    );
    // One snapshot for both scopes: the project is nested inside the fake HOME.
    expect(await readTreeSnapshot(made.fakeHome)).toStrictEqual(before);
  }

  it(
    "opens the editor under a global installation, leaving it as it was",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const made = await underAGlobalInstallation();
      expect(
        (await loadConfigOrFail(made.fakeHome)).marketplace,
        "the global installation was made from X",
      ).toBe(installedFrom.sourceDir);

      await expectTheEditorRoute(made, NAMED.sourceDir);
    },
  );

  it(
    "opens the editor where the folder's own installation came from another marketplace, leaving it as it was",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const made = await withItsOwnInstallation();
      expect(
        (await loadConfigOrFail(made.projectDir)).marketplace,
        "the project's own installation was made from X",
      ).toBe(installedFrom.sourceDir);

      await expectTheEditorRoute(made, NAMED.sourceDir);
    },
  );

  it(
    "opens the editor where the folder's own installation came from the marketplace named",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const made = await withItsOwnInstallation();

      await expectTheEditorRoute(made, installedFrom.sourceDir);
    },
  );
});
