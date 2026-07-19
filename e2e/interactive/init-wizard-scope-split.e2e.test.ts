import path from "path";
import { mkdir } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { TIMEOUTS, EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  createPermissionsFile,
  fileExists,
} from "../helpers/test-utils.js";
import { readConfigSkillIds, readSkillEntries } from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";

/**
 * E2E tests for mixed scope config split verification (Gap 2).
 *
 * When some skills are project-scoped and others are global-scoped,
 * writeScopedConfigs() should produce TWO config files:
 *   - ~/.claude-src/config.ts (global-scoped items)
 *   - <projectDir>/.claude-src/config.ts (project-scoped items)
 */

describe("init wizard — mixed scope config split", () => {
  let wizard: InitWizard | undefined;
  let tempDir: string | undefined;
  let source: { sourceDir: string; tempDir: string } | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;

    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
    if (source) {
      await cleanupTempDir(source.tempDir);
      source = undefined;
    }
  });

  async function createFixtures(): Promise<{
    fakeHome: string;
    projectDir: string;
  }> {
    tempDir = await createTempDir();

    const fakeHome = path.join(tempDir, "fake-home");
    const projectDir = path.join(fakeHome, "project");

    await mkdir(fakeHome, { recursive: true });
    await mkdir(projectDir, { recursive: true });

    await createPermissionsFile(fakeHome);
    await createPermissionsFile(projectDir);

    source = await createE2ESource();

    return { fakeHome, projectDir };
  }

  it(
    "should write TWO config files when skills have mixed scopes",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const { fakeHome, projectDir } = await createFixtures();

      wizard = await InitWizard.launch({
        projectDir,
        source: { sourceDir: source!.sourceDir, tempDir: source!.tempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      // Select stack, accept domains
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Toggle first skill (web-framework-react) to project scope
      await build.toggleScopeOnFocusedSkill();

      // Verify scope badge changed
      const buildOutput = build.getOutput();
      expect(buildOutput).toContain("P ");

      // Advance through all domains, then to sources
      const sources = await build.passThroughAllDomains();

      // Set all sources to local to avoid plugin install
      await sources.setAllLocal();
      const agents = await sources.advance();

      // Toggle api-developer agent scope by navigating to it
      await agents.navigateCursorToAgent("API Developer");
      await agents.toggleScopeOnFocusedAgent();

      const confirm = await agents.advance("init");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // --- Assertions ---

      // Both config files should exist
      await expect({ dir: fakeHome }).toHaveConfig();
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: ["web-framework-react"],
      });

      // Global config should NOT contain the project-scoped skill (scope-specific check)
      const globalSkillIds = await readConfigSkillIds(fakeHome);
      expect(globalSkillIds).not.toContain("web-framework-react");
      expect(globalSkillIds).toContain("web-testing-vitest");

      // web-developer should be compiled (global agent)
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // config-types.ts must exist at both scopes
      expect(
        await fileExists(path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS)),
        "Global config-types.ts must exist",
      ).toBe(true);
      expect(
        await fileExists(path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS)),
        "Project config-types.ts must exist",
      ).toBe(true);
    },
  );

  it(
    "should write each skill's scope correctly in split configs",
    { timeout: TIMEOUTS.INTERACTIVE },
    async () => {
      const { fakeHome, projectDir } = await createFixtures();

      wizard = await InitWizard.launch({
        projectDir,
        source: { sourceDir: source!.sourceDir, tempDir: source!.tempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      // Select stack, accept domains
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Web domain: toggle first skill to project scope, then advance
      await build.toggleScopeOnFocusedSkill();
      await build.advanceDomain();

      // API domain: toggle first skill to project scope, then advance
      await build.toggleScopeOnFocusedSkill();
      await build.advanceDomain();

      // Shared domain: pass through (stay global) — this final advance goes to sources
      const sources = await build.advanceToSources();

      // Set all sources to local
      await sources.setAllLocal();
      const agents = await sources.advance();
      const confirm = await agents.acceptDefaults("init");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // --- Assertions ---

      // Project config: should contain both project-scoped skills
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: ["web-framework-react", "api-framework-hono"],
      });

      // Global skills: should NOT contain project-scoped skills
      const globalSkillIds = await readConfigSkillIds(fakeHome);
      expect(globalSkillIds).not.toContain("web-framework-react");
      expect(globalSkillIds).not.toContain("api-framework-hono");

      // Verify scope field values in the project config (scope-specific check)
      const projectReactEntries = await readSkillEntries(projectDir, "web-framework-react");
      expect(projectReactEntries.map((entry) => entry.scope)).toStrictEqual(["project"]);
    },
  );
});
