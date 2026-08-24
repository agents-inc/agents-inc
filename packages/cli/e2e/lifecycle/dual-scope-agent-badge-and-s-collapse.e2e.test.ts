import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { agentsPath, fileExists, readAgentEntriesFor } from "../helpers/test-utils.js";
import { createDualScopeEnv, type DualScopeEnv } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT_DISPLAY } from "../fixtures/expected-values.js";
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * Dual-scope AGENT flow — badge rendering and the `s` collapse.
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
 *   3. Pressing `s` (scope toggle) on the persisted dual-scope agent COLLAPSES it
 *      to a single inherited-global row: the badge drops to [G], and saving the
 *      edit drops both the project entry and the tombstone from config.ts while
 *      the global install (and its compiled agent) survives. `s` is the sole
 *      dual-scope toggle — the selection key is inert on a `[P][G]` row.
 */

const API_DEVELOPER: AgentName = "api-developer";

describe("dual-scope agent — [P][G] badge and `s` collapse", () => {
  let env: DualScopeEnv | undefined;
  let wizard: EditWizard | undefined;

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
      env = await createDualScopeEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;

      // Check 1: the persisted config carries the dual-scope pair.
      const rows = await readAgentEntriesFor(projectDir, API_DEVELOPER);
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
      const projectAgentFile = path.join(agentsPath(projectDir), "api-developer.md");
      const globalAgentFile = path.join(agentsPath(fakeHome), "api-developer.md");
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
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      const agents = await sources.advance();
      await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);

      const badges = await agents.getScopeBadgesForAgent(E2E_AGENT_DISPLAY["api-developer"]);
      expect(
        [...badges].sort(),
        "persisted dual-scope api-developer must render both [P] and [G] badges",
      ).toStrictEqual(["G", "P"]);

      // Read-only check — abort without writing anything.
      await wizard.abortAndDestroy(TIMEOUTS.EXIT_WAIT);

      // The persisted `[P][G]` pair the setup wrote, read at four-surface strength on both
      // sides. Run after the abort so the probe touches a settled tree.
      await expectFourSurfaces(projectDir, { globalHome: fakeHome });
      await expectFourSurfaces(fakeHome);
    },
  );

  it(
    "Check 3: `s` on a persisted dual-scope agent collapses [P][G] to a single inherited-global [G]",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createDualScopeEnv(E2E_SOURCE);
      const { fakeHome, projectDir } = env;

      const projectAgentFile = path.join(agentsPath(projectDir), "api-developer.md");
      const globalAgentFile = path.join(agentsPath(fakeHome), "api-developer.md");
      const rowsBefore = await readAgentEntriesFor(projectDir, API_DEVELOPER);
      expect(
        rowsBefore.filter((row) => !row.excluded),
        "setup must persist exactly one active project agent entry",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "project" }]);
      expect(
        rowsBefore.filter((row) => row.excluded === true),
        "setup must persist exactly one global agent tombstone",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "global", excluded: true }]);

      wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const sources = await wizard.build.passThroughAllDomains();
      await sources.waitForReady();
      const agents = await sources.advance();

      // Focus api-developer and press `s`. `s` is the sole dual-scope toggle, so
      // it collapses the persisted pair to the single inherited-global entry.
      await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
      await agents.toggleScopeOnFocusedAgent();

      const badgesAfterS = await agents.getScopeBadgesForAgent(E2E_AGENT_DISPLAY["api-developer"]);
      expect(badgesAfterS, "`s` must collapse the dual-scope agent's badges to [G]").toStrictEqual([
        "G",
      ]);

      // Save the edit: the collapse must persist as a single global row — both the
      // project entry and the global tombstone are gone.
      const confirm = await agents.advance("edit");
      const result = await confirm.confirm();
      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      expect(
        await readAgentEntriesFor(projectDir, API_DEVELOPER),
        "a saved `s` collapse must leave exactly one active global api-developer row",
      ).toStrictEqual([{ name: API_DEVELOPER, scope: "global" }]);

      // Filesystem: the project override is uninstalled, the global install stays.
      expect(
        await fileExists(projectAgentFile),
        "the project-scope compiled agent must be removed by the collapse",
      ).toBe(false);
      expect(
        await fileExists(globalAgentFile),
        "the global-scope compiled agent must survive the collapse",
      ).toBe(true);

      await expectFourSurfaces(projectDir, { globalHome: fakeHome });
      await expectFourSurfaces(fakeHome);
    },
  );
});
