import path from "path";
import { mkdir, writeFile } from "fs/promises";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLI_ROOT } from "../helpers/cli-runner.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import { buildSkillConfig } from "../helpers/index.js";
import { buildAgentConfigs, buildProjectConfig } from "../factories/config-factories.js";
import { renderConfigTs } from "../content-generators";
import { sa } from "../factories/skill-factories.js";
import { CLAUDE_SRC_DIR, EJECT_SOURCE, STANDARD_FILES } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";
import { SHARED_CONFIG_ONE_DIRECTION, STATUS_MESSAGES } from "../../../utils/messages";
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
 */

const MISSING_ID = "NoSuchId";
const WEB_DEV = "web-developer";
const REACT_ID = "web-framework-react";
const REACT_CATEGORY = "web-framework";

const { default: Edit } = await import("../../../commands/edit.js");

let fetchStub: ReturnType<typeof vi.fn>;

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

    fetchStub = vi.fn().mockResolvedValue(new Response("no config", { status: 404 }));
    vi.stubGlobal("fetch", fetchStub);
  });

  afterEach(async () => {
    process.stdout.write = origWrite;
    process.stdin.isTTY = origIsTTY;
    process.chdir(originalCwd);
    vi.unstubAllGlobals();
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

      const error = await runEdit(["--from", MISSING_ID]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(MISSING_ID);
      // The refusal has to name the greenfield command, because that is the whole of what a
      // pipeline can do with an id — refusing without it reads as "this id is unusable here".
      expect(error?.message).toContain(`init --from ${MISSING_ID}`);
    });

    it("refuses before it fetches anything", async () => {
      await installConfig(installed());

      await runEdit(["--from", MISSING_ID]);

      // Nothing about the payload can change the answer, so asking for it is a round trip spent
      // on a run that was already over.
      expect(fetchStub).not.toHaveBeenCalled();
    });

    it("refuses before it loads the catalogue", async () => {
      await installConfig(installed());

      await runEdit(["--from", MISSING_ID]);

      expect(
        stdoutChunks.join(""),
        "a run that cannot finish must not pay for the inputs of one that could",
      ).not.toContain(STATUS_MESSAGES.LOADING_SKILLS);
    });

    it("refuses a directory with nothing installed the same way", async () => {
      const error = await runEdit(["--from", MISSING_ID]);

      // The terminal question is answered before the installation one, so the two refusals
      // cannot race: what a user is told is what they can act on first.
      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(MISSING_ID);
    });
  });

  describe("the two directions of the round trip", () => {
    it("refuses to run both at once", async () => {
      await installConfig(installed());

      const error = await runEdit(["--ui", "--from", MISSING_ID]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(SHARED_CONFIG_ONE_DIRECTION);
    });

    it("mints nothing and fetches nothing when both are given", async () => {
      await installConfig(installed());

      await runEdit(["--ui", "--from", MISSING_ID]);

      // `--ui` alone would have posted this installation. A run that is about to be refused
      // must not first spend a write on the store.
      expect(fetchStub).not.toHaveBeenCalled();
    });
  });

  describe("with a terminal to confirm at", () => {
    beforeEach(() => {
      process.stdin.isTTY = true;
    });

    it("reports an id the store does not have, in the store's own words", async () => {
      await installConfig(installed());

      const error = await runEdit(["--from", MISSING_ID]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(MISSING_ID);
    });

    it("fetches before it loads the catalogue, so an unknown id costs nothing else", async () => {
      await installConfig(installed());

      await runEdit(["--from", MISSING_ID]);

      expect(fetchStub).toHaveBeenCalled();
      expect(stdoutChunks.join("")).not.toContain(STATUS_MESSAGES.LOADING_SKILLS);
    });
  });
});
