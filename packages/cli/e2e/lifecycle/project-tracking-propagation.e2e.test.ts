import { realpathSync } from "fs";
import { mkdir, rm } from "fs/promises";
import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, initProjectAllGlobal } from "../fixtures/dual-scope-helpers.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, DIRS, STEP_TEXT, TERMINAL_SIZE } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  createPermissionsFile,
  ensureBinaryExists,
  fileExists,
  isClaudeCLIAvailable,
  readTestFile,
} from "../helpers/test-utils.js";

/**
 * Project tracking and propagation E2E tests.
 *
 * Verifies:
 * 1. Project paths are registered in global config's `projects` field after init
 * 2. Global config changes propagate config-types.ts to registered projects
 * 3. `uninstall` deregisters the project from global config
 * 4. Stale project paths are filtered during registration
 */

let source: E2EPluginSource;

const claudeAvailable = await isClaudeCLIAvailable();

beforeAll(async () => {
  if (!claudeAvailable) return;
  await ensureBinaryExists();
  source = await createE2EPluginSource();
}, TIMEOUTS.SETUP_DUAL);

describe.skipIf(!claudeAvailable)("project tracking -- registration", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "should register project paths in global config after init",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;
      const project1Dir = path.join(fakeHome, "project-1");
      const project2Dir = path.join(fakeHome, "project-2");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });
      await createPermissionsFile(project1Dir);
      await createPermissionsFile(project2Dir);

      // Phase A: Init from HOME (global)
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      const globalExitCode = await globalResult.exitCode;
      expect(globalExitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase B: Init project-1 via dashboard → Edit (global install already exists)
      const p1 = await initProjectAllGlobal(source, fakeHome, project1Dir);
      expect(p1.exitCode, "Project-1 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Phase C: Init project-2 via dashboard → Edit
      const p2 = await initProjectAllGlobal(source, fakeHome, project2Dir);
      expect(p2.exitCode, "Project-2 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Verification: Global config should contain projects field with both paths
      const globalConfigPath = configTsPath(fakeHome);
      expect(await fileExists(globalConfigPath), "Global config must exist").toBe(true);

      const globalConfig = await readTestFile(globalConfigPath);
      expect(globalConfig, "Global config must contain projects field").toContain('"projects"');

      // Both project paths should be registered (realpath-normalized)
      const realProject1 = realpathSync(project1Dir);
      const realProject2 = realpathSync(project2Dir);
      expect(globalConfig, "Global config must contain project-1 path").toContain(realProject1);
      expect(globalConfig, "Global config must contain project-2 path").toContain(realProject2);
    },
  );
});

