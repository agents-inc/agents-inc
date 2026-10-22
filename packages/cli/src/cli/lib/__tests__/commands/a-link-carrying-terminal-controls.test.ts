import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { runCliCommand } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { printAtWidth, standAtTerminal } from "../helpers/terminal-input.js";
import { readInstallTree } from "../helpers/golden-tree.js";
import { directoryExists, fileExists } from "../test-fs-utils";
import { delay, KEY_Y } from "../test-constants";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../factories/seed-factories.js";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  testMarketplaceSkillId,
  type TestDirs,
} from "../fixtures/create-test-source";
import { DEFAULT_TEST_SKILLS } from "../mock-data/mock-skills";
import { CLAUDE_DIR, STANDARD_FILES } from "../../../consts";
import { EXIT_CODES } from "../../exit-codes";

const REACT = testMarketplaceSkillId("web-framework-react");

const ESCAPE = "\u001B";
const BELL = "\u0007";

/** Clears the screen, then sets the window title, between the two halves of an honest name. */
const HOSTILE_DISPLAY_NAME = "House\u001B[2J\u001B]0;TITLE\u0007Tool";
const INERT_DISPLAY_NAME = "HouseTool";
/** Only the payload writes this; a frame Ink draws carries escapes of its own, never this one. */
const HOSTILE_TITLE = "\u001B]0;TITLE";

/** Prints a sentence of its own between two halves of a name, where nothing else may print. */
const NAME_ACROSS_LINES = "House\nNothing removed.\nTool";
const NAME_ON_ONE_LINE = "House Nothing removed. Tool";
const FORGED_ROW = "\nNothing removed.\n";

const CARRIED_ID = "external-web-testing-house";
/** Sets the window title, then colours everything printed after it. */
const CONTROL_HOLDING_ID = "external-x\u001B]0;PWNED\u0007\u001B[31mred";

/** Sets the window title, then prints a sentence on a line of its own. */
const FORGED_CODEX_MODEL = "m\u001B]0;CM\u0007\nNothing removed.";
/** A real Codex id this CLI does not offer. */
const NOT_OFFERED_CODEX_MODEL = "gpt-4o";
const SET_TITLE = "\u001B]0;";

/** Sets the window title, then starts a line of its own inside the refusal that quotes it. */
const FORGED_STACK_ID = "stk\u001B]0;S\u0007\nNothing removed.";
/** A stack no marketplace ships, written as an honest id is. */
const UNSHIPPED_STACK_ID = "no-such-stack";
const LINE_OF_ITS_OWN = "\nNothing removed.";

/** Long enough for a load and the first frame of the confirm. */
const PROMPT_READY_MS = 600;

/** Wide enough that a carried name sits on one line of the panel, which is what these specs pin. */
const PANEL_COLUMNS = 160;

/**
 * A shared configuration carries an added skill's id and display name, a sub-agent's Codex model, a
 * stack id and a marketplace off the wire. An id holding a terminal control is refused before
 * anything is listed or written; a display name, a Codex model or a stack id holding one, or a line
 * break, is printed without it, on one line; a marketplace holding either is refused, named so.
 * Each refusal sits beside the run it must still allow.
 */
