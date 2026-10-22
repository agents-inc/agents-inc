import path from "path";
import { mkdir } from "fs/promises";

import { CONFIGS_URL, DEAD_LINK_ID } from "@workspace/api-mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import { buildSkillConfig } from "../helpers/index.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { sa } from "../factories/skill-factories.js";
import { EJECT_SOURCE } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import { STATUS_MESSAGES } from "../../../utils/messages";
import type { ProjectConfig } from "../../../types";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { standAtTerminal } from "../helpers/terminal-input.js";

/**
 * `edit --from` deletes what the payload omits, so it must confirm; with no terminal it refuses
 * before the fetch and the catalogue load. The keystroke-driven confirm lives in the PTY suite.
 */

const WEB_DEV = "web-developer";
const REACT_ID = "web-framework-react";
const REACT_CATEGORY = "web-framework";

const { default: Edit } = await import("../../../commands/edit.js");

function runEdit(argv: string[]): Promise<(Error & { oclif?: { exit?: number } }) | undefined> {
  return Edit.run(argv, { root: CLI_ROOT }).then(
    () => undefined,
    (error: Error & { oclif?: { exit?: number } }) => error,
  );
}

describe("edit --from", () => {
  let tempDir: string;
  let projectDir: string;
  let originalCwd: string;
  let stdoutChunks: string[] = [];
  let origWrite: typeof process.stdout.write;
  let origIsTTY: boolean;

  const worker = useMockWorker();

  beforeEach(async () => {
    originalCwd = process.cwd();
    tempDir = await createTempDir("cc-edit-from-test-");
    projectDir = path.join(tempDir, "project");
    await mkdir(projectDir, { recursive: true });
    // The config loader falls back to $HOME, so HOME must not be the developer's.
    vi.stubEnv("HOME", tempDir);
    process.chdir(projectDir);

    stdoutChunks = [];
    // Restored onto the same object in afterEach; binding would restore a wrapper instead.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
    origWrite = process.stdout.write;
    process.stdout.write = function (str: unknown): boolean {
      stdoutChunks.push(String(str));
      return true;
    };

    origIsTTY = process.stdin.isTTY;
    // Whether anyone can confirm is this file's subject, so every spec states it.
    process.stdin.isTTY = false;
  });

  afterEach(async () => {
    process.stdout.write = origWrite;
    process.stdin.isTTY = origIsTTY;
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  async function installConfig(overrides: Partial<ProjectConfig>): Promise<void> {
    await writeTestTsConfig(projectDir, buildProjectConfig(overrides));
  }

  function installed(): Partial<ProjectConfig> {
    return {
      skills: [buildSkillConfig(REACT_ID, { scope: "project", origin: EJECT_SOURCE })],
      agents: buildAgentConfigs([WEB_DEV], { scope: "project" }),
      stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(REACT_ID)] } },
    };
  }

  describe("a removal nobody can confirm", () => {
    it("refuses without a terminal, naming the id and both ways forward", async () => {
      await installConfig(installed());

      const error = await runEdit(["--from", DEAD_LINK_ID]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(DEAD_LINK_ID);
      // Naming the greenfield command is all a pipeline can act on.
      expect(error?.message).toContain(`init --from ${DEAD_LINK_ID}`);
    });

    it("refuses before it fetches anything", async () => {
      await installConfig(installed());

      await runEdit(["--from", DEAD_LINK_ID]);

      // The run is already over, so fetching the payload would be a wasted round trip.
      expect(worker.requests).toStrictEqual([]);
    });

    it("refuses before it loads the catalogue", async () => {
      await installConfig(installed());

      await runEdit(["--from", DEAD_LINK_ID]);

      expect(
        stdoutChunks.join(""),
        "a run that cannot finish must not pay for the inputs of one that could",
      ).not.toContain(STATUS_MESSAGES.LOADING_SKILLS);
    });

    it("refuses a directory with nothing installed the same way", async () => {
      const error = await runEdit(["--from", DEAD_LINK_ID]);

      // The terminal question comes first, so the user is told what they can act on first.
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(DEAD_LINK_ID);
    });
  });

  /** `--ui` opens whatever `--from` names, else the command's own subject. */
  describe("--ui opens what --from names", () => {
    it("succeeds with both flags given", async () => {
      await installConfig(installed());

      const error = await runEdit(["--ui", "--from", DEAD_LINK_ID]);

      expect(error).toBeUndefined();
    });

    /**
     * Given both flags the id already exists, so nothing is minted or fetched; `DEAD_LINK_ID` is
     * not in the store, so a fetch would have failed.
     */
    it("neither mints nor fetches, because the id it opens already exists", async () => {
      await installConfig(installed());

      await runEdit(["--ui", "--from", DEAD_LINK_ID]);

      expect(worker.requests).toStrictEqual([]);
    });
  });

  describe("with a terminal to confirm at", () => {
    standAtTerminal();

    it("reports an id the store does not have, in the store's own words", async () => {
      await installConfig(installed());

      const error = await runEdit(["--from", DEAD_LINK_ID]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(DEAD_LINK_ID);
    });

    it("fetches before it loads the catalogue, so an unknown id costs nothing else", async () => {
      await installConfig(installed());

      await runEdit(["--from", DEAD_LINK_ID]);

      expect(worker.requests.map((request) => request.url)).toStrictEqual([
        `${CONFIGS_URL}/${DEAD_LINK_ID}`,
      ]);
      expect(stdoutChunks.join("")).not.toContain(STATUS_MESSAGES.LOADING_SKILLS);
    });
  });
});
