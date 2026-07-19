import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

/**
 * Dual-scope edit lifecycle E2E test -- scope changes via S hotkey.
 *
 * Tests toggling project skills/agents to global scope via the "s" hotkey
 * in the edit wizard.
 */

describe("dual-scope edit lifecycle -- scope changes via S hotkey", () => {
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
  });

  afterEach(async () => {
    await testWizard?.destroy();
    testWizard = undefined;
    await cleanupTempDir(testTempDir);
  });

  it(
    "Scope toggle (s) is inert on a persisted dual-scope skill locked to a selected agent",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // api-framework-hono is a persisted dual-scope [P][G] pair AND a preloaded
      // skill locked to the selected api-developer agent. `s` is intentionally
      // inert on a persisted dual-scope pair, and space cannot deselect a
      // skill locked to a selected agent — so neither key removes the project
      // half. The pair must survive the edit untouched: config and filesystem
      // unchanged at both scopes.
      const projectSkillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, "api-framework-hono");
      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, "api-framework-hono");
      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const projectConfigBefore = await readTestFile(projectConfigPath);

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

      // Build step -- API domain -- press `s` on api-framework-hono (must be inert)
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- Shared domain (pass through)
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");

      const result = await confirm.confirm();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase D: Assertions — the dual-scope pair is unchanged

      // D-1: Skill directory still exists at BOTH scopes (project override preserved)
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope (inert `s`)",
      ).toBe(true);
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must remain at project scope — `s` is inert on a locked dual-scope pair",
      ).toBe(true);

      // D-2: Project config still carries the dual-scope pair (project override + global tombstone)
      const projectConfigAfter = await readTestFile(projectConfigPath);
      expect(
        projectConfigAfter,
        "project config.ts must be unchanged after an inert scope toggle",
      ).toBe(projectConfigBefore);
      const honoProjectLines = projectConfigAfter
        .split("\n")
        .filter((l: string) => l.includes("api-framework-hono") && l.includes('"scope":"project"'));
      expect(honoProjectLines.length).toBeGreaterThan(0);

      // D-3: Agent files at both scopes still exist (unchanged)
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");
      await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

      await result.destroy();
    },
  );

  it("Toggle a project agent's scope to global", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    // Phase C: Edit -- toggle api-developer from project to global scope
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

    // Agents step -- restore api-developer to global scope. api-developer is a
    // persisted dual-scope [P][G] agent, so `s` is intentionally inert on it.
    // Space (deselect) is the sanctioned way to drop the project half — it
    // collapses [P][G] → [G], the same P→G restoration end-state.
    await agents.toggleAgent("API Developer");
    const confirm = await agents.advance("edit");

    // Confirm step
    const result = await confirm.confirm();
    const exitCode = await result.exitCode;
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Phase D: Assertions

    // D-1: api-developer.md exists at global scope (HOME)
    await expect({ dir: fakeHome }).toHaveCompiledAgent("api-developer");

    // D-2: api-developer.md does NOT exist at project scope (P→G is a MOVE for agents)
    const projectApiDevPath = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, "api-developer.md");
    expect(
      await fileExists(projectApiDevPath),
      "api-developer.md must NOT exist in project agents dir after scope toggle to global",
    ).toBe(false);

    // D-3: Agent content at global scope is properly compiled
    await expect({ dir: fakeHome }).toHaveCompiledAgentContent("api-developer", {
      contains: ["api-developer"],
    });

    // D-4: Global config has api-developer with scope: "global"
    await expect({ dir: fakeHome }).toHaveConfig({
      skillIds: [
        "web-framework-react",
        "web-testing-vitest",
        "web-state-zustand",
        "api-framework-hono",
      ],
      agents: ["web-developer", "api-developer"],
    });
    const globalConfig = await readTestFile(path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS));
    expect(globalConfig).toContain('"scope":"global"');

    // D-5: Project config does NOT have api-developer at project scope
    const projectConfig = await readTestFile(
      path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
    );
    const apiDevProjectLines = projectConfig
      .split("\n")
      .filter((l: string) => l.includes("api-developer") && l.includes('"scope":"project"'));
    expect(apiDevProjectLines).toStrictEqual([]);

    // D-6: web-developer.md still at global scope (unchanged — collateral damage check)
    await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

    // D-7: Global skill files unchanged (web skills still at global)
    await expect({ dir: fakeHome }).toHaveSkillCopied("web-framework-react");

    await result.destroy();
  });

  it("Toggle a global agent's scope to project", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    // Phase C: Edit -- toggle web-developer from global to project scope
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

    // Agents step -- toggle web-developer to project scope
    await agents.navigateCursorToAgent("Web Developer");
    await agents.toggleScopeOnFocusedAgent();
    const confirm = await agents.advance("edit");

    // Confirm step
    const result = await confirm.confirm();
    const exitCode = await result.exitCode;
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Phase D: Assertions

    // D-1: web-developer.md exists at project scope
    await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");

    // D-2: web-developer.md STILL exists at global scope (global untouched — override model)
    await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

    // D-3: web-developer.md at project was properly compiled
    await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
      contains: ["web-developer"],
    });

    // D-4: api-developer.md still exists at project scope (unchanged)
    await expect({ dir: projectDir }).toHaveCompiledAgent("api-developer");

    // D-5: Project config has web-developer with scope: "project"
    await expect({ dir: projectDir }).toHaveConfig({
      skillIds: ["api-framework-hono"],
      agents: ["api-developer", "web-developer"],
    });
    const projectConfig = await readTestFile(
      path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
    );
    expect(projectConfig).toContain('"scope":"project"');

    // D-6: Global config STILL has web-developer (global untouched)
    await expect({ dir: fakeHome }).toHaveConfig({
      skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
      agents: ["web-developer"],
    });

    await result.destroy();
  });

  it(
    "Toggle a global ejected skill's scope to project",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Phase C: Edit -- toggle web-framework-react from global to project scope
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

      // Build step -- Shared domain (pass through)
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

      // Phase D: Assertions

      // D-1: Skill directory EXISTS at project scope (copied from global)
      const projectSkillDir = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-framework-react",
      );
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react directory must exist at project scope after G→P toggle",
      ).toBe(true);

      // D-2: Skill directory STILL EXISTS at global scope (global untouched — override model)
      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, "web-framework-react");
      expect(
        await directoryExists(globalSkillDir),
        "web-framework-react directory must still exist at global scope (G→P is additive)",
      ).toBe(true);

      // D-3: SKILL.md file exists and has content at project scope
      const projectSkillMdPath = path.join(projectSkillDir, FILES.SKILL_MD);
      expect(
        await fileExists(projectSkillMdPath),
        "SKILL.md must exist in project skills/web-framework-react/",
      ).toBe(true);
      const skillMdContent = await readTestFile(projectSkillMdPath);
      expect(skillMdContent.length).toBeGreaterThan(100);
      expect(skillMdContent).toContain("web-framework-react");

      // D-4: Global config STILL contains web-framework-react
      // D-5: Project config has web-framework-react with scope: "project"
      // D-6: Agent files at both scopes still exist (unchanged)
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          agents: ["web-developer"],
        },
        project: {
          skillIds: ["api-framework-hono", "web-framework-react"],
          agents: ["api-developer"],
        },
      });
      const projectConfig = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(projectConfig).toContain('"scope":"project"');

      await result.destroy();
    },
  );
});
