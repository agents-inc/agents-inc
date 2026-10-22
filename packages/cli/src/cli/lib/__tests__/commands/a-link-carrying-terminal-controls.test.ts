import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { storedConfigHandlerFor } from "@workspace/api-mocks";
import { configMockServer } from "@workspace/api-mocks/node";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SeedPayload } from "@workspace/matrix/seed";

import { runCliCommand } from "../helpers/cli-runner.js";
import { useMockWorker } from "../helpers/mock-worker.js";
import { setupIsolatedHome } from "../helpers/isolated-home.js";
import { standAtTerminal } from "../helpers/terminal-input.js";
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

const CARRIED_ID = "external-web-testing-house";
/** Sets the window title, then colours everything printed after it. */
const CONTROL_HOLDING_ID = "external-x\u001B]0;PWNED\u0007\u001B[31mred";

/** Long enough for a load and the first frame of the confirm. */
const PROMPT_READY_MS = 600;

/**
 * A shared configuration carries an added skill's id and display name off the wire. An id holding a
 * terminal control is refused before anything is listed or written; a display name holding one is
 * printed without it. Each refusal sits beside the run it must still allow.
 */
describe("a shared configuration whose carried skill holds terminal controls", () => {
  useMockWorker();
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
      expect(rawStdout).not.toContain("Into this project:");
      expect(rawStdout).not.toContain(ESCAPE);
      expect(rawStdout).not.toContain(BELL);
      expect(await readInstallTree(projectDir)).toStrictEqual(before);
      expect(await directoryExists(path.join(fakeHome, CLAUDE_DIR))).toBe(false);
    });

    it("installs a carried skill whose display name holds them, naming it without them", async () => {
      serve("Hostile", carrying(CARRIED_ID, HOSTILE_DISPLAY_NAME));

      const { rawStdout, error } = await runCliCommand(["init", "--from", "Hostile"]);

      expect(error).toBeUndefined();
      expect(rawStdout).toContain(`    ${INERT_DISPLAY_NAME} (${CARRIED_ID})\n`);
      expect(rawStdout).not.toContain(ESCAPE);
      expect(rawStdout).not.toContain(BELL);
      expect(
        await fileExists(
          path.join(projectDir, CLAUDE_DIR, "skills", CARRIED_ID, STANDARD_FILES.SKILL_MD),
        ),
      ).toBe(true);
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

    it("names a carried skill it adds, whose display name holds them, without them", async () => {
      serve(
        "Installed",
        buildSeedPayload({
          marketplace: dirs.sourceDir,
          skills: ejected(REACT),
          agents: { "web-developer": { scope: "project" } },
        }),
      );
      expect((await answered(["init", "--from", "Installed"])).error).toBeUndefined();
      serve("Hostile", carrying(CARRIED_ID, HOSTILE_DISPLAY_NAME));

      const { rawStdout, stdout, error } = await answered(["edit", "--from", "Hostile"]);

      expect(error).toBeUndefined();
      expect(rawStdout).not.toContain(HOSTILE_TITLE);
      expect(stdout).toContain(`    ${INERT_DISPLAY_NAME} (${CARRIED_ID})\n`);
      expect(stdout).toContain(`  + ${INERT_DISPLAY_NAME} [P]\n`);
    });
  });
});
