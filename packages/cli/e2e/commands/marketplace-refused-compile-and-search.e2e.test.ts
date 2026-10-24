import path from "path";
import { rm } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload } from "../fixtures/e2e-stack-seed.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
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
  flattenCliOutput,
  loadConfigOrFail,
  matchedAsWritten,
  readTreeSnapshot,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";

import type { ProjectHandle } from "../fixtures/project-handle.js";

/**
 * A command loading a marketplace outside `init --from`, `edit --from` and doctor keeps the copy
 * saved on disk when the marketplace refuses its version check. On a 5xx, or a 405 from a host
 * refusing the HEAD it is asked with, it says the marketplace refused, in the words those two
 * commands use; on any other 4xx it says nothing, as before (owner ruling 2026-10-24, CLI-962).
 * `compile` and `search` stand for every such command. Each load fetches the marketplace twice,
 * once for its skills and once for its manifest, so a warning said per fetch rather than per run
 * would be said twice.
 *
 * A served tarball, since a local marketplace is never saved, installed by `init --from` so the
 * marketplace the commands load is the one the installation recorded. One HOME holds the saved
 * copy throughout. The server's state moves forward describe by describe, and closing it is last.
 *
 * The "as it was" comparisons were mutation-checked on the fixture, not by a revert (a revert
 * writes nothing either): in the 403 rows, renaming config.ts's top-level `name` after `compile`
 * and adding a file to the saved copies after `search` reddened exactly those two comparisons, and
 * nothing before them. The silence rows read the same flattened output, for the same words, as
 * their 5xx twins.
 */

const INSTALL_ID = "RefusedOthers01";

const ANSWERED = "HEAD 200";

/** A server failing, or a host refusing the HEAD the check asks with: said. */
const SAID_OVER = [500, 503, 405, 501] as const;

/** A refusal `init --from` and `edit --from` stop on: passed over in silence. */
const UNSAID_OVER = [401, 403, 404, 410] as const;

/** Each command, and what it prints only once it has read the marketplace's catalogue. */
const COMMANDS = [
  { command: "compile", args: ["compile"], read: STEP_TEXT.CONFIG_TYPES_REFRESHED },
  { command: "search", args: ["search", E2E_SKILL.react.slug], read: E2E_SKILL.react.display },
] as const;

type Command = (typeof COMMANDS)[number];

