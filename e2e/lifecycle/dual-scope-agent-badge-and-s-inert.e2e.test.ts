import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { createDualScopeEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/index.js";
import type { AgentName, AgentScopeConfig } from "../../src/cli/types/index.js";

/**
 * Dual-scope AGENT flow — badge rendering and the guarded-no-op `s` toggle.
 *
 * `createDualScopeEnv` installs every agent globally, then toggles api-developer
 * to project scope inside the project, producing the persisted dual-scope pair:
 *
 *   [{ name: api-developer, scope: "project" },
 *    { name: api-developer, scope: "global", excluded: true }]
 *
 * This suite verifies, via real `cc edit` runs and a structural config load:
 *   1. The project config carries the dual-scope pair (active project entry +
 *      global excluded tombstone).
 *   2. Re-opening the wizard renders BOTH [P] and [G] badges on the agents step.
 *   3. Pressing `s` (scope toggle) on the persisted dual-scope agent is a
 *      guarded no-op: badges stay [P][G] and the on-disk config is unchanged.
 *      (Unlike the task's stated assumption, `s` does NOT collapse a persisted
 *      dual-scope agent to global — the collapse is driven by SPACE. That
 *      collapse end-state is proven in
 *      agent-scope-toggle-agents-array.e2e.test.ts Scenario A.)
 */

const API_DEVELOPER: AgentName = "api-developer";
const API_DEVELOPER_DISPLAY = "API Developer";

/** Load the api-developer agent rows from the project's on-disk config. */
async function loadApiDevAgentRows(projectDir: string): Promise<AgentScopeConfig[]> {
  const loaded = await loadProjectConfigFromDir(projectDir);
  if (!loaded) throw new Error("project config must exist after dual-scope setup");
  return loaded.config.agents.filter((a) => a.name === API_DEVELOPER);
}

describe("dual-scope agent — [P][G] badge and guarded-no-op `s` toggle", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let env: DualScopeEnv | undefined;
  let wizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    await env?.destroy();
    env = undefined;
  });

  it(
    "Check 1+2: dual-scope config shape and both [P][G] badges render on re-open",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      // Check 1: the persisted config carries the dual-scope pair.
      const rows = await loadApiDevAgentRows(projectDir);
      const active = rows.filter((a) => !a.excluded);
      const tombstone = rows.filter((a) => a.excluded === true);
      expect(active, "api-developer must have exactly one active project entry").toStrictEqual([
        { name: API_DEVELOPER, scope: "project" },
      ]);
      expect(
        tombstone,
        "api-developer must have exactly one global excluded tombstone",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "global", excluded: true }]);

      // Filesystem sanity: dual-scope is additive — agent compiled at BOTH scopes.
      const projectAgentFile = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
      const globalAgentFile = path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
      expect(
        await fileExists(projectAgentFile),
        "api-developer.md must exist at project scope",
      ).toBe(true);
      expect(await fileExists(globalAgentFile), "api-developer.md must exist at global scope").toBe(
        true,
      );

      // Check 2: re-open the wizard, walk to the agents step, read the badges.
      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      const agents = await sources.advance();
      await agents.navigateCursorToAgent(API_DEVELOPER_DISPLAY);

      const badges = await agents.getScopeBadgesForAgent(API_DEVELOPER_DISPLAY);
      expect(
        [...badges].sort(),
        "persisted dual-scope api-developer must render both [P] and [G] badges",
      ).toStrictEqual(["G", "P"]);

      // Read-only check — abort without writing anything.
      wizard.abort();
      await wizard.waitForExit(TIMEOUTS.EXIT_WAIT);
    },
  );

  it(
    "Check 3: `s` on a persisted dual-scope agent is a guarded no-op (badges + config unchanged)",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(sourceDir, sourceTempDir);
      const { fakeHome, projectDir } = env;

      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const configBefore = await readTestFile(projectConfigPath);
      const rowsBefore = await loadApiDevAgentRows(projectDir);

      wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      const agents = await sources.advance();

      // Focus api-developer and press `s`. The scope-toggle guard makes this
      // inert on a persisted dual-scope agent (toast: "use space to change
      // project scope"), so the badges must remain [P][G].
      await agents.navigateCursorToAgent(API_DEVELOPER_DISPLAY);
      await agents.toggleScopeOnFocusedAgent();

      const badgesAfterS = await agents.getScopeBadgesForAgent(API_DEVELOPER_DISPLAY);
      expect(
        [...badgesAfterS].sort(),
        "`s` must not change the dual-scope agent's badges (guarded no-op)",
      ).toStrictEqual(["G", "P"]);

      // Complete the edit so the config is re-written, then assert it is
      // byte-identical and the api-developer rows are structurally unchanged.
      const confirm = await agents.advance("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      const configAfter = await readTestFile(projectConfigPath);
      expect(configAfter, "project config.ts must be unchanged after an inert `s` toggle").toBe(
        configBefore,
      );

      const rowsAfter = await loadApiDevAgentRows(projectDir);
      expect(
        rowsAfter,
        "api-developer dual-scope rows must be unchanged after an inert `s` toggle",
      ).toStrictEqual(rowsBefore);
    },
  );
});
