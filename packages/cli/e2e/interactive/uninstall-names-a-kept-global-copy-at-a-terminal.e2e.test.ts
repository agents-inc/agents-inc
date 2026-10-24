import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { cleanupTempDir, readTreeSnapshot } from "../helpers/test-utils.js";
import {
  DIRS,
  EXIT_CODES,
  LOCAL_COPY_MARK,
  REMOVED_MARKER,
  STEP_TEXT,
  TERMINAL_SIZE,
  TIMEOUTS,
  panelRow,
} from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * At a terminal, `uninstall`'s panel above its question names a global copy a project uninstall
 * keeps as its install recorded it on the global config.ts entry, though no catalogue the CLI
 * ships lists the fixture's namespaced id. The project copy being removed is the allowed case, named by its own;
 * the whole-panel assertion, last, is the one an id row reddens. Its lines are this run at
 * `MIDDLE`'s 100 columns, and end on the bottom border: the path line under it wraps by the temp
 * directory's length. The piped half is `commands/uninstall-names-skills-the-built-in-catalogue-lacks`.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;

const KEPT_GLOBAL_ID = "KeptTerm1";

describe("uninstall at a terminal over a global copy the built-in catalogue does not list", () => {
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
    store.publish(
      KEPT_GLOBAL_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "global",
            assignments: { [WEB_DEV]: "preloaded" },
          }),
          [E2E_SKILL.hono.id]: buildSeedSkill({
            scope: "project",
            assignments: { [API_DEV]: "preloaded" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "project" } },
      }),
    );
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "names the global copy it keeps as its install recorded it on the global config.ts entry, beside the project copy it removes, and a no changes nothing",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      env = await createTestEnvironment();
      const installed = await runInitFrom(
        store,
        KEPT_GLOBAL_ID,
        { dir: env.projectDir, globalHome: env.fakeHome },
        E2E_SOURCE.sourceDir,
      );
      expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

      // Not HOME whole: the project sits inside it.
      const installSurfaces = [
        env.projectDir,
        path.join(env.fakeHome, DIRS.CLAUDE),
        path.join(env.fakeHome, DIRS.SOURCE_ROOT),
      ];
      const before = await Promise.all(installSurfaces.map(readTreeSnapshot));
      expect(
        before.map((snapshot) => Object.keys(snapshot).length > 0),
        "each install surface holds files, or the equality after the decline holds for nothing",
      ).toStrictEqual([true, true, true]);

      prompt = new InteractivePrompt(["uninstall"], env.projectDir, {
        ...TERMINAL_SIZE.MIDDLE,
        env: { HOME: env.fakeHome },
      });
      await prompt.waitForText(STEP_TEXT.CONFIRM_UNINSTALL, TIMEOUTS.WIZARD_LOAD);
      const planned = prompt.getOutput();

      expect(
        planned,
        "a copy in the scope being uninstalled is named by its own metadata.yaml",
      ).toContain(panelRow(REMOVED_MARKER, `${E2E_SKILL.hono.display} ${LOCAL_COPY_MARK}`));

      await prompt.deny();
      await prompt.waitForText(STEP_TEXT.UNINSTALL_CANCELLED, TIMEOUTS.EXIT);
      expect(await prompt.waitForExit(TIMEOUTS.EXIT)).toBe(EXIT_CODES.CANCELLED);
      expect(
        await Promise.all(installSurfaces.map(readTreeSnapshot)),
        "a declined uninstall writes nothing at either scope",
      ).toStrictEqual(before);

      expect(
        planned,
        "the global copy the project uninstall keeps is named as its install recorded it on the global config.ts entry, not by its id",
      ).toContain(
        [
          "│  Skills                                                       │  Agents                          │",
          "│                                                               │                                  │",
          "│   Project                                                     │   Project                        │",
          "│  - E2E Hono ⏏                                                 │  - api-developer                 │",
          "│                                                               │                                  │",
          "│   Global                                                      │   Global                         │",
          "│  • E2E React ⏏                                                │  • web-developer                 │",
          "└──────────────────────────────────────────────────────────────────────────────────────────────────┘",
        ].join("\n"),
      );
    },
  );
});