describe("compile and search against a marketplace that refuses its version check", () => {
  let server: TarballSourceServer;
  let store: SeedConfigStore;
  let env: TestEnvironment;
  let installed: Required<ProjectHandle>;

  /** The saved copy and its fetch record, which a load keeping the copy leaves as it found them. */
  function snapshotSavedCopies(): Promise<unknown> {
    return readTreeSnapshot(path.join(env.fakeHome, DIRS.SOURCE_CACHE_COPIES));
  }

  /** Who refused and with what, then that the saved copy stood in, as the unreachable warning says. */
  function refusedWarning(status: number): string {
    return `${server.url} ${STEP_TEXT.MARKETPLACE_REFUSED_CACHED} (${status}) — ${STEP_TEXT.SOURCE_UNREACHABLE_CACHED}`;
  }

  /** `text`, and `text` again after it. */
  function twice(text: string): RegExp {
    return new RegExp(`${matchedAsWritten(text)}[\\s\\S]*${matchedAsWritten(text)}`);
  }

  /** Runs `command` over the installation, with the requests it made and its output flattened. */
  async function run({ args }: Command): Promise<{
    exitCode: number;
    output: string;
    said: string;
    requests: string[];
  }> {
    const asked = server.requests.length;
    const { exitCode, output } = await CLI.run([...args], installed);
    return {
      exitCode,
      output,
      said: flattenCliOutput(output),
      requests: server.requests.slice(asked),
    };
  }

  beforeAll(async () => {
    server = await startTarballSourceServer(E2E_SOURCE.sourceDir);
    store = await startSeedConfigStore();
    store.publish(INSTALL_ID, e2eStackPayload({ scope: "project" }));
    env = await createTestEnvironment();
    installed = { dir: env.projectDir, globalHome: env.fakeHome };

    // Downloads the marketplace, so its copy and the ETag it answered with are saved under HOME.
    const result = await runInitFrom(store, INSTALL_ID, installed, server.url);
    expect(result.exitCode, `install failed: ${result.output}`).toBe(EXIT_CODES.SUCCESS);
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await server.close();
    await store.close();
    await cleanupTempDir(env.tempDir);
  });

  describe("while the marketplace answers its version check", () => {
    it.each(COMMANDS)(
      "$command reads the saved copy the marketplace vouched for, and says nothing of it",
      { timeout: TIMEOUTS.INSTALL },
      async (command) => {
        const { exitCode, output, said, requests } = await run(command);

        expect(requests, "the saved copy was checked with the marketplace").toContain(ANSWERED);
        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(output, "the command read the saved copy's catalogue").toContain(command.read);
        expect(said).not.toContain(STEP_TEXT.MARKETPLACE_REFUSED_CACHED);
        expect(said).not.toContain(STEP_TEXT.SOURCE_UNREACHABLE_CACHED);
      },
    );
  });

  describe.each(SAID_OVER)("once the marketplace answers its version check %i", (status) => {
    beforeAll(() => {
      server.refuse(status);
    });

    it.each(COMMANDS)(
      "$command keeps reading the saved copy, and says once that the marketplace refused",
      { timeout: TIMEOUTS.INSTALL },
      async (command) => {
        const config = await loadConfigOrFail(installed.dir);
        const savedCopies = await snapshotSavedCopies();

        const { exitCode, output, said, requests } = await run(command);

        expect(requests, "subject guard: the version check was refused").toContain(
          `HEAD ${status}`,
        );
        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(output, "the command read the saved copy's catalogue").toContain(command.read);
        expect(said, "a saved copy standing in for a refusing marketplace is said").toContain(
          refusedWarning(status),
        );
        expect(said, "one refusal is said once, however many times the run loads it").not.toMatch(
          twice(refusedWarning(status)),
        );
        expect(await loadConfigOrFail(installed.dir), "the config is as it was").toStrictEqual(
          config,
        );
        expect(
          await snapshotSavedCopies(),
          "the command keeps the saved copy and its record",
        ).toStrictEqual(savedCopies);
      },
    );
  });

  describe.each(UNSAID_OVER)("once the marketplace answers its version check %i", (status) => {
    beforeAll(() => {
      server.refuse(status);
    });

    it.each(COMMANDS)(
      "$command keeps reading the saved copy, and says nothing of the refusal",
      { timeout: TIMEOUTS.INSTALL },
      async (command) => {
        const config = await loadConfigOrFail(installed.dir);
        const savedCopies = await snapshotSavedCopies();

        const { exitCode, output, said, requests } = await run(command);

        expect(requests, "subject guard: the version check was refused").toContain(
          `HEAD ${status}`,
        );
        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(output, "the command read the saved copy's catalogue").toContain(command.read);
        expect(said, "a refusal short of a server's failure is not said").not.toContain(
          STEP_TEXT.MARKETPLACE_REFUSED_CACHED,
        );
        expect(said, "nor is the saved copy standing in for it").not.toContain(
          STEP_TEXT.SOURCE_UNREACHABLE_CACHED,
        );
        expect(await loadConfigOrFail(installed.dir), "the config is as it was").toStrictEqual(
          config,
        );
        expect(
          await snapshotSavedCopies(),
          "the command keeps the saved copy and its record",
        ).toStrictEqual(savedCopies);
      },
    );
  });

  /**
   * With the CLI's copy gone, giget extracts the tarball it saved when its own download is refused,
   * and says nothing. The saved copies are not compared here: that extraction lands in them.
   */
  describe.each(SAID_OVER)(
    "once the marketplace answers %i and only giget's saved tarball is left",
    (status) => {
      beforeAll(() => {
        server.refuse(status);
      });

      it.each(COMMANDS)(
        "$command reads giget's saved tarball, and says once that the marketplace refused",
        { timeout: TIMEOUTS.INSTALL },
        async (command) => {
          await rm(path.join(env.fakeHome, DIRS.SOURCE_CACHE), { recursive: true, force: true });
          const config = await loadConfigOrFail(installed.dir);

          const { exitCode, output, said, requests } = await run(command);

          expect(requests, "subject guard: giget's download was refused").toContain(
            `GET ${status}`,
          );
          expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
          expect(output, "the command read the tarball's catalogue").toContain(command.read);
          expect(
            said,
            "giget's saved tarball standing in for a refusing marketplace is said",
          ).toContain(refusedWarning(status));
          expect(said, "one refusal is said once, however many times the run loads it").not.toMatch(
            twice(refusedWarning(status)),
          );
          expect(await loadConfigOrFail(installed.dir), "the config is as it was").toStrictEqual(
            config,
          );
        },
      );
    },
  );

  describe.each(UNSAID_OVER)(
    "once the marketplace answers %i and only giget's saved tarball is left",
    (status) => {
      beforeAll(() => {
        server.refuse(status);
      });

      it.each(COMMANDS)(
        "$command reads giget's saved tarball, and says nothing of the refusal",
        { timeout: TIMEOUTS.INSTALL },
        async (command) => {
          await rm(path.join(env.fakeHome, DIRS.SOURCE_CACHE), { recursive: true, force: true });
          const config = await loadConfigOrFail(installed.dir);

          const { exitCode, output, said, requests } = await run(command);

          expect(requests, "subject guard: giget's download was refused").toContain(
            `GET ${status}`,
          );
          expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
          expect(output, "the command read the tarball's catalogue").toContain(command.read);
          expect(said, "a refusal short of a server's failure is not said").not.toContain(
            STEP_TEXT.MARKETPLACE_REFUSED_CACHED,
          );
          expect(await loadConfigOrFail(installed.dir), "the config is as it was").toStrictEqual(
            config,
          );
        },
      );
    },
  );

  describe("once the marketplace answers its version check again", () => {
    beforeAll(async () => {
      await server.publish(E2E_SOURCE.sourceDir);
    });

    it.each(COMMANDS)(
      "$command reads the marketplace again, and says nothing of a refusal",
      { timeout: TIMEOUTS.INSTALL },
      async (command) => {
        const { exitCode, output, said, requests } = await run(command);

        expect(requests, "the marketplace was asked again").toContain(ANSWERED);
        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(output, "the command read the marketplace's catalogue").toContain(command.read);
        expect(said).not.toContain(STEP_TEXT.MARKETPLACE_REFUSED_CACHED);
        expect(said).not.toContain(STEP_TEXT.SOURCE_UNREACHABLE_CACHED);
      },
    );
  });

  /** No answer at all is not a refusal: the saved copy stands in with the warning it always had. */
  describe("once the marketplace cannot be reached at all", () => {
    beforeAll(async () => {
      await server.close();
    });

    it.each(COMMANDS)(
      "$command reads the saved copy, and says it may be out of date rather than refused",
      { timeout: TIMEOUTS.INSTALL },
      async (command) => {
        const { exitCode, output, said } = await run(command);

        expect(exitCode, output).toBe(EXIT_CODES.SUCCESS);
        expect(output, "the command read the saved copy's catalogue").toContain(command.read);
        expect(said).toContain(STEP_TEXT.SOURCE_UNREACHABLE_CACHED);
        expect(said, "an unanswered check is no refusal").not.toContain(
          STEP_TEXT.MARKETPLACE_REFUSED_CACHED,
        );
      },
    );
  });
});
