import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
} from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";

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
  }, TIMEOUTS.SETUP * 2);

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
        contains: ["web-framework-react"],
      });

      // ACTION: Launch EditWizard, toggle web-framework-react scope to project
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      testWizard = wizard;

      // Build step -- Web domain: toggle first focused skill (web-framework-react) scope to project
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- API domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- Methodology domain (pass through) -> Sources
      const sources = await wizard.build.advanceToSources();

      // Sources step (pass through)
      await sources.waitForReady();
      const agents = await sources.advance();

      // Agents step (pass through)
      const confirm = await agents.acceptDefaults("edit");

      // Confirm step
      const result = await confirm.confirm();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // AFTER assertions

      // Global web-developer.md: STILL contains web-framework-react
      // (mergeGlobalConfigs preserves existing skills in the global config)
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["web-framework-react"],
      });

      // Skill directory exists at project scope (G->P is additive — skill copied to project)
      const projectSkillDir = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-framework-react",
      );
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react must exist at project scope after G->P toggle",
      ).toBe(true);

      // Skill directory still exists at global scope (global config preserves it)
      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, "web-framework-react");
      expect(
        await directoryExists(globalSkillDir),
        "web-framework-react must still exist at global scope (preserved by mergeGlobalConfigs)",
      ).toBe(true);

      // Project config has web-framework-react with project scope
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: ["web-framework-react"],
      });

      await result.destroy();
    },
  );

  it(
    "scope toggle (s) is inert on a persisted dual-scope skill locked to a selected agent, leaving the agent untouched",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Verify project api-developer contains api-framework-hono
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["api-framework-hono"],
      });

      // api-framework-hono is a persisted dual-scope [P][G] pair AND locked to the
      // selected api-developer agent, so `s` is inert (dual-scope guard) and space
      // cannot deselect it (agent lock). Pressing `s` must leave both the skill
      // (still dual-scope) and the agent untouched.
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      testWizard = wizard;

      // Build step -- Web domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- API domain: press `s` on api-framework-hono (must be inert)
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- Methodology domain (pass through) -> Sources
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");

      const result = await confirm.confirm();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // AFTER assertions — nothing moved

      // api-developer.md STILL exists at project scope (agent untouched)
      const projectApiDevPath = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
      expect(
        await fileExists(projectApiDevPath),
        "api-developer.md must still exist at project scope",
      ).toBe(true);
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      // Skill directory still present at BOTH scopes — the dual-scope pair survives
      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, "api-framework-hono");
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope (inert `s`)",
      ).toBe(true);

      const projectSkillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, "api-framework-hono");
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must remain at project scope — `s` is inert on a locked dual-scope pair",
      ).toBe(true);

      await result.destroy();
    },
  );

  it(
    "Agent scope toggle should recompile agent at new scope with correct skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Verify project api-developer contains api-framework-hono
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["api-framework-hono"],
      });

      // ACTION: Launch EditWizard, pass through build domains, toggle api-developer agent to global
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      testWizard = wizard;

      // Build step -- pass through all three domains
      const sources = await wizard.build.passThroughAllDomains();

      // Sources step (pass through)
      await sources.waitForReady();
      const agents = await sources.advance();

      // Agents step -- restore api-developer to global scope. It is a persisted
      // dual-scope [P][G] agent, so `s` is inert on it; space (deselect)
      // collapses [P][G] → [G], the sanctioned P→G restoration path.
      await agents.toggleAgent("API Developer");
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
      const projectApiDevPath = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
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
