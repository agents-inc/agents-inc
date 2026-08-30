import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  directoryExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  readSkillEntries,
  setupDualScopeWithEject,
} from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

/**
 * Dual-scope edit lifecycle E2E test -- combined scope toggles.
 *
 * Tests toggling BOTH a skill and an agent scope within a single edit session,
 * and mixed-direction toggles (P->G skill + G->P agent simultaneously).
 */

describe("dual-scope edit lifecycle -- combined scope toggles", () => {
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let testWizard: EditWizard | undefined;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await setupDualScopeWithEject(E2E_SOURCE, fakeHome, projectDir);
  });

  afterEach(async () => {
    await testWizard?.destroy();
    testWizard = undefined;
    await cleanupTempDir(testTempDir);
  });

  it(
    "Toggle both a skill and an agent scope in single edit session",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 1 },
    async () => {
      // Phase C: Edit -- toggle web-framework-react G->P and web-developer G->P
      const wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain: toggle web-framework-react scope (G->P), focused
      // explicitly rather than relying on where the grid opens.
      await wizard.build.focusSkill(E2E_SKILL.react.display);
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- API domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- Shared domain (pass through) -> Sources
      const sources = await wizard.build.advanceToSources();

      // Sources step (pass through)
      await sources.waitForReady();
      const agents = await sources.advance();

      // Agents step -- navigate to Web Developer and toggle scope (G->P)
      await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["web-developer"]);
      await agents.toggleScopeOnFocusedAgent();
      const confirm = await agents.advance("edit");

      // Confirm step
      const result = await confirm.confirm();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase D: Assertions

      // D-1: web-framework-react directory exists at project scope (G->P additive)
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react directory must exist at project scope after G->P toggle",
      ).toBe(true);

      // D-2: web-framework-react directory STILL exists at global scope (G->P is additive)
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      expect(
        await directoryExists(globalSkillDir),
        "web-framework-react directory must still exist at global scope (G->P is additive)",
      ).toBe(true);

      // D-3: web-developer compiled agent exists at project scope (G->P additive)
      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");

      // D-4: web-developer compiled agent STILL exists at global scope (G->P is additive)
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // D-5: Project config contains both web-framework-react and web-developer at project scope
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
        agents: ["api-developer", "web-developer"],
      });
      const projectConfig = await readTestFile(configTsPath(projectDir));
      expect(projectConfig).toContain("scope: 'project'");

      // D-6: Global config still has both (unchanged)
      await expect({ dir: fakeHome }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
        agents: ["web-developer"],
      });

      // D-7: Full dual-scope assertion with updated expectations
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: ["web-developer"],
        },
        project: {
          skillIds: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
          agents: ["api-developer", "web-developer"],
        },
      });

      await result.destroy();
    },
  );

  it(
    "Skill scope collapse on a locked dual-scope pair alongside a working agent G->P",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // api-framework-hono is a persisted dual-scope [P][G] pair locked to the
      // selected api-developer agent: space can't deselect it, but `s` collapses
      // the pair P->G. web-developer is a plain global agent, so `s` G->P on it
      // moves the other way. This exercises both scope-toggle directions in the
      // same edit.
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.hono.id);
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      const wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- API domain: press `s` on api-framework-hono (collapses the pair)
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- Shared domain (pass through) -> Sources
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.advance();

      // Agents step -- web-developer is a plain global agent: `s` G->P works
      await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["web-developer"]);
      await agents.toggleScopeOnFocusedAgent();
      const confirm = await agents.advance("edit");

      const result = await confirm.confirm();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase D: Assertions

      // D-1: api-framework-hono collapsed to its global half — project override gone
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must be removed from project scope after the `s` collapse",
      ).toBe(false);
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.hono.id);
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope",
      ).toBe(true);

      // D-2: the collapse drops the project override and leaves the global half.
      // Asserted on the whole entry list rather than on an absence: an entry list
      // that lost BOTH halves also has no project entry, and a scan of the emitted
      // text answers a question about the writer's line breaking instead.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the collapsed pair must leave the inherited global api-framework-hono entry and nothing else",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "global", origin: "eject" }]);

      // D-3: web-developer G->P worked — compiled at project scope AND still at global (additive)
      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // D-4: Project config now includes web-developer alongside api-developer
      await expect({ dir: projectDir }).toHaveConfig({
        agents: ["api-developer", "web-developer"],
      });

      // D-5: api-developer still compiled at project scope (unchanged)
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      // D-6: The project config genuinely changed (web-developer G->P was applied)
      expect(await readTestFile(configTsPath(projectDir))).not.toBe(projectConfigBefore);

      await result.destroy();
    },
  );
});
