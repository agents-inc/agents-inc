import path from "path";
import { rm } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
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
  createTempDir,
  directoryExists,
  fileExists,
  flattenCliOutput,
  loadConfigOrFail,
  matchedAsWritten,
  readInstallTree,
  readTreeSnapshot,
  writeProjectConfig,
  type InstallTree,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  fetchRecordPath,
  sanitizeSourceForCache,
} from "../../src/cli/lib/loading/source-fetcher.js";

import type { ProjectConfig } from "../../src/cli/types/index.js";
import type { ProjectHandle } from "../fixtures/project-handle.js";

/**
 * A command that cannot reach its marketplace reads what is saved on disk and says so, in the
 * same words whichever saved copy stands in: the CLI's own, or, once that is gone, the tarball
 * giget saved beside it, which giget extracts in silence when its own download fails. The docs
 * promise it for every load: "when it can't reach the remote uses the cache and warns"
 * (`recipes/compile-in-ci.md`; CLI-966). `compile` stands for every load but doctor's: `init
 * --from` and `edit --from` take the same branch of the fetcher, and its unit rows hold both.
 *
 * A served tarball, since a local marketplace is never saved, installed by `init --from` so the
 * marketplace compile loads is the one the installation recorded; the server is then closed for
 * good. Compile fetches the marketplace twice, once for its skills and once for its manifest, so a
 * warning said per fetch rather than per run would be said twice.
 *
 * Nothing answers, so no request log can prove which path ran. The proof is the catalogue read:
 * with the CLI's copy gone and the marketplace closed, only giget's tarball can supply it.
 *
 * The "as it was" comparisons were mutation-checked on the fixture, not by a revert (a revert
 * writes nothing either): in the saved-copy row, a byte appended to giget's tarball, or config.ts's
 * top-level `name` renamed, after the snapshots reddened exactly that comparison and nothing
 * before it.
 */

const INSTALL_ID = "UnreachGiget01";

/** Saved on disk under HOME, as `cacheRoot()` and giget's `cacheDirectory()` place them. */
type SavedOnDisk = Record<string, TreeSnapshotEntry>;

const STAND_INS = [
  { standIn: "its own saved copy", removesTheCliCopy: false },
  { standIn: "only giget's tarball", removesTheCliCopy: true },
] as const;

describe("compile against a marketplace it cannot reach", () => {
  let server: TarballSourceServer;
  let store: SeedConfigStore;
  let env: TestEnvironment;
  let installed: Required<ProjectHandle>;

  /** Who could not be reached, then that a saved copy stood in, as the warning says it. */
  function unreachableWarning(): string {
    return `Could not reach ${server.url} — ${STEP_TEXT.SOURCE_UNREACHABLE_CACHED}`;
  }

  beforeAll(async () => {
    server = await startTarballSourceServer(E2E_SOURCE.sourceDir);
    store = await startSeedConfigStore();
    store.publish(INSTALL_ID, e2eStackPayload({ scope: "project" }));
    env = await createTestEnvironment();
    installed = { dir: env.projectDir, globalHome: env.fakeHome };

    // Downloads the marketplace, so the CLI's copy and giget's tarball are both saved under HOME.
    const result = await runInitFrom(store, INSTALL_ID, installed, server.url);
    expect(result.exitCode, `install failed: ${result.output}`).toBe(EXIT_CODES.SUCCESS);
    await server.close();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(env.tempDir);
  });

  describe.each(STAND_INS)("with $standIn on disk", ({ removesTheCliCopy }) => {
    let cliCopyOnDisk: boolean;
    let gigetTarballBefore: SavedOnDisk;
    let configBefore: ProjectConfig;
    let result: CLIResult;

    beforeAll(async () => {
      if (removesTheCliCopy) {
        await rm(path.join(env.fakeHome, DIRS.SOURCE_CACHE), { recursive: true, force: true });
      }
      cliCopyOnDisk = await directoryExists(path.join(env.fakeHome, DIRS.SOURCE_CACHE_COPIES));
      gigetTarballBefore = await readTreeSnapshot(path.join(env.fakeHome, DIRS.GIGET_CACHE));
      configBefore = await loadConfigOrFail(installed.dir);

      result = await CLI.run(["compile"], installed);
    }, TIMEOUTS.INSTALL);

    it("reads it, and says once that the marketplace could not be reached", async () => {
      const said = flattenCliOutput(result.output);
      const warning = unreachableWarning();

      expect(cliCopyOnDisk, "subject guard: which saved copy is there to stand in").toBe(
        !removesTheCliCopy,
      );
      expect(gigetTarballBefore, "subject guard: giget's tarball is on disk").not.toStrictEqual({});
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(result.output, "compile read the saved catalogue").toContain(
        STEP_TEXT.CONFIG_TYPES_REFRESHED,
      );
      expect(said, "an unanswered check is no refusal").not.toContain(
        STEP_TEXT.MARKETPLACE_REFUSED_CACHED,
      );
      expect(await loadConfigOrFail(installed.dir), "the config is as it was").toStrictEqual(
        configBefore,
      );
      expect(
        await readTreeSnapshot(path.join(env.fakeHome, DIRS.GIGET_CACHE)),
        "giget's tarball is left as it was: nothing was fetched over it",
      ).toStrictEqual(gigetTarballBefore);
      expect(said, "a saved copy standing in for a marketplace nobody could ask is said").toContain(
        warning,
      );
      expect(said, "said once, however many times the run loads the marketplace").not.toMatch(
        new RegExp(`${matchedAsWritten(warning)}[\\s\\S]*${matchedAsWritten(warning)}`),
      );
    });
  });
});

