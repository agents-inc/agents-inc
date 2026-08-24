import { realpathSync } from "fs";
import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { expectFourSurfaces } from "../assertions/four-surfaces.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  initGlobalWithEjectWithoutSkill,
  readAllSkillEntries,
  readSkillEntries,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * A skill picked fresh while setting a project up over an existing global
 * install defaults to global scope, and the `s` toggle overrides that default to
 * project scope — the ruled behaviour for CLI-442.
 *
 * The session is the one the defect was reported against: `init` inside a
 * project that has no config of its own, the dashboard's Edit, a skill the
 * global install does not carry. Every state is reached through the real wizard
 * — the global install by an `init` with the skill deselected in the grid, the
 * pick and its override by SPACE then `s` — because the defect is precisely
 * that a state reached by hand differs from one a fixture would write.
 *
 * "Overridable" only means something if choosing project produces a REAL project
 * install, so all three of its sides are asserted (the copied skill directory,
 * the project config entry, the compiled project agent carrying it) against a
 * global scope that must be byte-identical afterwards. The agent is moved to
 * project scope in the same session for that last one: a global agent can never
 * carry a project-scoped skill, so without it the project side has nowhere to be
 * observed in compiled output.
 */

describe("fresh pick during project setup defaults to global and overrides to project", () => {
  let tempDir: string | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP_DUAL);

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "`s` on a freshly picked skill installs it project-side and leaves the global scope untouched",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase A — global install WITHOUT vitest, so picking it later is a
      // genuine addition rather than a re-selection of an inherited install.
      const phaseA = await initGlobalWithEjectWithoutSkill(
        E2E_SOURCE,
        fakeHome,
        E2E_SKILL.vitest.display,
      );
      expect(phaseA.exitCode, `global init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);
      expect(
        (await readAllSkillEntries(fakeHome)).map((entry) => entry.id),
        "the deselected skill must not be installed globally — the whole premise of a fresh pick",
      ).not.toContain(E2E_SKILL.vitest.id);

      const globalSkillsBefore = await readAllSkillEntries(fakeHome);
      const globalAgentsBefore = await readCompiledAgents(fakeHome);
      expect(
        Object.keys(globalAgentsBefore).length,
        "the global scope must hold compiled agents before the edit, or its unchanged-ness is vacuous",
      ).toBeGreaterThan(0);

      // Phase B — set the project up over that global install, picking the skill
      // the global install lacks and overriding its scope.
      const dashboard = await InitWizard.launchForDashboard({
        projectDir,
        env: { HOME: fakeHome },
      });

      try {
        await dashboard.waitForText(STEP_TEXT.DASHBOARD, TIMEOUTS.WIZARD_TRANSITION);
        const build = await dashboard.selectEdit();

        await build.focusSkill(E2E_SKILL.vitest.display);
        await build.toggleFocusedSkill();
        expect(
          await build.getScopeBadgesForSkill(E2E_SKILL.vitest.display),
          "a fresh pick must default to global scope",
        ).toStrictEqual(["G"]);

        await build.toggleScopeOnFocusedSkill();
        expect(
          await build.getScopeBadgesForSkill(E2E_SKILL.vitest.display),
          "`s` must override a fresh pick's default to project scope",
        ).toStrictEqual(["P"]);

        const sources = await build.passThroughAllDomains();
        await sources.waitForReady();
        await sources.setAllLocal();
        const agents = await sources.advance();

        await agents.navigateCursorToAgent(E2E_AGENT["web-developer"].display);
        await agents.toggleScopeOnFocusedAgent();
        const confirm = await agents.advance("edit");

        const result = await confirm.confirm();
        expect(await result.exitCode, `project setup failed: ${result.rawOutput}`).toBe(
          EXIT_CODES.SUCCESS,
        );
        await result.destroy();
      } finally {
        await dashboard.destroy();
      }

      // The project side is real: config entry, copied files, compiled agent.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.vitest.id),
        "the overridden pick must be recorded at project scope only",
      ).toStrictEqual([{ id: E2E_SKILL.vitest.id, scope: "project", origin: "eject" }]);
      expect(
        await directoryExists(path.join(skillsPath(projectDir), E2E_SKILL.vitest.id)),
        "the overridden pick's files must land under the project's skills dir",
      ).toBe(true);
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        { contains: [E2E_SKILL.vitest.id] },
      );

      // The global side is untouched: no entry, no files, no rewritten agents.
      // The global config's SKILLS are compared rather than its bytes — setting a
      // project up registers its path in the global `projects` list, which is the
      // one global write this flow owes and is asserted below.
      expect(
        await readAllSkillEntries(fakeHome),
        "a project-scoped pick must not reach the global config's skills",
      ).toStrictEqual(globalSkillsBefore);
      expect(
        await directoryExists(path.join(skillsPath(fakeHome), E2E_SKILL.vitest.id)),
        "a project-scoped pick must not copy files into the global skills dir",
      ).toBe(false);
      expect(
        await readCompiledAgents(fakeHome),
        "a project-scoped pick must not rewrite the global agents",
      ).toStrictEqual(globalAgentsBefore);
      expect(
        await readTestFile(configTsPath(fakeHome)),
        "setting a project up must register it globally — the one global write this flow owes",
      ).toContain(realpathSync(projectDir));

      // Both scopes at four-surface strength. The override moved a skill and an agent across
      // the boundary, so the generated pair on EACH side has to still narrow — a project that
      // took the only skill of its category leaves the global unions to be regenerated without
      // it, and that regeneration is where a union collapses unnoticed.
      await expectFourSurfaces(projectDir, { globalHome: fakeHome });
      await expectFourSurfaces(fakeHome);
    },
  );
});
