import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { EXIT_CODES, TERMINAL_SIZE, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * Dual-scope edit lifecycle E2E test -- compiled agent content after scope toggle.
 *
 * Key invariants:
 * - When a SKILL's scope changes, only the skill moves — agents stay at their scope.
 * - The global config is PRESERVED via `mergeGlobalConfigs` — it keeps existing
 *   skills even if the new config doesn't include them.
 * - Global skills reach any agent (project or global). Project skills never reach
 *   global agents.
 */

describe("dual-scope edit lifecycle -- compiled agent content after scope toggle", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let testWizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP_DUAL);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);
  }, TIMEOUTS.LIFECYCLE);

  afterEach(async () => {
    await testWizard?.destroy();
    testWizard = undefined;
    await cleanupTempDir(testTempDir);
  });

  it(
    "G->P skill scope toggle should preserve skill in global agent via mergeGlobalConfigs",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Verify global web-developer contains web-framework-react
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: [E2E_SKILL.react.id],
      });

      // ACTION: Launch EditWizard, toggle web-framework-react scope to project
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain: toggle web-framework-react scope to project
      // (focus it explicitly — the first-alphabetical cell is Vue, not react).
      await wizard.build.focusSkill(E2E_SKILL.react.display);
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- API domain (pass through)
      await wizard.build.advanceDomain();

      // Methodology domain -> Sources -> Agents -> Confirm, all accepting defaults
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // AFTER assertions

      // Global web-developer.md: STILL contains web-framework-react
      // (mergeGlobalConfigs preserves existing skills in the global config)
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: [E2E_SKILL.react.id],
      });

      // Skill directory exists at project scope (G->P is additive — skill copied to project)
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react must exist at project scope after G->P toggle",
      ).toBe(true);

      // Skill directory still exists at global scope (global config preserves it)
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
      expect(
        await directoryExists(globalSkillDir),
        "web-framework-react must still exist at global scope (preserved by mergeGlobalConfigs)",
      ).toBe(true);

      // Project config has web-framework-react with project scope
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
      });

      await result.destroy();
    },
  );

  it(
    "scope toggle (s) collapses a persisted dual-scope skill locked to a selected agent, leaving the agent untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Verify project api-developer contains api-framework-hono
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.hono.id],
      });

      // api-framework-hono is a persisted dual-scope [P][G] pair AND locked to the
      // selected api-developer agent: space cannot deselect it (agent lock), but `s`
      // collapses the pair to its global half. The agent itself must stay put at
      // project scope — only the skill's project override goes away.
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- API domain: press `s` on api-framework-hono (collapses the pair)
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Methodology domain -> Sources -> Agents -> Confirm, all accepting defaults
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // AFTER assertions — only the skill's project half moved

      // api-developer.md STILL exists at project scope (agent untouched)
      const projectApiDevPath = path.join(agentsPath(projectDir), "api-developer.md");
      expect(
        await fileExists(projectApiDevPath),
        "api-developer.md must still exist at project scope",
      ).toBe(true);
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");
      // The agent still references the skill — it is now resolved from the global install.
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.hono.id],
      });

      // The global install survives; the project override is gone.
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.hono.id);
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope (P→G leaves the global install intact)",
      ).toBe(true);

      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.hono.id);
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must be removed from project scope after the `s` collapse",
      ).toBe(false);

      await result.destroy();
    },
  );

  it(
    "Agent scope toggle should recompile agent at new scope with correct skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Verify project api-developer contains api-framework-hono
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.hono.id],
      });

      // ACTION: Launch EditWizard, pass through build domains, toggle api-developer agent to global
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- pass through all three domains
      const sources = await wizard.build.passThroughAllDomains();

      // Sources step (pass through)
      await sources.waitForReady();
      const agents = await sources.advance();

      // Agents step -- restore api-developer to global scope. It is a persisted
      // dual-scope [P][G] agent and `s` collapses [P][G] → [G], the P→G
      // restoration path.
      await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
      await agents.toggleScopeOnFocusedAgent();
      const confirm = await agents.advance("edit");

      // Confirm step
      const result = await confirm.confirm();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // AFTER assertions

      // api-developer.md at global scope: exists and contains api-developer in content
      await expect({ dir: fakeHome }).toHaveCompiledAgent("api-developer");
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("api-developer", {
        contains: ["api-developer"],
      });

      // api-developer.md at project scope: does NOT exist (P->G is a move for agents)
      const projectApiDevPath = path.join(agentsPath(projectDir), "api-developer.md");
      expect(
        await fileExists(projectApiDevPath),
        "api-developer.md must NOT exist at project scope after P->G agent toggle",
      ).toBe(false);

      // Global config has api-developer agent
      await expect({ dir: fakeHome }).toHaveConfig({
        agents: ["api-developer"],
      });

      await result.destroy();
    },
  );
});
