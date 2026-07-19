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

/**
 * Scope toggle config snapshot E2E test.
 *
 * Verifies exact config state before and after scope toggle operations,
 * ensuring that toggling a skill's or agent's scope correctly updates
 * the config files at both global and project scopes.
 */

describe("scope toggle config snapshot", () => {
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
    "G->P skill scope toggle should add skill to project config and preserve global config",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 1 },
    async () => {
      // BEFORE: Snapshot both configs
      const globalConfigBefore = await readTestFile(
        path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      const projectConfigBefore = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );

      // Capture global skill IDs before the toggle
      const globalSkillIdsBefore = globalConfigBefore
        .split("\n")
        .filter((l: string) => l.includes('"id"'))
        .map((l: string) => l.match(/"id":"([^"]+)"/)?.[1])
        .filter(Boolean);

      // ACTION: Launch EditWizard, toggle web-framework-react scope (S on first domain)
      const wizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });
      testWizard = wizard;

      // Build step -- Web domain: toggle first focused skill (web-framework-react) scope
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

      // AFTER assertions
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Project config contains web-framework-react with scope:"project"
      const projectConfigAfter = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      const reactProjectLines = projectConfigAfter
        .split("\n")
        .filter(
          (l: string) => l.includes("web-framework-react") && l.includes('"scope":"project"'),
        );
      expect(reactProjectLines.length).toBeGreaterThan(0);

      // Excluded tombstone for global scope must exist in project config
      expect(projectConfigAfter).toContain('"excluded":true');

      // Project config still contains api-framework-hono with scope:"project"
      const honoProjectLines = projectConfigAfter
        .split("\n")
        .filter((l: string) => l.includes("api-framework-hono") && l.includes('"scope":"project"'));
      expect(honoProjectLines.length).toBeGreaterThan(0);

      // Global config STILL contains web-framework-react with scope:"global"
      const globalConfigAfter = await readTestFile(
        path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      const reactGlobalLines = globalConfigAfter
        .split("\n")
        .filter((l: string) => l.includes("web-framework-react") && l.includes('"scope":"global"'));
      expect(reactGlobalLines.length).toBeGreaterThan(0);

      // Global config skill IDs unchanged from BEFORE snapshot
      const globalSkillIdsAfter = globalConfigAfter
        .split("\n")
        .filter((l: string) => l.includes('"id"'))
        .map((l: string) => l.match(/"id":"([^"]+)"/)?.[1])
        .filter(Boolean);
      expect(globalSkillIdsAfter).toStrictEqual(globalSkillIdsBefore);

      // Global config must be byte-identical (G->P should not modify global config)
      const globalConfigAfter2 = await readTestFile(
        path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(globalConfigAfter2).toStrictEqual(globalConfigBefore);

      // Project .claude/skills/web-framework-react/SKILL.md exists
      const projectSkillMdPath = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-framework-react",
        FILES.SKILL_MD,
      );
      expect(
        await fileExists(projectSkillMdPath),
        "SKILL.md must exist in project skills/web-framework-react/",
      ).toBe(true);

      // Global .claude/skills/web-framework-react/SKILL.md still exists (G->P is additive)
      const globalSkillMdPath = path.join(
        fakeHome,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-framework-react",
        FILES.SKILL_MD,
      );
      expect(
        await fileExists(globalSkillMdPath),
        "SKILL.md must still exist in global skills/web-framework-react/ (G->P is additive)",
      ).toBe(true);

      await result.destroy();
    },
  );

  it(
    "scope toggle (s) is inert on a persisted dual-scope skill locked to a selected agent — configs unchanged",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // api-framework-hono is a persisted dual-scope [P][G] pair AND locked to the
      // selected api-developer agent, so neither `s` (dual-scope guard) nor space
      // (agent lock) can drop the project half. Both config snapshots must be
      // byte-identical after the edit.

      // BEFORE: Snapshot both configs
      const globalConfigBefore = await readTestFile(
        path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      const projectConfigBefore = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );

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

      // Build step -- Shared domain (pass through)
      const sources = await wizard.build.advanceToSources();
      await sources.waitForReady();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("edit");

      const result = await confirm.confirm();
      const exitCode = await result.exitCode;

      // AFTER assertions — configs and filesystem unchanged
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      const projectConfigAfter = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(
        projectConfigAfter,
        "project config.ts must be unchanged after an inert scope toggle",
      ).toBe(projectConfigBefore);

      const globalConfigAfter = await readTestFile(
        path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(
        globalConfigAfter,
        "global config.ts must be unchanged after an inert scope toggle",
      ).toBe(globalConfigBefore);

      // Skill directory still present at BOTH scopes — the dual-scope pair survives
      const projectSkillDir = path.join(projectDir, DIRS.CLAUDE, DIRS.SKILLS, "api-framework-hono");
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must remain at project scope — `s` is inert on a locked dual-scope pair",
      ).toBe(true);

      const globalSkillDir = path.join(fakeHome, DIRS.CLAUDE, DIRS.SKILLS, "api-framework-hono");
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope (inert `s`)",
      ).toBe(true);

      await result.destroy();
    },
  );

  it(
    "G->P agent scope toggle should compile agent at project scope and preserve global",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Snapshot both configs
      const globalConfigBefore = await readTestFile(
        path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      const projectConfigBefore = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );

      // ACTION: Launch EditWizard, pass through build domains + sources, navigate to web-developer, toggle scope
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

      // Agents step -- navigate to Web Developer and toggle scope to project
      await agents.navigateCursorToAgent("Web Developer");
      await agents.toggleScopeOnFocusedAgent();
      const confirm = await agents.advance("edit");

      // Confirm step
      const result = await confirm.confirm();
      const exitCode = await result.exitCode;

      // AFTER assertions
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // web-developer.md exists at project .claude/agents/
      const projectAgentPath = path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS, "web-developer.md");
      expect(
        await fileExists(projectAgentPath),
        "web-developer.md must exist in project agents dir after G->P toggle",
      ).toBe(true);

      // web-developer.md STILL exists at global .claude/agents/ (G->P additive)
      const globalAgentPath = path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS, "web-developer.md");
      expect(
        await fileExists(globalAgentPath),
        "web-developer.md must still exist in global agents dir (G->P is additive)",
      ).toBe(true);

      // Project config contains web-developer agent
      const projectConfigAfter = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(projectConfigAfter).toContain("web-developer");

      // Global config STILL contains web-developer agent (immutable)
      const globalConfigAfter = await readTestFile(
        path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(globalConfigAfter).toContain("web-developer");

      await result.destroy();
    },
  );
});
