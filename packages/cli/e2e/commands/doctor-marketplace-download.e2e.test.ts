import path from "path";
import { existsSync, statSync } from "fs";
import { rm } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { E2E_SKILL, E2E_SKILL_IDS } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  startTarballSourceServer,
  type TarballSourceServer,
} from "../helpers/tarball-source-server.js";
import {
  cleanupTempDir,
  createTempDir,
  pollUntil,
  readInstallTree,
  writeAgentFile,
  writeProjectConfig,
  type InstallTree,
  matchedAsWritten,
} from "../helpers/test-utils.js";
import { DIRS, doctorRow, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { sanitizeSourceForCache } from "../../src/cli/lib/loading/source-fetcher.js";
import { SKILLS_DIR_PATH } from "../../src/cli/consts.js";

/**
 * Doctor downloads each marketplace on every run, and counts only what that download brought. giget
 * answers a download it did not make with the tarball it saved on an earlier run, and says nothing:
 * when its download fails, and when the marketplace answers with the ETag that tarball was saved
 * under.
 */

const UNAVAILABLE = 503;

const DOWNLOAD_REFUSED = `GET ${UNAVAILABLE}`;

const PUBLISHED_COUNT_LINE = ` ${E2E_SKILL_IDS.length} ${STEP_TEXT.DOCTOR_SKILLS_AVAILABLE}\n`;

const WITHDRAWN_COUNT_LINE = ` ${E2E_SKILL_IDS.length - 1} ${STEP_TEXT.DOCTOR_SKILLS_AVAILABLE}\n`;

/** The marketplace row is the last: the blank line and the summary follow it. */
const AFTER_THE_LAST_ROW = `\n\n {2}${matchedAsWritten(STEP_TEXT.DOCTOR_SUMMARY)}`;

const SAVED_COPY_SAID_REPLACED = new RegExp(
  `\n {2,}${matchedAsWritten(STEP_TEXT.DOCTOR_SAVED_COPY_REPLACED)}${AFTER_THE_LAST_ROW}`,
);

/** The count, then the one line saying how the marketplace was reached, and the row ends. */
const NOTHING_SAID_PAST_HOW_IT_WAS_REACHED = new RegExp(
  `${matchedAsWritten(PUBLISHED_COUNT_LINE)} {2,}[^\n]+${AFTER_THE_LAST_ROW}`,
);

const SKILLS_SKIPPED = doctorRow(
  STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED,
  STEP_TEXT.DOCTOR_STATUS_SKIP,
  `${STEP_TEXT.DOCTOR_SKILLS_SKIPPED_UNREACHABLE}\n`,
);

const CONNECTED_TO_REMOTE = doctorRow(
  STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE,
  STEP_TEXT.DOCTOR_STATUS_PASS,
  STEP_TEXT.DOCTOR_SOURCE_REMOTE,
);

/** giget saves this branch's tarball a folder deeper than any other: `feature/x.tar.gz`. */
const SLASHED_BRANCH = "github:org/repo#feature/x";

/** How a project names the marketplace the server serves, and what sends giget's download there. */
type Naming = {
  naming: string;
  marketplaceOn: (server: TarballSourceServer) => string;
  envFor: (server: TarballSourceServer) => Record<string, string>;
};

const NAMINGS: Naming[] = [
  { naming: "by its URL", marketplaceOn: (server) => server.url, envFor: () => ({}) },
  {
    naming: "on GitHub by a branch whose name holds a slash",
    marketplaceOn: () => SLASHED_BRANCH,
    envFor: (server) => ({ GIGET_GITHUB_URL: new URL(server.url).origin }),
  },
];

async function projectOn(marketplace: string): Promise<string> {
  const projectDir = await createTempDir();
  await writeProjectConfig(
    projectDir,
    buildProjectConfig({
      name: "marketplace-download",
      skills: [],
      agents: buildAgentConfigs(["web-developer"]),
      marketplace,
    }),
  );
  await writeAgentFile(projectDir, "web-developer", { frontmatter: true });
  return projectDir;
}

/** HOME is the project directory, so the CLI's saved copies and their records are under it. */
function savedCopies(projectDir: string): Promise<InstallTree> {
  return readInstallTree(path.join(projectDir, DIRS.SOURCE_CACHE));
}

function gigetTarballs(projectDir: string): Promise<InstallTree> {
  return readInstallTree(path.join(projectDir, DIRS.GIGET_CACHE));
}

describe("a marketplace doctor downloads on every run", () => {
  let published: E2ESource;
  let server: TarballSourceServer;
  let projectDir: string;
  let firstRun: CLIResult;
  let copiesAfterFirstRun: InstallTree;
  let overDamagedCopy: CLIResult;
  let copiesAfterDamagedRun: InstallTree;
  let failedDownload: CLIResult;
  let failedDownloadRequests: string[];
  let copiesBefore: InstallTree;
  let copiesAfter: InstallTree;
  let tarballsBefore: InstallTree;
  let tarballsAfter: InstallTree;
  let lastRun: CLIResult;

  beforeAll(async () => {
    published = await createE2ESource();
    server = await startTarballSourceServer(published.sourceDir);
    projectDir = await projectOn(server.url);

    firstRun = await CLI.run(["doctor"], { dir: projectDir });
    copiesAfterFirstRun = await savedCopies(projectDir);

    await rm(
      path.join(
        projectDir,
        DIRS.SOURCE_CACHE_COPIES,
        sanitizeSourceForCache(server.url),
        SKILLS_DIR_PATH,
        E2E_SKILL.vitest.id,
      ),
      { recursive: true },
    );
    overDamagedCopy = await CLI.run(["doctor"], { dir: projectDir });
    copiesAfterDamagedRun = await savedCopies(projectDir);

    // The ETag never moves. Doctor asks, giget extracts the tarball it saved, doctor asks again
    // and sets that tarball aside, so the third GET is the download.
    server.failOnce("GET", UNAVAILABLE, 2);
    copiesBefore = await savedCopies(projectDir);
    tarballsBefore = await gigetTarballs(projectDir);
    const before = server.requests.length;
    failedDownload = await CLI.run(["doctor"], { dir: projectDir });
    failedDownloadRequests = server.requests.slice(before);
    copiesAfter = await savedCopies(projectDir);
    tarballsAfter = await gigetTarballs(projectDir);

    lastRun = await CLI.run(["doctor"], { dir: projectDir });
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await server.close();
    await cleanupTempDir(projectDir);
    await cleanupTempDir(published.tempDir);
  });

  it("counts what the marketplace serves on an ordinary run", () => {
    for (const run of [firstRun, lastRun]) {
      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
      expect(run.stdout).toMatch(CONNECTED_TO_REMOTE);
      expect(run.stdout).toContain(PUBLISHED_COUNT_LINE);
    }
  });

  it("says nothing of a saved copy where there was none", () => {
    expect(firstRun.stdout).toMatch(NOTHING_SAID_PAST_HOW_IT_WAS_REACHED);
    expect(firstRun.stdout).not.toContain(STEP_TEXT.DOCTOR_SAVED_COPY_REPLACED);
  });

  it("says nothing of a saved copy that matched the download", () => {
    expect(lastRun.stdout).toMatch(NOTHING_SAID_PAST_HOW_IT_WAS_REACHED);
    expect(lastRun.stdout).not.toContain(STEP_TEXT.DOCTOR_SAVED_COPY_REPLACED);
  });

  it("counts the download, not a saved copy damaged on disk", () => {
    expect(overDamagedCopy.exitCode, overDamagedCopy.output).toBe(EXIT_CODES.SUCCESS);
    expect(overDamagedCopy.stdout).toMatch(CONNECTED_TO_REMOTE);
    expect(overDamagedCopy.stdout).toContain(PUBLISHED_COUNT_LINE);
    expect(overDamagedCopy.stdout, "the damaged copy is not counted").not.toContain(
      WITHDRAWN_COUNT_LINE,
    );
  });

  it("says, as the marketplace row's last line, that the damaged copy differed and was replaced", () => {
    expect(overDamagedCopy.stdout).toMatch(SAVED_COPY_SAID_REPLACED);
  });

  it("replaces the damaged copy with what it downloaded", () => {
    expect(copiesAfterDamagedRun).toStrictEqual(copiesAfterFirstRun);
  });

  it("fails the marketplace row when the download fails though the marketplace answered", () => {
    expect(failedDownloadRequests[0], "the marketplace answered doctor's question").toBe("GET 200");
    expect(failedDownloadRequests, "the download was the request refused").toContain(
      DOWNLOAD_REFUSED,
    );
    expect(failedDownload.exitCode, failedDownload.output).toBe(EXIT_CODES.ERROR);
    expect(failedDownload.stdout).toMatch(
      doctorRow(
        STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE,
        STEP_TEXT.DOCTOR_STATUS_FAIL,
        `${STEP_TEXT.DOCTOR_MARKETPLACE_LOAD_FAILED}\n`,
      ),
    );
    expect(failedDownload.stdout).toMatch(SKILLS_SKIPPED);
    expect(failedDownload.stdout, "no saved copy is counted").not.toContain(PUBLISHED_COUNT_LINE);
    expect(failedDownload.stdout, "a failed download replaced nothing").not.toContain(
      STEP_TEXT.DOCTOR_SAVED_COPY_REPLACED,
    );
  });

  it("leaves the saved copy, its record and giget's tarball as they were when the download fails", () => {
    expect(copiesAfter).toStrictEqual(copiesBefore);
    expect(tarballsAfter).toStrictEqual(tarballsBefore);
  });
});

/**
 * Ctrl+C while doctor downloads past the tarball giget saved: nothing after the key press runs, so
 * what is on disk at that moment, a tarball cut short, is all the next run finds.
 */
describe("a doctor run interrupted while it downloads the marketplace", () => {
  let published: E2ESource;
  let server: TarballSourceServer;
  let projectDir: string;
  let wholeTarballBytes: number;
  let copiesAfterFirstRun: InstallTree;
  let nextRun: CLIResult;
  let tarballBytesAfterNextRun: number;
  let copiesAfterNextRun: InstallTree;

  beforeAll(async () => {
    published = await createE2ESource();
    server = await startTarballSourceServer(published.sourceDir);
    projectDir = await projectOn(server.url);

    await CLI.run(["doctor"], { dir: projectDir });
    copiesAfterFirstRun = await savedCopies(projectDir);
    const saved = Object.keys((await gigetTarballs(projectDir)).files).find((file) =>
      file.endsWith(".tar.gz"),
    );
    if (saved === undefined) throw new Error("the first download saved no tarball");
    const tarball = path.join(projectDir, DIRS.GIGET_CACHE, saved);
    wholeTarballBytes = statSync(tarball).size;
    const downloadIsHalfway = () => {
      const bytes = existsSync(tarball) ? statSync(tarball).size : 0;
      return bytes > 0 && bytes < wholeTarballBytes;
    };

    // As in the failed download above, the third GET is the download past giget's saved tarball.
    server.stallOnce(2);
    const interrupted = new InteractivePrompt(["doctor"], projectDir, {
      env: { HOME: projectDir },
    });
    try {
      await pollUntil(
        downloadIsHalfway,
        TIMEOUTS.WIZARD_LOAD,
        () => new Error(`doctor never began the download:\n${interrupted.getOutput()}`),
      );
      await interrupted.ctrlC();
      await interrupted.waitForExit();
    } finally {
      await interrupted.destroy();
    }

    nextRun = await CLI.run(["doctor"], { dir: projectDir });
    tarballBytesAfterNextRun = statSync(tarball).size;
    copiesAfterNextRun = await savedCopies(projectDir);
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await server.close();
    await cleanupTempDir(projectDir);
    await cleanupTempDir(published.tempDir);
  });

  it("counts what the marketplace serves on the next run", () => {
    expect(nextRun.exitCode, nextRun.output).toBe(EXIT_CODES.SUCCESS);
    expect(nextRun.stdout).toMatch(CONNECTED_TO_REMOTE);
    expect(nextRun.stdout).toContain(PUBLISHED_COUNT_LINE);
  });

  it("leaves giget a whole tarball and the saved copy as a whole download left them", () => {
    expect(tarballBytesAfterNextRun, "giget's tarball is whole again").toBe(wholeTarballBytes);
    expect(copiesAfterNextRun).toStrictEqual(copiesAfterFirstRun);
  });
});

/**
 * The marketplace withdraws a skill between runs and the next download of it fails once, so the
 * tarball giget saved still carries the skill the marketplace no longer serves.
 */
describe("a marketplace whose download fails once after it withdrew a skill", () => {
  let published: E2ESource;
  let withdrawn: E2ESource;

  beforeAll(async () => {
    published = await createE2ESource();
    withdrawn = await createE2ESource({ withoutSkills: [E2E_SKILL.vitest.id] });
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    await cleanupTempDir(published.tempDir);
    await cleanupTempDir(withdrawn.tempDir);
  });

  describe.each(NAMINGS)("named $naming", ({ marketplaceOn, envFor }) => {
    describe("asked by doctor", () => {
      let server: TarballSourceServer;
      let projectDir: string;
      let failed: CLIResult;
      let failedRequests: string[];
      let copiesBefore: InstallTree;
      let copiesAfter: InstallTree;
      let reachedAgain: CLIResult;

      beforeAll(async () => {
        server = await startTarballSourceServer(published.sourceDir);
        projectDir = await projectOn(marketplaceOn(server));
        const env = envFor(server);
        await CLI.run(["doctor"], { dir: projectDir }, { env });

        await server.publish(withdrawn.sourceDir);
        // Doctor asks for the content before it downloads, so the second GET is the download.
        server.failOnce("GET", UNAVAILABLE, 1);
        copiesBefore = await savedCopies(projectDir);
        const before = server.requests.length;
        failed = await CLI.run(["doctor"], { dir: projectDir }, { env });
        failedRequests = server.requests.slice(before);
        copiesAfter = await savedCopies(projectDir);

        reachedAgain = await CLI.run(["doctor"], { dir: projectDir }, { env });
      }, TIMEOUTS.SETUP_DUAL);

      afterAll(async () => {
        await server.close();
        await cleanupTempDir(projectDir);
      });

      it("fails the marketplace row rather than count the copy giget saved", () => {
        expect(failedRequests, "the download was the request refused").toContain(DOWNLOAD_REFUSED);
        expect(failed.exitCode, failed.output).toBe(EXIT_CODES.ERROR);
        expect(failed.stdout).toMatch(
          doctorRow(
            STEP_TEXT.DOCTOR_ROW_SOURCE_REACHABLE,
            STEP_TEXT.DOCTOR_STATUS_FAIL,
            `Could not reach ${marketplaceOn(server)}\n`,
          ),
        );
        expect(failed.stdout).toContain(STEP_TEXT.DOCTOR_DOWNLOAD_FAILED_SAVED_COPY);
        expect(failed.stdout).toMatch(SKILLS_SKIPPED);
        expect(failed.stdout, "the copy giget saved is not counted").not.toContain(
          PUBLISHED_COUNT_LINE,
        );
        expect(failed.stdout, "a download that failed is not a connection").not.toContain(
          "Connected to remote",
        );
      });

      it("leaves the saved copy and its record as they were", () => {
        expect(copiesAfter, "a refused doctor run writes nothing").toStrictEqual(copiesBefore);
      });

      it("counts what the marketplace serves once its download succeeds", () => {
        expect(reachedAgain.exitCode, reachedAgain.output).toBe(EXIT_CODES.SUCCESS);
        expect(reachedAgain.stdout).toContain(WITHDRAWN_COUNT_LINE);
      });

      it("says the saved copy, holding the skill the marketplace withdrew, differed and was replaced", () => {
        expect(reachedAgain.stdout).toMatch(SAVED_COPY_SAID_REPLACED);
      });
    });
  });

  /**
   * Over the URL only: a load outside doctor discards a superseded copy of a git source together
   * with giget's tarball of it, so giget has nothing saved to fall back on there.
   */
  describe("met by a load outside doctor", () => {
    let server: TarballSourceServer;
    let projectDir: string;
    let searched: CLIResult;
    let searchedRequests: string[];
    let copiesBefore: InstallTree;
    let copiesAfter: InstallTree;
    let doctored: CLIResult;

    beforeAll(async () => {
      server = await startTarballSourceServer(published.sourceDir);
      projectDir = await projectOn(server.url);
      await CLI.run(["search", E2E_SKILL.vitest.slug], { dir: projectDir });

      await server.publish(withdrawn.sourceDir);
      // `search` asks with a HEAD, so the first GET is the download.
      server.failOnce("GET", UNAVAILABLE);
      copiesBefore = await savedCopies(projectDir);
      const before = server.requests.length;
      searched = await CLI.run(["search", E2E_SKILL.vitest.slug], { dir: projectDir });
      searchedRequests = server.requests.slice(before);
      copiesAfter = await savedCopies(projectDir);

      doctored = await CLI.run(["doctor"], { dir: projectDir });
    }, TIMEOUTS.SETUP_DUAL);

    afterAll(async () => {
      await server.close();
      await cleanupTempDir(projectDir);
    });

    it("still reads the copy giget saved, as every load outside doctor may", () => {
      expect(searchedRequests, "the download was the request refused").toContain(DOWNLOAD_REFUSED);
      expect(searched.exitCode, searched.output).toBe(EXIT_CODES.SUCCESS);
      expect(searched.output).toContain(E2E_SKILL.vitest.display);
    });

    it("records that copy under the ETag it was saved with, not the marketplace's new one", () => {
      expect(
        copiesAfter,
        "the copy and its record are what the earlier download left",
      ).toStrictEqual(copiesBefore);
    });

    it("so doctor afterwards counts what the marketplace serves", () => {
      expect(doctored.exitCode, doctored.output).toBe(EXIT_CODES.SUCCESS);
      expect(doctored.stdout).toContain(WITHDRAWN_COUNT_LINE);
      expect(doctored.stdout).not.toContain(PUBLISHED_COUNT_LINE);
    });
  });
});
