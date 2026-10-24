import path from "path";
import { rm } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import {
  createTestEnvironment,
  readConfigSkillIds,
  type TestEnvironment,
} from "../fixtures/dual-scope-helpers.js";
import { applyEditFrom, e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  startTarballSourceServer,
  type TarballSourceServer,
} from "../helpers/tarball-source-server.js";
import {
  cleanupTempDir,
  configTsPath,
  createTempDir,
  fileExists,
  flattenCliOutput,
  loadConfigOrFail,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

import type { ProjectHandle } from "../fixtures/project-handle.js";

/**
 * A marketplace that refuses the version check with any 4xx but 405 stops `init --from` and
 * `edit --from` with an error until it answers again, rather than installing from the copy saved on
 * disk (owner rulings 2026-10-23, CLI-946, and 2026-10-24, CLI-958): a 404, as GitHub, Bitbucket and
 * sourcehut answer for a repository gone or private, a 403, as GitLab does, a 401 and a 410. A 5xx,
 * and a 405 or 501 from a host refusing the HEAD it is asked with, keep the saved copy and say the
 * marketplace refused. Each stop's permitted twins are the same command over the same saved copy
 * while the marketplace answers, and `compile` over the same refusal, which keeps the copy and says
 * nothing. An unreachable marketplace is not the rulings' subject: the last describe pins today's
 * warning for `init`, so the stop cannot spread to it.
 *
 * A served tarball, since a local marketplace is never saved. Every run shares one HOME, where the
 * saved copy lives; each `init` gets a fresh project, so a retry meets what its first attempt met.
 *
 * The "writes nothing" snapshots were mutation-checked, not reverted (a revert writes nothing
 * either): a uniquely named file written into HOME by the stop over the saved copy, and into the
 * project by the stop over giget's tarball, reddened exactly the snapshotEverything and
 * snapshotInstallations comparisons of the 404 and 403 rows, and nothing before them. The "keeps the
 * saved copy" snapshots were checked the same way: a uniquely named file written into the saved
 * copies after each `compile`, kept `init` and kept `edit`, with the unbuilt warning's assertion
 * inverted, reddened exactly those comparisons, and nothing before them.
 */

const INSTALL_ID = "Refused01";
const EDIT_ID = "Refused02";

/** What the edit adds, so an applied edit is told from one that changed nothing. */
const ADDED = E2E_SKILL.vitest;

const ANSWERED = "HEAD 200";

const REFUSALS = [
  { status: 404, refusal: STEP_TEXT.MARKETPLACE_REPOSITORY_NOT_FOUND },
  { status: 403, refusal: STEP_TEXT.MARKETPLACE_ACCESS_DENIED },
  { status: 401, refusal: STEP_TEXT.MARKETPLACE_AUTHENTICATION_REQUIRED },
  { status: 410, refusal: STEP_TEXT.MARKETPLACE_FETCH_FAILED },
] as const;

/** A server failing, or a host refusing the HEAD the check asks with: the saved copy stands in. */
const KEPT_OVER = [500, 503, 405, 501] as const;

describe("init --from and edit --from against a marketplace that refuses its version check", () => {
  let server: TarballSourceServer;
  let store: SeedConfigStore;
  let env: TestEnvironment;
  let installed: Required<ProjectHandle>;
  let prompt: InteractivePrompt | undefined;
  const freshProjects: string[] = [];

  async function freshProject(): Promise<Required<ProjectHandle>> {
    const dir = await createTempDir();
    freshProjects.push(dir);
    return { dir, globalHome: env.fakeHome };
  }

  async function snapshotEverything(project: ProjectHandle): Promise<unknown> {
    return {
      home: await readTreeSnapshot(env.tempDir),
      project: await readTreeSnapshot(project.dir),
    };
  }

  /** HOME's installation folders, where the global config lives, and the project: not the cache. */
  async function snapshotInstallations(project: ProjectHandle): Promise<unknown> {
    return {
      homeSourceFolder: await readTreeSnapshot(path.join(env.fakeHome, DIRS.SOURCE_ROOT)),
      homeClaude: await readTreeSnapshot(path.join(env.fakeHome, DIRS.CLAUDE)),
      project: await readTreeSnapshot(project.dir),
    };
  }

  /** The saved copy and its fetch record, which a load keeping the copy leaves as it found them. */
  function snapshotSavedCopies(): Promise<unknown> {
    return readTreeSnapshot(path.join(env.fakeHome, DIRS.SOURCE_CACHE_COPIES));
  }

  /** Who refused and with what, then that the saved copy stood in, as the unreachable warning says. */
  function refusedWarning(status: number): string {
    return `${server.url} ${STEP_TEXT.MARKETPLACE_REFUSED_CACHED} (${status}) — ${STEP_TEXT.SOURCE_UNREACHABLE_CACHED}`;
  }

  function launchEdit(project: Required<ProjectHandle>, id: string): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], project.dir, {
      env: { AGENTS_INC_API_URL: store.url, HOME: project.globalHome },
    });
  }

  /** `init --from` into a fresh project, held to the refusal; `snapshot` is compared around it. */
  async function expectInitStopped(
    { status, refusal }: { status: number; refusal: string },
    snapshot: (project: ProjectHandle) => Promise<unknown>,
  ): Promise<void> {
    const project = await freshProject();
    const before = await snapshot(project);
    const asked = server.requests.length;

    const { exitCode, output } = await runInitFrom(store, INSTALL_ID, project, server.url);

    expect(server.requests.slice(asked), "subject guard: the version check was refused").toContain(
      `HEAD ${status}`,
    );
    expect(exitCode, `a refused version check must stop init: ${output}`).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(`${refusal} ${server.url}`);
    expect(await fileExists(configTsPath(project.dir)), "a stopped init writes no config").toBe(
      false,
    );
    expect(
      await snapshot(project),
      "a stopped init leaves the project and HOME as it found them",
    ).toStrictEqual(before);
  }

  beforeAll(async () => {
    server = await startTarballSourceServer(E2E_SOURCE.sourceDir);
    store = await startSeedConfigStore();
    store.publish(INSTALL_ID, e2eStackPayload({ scope: "project", without: [ADDED.id] }));
    store.publish(EDIT_ID, e2eStackPayload({ scope: "project" }));
    env = await createTestEnvironment();
    installed = { dir: env.projectDir, globalHome: env.fakeHome };

    // Downloads the marketplace, so its copy and the ETag it answered with are saved under HOME.
    const result = await runInitFrom(store, INSTALL_ID, installed, server.url);
    expect(result.exitCode, `install failed: ${result.output}`).toBe(EXIT_CODES.SUCCESS);
  }, TIMEOUTS.SETUP);

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
  });

  afterAll(async () => {
    await server.close();
    await store.close();
    await Promise.all([env.tempDir, ...freshProjects].map(cleanupTempDir));
  });

  describe("while the marketplace answers its version check", () => {
    it(
      "init --from installs from the saved copy the marketplace vouched for",
      { timeout: TIMEOUTS.INSTALL },
      async () => {
        const project = await freshProject();
        const asked = server.requests.length;

        const { exitCode, output } = await runInitFrom(store, INSTALL_ID, project, server.url);

        expect(
          server.requests.slice(asked),
          "the saved copy was checked with the marketplace",
        ).toContain(ANSWERED);
        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(await readConfigSkillIds(project.dir)).toContain(E2E_SKILL.react.id);
      },
    );

    it(
      "edit --from applies from the saved copy the marketplace vouched for, once approved",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        const project = await freshProject();
        const install = await runInitFrom(store, INSTALL_ID, project, server.url);
        expect(install.exitCode, `install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);
        const asked = server.requests.length;

        const { exitCode, output } = await applyEditFrom(store, EDIT_ID, project);

        expect(
          server.requests.slice(asked),
          "the saved copy was checked with the marketplace",
        ).toContain(ANSWERED);
        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(
          await readConfigSkillIds(project.dir),
          "an approved edit records the skill it adds",
        ).toContain(ADDED.id);
      },
    );
  });

  describe.each(REFUSALS)(
    "once the marketplace answers its version check $status",
    ({ status, refusal }) => {
      beforeAll(() => {
        server.refuse(status);
      });

      it(
        "init --from stops with an error naming the refusal, and writes nothing",
        { timeout: TIMEOUTS.INSTALL },
        async () => {
          await expectInitStopped({ status, refusal }, snapshotEverything);
        },
      );

      it(
        "edit --from stops with an error before it asks, and writes nothing",
        { timeout: TIMEOUTS.INTERACTIVE },
        async () => {
          const config = await loadConfigOrFail(installed.dir);
          const before = await snapshotEverything(installed);
          const asked = server.requests.length;

          prompt = launchEdit(installed, EDIT_ID);
          // The question or the exit: waiting on the exit alone would time out naming nothing.
          await prompt.waitForTextOrExit(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);

          // First, because it is the defect: a yes installs from a copy the marketplace refused.
          expect(
            prompt.getRawOutput(),
            "a refused version check must stop edit before it asks to apply anything",
          ).not.toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
          expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.ERROR);
          expect(
            server.requests.slice(asked),
            "subject guard: the version check was refused",
          ).toContain(`HEAD ${status}`);
          expect(flattenCliOutput(prompt.getRawOutput())).toContain(`${refusal} ${server.url}`);
          expect(
            await loadConfigOrFail(installed.dir),
            "a stopped edit leaves the config as it was",
          ).toStrictEqual(config);
          expect(
            await snapshotEverything(installed),
            "a stopped edit leaves the installation, the saved copy and HOME as it found them",
          ).toStrictEqual(before);
        },
      );

      it(
        "compile keeps compiling from the saved copy, and says nothing of the refusal",
        { timeout: TIMEOUTS.INSTALL },
        async () => {
          const savedCopies = await snapshotSavedCopies();
          const asked = server.requests.length;

          const { exitCode, output } = await CLI.run(["compile"], installed);

          expect(
            server.requests.slice(asked),
            "subject guard: the version check was refused",
          ).toContain(`HEAD ${status}`);
          expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
          expect(output, "compile read the saved copy's catalogue").toContain(
            STEP_TEXT.CONFIG_TYPES_REFRESHED,
          );
          const said = flattenCliOutput(output);
          expect(said, "a refusal stops init --from and edit --from, not compile").not.toContain(
            `${refusal} ${server.url}`,
          );
          expect(said, "compile says nothing of the saved copy standing in").not.toContain(
            STEP_TEXT.SOURCE_UNREACHABLE_CACHED,
          );
          expect(
            await snapshotSavedCopies(),
            "compile keeps the saved copy and its record",
          ).toStrictEqual(savedCopies);
        },
      );
    },
  );

  describe.each(KEPT_OVER)(
    "once the marketplace answers its version check %i, which keeps the saved copy",
    (status) => {
      beforeAll(() => {
        server.refuse(status);
      });

      it(
        "init --from installs from the saved copy and says the marketplace refused",
        { timeout: TIMEOUTS.INSTALL },
        async () => {
          const project = await freshProject();
          const savedCopies = await snapshotSavedCopies();
          const asked = server.requests.length;

          const { exitCode, output } = await runInitFrom(store, INSTALL_ID, project, server.url);

          expect(
            server.requests.slice(asked),
            "subject guard: the version check was refused",
          ).toContain(`HEAD ${status}`);
          expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
          expect(
            flattenCliOutput(output),
            "a saved copy standing in for a refusing marketplace is said",
          ).toContain(refusedWarning(status));
          expect(await readConfigSkillIds(project.dir)).toContain(E2E_SKILL.react.id);
          expect(
            await snapshotSavedCopies(),
            "init keeps the saved copy and its record",
          ).toStrictEqual(savedCopies);
        },
      );

      it(
        "edit --from applies from the saved copy once approved, and says the marketplace refused",
        { timeout: TIMEOUTS.INTERACTIVE },
        async () => {
          const project = await freshProject();
          const install = await runInitFrom(store, INSTALL_ID, project, server.url);
          expect(install.exitCode, `install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);
          const savedCopies = await snapshotSavedCopies();
          const asked = server.requests.length;

          prompt = launchEdit(project, EDIT_ID);
          await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);

          expect(
            server.requests.slice(asked),
            "subject guard: the version check was refused",
          ).toContain(`HEAD ${status}`);
          expect(
            flattenCliOutput(prompt.getRawOutput()),
            "a saved copy standing in for a refusing marketplace is said before the question",
          ).toContain(refusedWarning(status));
          await prompt.confirm();
          expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.SUCCESS);
          expect(
            await readConfigSkillIds(project.dir),
            "an approved edit records the skill it adds",
          ).toContain(ADDED.id);
          expect(
            await snapshotSavedCopies(),
            "edit keeps the saved copy and its record",
          ).toStrictEqual(savedCopies);
        },
      );
    },
  );

  /**
   * With the CLI's copy gone, giget extracts the tarball it saved when its own download is refused,
   * and only the version check that follows shows the refusal. The cache is not compared here: that
   * extraction lands in it before the version check is asked.
   */
  describe.each(REFUSALS)(
    "once the marketplace answers $status and only giget's saved tarball is left",
    ({ status, refusal }) => {
      beforeAll(() => {
        server.refuse(status);
      });

      it(
        "init --from stops with an error naming the refusal, and writes nothing",
        { timeout: TIMEOUTS.INSTALL },
        async () => {
          await rm(path.join(env.fakeHome, DIRS.SOURCE_CACHE), { recursive: true, force: true });
          await expectInitStopped({ status, refusal }, snapshotInstallations);
        },
      );
    },
  );

  describe.each(KEPT_OVER)(
    "once the marketplace answers %i and only giget's saved tarball is left",
    (status) => {
      beforeAll(() => {
        server.refuse(status);
      });

      it(
        "init --from installs from giget's saved tarball and says the marketplace refused",
        { timeout: TIMEOUTS.INSTALL },
        async () => {
          await rm(path.join(env.fakeHome, DIRS.SOURCE_CACHE), { recursive: true, force: true });
          const project = await freshProject();
          const asked = server.requests.length;

          const { exitCode, output } = await runInitFrom(store, INSTALL_ID, project, server.url);

          expect(
            server.requests.slice(asked),
            "subject guard: the version check was refused",
          ).toContain(`HEAD ${status}`);
          expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
          expect(
            flattenCliOutput(output),
            "giget's saved tarball standing in for a refusing marketplace is said",
          ).toContain(refusedWarning(status));
          expect(await readConfigSkillIds(project.dir)).toContain(E2E_SKILL.react.id);
        },
      );
    },
  );

  describe("once the marketplace answers its version check again", () => {
    beforeAll(async () => {
      await server.publish(E2E_SOURCE.sourceDir);
    });

    it("init --from installs again", { timeout: TIMEOUTS.INSTALL }, async () => {
      const project = await freshProject();
      const asked = server.requests.length;

      const { exitCode, output } = await runInitFrom(store, INSTALL_ID, project, server.url);

      expect(server.requests.slice(asked), "the marketplace was asked again").toContain(ANSWERED);
      expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
      expect(await readConfigSkillIds(project.dir)).toContain(E2E_SKILL.react.id);
    });
  });

  /** No answer at all is not a refusal: the saved copy stands in with a warning, as the docs say. */
  describe("once the marketplace cannot be reached at all", () => {
    beforeAll(async () => {
      await server.close();
    });

    it(
      "init --from installs from the saved copy and says it may be out of date",
      { timeout: TIMEOUTS.INSTALL },
      async () => {
        const project = await freshProject();

        const { exitCode, output } = await runInitFrom(store, INSTALL_ID, project, server.url);

        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(output).toContain(STEP_TEXT.SOURCE_UNREACHABLE_CACHED);
        expect(await readConfigSkillIds(project.dir)).toContain(E2E_SKILL.react.id);
      },
    );
  });
});
