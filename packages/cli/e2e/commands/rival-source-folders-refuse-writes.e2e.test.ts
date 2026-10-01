import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  readTreeSnapshot,
  runCLI,
  writeConfigTypes,
  writeProjectConfigIn,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";

/**
 * A scope holding BOTH source folders stops a write command, and lets a read one through.
 *
 * The preference order is the whole reason it is a refusal rather than a warning: with two
 * folders on disk the resolver reads whichever holds a `config.ts`, and that can perfectly well
 * be the STALE one — so a write that went ahead would land in a folder nothing compiles, beside
 * a folder holding the sub-agents the user is about to stop seeing. Both ways into the state are
 * the product's own doing: a compiled `agent-summoner` names the source folder in its own prompt,
 * so a copy compiled under either layout authors into the other one.
 *
 * **The way out is a manual one and the refusal has to say so.** Nothing in this CLI merges two
 * source folders or moves one, so the sentence names the folder being read and asks the user to
 * move what they want into it — a refusal that handed out a command would be handing out one
 * that exits 127.
 *
 * **Reading is deliberately left alone.** A user in this state has to be able to look at it, and
 * `doctor`'s Layout row is what they look with — a report that refused to run over the state it
 * exists to describe would leave them with the refusal and no way to see what it is about.
 *
 * Three of the five write commands are driven here. The guard is one method on `BaseCommand` and
 * the other two — `init` and `edit` — reach it through the same call at the top of their own
 * `run`, which no non-interactive spec can drive; `commands/handed-out-invocations` is what says
 * the invocations this refusal hands out are answerable at all.
 *
 * **Every refusal below is paired with the same command running on a one-folder scope**, because
 * a refusal on its own cannot tell a guard scoped to rival folders from one that has swallowed
 * every project it is pointed at.
 */

const AUTHORED_BY_THE_SUMMONER = "agents/summoned-agent/identity.md";
const AUTHORED_BY_THE_SUMMONER_BODY = "You are an agent a summoner wrote into the other folder.\n";

/** Write commands that take no wizard and no network, so a spec can drive them end to end. */
const WRITE_COMMANDS = [["compile"], ["update"], ["eject", "skills"]] as const;

describe("a scope holding two source folders refuses writes", () => {
  let tempDir: string;
  let projectDir: string;
  let home: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  async function project(): Promise<void> {
    tempDir = await createTempDir();
    projectDir = path.join(tempDir, "project");
    home = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await mkdir(home, { recursive: true });
    await writeProjectConfigIn(
      projectDir,
      DIRS.CLAUDE_SRC,
      buildProjectConfig({ name: "rival-folders-project", skills: [], agents: [] }),
    );
    await writeConfigTypes(projectDir, DIRS.CLAUDE_SRC);
  }

  /** The second folder, holding what a summoner compiled under the other layout authored. */
  async function seedTheRivalFolder(): Promise<void> {
    const target = path.join(projectDir, DIRS.SOURCE_CLAUDE, AUTHORED_BY_THE_SUMMONER);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, AUTHORED_BY_THE_SUMMONER_BODY);
  }

  async function run(command: readonly string[]) {
    return runCLI([...command], projectDir, { env: { HOME: home } });
  }

  for (const command of WRITE_COMMANDS) {
    it(`refuses '${command.join(" ")}' and changes nothing`, async () => {
      await project();
      await seedTheRivalFolder();
      const before = await readTreeSnapshot(projectDir);

      const { exitCode, combined } = await run(command);

      expect(exitCode).toBe(EXIT_CODES.ERROR);
      expect(combined).toContain(STEP_TEXT.WRITE_REFUSED_RIVAL_FOLDERS);
      expect(
        combined,
        "the refusal names both folders and says which is read, because the user's next move is to decide which of the two is theirs",
      ).toContain(STEP_TEXT.RIVAL_FOLDERS_REFUSE_WRITES);
      expect(
        combined,
        "no command performs the merge, so a refusal that did not spell out the manual one leaves the user with nothing to do",
      ).toContain(STEP_TEXT.RIVAL_FOLDERS_MANUAL_REMEDY);
      expect(await readTreeSnapshot(projectDir)).toStrictEqual(before);
    });
  }

  it("runs the same write command once only one of the two folders is there", async () => {
    await project();

    const { exitCode, combined } = await run(["update"]);

    expect(
      exitCode,
      "without this the refusals above cannot tell a guard that fires on two folders from one that refuses every project it is pointed at",
    ).toBe(EXIT_CODES.SUCCESS);
    expect(combined).not.toContain(STEP_TEXT.WRITE_REFUSED_RIVAL_FOLDERS);
    expect(
      combined,
      "one folder on the old name is a supported state, written in place indefinitely, so the run says nothing about it at all",
    ).not.toContain(STEP_TEXT.RIVAL_FOLDERS_MANUAL_REMEDY);
  });

  it("still reports the state through doctor, which writes nothing", async () => {
    await project();
    await seedTheRivalFolder();

    const { exitCode, combined } = await run(["doctor"]);

    expect(
      exitCode,
      "doctor answers on its rows rather than on the layout, and this state is one of the findings it is for",
    ).not.toBe(EXIT_CODES.CANCELLED);
    expect(combined).toContain(STEP_TEXT.DOCTOR_ROW_LAYOUT);
    expect(combined).toContain(STEP_TEXT.DOCTOR_LAYOUT_BOTH_FOLDERS);
    expect(combined).not.toContain(STEP_TEXT.WRITE_REFUSED_RIVAL_FOLDERS);
  });
});
