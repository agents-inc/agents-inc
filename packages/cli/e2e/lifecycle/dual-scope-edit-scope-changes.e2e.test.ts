import path from "path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, FILES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  readAgentEntriesFor,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createTestEnvironment,
  readSkillEntries,
  setupDualScopeWithEject,
} from "../fixtures/dual-scope-helpers.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";

/**
 * Dual-scope edit lifecycle E2E test -- scope changes via S hotkey.
 *
 * Tests toggling project skills/agents to global scope via the "s" hotkey
 * in the edit wizard.
 */

describe("dual-scope edit lifecycle -- scope changes via S hotkey", () => {
  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;
  let testWizard: EditWizard | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP_DUAL);

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
    "Scope toggle (s) collapses a persisted dual-scope skill locked to a selected agent",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // api-framework-hono is a persisted dual-scope [P][G] pair AND a preloaded
      // skill locked to the selected api-developer agent. Space cannot deselect a
      // skill locked to a selected agent, but `s` is the sole dual-scope toggle:
      // it collapses [P][G] to the single inherited-global entry, dropping the
      // project override while the global install survives.
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.hono.id);
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.hono.id);

      const wizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- API domain -- press `s` on api-framework-hono (collapses the pair)
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- Shared domain (pass through), then Sources/Agents/Confirm
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase D: Assertions — the pair collapsed to the global half

      // D-1: The global install is untouched; the project override is gone.
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope (P→G leaves the global install intact)",
      ).toBe(true);
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must be removed from project scope after the `s` collapse",
      ).toBe(false);

      // Project config no longer carries a project-scope entry or a tombstone for hono.
      expect(
        await readSkillEntries(projectDir, E2E_SKILL.hono.id),
        "the collapse must leave the inherited-global entry alone — no project entry, no tombstone",
      ).toStrictEqual([{ id: E2E_SKILL.hono.id, scope: "global", origin: "eject" }]);

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
      source: E2E_SOURCE,
      env: { HOME: fakeHome },
      ...TERMINAL_SIZE.TALL,
    });
    testWizard = wizard;

    // Build step -- pass through all three domains
    const sources = await wizard.build.passThroughAllDomains();

    // Sources step (pass through)
    await sources.waitForReady();
    const agents = await sources.advance();

    // Agents step -- restore api-developer to global scope. api-developer is a
    // persisted dual-scope [P][G] agent and `s` is the sole dual-scope toggle:
    // it collapses [P][G] → [G], the P→G restoration end-state.
    await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
    await agents.toggleScopeOnFocusedAgent();
    const confirm = await agents.advance("edit");

    // Confirm step
    const result = await confirm.confirm();
    const exitCode = await result.exitCode;
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Phase D: Assertions

    // D-1: api-developer.md exists at global scope (HOME)
    await expect({ dir: fakeHome }).toHaveCompiledAgent("api-developer");

    // D-2: api-developer.md does NOT exist at project scope (P→G is a MOVE for agents)
    const projectApiDevPath = path.join(agentsPath(projectDir), "api-developer.md");
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
      skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id, E2E_SKILL.hono.id],
      agents: ["web-developer", "api-developer"],
    });
    const globalConfig = await readTestFile(configTsPath(fakeHome));
    expect(globalConfig).toContain('"scope":"global"');

    // D-5: Project config does NOT have api-developer at project scope
    expect(
      await readAgentEntriesFor(projectDir, "api-developer"),
      "the P->G collapse must leave one global entry and no project-scope override",
    ).toStrictEqual([{ name: "api-developer", scope: "global" }]);

    // D-6: web-developer.md still at global scope (unchanged — collateral damage check)
    await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

    // D-7: Global skill files unchanged (web skills still at global)
    await expect({ dir: fakeHome }).toHaveSkillCopied(E2E_SKILL.react.id);

    await result.destroy();
  });

  it("Toggle a global agent's scope to project", { timeout: TIMEOUTS.LIFECYCLE }, async () => {
    // Phase C: Edit -- toggle web-developer from global to project scope
    const wizard = await EditWizard.launch({
      projectDir,
      source: E2E_SOURCE,
      env: { HOME: fakeHome },
      ...TERMINAL_SIZE.TALL,
    });
    testWizard = wizard;

    // Build step -- pass through all three domains
    const sources = await wizard.build.passThroughAllDomains();

    // Sources step (pass through)
    await sources.waitForReady();
    const agents = await sources.advance();

    // Agents step -- toggle web-developer to project scope
    await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["web-developer"]);
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
      skillIds: [E2E_SKILL.hono.id],
      agents: ["api-developer", "web-developer"],
    });
    const projectConfig = await readTestFile(configTsPath(projectDir));
    expect(projectConfig).toContain('"scope":"project"');

    // D-6: Global config STILL has web-developer (global untouched)
    await expect({ dir: fakeHome }).toHaveConfig({
      skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
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
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain: toggle web-framework-react scope to project,
      // focused explicitly rather than relying on where the grid opens.
      await wizard.build.focusSkill(E2E_SKILL.react.display);
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- API domain (pass through)
      await wizard.build.advanceDomain();

      // Build step -- Shared domain (pass through), then Sources/Agents/Confirm
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Phase D: Assertions

      // D-1: Skill directory EXISTS at project scope (copied from global)
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.react.id);
      expect(
        await directoryExists(projectSkillDir),
        "web-framework-react directory must exist at project scope after G→P toggle",
      ).toBe(true);

      // D-2: Skill directory STILL EXISTS at global scope (global untouched — override model)
      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.react.id);
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
      // The copied file is the skill it claims to be, named in its own frontmatter.
      // `skillMdContent.length > 100` stood here — an unexplained threshold standing
      // in for "the file has content", which any hundred bytes satisfy.
      const skillMdContent = await readTestFile(projectSkillMdPath);
      expect(skillMdContent.startsWith(`---\nname: ${E2E_SKILL.react.id}\n`)).toBe(true);

      // D-4: Global config STILL contains web-framework-react
      // D-5: Project config has web-framework-react with scope: "project"
      // D-6: Agent files at both scopes still exist (unchanged)
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.vitest.id, E2E_SKILL.zustand.id],
          agents: ["web-developer"],
        },
        project: {
          skillIds: [E2E_SKILL.hono.id, E2E_SKILL.react.id],
          agents: ["api-developer"],
        },
      });
      const projectConfig = await readTestFile(configTsPath(projectDir));
      expect(projectConfig).toContain('"scope":"project"');

      await result.destroy();
    },
  );
});