describe.skipIf(!claudeAvailable)("project tracking -- config-types propagation", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "project config-types.ts imports from global install and extends GlobalSkillId",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase A: Init from HOME (global) — establishes the global config-types.ts
      // that the project's config-types.ts must import from.
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Verify global install emitted the standalone (inlined) config-types — the
      // global types file is the source of truth for GlobalSkillId / GlobalAgentName.
      const globalConfigTypesPath = configTypesTsPath(fakeHome);
      const globalTypesContent = await readTestFile(globalConfigTypesPath);
      expect(globalTypesContent, "Global config-types must inline skill IDs").toContain(
        E2E_SKILL.react.id,
      );
      expect(globalTypesContent, "Global config-types must NOT import from itself").not.toContain(
        "as GlobalSkillId",
      );

      // Phase B: Init project via dashboard → Edit with all skills kept at global scope.
      const proj = await initProjectAllGlobal(source, fakeHome, projectDir);
      expect(proj.exitCode, "Project init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Project's config-types.ts must be the IMPORT-AND-EXTEND form, not the
      // standalone/inlined form.
      const projectConfigTypesPath = configTypesTsPath(projectDir);
      expect(await fileExists(projectConfigTypesPath), "Project config-types.ts must exist").toBe(
        true,
      );

      const configTypesContent = await readTestFile(projectConfigTypesPath);
      expect(configTypesContent, "config-types.ts must be auto-generated").toContain(
        "AUTO-GENERATED",
      );

      // Must import GlobalSkillId / GlobalAgentName / GlobalDomain / GlobalCategory
      // from the global config-types.ts
      expect(
        configTypesContent,
        "Project config-types must import SkillId as GlobalSkillId",
      ).toContain("SkillId as GlobalSkillId");
      expect(
        configTypesContent,
        "Project config-types must import AgentName as GlobalAgentName",
      ).toContain("AgentName as GlobalAgentName");
      expect(
        configTypesContent,
        "Project config-types must import Domain as GlobalDomain",
      ).toContain("Domain as GlobalDomain");
      expect(
        configTypesContent,
        "Project config-types must import Category as GlobalCategory",
      ).toContain("Category as GlobalCategory");

      // The union EXTENDS the imported alias rather than restating the global list:
      // a standalone write would name no GlobalSkillId at all.
      expect(
        configTypesContent,
        "Project SkillId must extend GlobalSkillId, not replace it",
      ).toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/);

      // With initProjectAllGlobal every skill stays global-scoped, and the project's
      // own config.ts inlines each of those rows — so its own union has to name them
      // too. Covered by the alias alone, this file goes red the moment a later
      // global-scope run drops one of them.
      expect(
        configTypesContent,
        "Project config-types must name the global skill IDs its config.ts inlines",
      ).toContain(`"${E2E_SKILL.react.id}"`);

      // Global config should have project registered
      const globalConfigPath = configTsPath(fakeHome);
      const globalConfig = await readTestFile(globalConfigPath);
      const realProjectDir = realpathSync(projectDir);
      expect(globalConfig, "Global config must contain project path").toContain(realProjectDir);
    },
  );

  it(
    "cc edit at HOME adding a new global skill preserves project import-and-extend config-types",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      // Phase A: Global init at HOME with the default stack. Installs the
      // baseline stack skills; `web-framework-vue-composition-api` is
      // deliberately NOT in the default stack, so adding it in Phase C is a
      // genuine global-scope addition — not a scope toggle.
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase B: Project init via dashboard → Edit, keeping all skills at
      // global scope. Produces the import-and-extend project config-types.ts
      // that must survive the Phase C global edit unchanged.
      const proj = await initProjectAllGlobal(source, fakeHome, projectDir);
      expect(proj.exitCode, "Project init should succeed").toBe(EXIT_CODES.SUCCESS);

      const projectConfigTypesPath = configTypesTsPath(projectDir);
      const projectTypesBefore = await readTestFile(projectConfigTypesPath);
      // Pre-condition: project types START in the import-and-extend form. If
      // this fails, Phase B regressed — the Phase C assertion would be a
      // vacuous pass because `propagateGlobalChangesToProjects` is the only
      // code path that could restore the import form.
      expect(
        projectTypesBefore,
        "Pre-condition: Phase B must emit import-and-extend project types",
      ).toContain("SkillId as GlobalSkillId");
      expect(projectTypesBefore).toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/);

      // Phase C: `cc edit` at HOME and add `Vue Composition Api` to the
      // global install. This is a new global skill (not in the default
      // stack), so the write path sees a globally-added item and must
      // rewrite every registered project's config-types.ts via
      // `propagateGlobalChangesToProjects`, using the import-and-extend
      // form.
      const editWizard = await EditWizard.launch({
        projectDir: fakeHome,
        source,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      try {
        // Select Vue in the Web domain, then advance through remaining
        // domains (API, Methodology) to reach Sources. The generic
        // passthrough is required because edit-at-HOME carries all domains
        // where the global install has skills — not just Web.
        await editWizard.build.selectSkill(E2E_SKILL["vue-composition-api"].display);
        const sources = await editWizard.build.passThroughAllDomainsGeneric();
        const agents = await sources.acceptDefaults();
        const confirm = await agents.acceptDefaults("edit");
        const result = await confirm.confirm();
        expect(await result.exitCode, "Global edit should succeed").toBe(EXIT_CODES.SUCCESS);
        await result.destroy();
      } catch (e) {
        await editWizard.destroy();
        throw e;
      }

      // Sanity: the global install must actually have grown — otherwise any
      // downstream assertion about propagation is testing the wrong state.
      const globalConfigTypesPath = configTypesTsPath(fakeHome);
      const globalTypesAfter = await readTestFile(globalConfigTypesPath);
      expect(
        globalTypesAfter,
        "Pre-condition: global config-types must inline the newly-added skill after Phase C",
      ).toContain(E2E_SKILL["vue-composition-api"].id);

      // Contract: project config-types.ts must STILL be the import-and-extend
      // form after the global edit. A regression would replace the import
      // form with a standalone/inlined union, flipping every registered
      // project's types file on every global edit.
      const projectTypesAfter = await readTestFile(projectConfigTypesPath);

      expect(projectTypesAfter, "Project config-types must stay AUTO-GENERATED").toContain(
        "AUTO-GENERATED",
      );
      expect(
        projectTypesAfter,
        "Project config-types must still import SkillId as GlobalSkillId after global edit",
      ).toContain("SkillId as GlobalSkillId");
      expect(
        projectTypesAfter,
        "Project config-types must still import AgentName as GlobalAgentName after global edit",
      ).toContain("AgentName as GlobalAgentName");
      expect(
        projectTypesAfter,
        "Project config-types must still import Domain as GlobalDomain after global edit",
      ).toContain("Domain as GlobalDomain");
      expect(
        projectTypesAfter,
        "Project config-types must still import Category as GlobalCategory after global edit",
      ).toContain("Category as GlobalCategory");

      // Still the extend form: the imported alias is the head of the union, not a
      // standalone list that happens to hold the same ids.
      expect(
        projectTypesAfter,
        "Project SkillId must still extend GlobalSkillId after the global edit",
      ).toMatch(/export type SkillId =\s*\|?\s*GlobalSkillId/);

      // A standalone write is discriminated by the absence of the import block
      // and of the `GlobalSkillId` union head, both asserted above. The extend
      // form additionally declares the global rows its sibling config.ts inlines,
      // so their presence is expected rather than evidence of a standalone write:
      // the imported unions cover those rows only for as long as the global
      // config still holds them.
      expect(
        projectTypesAfter,
        "the extend form must declare the newly-added global skill its config.ts now inlines",
      ).toContain(`"${E2E_SKILL["vue-composition-api"].id}"`);

      // Proof the fan-out reached this project rather than leaving it untouched.
      expect(
        projectTypesAfter,
        "the global edit must have rewritten the registered project's config-types",
      ).not.toStrictEqual(projectTypesBefore);
    },
  );
});

