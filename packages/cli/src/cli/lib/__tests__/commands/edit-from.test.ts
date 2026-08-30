import path from "path";
import { mkdir, writeFile } from "fs/promises";

import { CONFIGS_URL, DEAD_LINK_ID } from "@workspace/api-mocks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import { buildSkillConfig } from "../helpers/index.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { renderConfigTs } from "../content-generators";
import { sa } from "../factories/skill-factories.js";
import { CLAUDE_SRC_DIR, EJECT_SOURCE, STANDARD_FILES } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import { STATUS_MESSAGES } from "../../../utils/messages";
import type { ProjectConfig } from "../../../types";

/**
 * `edit --from <id>` is the inbound half of the editor round trip, and the half that DELETES:
 * the project is made to match the payload, so a skill the previous configuration installed and
 * this one omits is removed.
 *
 * That is why it is interactive, and why these specs are mostly about what happens before
 * anything is fetched. A confirm nobody can answer must never become a yes, so a run with no
 * terminal refuses — and it refuses BEFORE the fetch and before the catalogue load, because a
 * run that cannot finish must not spend either.
 *
 * The confirm itself is an Ink prompt driven by a real keystroke, so it lives in the PTY suite;
 * what is provable here is every refusal that fires without one.
 *
 * The store is `@workspace/api-mocks`, which answers an id it has never seen with the worker's own
 * 404 and the worker's own body. This file wrote that body as `"no config"` while the worker
 * answers `"No config under this id"` — invisible for as long as the answer was hand-built here,
 * because a stub is never held against the thing it stands in for.
 */

const WEB_DEV = "web-developer";
const REACT_ID = "web-framework-react";
const REACT_CATEGORY = "web-framework";

const { default: Edit } = await import("../../../commands/edit.js");

/** Runs the command, returning the oclif error it threw (or `undefined` on success). */
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
    // The config loader falls back to $HOME when the cwd carries no config, so an unstubbed
    // HOME would let the developer's own installation decide what these runs would edit.
    vi.stubEnv("HOME", tempDir);
    process.chdir(projectDir);

    stdoutChunks = [];
    // Saved to be assigned straight back onto the same object in afterEach, so it is called
    // with the receiver it came from. Binding would restore a wrapper rather than the original.
    // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
    origWrite = process.stdout.write;
    process.stdout.write = function (str: unknown): boolean {
      stdoutChunks.push(String(str));
      return true;
    };

    origIsTTY = process.stdin.isTTY;
    // Whether there is anybody to confirm a removal is the whole subject of this file, so every
    // spec states it rather than inheriting whatever the runner happened to be started from.
    process.stdin.isTTY = false;
  });

  afterEach(async () => {
    process.stdout.write = origWrite;
    process.stdin.isTTY = origIsTTY;
    process.chdir(originalCwd);
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  /** Writes the `config.ts` this command reads the installation out of. */
  async function installConfig(overrides: Partial<ProjectConfig>): Promise<void> {
    const claudeSrcDir = path.join(projectDir, CLAUDE_SRC_DIR);
    await mkdir(claudeSrcDir, { recursive: true });
    await writeFile(
      path.join(claudeSrcDir, STANDARD_FILES.CONFIG_TS),
      renderConfigTs(buildProjectConfig(overrides)),
    );
  }

  /** The one installed configuration these specs would apply over. */
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
      // The refusal has to name the greenfield command, because that is the whole of what a
      // pipeline can do with an id — refusing without it reads as "this id is unusable here".
      expect(error?.message).toContain(`init --from ${DEAD_LINK_ID}`);
    });

    it("refuses before it fetches anything", async () => {
      await installConfig(installed());

      await runEdit(["--from", DEAD_LINK_ID]);

      // Nothing about the payload can change the answer, so asking for it is a round trip spent
      // on a run that was already over.
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

      // The terminal question is answered before the installation one, so the two refusals
      // cannot race: what a user is told is what they can act on first.
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(DEAD_LINK_ID);
    });
  });

  /**
   * The pair was REFUSED until 2026-08-24, on the reading that `--ui` hands this installation out
   * and `--from` applies one back, so the two are opposite ends of one round trip. The owner's
   * ruling replaced that with one rule across both commands — **`--ui` opens whatever `--from`
   * names, and the command's own subject when `--from` is absent** — under which the combination
   * is the obvious thing rather than a contradiction, and a shared id becomes something a
   * recipient can look at rather than only apply blind.
   */
  describe("--ui opens what --from names", () => {
    it("succeeds, where it used to refuse", async () => {
      await installConfig(installed());

      const error = await runEdit(["--ui", "--from", DEAD_LINK_ID]);

      expect(error).toBeUndefined();
    });

    /**
     * The whole economy of the path. `--ui` ALONE posts this installation to mint an id; `--from`
     * alone fetches the named one. Given both, an id already exists and this directory is not the
     * subject — so neither call has anything to do, and `DEAD_LINK_ID` proves it: the store does not
     * hold that id, and a run that fetched it would have failed.
     */
    it("neither mints nor fetches, because the id it opens already exists", async () => {
      await installConfig(installed());

      await runEdit(["--ui", "--from", DEAD_LINK_ID]);

      expect(worker.requests).toStrictEqual([]);
    });
  });

  describe("with a terminal to confirm at", () => {
    beforeEach(() => {
      process.stdin.isTTY = true;
    });

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
