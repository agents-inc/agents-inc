import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  fileExists,
  readTestFile,
} from "../helpers/test-utils.js";
import {
  createTestEnvironment,
  initGlobal,
  initGlobalWithEject,
  initProject,
  readAllSkillEntries,
} from "../fixtures/dual-scope-helpers.js";

/**
 * Config/scope integrity E2E tests.
 *
 * These tests verify fixes to config/scope-related bugs:
 *
 * Item 1: Source priority preservation
 * Item 5: Config merger preserving agent scope changes
 * Item 6: Old agent file deletion on scope change
 * Item 7: Stack scope leak filtering
 * Item 9: Global config includes all domains
 * D-92: Global config includes source field after splitConfigByScope
 */

/**
 * Runs init wizard from HOME, accepting defaults with all sources set to local.
 * Caller must launch the wizard and handle cleanup (e.g. via afterEach).
 */
async function initGlobalWithLocalSource(
  wizard: InitWizard,
): Promise<{ exitCode: number; output: string }> {
  // Stack -> Domain -> Build (all domains) -> Sources -> Agents -> Confirm
  const domain = await wizard.stack.selectFirstStack();
  const build = await domain.acceptDefaults();
  const sources = await build.passThroughAllDomains();

  // Sources -- press "l" to set ALL sources to local
  await sources.waitForReady();
  await sources.setAllLocal();
  const agents = await sources.advance();

  // Agents -- accept defaults
  const confirm = await agents.acceptDefaults("init");

  // Confirm
  const result = await confirm.confirm();
  const exitCode = await result.exitCode;
  const output = result.rawOutput;
  await result.destroy();
  return { exitCode, output };
}

describe("config-scope integrity -- source priority preservation", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string;
  let initWizard: InitWizard | undefined;
  let wizard: Awaited<ReturnType<typeof EditWizard.launch>> | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterEach(async () => {
    await initWizard?.destroy();
    initWizard = undefined;
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it(
    "should preserve source: local after edit re-open (not overridden by primarySource)",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome } = env;

      // Phase A: Init from HOME with all sources set to local
      initWizard = await InitWizard.launch({
        source: { sourceDir, tempDir: sourceTempDir },
        projectDir: fakeHome,
        env: { HOME: fakeHome },
      });
      const initResult = await initGlobalWithLocalSource(initWizard);
      expect(initResult.exitCode, `Init failed: ${initResult.output}`).toBe(EXIT_CODES.SUCCESS);

      // Verify Phase A: config has source: "eject"
      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const configAfterInit = await readTestFile(globalConfigPath);
      expect(configAfterInit).toContain('"eject"');

      // Phase B: Edit from HOME -- pass through without changes.
      wizard = await EditWizard.launch({
        projectDir: fakeHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      const result = await wizard.passThrough();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      wizard = undefined;

      // Phase C: every skill must still have source: "eject" — no marketplace override
      const skillEntries = await readAllSkillEntries(fakeHome);
      expect(skillEntries.length).toBeGreaterThanOrEqual(3);
      for (const entry of skillEntries) {
        expect(entry.source, `skill ${entry.id} must keep source "eject"`).toBe("eject");
      }
    },
  );
});

//                + Old agent file deleted on scope change (Item 6)

describe("config-scope integrity -- agent scope change merge and file cleanup", () => {
  // Blocked by D-128: scope toggle from global context should be disabled (no-op).
  it.todo("should ignore scope toggle on global agents when editing from global context");
});

describe("config-scope integrity -- global stack scope filtering", () => {
  // Blocked by D-123: project-scoped skills require local copy, but source path
  // doesn't resolve from consuming projects.
  it.todo("should not reference project-scoped skills in global config stack section");
});

describe("config-scope integrity -- domains in global config only", () => {
  // Blocked by D-123: same as stack scope filtering test above.
  it.todo("should store ALL domains in global config and no domains in project config");
});

describe("config-scope integrity -- config-types Domain type includes config.domains", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string;
  let wizard: Awaited<ReturnType<typeof EditWizard.launch>> | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  it(
    "should include all config.domains in config-types.ts Domain type even when some domains have no skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const fakeHome = path.join(tempDir, "fake-home");

      await mkdir(fakeHome, { recursive: true });
      await createPermissionsFile(fakeHome);

      // Phase A: Init from HOME with eject mode (non-plugin source, no marketplace).
      const initResult = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
      expect(initResult.exitCode, `Phase A init failed`).toBe(EXIT_CODES.SUCCESS);

      // Phase B: Manually edit the config to remove api skills while keeping
      // domains: ["web", "api", "shared"].
      const configPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const originalConfig = await readTestFile(configPath);

      // Remove api-framework-hono from the skills array (but stack refs remain).
      const modifiedConfig = originalConfig.replace(
        /\{[^}]*"id"\s*:\s*"api-framework-hono"[^}]*\},?\s*/g,
        "",
      );

      await writeFile(configPath, modifiedConfig);

      // Verify modification: config should still have domains with "api"
      // but the skills array should not contain api-framework-hono as an id.
      // NOTE: raw-text check on purpose — this config was just hand-mangled by
      // the regex surgery above and may not pass the structural loader's
      // validation; the CLI's own tolerance for it is what Phase C exercises.
      const verifyConfig = await readTestFile(configPath);
      expect(verifyConfig).toContain('"api"');
      const skillsMatch = verifyConfig.match(/const skills[\s\S]*?\];/);
      expect(skillsMatch?.[0] ?? "").not.toContain("api-framework-hono");

      // Phase C: Run edit from HOME -- pass through without changes.
      wizard = await EditWizard.launch({
        projectDir: fakeHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      // Skills were removed from config, so domain count may differ — use generic
      const sources = await wizard.build.passThroughAllDomainsGeneric();
      const agents = await sources.acceptDefaults();
      const confirm = await agents.acceptDefaults("edit");
      const result = await confirm.confirm();
      const exitCodeB = await result.exitCode;
      expect(exitCodeB, `Phase C edit failed`).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      wizard = undefined;

      // Phase D: Verify config-types.ts Domain type includes ALL config.domains
      const configTypesPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS);
      expect(await fileExists(configTypesPath), "config-types.ts must exist after edit").toBe(true);

      const configTypesContent = await readTestFile(configTypesPath);

      // The file must be auto-generated
      expect(configTypesContent).toContain("AUTO-GENERATED");

      // Extract the Domain type union from config-types.ts
      const domainTypeMatch = configTypesContent.match(/export type Domain\s*=\s*([\s\S]*?);/);
      expect(domainTypeMatch, "config-types.ts must contain a Domain type").not.toBeNull();
      const domainTypeBlock = domainTypeMatch![1];

      // All 3 domains must appear in the Domain type -- including "api"
      expect(domainTypeBlock).toContain('"web"');
      expect(domainTypeBlock).toContain('"api"');
      expect(domainTypeBlock).toContain('"meta"');
    },
  );
});

