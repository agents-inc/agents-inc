import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT_DISPLAY } from "../fixtures/expected-values.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

/**
 * Dual-scope edit lifecycle E2E test -- combined scope toggles.
 *
 * Tests toggling BOTH a skill and an agent scope within a single edit session,
 * and mixed-direction toggles (P->G skill + G->P agent simultaneously).
 */

describe("dual-scope edit lifecycle -- combined scope toggles", () => {
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
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain: toggle web-framework-react scope (G->P)
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
      const projectSkillDir = path.join(skillsPath(projectDir), "web-framework-react");
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react directory must exist at project scope after G->P toggle",
      ).toBe(true);

      // D-2: web-framework-react directory STILL exists at global scope (G->P is additive)
      const globalSkillDir = path.join(skillsPath(fakeHome), "web-framework-react");
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
        skillIds: ["api-framework-hono", "web-framework-react"],
        agents: ["api-developer", "web-developer"],
      });
      const projectConfig = await readTestFile(configTsPath(projectDir));
      expect(projectConfig).toContain('"scope":"project"');

      // D-6: Global config still has both (unchanged)
      await expect({ dir: fakeHome }).toHaveConfig({
        skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
        agents: ["web-developer"],
      });

      // D-7: Full dual-scope assertion with updated expectations
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          agents: ["web-developer"],
        },
        project: {
          skillIds: ["api-framework-hono", "web-framework-react"],
          agents: ["api-developer", "web-developer"],
        },
      });

      await result.destroy();
    },
  );

  it(
    "Inert skill scope toggle on a locked dual-scope pair alongside a working agent G->P",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // api-framework-hono is a persisted dual-scope [P][G] pair locked to the
      // selected api-developer agent, so `s` is inert on it (and space can't
      // deselect it). web-developer is a plain global agent, so `s` G->P on it
      // still works. This exercises both an inert scope toggle and a live one in
      // the same edit.
      const projectSkillDir = path.join(skillsPath(projectDir), "api-framework-hono");
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- API domain: press `s` on api-framework-hono (must be inert)
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

      // D-1: api-framework-hono still present at BOTH scopes (inert `s` — pair survives)
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must remain at project scope — `s` is inert on a locked dual-scope pair",
      ).toBe(true);
      const globalSkillDir = path.join(skillsPath(fakeHome), "api-framework-hono");
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope",
      ).toBe(true);

      // D-2: Project config still carries api-framework-hono at project scope
      const projectConfig = await readTestFile(configTsPath(projectDir));
      const honoProjectLines = projectConfig
        .split("\n")
        .filter((l: string) => l.includes("api-framework-hono") && l.includes('"scope":"project"'));
      expect(honoProjectLines.length).toBeGreaterThan(0);

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
      expect(projectConfig).not.toBe(projectConfigBefore);

      await result.destroy();
    },
  );
});