describe("a shared configuration whose carried text holds terminal controls", () => {
  useMockWorker();
  printAtWidth(PANEL_COLUMNS);
  let projectDir: string;
  let fakeHome: string;
  let cleanup: () => Promise<void>;
  let dirs: TestDirs;

  beforeEach(async () => {
    ({ projectDir, fakeHome, cleanup } = await setupIsolatedHome("cc-link-terminal-controls-"));
    dirs = await createTestSource({ skills: inTestMarketplace(DEFAULT_TEST_SKILLS) });
    // An existing grant keeps the permission notice out of these specs.
    await mkdir(path.join(projectDir, CLAUDE_DIR), { recursive: true });
    await writeFile(
      path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON),
      JSON.stringify({ permissions: { allow: ["Read(*)"] } }),
    );
  });

  afterEach(async () => {
    await cleanupTestSource(dirs);
    await cleanup();
  });

  function serve(id: string, payload: SeedPayload): void {
    configMockServer.use(storedConfigHandlerFor(id, payload));
  }

  function ejected(skillId: string) {
    return {
      [skillId]: buildSeedSkill({
        install: "eject",
        scope: "project",
        assignments: { "web-developer": "lazy" },
      }),
    };
  }

  function carrying(carriedId: string, displayName: string): SeedPayload {
    return buildSeedPayload({
      marketplace: dirs.sourceDir,
      skills: { ...ejected(REACT), ...ejected(carriedId) },
      external: { [carriedId]: buildSeedExternalSkill({ categoryId: "web-testing", displayName }) },
      agents: { "web-developer": { scope: "project" } },
    });
  }

  describe("init --from, with no terminal", () => {
    it("refuses a carried skill whose id holds one, printing none, before it lists or writes anything", async () => {
      serve("Hostile", carrying(CONTROL_HOLDING_ID, INERT_DISPLAY_NAME));
      const before = await readInstallTree(projectDir);

      const { rawStdout, error } = await runCliCommand(["init", "--from", "Hostile"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(`  "external-x\\u001b]0;PWNED\\u0007\\u001b[31mred"\n`);
      expect(rawStdout).not.toContain("│  Marketplace ");
      expect(rawStdout).not.toContain(ESCAPE);
      expect(rawStdout).not.toContain(BELL);
      expect(await readInstallTree(projectDir)).toStrictEqual(before);
      expect(await directoryExists(path.join(fakeHome, CLAUDE_DIR))).toBe(false);
    });

    it("installs a carried skill whose display name holds them, naming it without them", async () => {
      serve("Hostile", carrying(CARRIED_ID, HOSTILE_DISPLAY_NAME));

      const { rawStdout, error } = await runCliCommand(["init", "--from", "Hostile"]);

      expect(error).toBeUndefined();
      expect(rawStdout).toContain(` + ${INERT_DISPLAY_NAME} ⏏ `);
      expect(rawStdout).not.toContain(ESCAPE);
      expect(rawStdout).not.toContain(BELL);
      expect(
        await fileExists(
          path.join(projectDir, CLAUDE_DIR, "skills", CARRIED_ID, STANDARD_FILES.SKILL_MD),
        ),
      ).toBe(true);
    });

    it("installs a carried skill whose display name is written across lines, naming it on one", async () => {
      serve("AcrossLines", carrying(CARRIED_ID, NAME_ACROSS_LINES));

      const { rawStdout, error } = await runCliCommand(["init", "--from", "AcrossLines"]);

      expect(error).toBeUndefined();
      expect(rawStdout).toContain(` + ${NAME_ON_ONE_LINE} ⏏ `);
      expect(rawStdout).not.toContain(FORGED_ROW);
    });
  });

  describe("init --from, a sub-agent's Codex model", () => {
    function pinnedTo(codexModel: string): SeedPayload {
      return buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: ejected(REACT),
        agents: { "web-developer": { scope: "project", codexModel } },
      });
    }

    it("warns about a model it does not offer that holds them and a line break, naming it inert on one line", async () => {
      serve("ForgedModel", pinnedTo(FORGED_CODEX_MODEL));

      const { stderr, error } = await runCliCommand(["init", "--from", "ForgedModel"]);

      expect(error).toBeUndefined();
      // `stderr` drops CSI but keeps OSC and BEL, so these two can fail.
      expect(stderr).not.toContain(SET_TITLE);
      expect(stderr).not.toContain(BELL);
      expect(stderr).toContain(
        "asks for Codex model 'm Nothing removed.', which this version of the CLI does not offer",
      );
    });

    it("warns about an honest model it does not offer exactly as written", async () => {
      serve("HonestModel", pinnedTo(NOT_OFFERED_CODEX_MODEL));

      const { stderr, error } = await runCliCommand(["init", "--from", "HonestModel"]);

      expect(error).toBeUndefined();
      expect(stderr).toContain(
        `asks for Codex model '${NOT_OFFERED_CODEX_MODEL}', which this version`,
      );
    });
  });

  describe("init --from, the stack and the marketplace a link names", () => {
    function naming(named: Pick<SeedPayload, "stackId"> | { marketplace: string }): SeedPayload {
      return buildSeedPayload({
        marketplace: dirs.sourceDir,
        skills: ejected(REACT),
        agents: { "web-developer": { scope: "project" } },
        ...named,
      });
    }

    it("refuses a stack it does not offer whose id holds them and a line break, naming it inert on one line", async () => {
      serve("ForgedStack", naming({ stackId: FORGED_STACK_ID }));

      const { error } = await runCliCommand(["init", "--from", "ForgedStack"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain("Stack 'stk Nothing removed.' is not a stack the source");
      expect(error?.message).not.toContain(LINE_OF_ITS_OWN);
    });

    it("refuses a stack it does not offer under an honest id, naming it exactly as written", async () => {
      serve("UnshippedStack", naming({ stackId: UNSHIPPED_STACK_ID }));

      const { error } = await runCliCommand(["init", "--from", "UnshippedStack"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(`Stack '${UNSHIPPED_STACK_ID}' is not a stack the source`);
    });

    it("refuses a marketplace holding them and a line break before it writes anything, naming it inert on one line", async () => {
      serve(
        "ForgedMarketplace",
        naming({ marketplace: `${dirs.sourceDir}${SET_TITLE}MK${BELL}${LINE_OF_ITS_OWN}` }),
      );
      const before = await readInstallTree(projectDir);

      const { error } = await runCliCommand(["init", "--from", "ForgedMarketplace"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(
        `The marketplace contains invalid characters: "${dirs.sourceDir} Nothing removed."\n`,
      );
      expect(error?.message).not.toContain(LINE_OF_ITS_OWN);
      expect(await readInstallTree(projectDir)).toStrictEqual(before);
    });

    it("refuses a marketplace holding a line break alone before it writes anything, naming it on one line", async () => {
      serve(
        "MarketplaceAcrossLines",
        naming({ marketplace: `${dirs.sourceDir}${LINE_OF_ITS_OWN}` }),
      );
      const before = await readInstallTree(projectDir);

      const { error } = await runCliCommand(["init", "--from", "MarketplaceAcrossLines"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain(
        `The marketplace contains invalid characters: "${dirs.sourceDir} Nothing removed."\n`,
      );
      expect(error?.message).not.toContain(LINE_OF_ITS_OWN);
      expect(await readInstallTree(projectDir)).toStrictEqual(before);
    });
  });

  describe("edit --from, at a terminal", () => {
    const terminal = standAtTerminal();

    async function answered(argv: string[]) {
      const run = runCliCommand(argv);
      await delay(PROMPT_READY_MS);
      terminal.input.push(KEY_Y);
      return run;
    }

    async function installedReactAlone(): Promise<void> {
      serve(
        "Installed",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: ejected(REACT),
          agents: { "web-developer": { scope: "project" } },
        }),
      );
      expect((await answered(["init", "--from", "Installed"])).error).toBeUndefined();
    }

    it("names a carried skill it adds, whose display name holds them, without them", async () => {
      await installedReactAlone();
      serve("Hostile", carrying(CARRIED_ID, HOSTILE_DISPLAY_NAME));

      const { rawStdout, stdout, error } = await answered(["edit", "--from", "Hostile"]);

      expect(error).toBeUndefined();
      expect(rawStdout).not.toContain(HOSTILE_TITLE);
      expect(stdout).toContain(` + ${INERT_DISPLAY_NAME} ⏏ `);
      expect(stdout).toContain(`  + ${INERT_DISPLAY_NAME} [P]\n`);
    });

    it("names a carried skill it adds, whose display name is written across lines, on one line", async () => {
      await installedReactAlone();
      serve("AcrossLines", carrying(CARRIED_ID, NAME_ACROSS_LINES));

      const { stdout, error } = await answered(["edit", "--from", "AcrossLines"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(` + ${NAME_ON_ONE_LINE} ⏏ `);
      expect(stdout).toContain(`  + ${NAME_ON_ONE_LINE} [P]\n`);
    });

    it("names a carried skill it overwrites, under a name written across lines, on one line", async () => {
      serve("Honest", carrying(CARRIED_ID, INERT_DISPLAY_NAME));
      expect((await answered(["init", "--from", "Honest"])).error).toBeUndefined();
      serve("AcrossLines", carrying(CARRIED_ID, NAME_ACROSS_LINES));

      const { stdout, error } = await answered(["edit", "--from", "AcrossLines"]);

      expect(error).toBeUndefined();
      expect(stdout).toContain(` ↻ ${NAME_ON_ONE_LINE} ⏏ `);
      expect(stdout).not.toContain(FORGED_ROW);
    });

    it("refuses a stack it does not offer whose id holds them and a line break, naming it inert on one line", async () => {
      await installedReactAlone();
      serve(
        "ForgedStack",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          stackId: FORGED_STACK_ID,
          skills: ejected(REACT),
          agents: { "web-developer": { scope: "project" } },
        }),
      );

      const { error } = await runCliCommand(["edit", "--from", "ForgedStack"]);

      expect(error?.oclif?.exit).toBe(EXIT_CODES.ERROR);
      expect(error?.message).toContain("Stack 'stk Nothing removed.' is not a stack the source");
      expect(error?.message).not.toContain(LINE_OF_ITS_OWN);
    });
  });
});