describe("config-scope integrity -- global config includes source field", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  let tempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  // TODO: This test has never passed. The dual-scope local install fails with ENOENT because
  // the skill copier can't resolve source paths in the project context. Plugin mode also
  // falls back to local when no marketplace is registered in the test env. The test itself
  // likely needs restructuring — the D-92 functionality (splitConfigByScope preserving the
  // source field) still needs proper E2E coverage.
  it.skip(
    "should include source field in both global and project configs after scope split",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const env = await createTestEnvironment();
      tempDir = env.tempDir;
      const { fakeHome, projectDir } = env;

      const phaseA = await initGlobal(sourceDir, sourceTempDir, fakeHome);
      expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      const phaseB = await initProject(sourceDir, sourceTempDir, fakeHome, projectDir, {
        setLocal: false,
      });
      expect(phaseB.exitCode, `Phase B init failed: ${phaseB.output}`).toBe(EXIT_CODES.SUCCESS);

      // Phase C: Verify global config includes the source field.
      // Before the D-92 fix, splitConfigByScope did not spread ...config,
      // so source (and marketplace) were lost in the global partition.
      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const globalConfig = await readTestFile(globalConfigPath);

      // The top-level "source" field in the export default block should reference
      // the E2E source directory. The config writer formats it as:
      //   "source": "/path/to/source",
      expect(globalConfig, "Global config must contain a top-level source field").toContain(
        `"source": "${sourceDir}"`,
      );

      // Phase D: Verify project config also includes the source field
      const projectConfigPath = path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const projectConfig = await readTestFile(projectConfigPath);

      expect(projectConfig, "Project config must contain a top-level source field").toContain(
        `"source": "${sourceDir}"`,
      );
    },
  );
});