/** How a project names the marketplace the server serves, and what sends giget's download there. */
type Naming = {
  naming: string;
  marketplaceOn: (server: TarballSourceServer) => string;
  envFor: (server: TarballSourceServer) => Record<string, string>;
};

const NAMINGS: Naming[] = [
  { naming: "by its URL", marketplaceOn: (server) => server.url, envFor: () => ({}) },
  {
    naming: "on GitHub",
    marketplaceOn: () => "github:org/repo",
    envFor: (server) => ({ GIGET_GITHUB_URL: new URL(server.url).origin }),
  },
];

/**
 * The saved copy lost the record beside it and the marketplace is closed for good: the next load
 * reads what the earlier download left, for a git source as for a URL, and says the marketplace
 * could not be reached. `search` stands for the load here, since what it lists is what the
 * catalogue it read holds.
 */
describe.each(NAMINGS)(
  "a load over a saved copy that lost its record, against a marketplace named $naming it cannot reach",
  ({ marketplaceOn, envFor }) => {
    let server: TarballSourceServer;
    let projectDir: string;
    let copyDir: string;
    let recordOnDisk: boolean;
    let copyBefore: InstallTree;
    let configBefore: ProjectConfig;
    let result: CLIResult;

    beforeAll(async () => {
      server = await startTarballSourceServer(E2E_SOURCE.sourceDir);
      projectDir = await createTempDir();
      await writeProjectConfig(projectDir, {
        name: "lost-record-fixture",
        marketplace: marketplaceOn(server),
      });
      const env = envFor(server);
      const search = () => CLI.run(["search", E2E_SKILL.vitest.slug], { dir: projectDir }, { env });

      const online = await search();
      expect(online.exitCode, `the download failed: ${online.output}`).toBe(EXIT_CODES.SUCCESS);

      // HOME is the project directory, so the saved copy is under it.
      copyDir = path.join(
        projectDir,
        DIRS.SOURCE_CACHE_COPIES,
        sanitizeSourceForCache(marketplaceOn(server)),
      );
      await rm(fetchRecordPath(copyDir));
      await server.close();

      recordOnDisk = await fileExists(fetchRecordPath(copyDir));
      copyBefore = await readInstallTree(copyDir);
      configBefore = await loadConfigOrFail(projectDir);
      result = await search();
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await server.close();
      await cleanupTempDir(projectDir);
    });

    it("reads it, and says once that the marketplace could not be reached", async () => {
      const said = flattenCliOutput(result.output);
      const warning = `Could not reach ${marketplaceOn(server)} — ${STEP_TEXT.SOURCE_UNREACHABLE_CACHED}`;

      expect(recordOnDisk, "subject guard: the copy lost its record").toBe(false);
      expect(copyBefore.files, "subject guard: the copy is on disk").not.toStrictEqual({});
      expect(result.exitCode, result.output).toBe(EXIT_CODES.SUCCESS);
      expect(result.output, "the saved catalogue was read").toContain(E2E_SKILL.vitest.display);
      expect(said, "a saved copy standing in for a marketplace nobody could ask is said").toContain(
        warning,
      );
      expect(said, "said once, however many times the run loads the marketplace").not.toMatch(
        new RegExp(`${matchedAsWritten(warning)}[\\s\\S]*${matchedAsWritten(warning)}`),
      );
      expect(said, "an unanswered check is no refusal").not.toContain(
        STEP_TEXT.MARKETPLACE_REFUSED_CACHED,
      );
      expect(await loadConfigOrFail(projectDir), "the config is as it was").toStrictEqual(
        configBefore,
      );
      expect(
        await readInstallTree(copyDir),
        "the copy holds what the earlier download left",
      ).toStrictEqual(copyBefore);
    });
  },
);
