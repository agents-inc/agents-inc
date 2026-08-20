import path from "path";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import { TIMEOUTS, EXIT_CODES, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  ensureBinaryExists,
  fileExists,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createTestEnvironment,
  readConfigSkillIds,
  readSkillEntries,
} from "../fixtures/dual-scope-helpers.js";
import "../matchers/setup.js";

/**
 * E2E tests for mixed scope config split verification (Gap 2).
 *
 * When some skills are project-scoped and others are global-scoped,
 * writeScopedFromWizard() should produce TWO config files:
 *   - ~/.claude-src/config.ts (global-scoped items)
 *   - <projectDir>/.claude-src/config.ts (project-scoped items)
 */

describe("init wizard — mixed scope config split", () => {
  let wizard: InitWizard | undefined;
  let tempDir: string | undefined;
  let source: E2ESource | undefined;

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
    const { tempDir: envTempDir, fakeHome, projectDir } = await createTestEnvironment();
    tempDir = envTempDir;

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
        ...TERMINAL_SIZE.TALL,
      });

      // Select stack, accept domains
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Focus and toggle web-framework-react to project scope, focused explicitly
      // rather than relying on where the grid opens.
      await build.focusSkill(E2E_SKILL.react.display);
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
      await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["api-developer"]);
      await agents.toggleScopeOnFocusedAgent();

      const confirm = await agents.advance("init");
      const result = await confirm.confirm();

      expect(await result.exitCode).toBe(EXIT_CODES.SUCCESS);

      // --- Assertions ---

      // Both config files should exist
      await expect({ dir: fakeHome }).toHaveConfig();
      await expect({ dir: projectDir }).toHaveConfig({
        skillIds: [E2E_SKILL.react.id],
      });

      // The project config is named for the project it configures — the same
      // identity `eject` writes and the loader repairs a missing name to.
      // Asserted on the written text as well as structurally: the loader
      // SUPPLIES the directory name when the field is absent, so a structural
      // read alone would pass over a config that never carried one.
      const projectName = path.basename(projectDir);
      expect(await readTestFile(configTsPath(projectDir))).toContain(`name: "${projectName}"`);
      expect((await loadConfigOrFail(projectDir)).name).toBe(projectName);

      // A MIXED install writes assignments into both files — a project-scoped
      // skill on a project-scoped agent lands in the project's `stack`, and the
      // global-scoped rest lands in the global one — so the closing block owes
      // the user both paths. The project half already prints; the global half is
      // the one this pins.
      expect(result.output).toContain(STEP_TEXT.CONFIGURATION_LABEL);
      expect(result.output).toContain(configTsPath(projectDir));
      expect(result.output).toContain(configTsPath(fakeHome));

      // Global config should NOT contain the project-scoped skill (scope-specific check)
      const globalSkillIds = await readConfigSkillIds(fakeHome);
      expect(globalSkillIds).not.toContain(E2E_SKILL.react.id);
      expect(globalSkillIds).toContain(E2E_SKILL.vitest.id);

      // web-developer should be compiled (global agent)
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // config-types.ts must exist at both scopes
      expect(
        await fileExists(configTypesTsPath(fakeHome)),
        "Global config-types.ts must exist",
      ).toBe(true);
      expect(
        await fileExists(configTypesTsPath(projectDir)),
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
        ...TERMINAL_SIZE.TALL,
      });

      // Select stack, accept domains
      const domain = await wizard.stack.selectFirstStack();
      const build = await domain.acceptDefaults();

      // Web domain: toggle web-framework-react to project scope, then advance.
      // Focused explicitly rather than relying on where the grid opens.
      await build.focusSkill(E2E_SKILL.react.display);
      await build.toggleScopeOnFocusedSkill();
      await build.advanceDomain();

      // API domain: toggle first skill (api-framework-hono, sole option) to project scope
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
        skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id],
      });

      // Global skills: should NOT contain project-scoped skills
      const globalSkillIds = await readConfigSkillIds(fakeHome);
      expect(globalSkillIds).not.toContain(E2E_SKILL.react.id);
      expect(globalSkillIds).not.toContain(E2E_SKILL.hono.id);

      // Verify scope field values in the project config (scope-specific check)
      const projectReactEntries = await readSkillEntries(projectDir, E2E_SKILL.react.id);
      expect(projectReactEntries.map((entry) => entry.scope)).toStrictEqual(["project"]);
    },
  );
});