describe.skipIf(!claudeAvailable)("project tracking -- deregistration on uninstall", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "should deregister project on uninstall",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 1 },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;
      const project1Dir = path.join(fakeHome, "project-1");
      const project2Dir = path.join(fakeHome, "project-2");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });
      await createPermissionsFile(project1Dir);
      await createPermissionsFile(project2Dir);

      // Phase A: Init from HOME (global)
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase B: Init project-1 via dashboard → Edit
      const p1 = await initProjectAllGlobal(source, fakeHome, project1Dir);
      expect(p1.exitCode, "Project-1 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Phase C: Init project-2 via dashboard → Edit
      const p2 = await initProjectAllGlobal(source, fakeHome, project2Dir);
      expect(p2.exitCode, "Project-2 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Pre-check: Both projects should be registered
      const globalConfigPath = configTsPath(fakeHome);
      const configBefore = await readTestFile(globalConfigPath);
      const realProject1 = realpathSync(project1Dir);
      const realProject2 = realpathSync(project2Dir);
      expect(configBefore, "Both projects should be registered before uninstall").toContain(
        realProject1,
      );
      expect(configBefore, "Both projects should be registered before uninstall").toContain(
        realProject2,
      );

      // Phase D: Uninstall from project-2 (deregistration is now the default)
      const { exitCode, output } = await CLI.run(
        ["uninstall", "--yes"],
        { dir: project2Dir },
        { env: { HOME: fakeHome } },
      );

      expect(exitCode, "Uninstall should succeed").toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

      // Verification: Global config should no longer contain project-2
      const configAfter = await readTestFile(globalConfigPath);
      expect(configAfter, "Global config should still contain project-1").toContain(realProject1);
      expect(
        configAfter,
        "Global config should not contain project-2 after uninstall",
      ).not.toContain(realProject2);
    },
  );
});

describe.skipIf(!claudeAvailable)("project tracking -- stale path filtering", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined!;
  });

  it(
    "should filter stale project paths during registration",
    { timeout: TIMEOUTS.LIFECYCLE, retry: 1 },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;
      const project1Dir = path.join(fakeHome, "project-1");
      const project2Dir = path.join(fakeHome, "project-2");

      await mkdir(project1Dir, { recursive: true });
      await mkdir(project2Dir, { recursive: true });
      await createPermissionsFile(project1Dir);
      await createPermissionsFile(project2Dir);

      // Phase A: Init from HOME (global)
      const globalWizard = await InitWizard.launch({
        source,
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const globalResult = await globalWizard.completeWithDefaults();
      expect(await globalResult.exitCode, "Global init should succeed").toBe(EXIT_CODES.SUCCESS);
      await globalResult.destroy();

      // Phase B: Init project-1 via dashboard → Edit (registers it)
      const p1 = await initProjectAllGlobal(source, fakeHome, project1Dir);
      expect(p1.exitCode, "Project-1 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Phase C: Delete project-1's .claude-src/ directory to make it stale
      const project1ConfigDir = path.join(project1Dir, DIRS.CLAUDE_SRC);
      await rm(project1ConfigDir, { recursive: true, force: true });

      // Phase D: Init project-2 via dashboard → Edit (triggers registration + stale filtering)
      const p2 = await initProjectAllGlobal(source, fakeHome, project2Dir);
      expect(p2.exitCode, "Project-2 init should succeed").toBe(EXIT_CODES.SUCCESS);

      // Verification: Global config should only contain project-2, not stale project-1
      const globalConfigPath = configTsPath(fakeHome);
      const globalConfig = await readTestFile(globalConfigPath);

      const realProject2 = realpathSync(project2Dir);
      expect(globalConfig, "Global config must contain project-2 path").toContain(realProject2);

      // Project-1 should have been filtered out as stale (its config.ts no longer exists)
      const realProject1 = realpathSync(project1Dir);
      expect(globalConfig, "Global config should not contain stale project-1 path").not.toContain(
        realProject1,
      );
    },
  );
});
