import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, FILES, TERMINAL_SIZE } from "../pages/constants.js";
import { E2E_AGENT_DISPLAY, E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  readSkillEntries,
  setupDualScopeWithEject,
} from "../fixtures/dual-scope-helpers.js";

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
    "G->P skill scope toggle should add skill to project config and preserve global config",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 1 },
    async () => {
      // BEFORE: Snapshot both configs
      const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

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
        ...TERMINAL_SIZE.TALL,
      });
      testWizard = wizard;

      // Build step -- Web domain: toggle web-framework-react scope (focus it
      // explicitly — the first-alphabetical cell is Vue, not react).
      await wizard.build.focusSkill(E2E_SKILL.react.display);
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Build step -- API domain (pass through)
      await wizard.build.advanceDomain();

      // Shared domain, sources, agents and confirm all accept defaults
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;

      // AFTER assertions
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Proof of execution: the G->P toggle must have rewritten the project config.
      const projectConfigAfter = await readTestFile(configTsPath(projectDir));
      expect(projectConfigAfter, "project config.ts must record the G->P toggle").not.toBe(
        projectConfigBefore,
      );

      // The three grep-style `lines.length > 0` presence checks that stood here are
      // replaced by structural reads. A line count says a matching line exists
      // SOMEWHERE; `toStrictEqual` on the entry list says which entries exist and
      // that no fourth one joined them — the shape the rest of this file uses.
      expect(await readSkillEntries(projectDir, E2E_SKILL.react.id)).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", source: "eject", excluded: true },
        { id: E2E_SKILL.react.id, scope: "project", source: "eject" },
      ]);
      expect(await readSkillEntries(projectDir, E2E_SKILL.hono.id)).toStrictEqual([
        { id: E2E_SKILL.hono.id, scope: "global", source: "eject", excluded: true },
        { id: E2E_SKILL.hono.id, scope: "project", source: "eject" },
      ]);
      expect(await readSkillEntries(fakeHome, E2E_SKILL.react.id)).toStrictEqual([
        { id: E2E_SKILL.react.id, scope: "global", source: "eject" },
      ]);

      const globalConfigAfter = await readTestFile(configTsPath(fakeHome));

      // Global config skill IDs unchanged from BEFORE snapshot
      const globalSkillIdsAfter = globalConfigAfter
        .split("\n")
        .filter((l: string) => l.includes('"id"'))
        .map((l: string) => l.match(/"id":"([^"]+)"/)?.[1])
        .filter(Boolean);
      expect(globalSkillIdsAfter).toStrictEqual(globalSkillIdsBefore);

      // Global config must be byte-identical (G->P should not modify global config)
      const globalConfigAfter2 = await readTestFile(configTsPath(fakeHome));
      expect(globalConfigAfter2).toStrictEqual(globalConfigBefore);

      // Project .claude/skills/web-framework-react/SKILL.md exists
      const projectSkillMdPath = path.join(
        skillsPath(projectDir),
        E2E_SKILL.react.id,
        FILES.SKILL_MD,
      );
      expect(
        await fileExists(projectSkillMdPath),
        "SKILL.md must exist in project skills/web-framework-react/",
      ).toBe(true);

      // Global .claude/skills/web-framework-react/SKILL.md still exists (G->P is additive)
      const globalSkillMdPath = path.join(skillsPath(fakeHome), E2E_SKILL.react.id, FILES.SKILL_MD);
      expect(
        await fileExists(globalSkillMdPath),
        "SKILL.md must still exist in global skills/web-framework-react/ (G->P is additive)",
      ).toBe(true);

      await result.destroy();
    },
  );

  it(
    "scope toggle (s) collapses a persisted dual-scope skill locked to a selected agent — only the project config changes",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // api-framework-hono is a persisted dual-scope [P][G] pair AND locked to the
      // selected api-developer agent: space (agent lock) cannot drop the project
      // half but `s` collapses the pair to its global half. Only the PROJECT config
      // may change — the global config is not the wizard's to rewrite from a
      // project-scope edit.

      // BEFORE: Snapshot both configs
      const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
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

      // Build step -- API domain: press `s` on api-framework-hono (collapses the pair)
      await wizard.build.toggleScopeOnFocusedSkill();
      await wizard.build.advanceDomain();

      // Shared domain, sources, agents and confirm all accept defaults
      const result = await wizard.build.saveFromBuild("edit");
      const exitCode = await result.exitCode;

      // AFTER assertions — the project config lost the pair, the global one is untouched
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      const projectConfigAfter = await readTestFile(configTsPath(projectDir));
      expect(projectConfigAfter, "project config.ts must record the collapsed pair").not.toBe(
        projectConfigBefore,
      );
      const honoProjectLines = projectConfigAfter
        .split("\n")
        .filter((l: string) => l.includes(E2E_SKILL.hono.id) && l.includes('"scope":"project"'));
      expect(
        honoProjectLines,
        "the collapsed pair must leave no project-scope api-framework-hono entry",
      ).toStrictEqual([]);

      const globalConfigAfter = await readTestFile(configTsPath(fakeHome));
      expect(globalConfigAfter, "global config.ts must be unchanged by a project-scope edit").toBe(
        globalConfigBefore,
      );

      // The project override is gone; the global install survives.
      const projectSkillDir = path.join(skillsPath(projectDir), E2E_SKILL.hono.id);
      expect(
        await directoryExists(projectSkillDir),
        "api-framework-hono must be removed from project scope after the `s` collapse",
      ).toBe(false);

      const globalSkillDir = path.join(skillsPath(fakeHome), E2E_SKILL.hono.id);
      expect(
        await directoryExists(globalSkillDir),
        "api-framework-hono must remain at global scope (P→G leaves the global install intact)",
      ).toBe(true);

      await result.destroy();
    },
  );

  it(
    "G->P agent scope toggle should compile agent at project scope and preserve global",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // BEFORE: Snapshot both configs
      const globalConfigBefore = await readTestFile(configTsPath(fakeHome));
      const projectConfigBefore = await readTestFile(configTsPath(projectDir));

      // ACTION: Launch EditWizard, pass through build domains + sources, navigate to web-developer, toggle scope
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

      // Agents step -- navigate to Web Developer and toggle scope to project
      await agents.navigateCursorToAgent(E2E_AGENT_DISPLAY["web-developer"]);
      await agents.toggleScopeOnFocusedAgent();
      const confirm = await agents.advance("edit");

      // Confirm step
      const result = await confirm.confirm();
      const exitCode = await result.exitCode;

      // AFTER assertions
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // web-developer.md exists at project .claude/agents/
      const projectAgentPath = path.join(agentsPath(projectDir), "web-developer.md");
      expect(
        await fileExists(projectAgentPath),
        "web-developer.md must exist in project agents dir after G->P toggle",
      ).toBe(true);

      // web-developer.md STILL exists at global .claude/agents/ (G->P additive)
      const globalAgentPath = path.join(agentsPath(fakeHome), "web-developer.md");
      expect(
        await fileExists(globalAgentPath),
        "web-developer.md must still exist in global agents dir (G->P is additive)",
      ).toBe(true);

      // Proof of execution: the G->P toggle must have rewritten the project config.
      // Without this the `toContain` below passes on the pre-toggle config, which
      // already named web-developer as a global-scoped agent.
      const projectConfigAfter = await readTestFile(configTsPath(projectDir));
      expect(projectConfigAfter, "project config.ts must record the G->P toggle").not.toBe(
        projectConfigBefore,
      );

      // Project config contains web-developer agent
      expect(projectConfigAfter).toContain("web-developer");

      // Global config STILL contains web-developer agent (immutable) — a
      // project-scope edit is not the wizard's licence to rewrite global config.
      const globalConfigAfter = await readTestFile(configTsPath(fakeHome));
      expect(globalConfigAfter, "global config.ts must be unchanged by a project-scope edit").toBe(
        globalConfigBefore,
      );
      expect(globalConfigAfter).toContain("web-developer");

      await result.destroy();
    },
  );
});
