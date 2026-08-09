import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  configTsPath,
  configTypesTsPath,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  fileExists,
  loadConfigOrFail,
  readTestFile,
} from "../helpers/test-utils.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  createTestEnvironment,
  finishWizard,
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

/** The domain whose skills the config-types spec strips while keeping the domain declared. */
const API_DOMAIN = "api";

/**
 * A domain the E2E source has no skills for, so no config under test declares it.
 * The generated `Domain` type must therefore not carry it — the negative that a
 * type listing every known domain would fail.
 */
const UNDECLARED_DOMAIN = "mobile";

/**
 * Runs init wizard from HOME, accepting defaults with all sources set to local.
 * Caller must launch the wizard and handle cleanup (e.g. via afterEach).
 */
async function initGlobalWithLocalSource(
  wizard: InitWizard,
): Promise<{ exitCode: number; output: string }> {
  // Stack -> Domain -> Build (all domains) -> Sources -> Agents -> Confirm
  return finishWizard(await completeWithLocalSources(wizard));
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
  }, TIMEOUTS.SETUP_DUAL);

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
      const globalConfigPath = configTsPath(fakeHome);
      const configAfterInit = await readTestFile(globalConfigPath);
      expect(configAfterInit).toContain('"eject"');

      // The entries the install wrote. Captured rather than counted: Phase C used
      // to open on `skillEntries.length >= 3`, and three wrong entries pass a floor
      // exactly as three right ones do.
      const entriesAfterInit = await readAllSkillEntries(fakeHome);
      expect(
        entriesAfterInit.map((entry) => entry.id),
        "the default install must include react, or the comparison below is vacuous",
      ).toContain(E2E_SKILL.react.id);

      // Phase B: Edit from HOME -- pass through without changes.
      wizard = await EditWizard.launch({
        projectDir: fakeHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      const result = await wizard.passThrough();
      const exitCode = await result.exitCode;
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      await result.destroy();
      wizard = undefined;

      // Phase C: the pass-through edit returned every entry exactly as the install
      // left it — same members, same order, same source.
      const skillEntries = await readAllSkillEntries(fakeHome);
      expect(skillEntries, "a no-change edit must not rewrite any skill entry").toStrictEqual(
        entriesAfterInit,
      );
      for (const entry of skillEntries) {
        expect(entry.source, `skill  must keep source "eject"`).toBe("eject");
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
  }, TIMEOUTS.SETUP_DUAL);

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
      const configPath = configTsPath(fakeHome);
      const originalConfig = await readTestFile(configPath);

      // Remove every api-framework-hono object entry: its `skills[]` record, and in
      // the stack the preloaded assignment, which the writer emits bare at the
      // category-value position because `api-api` is exclusive. The optional
      // `"<category>": ` prefix takes that whole property with it, so no key is left
      // without a value. `[^{}]*` (not `[^}]*`) keeps each match inside the innermost
      // object so the surrounding stack/agent braces stay balanced — the result is a
      // structurally VALID config in which the "api" domain simply has no skills.
      const modifiedConfig = originalConfig.replace(
        /(?:"[\w-]+"\s*:\s*)?\{[^{}]*"id"\s*:\s*"api-framework-hono"[^{}]*\},?\s*/g,
        "",
      );

      await writeFile(configPath, modifiedConfig);

      // The config must remain loadable — a corrupt config is (correctly) rejected
      // by edit, so a broken fixture would fail Phase C for the wrong reason. Read
      // it structurally: a regex scan over the text answers "no match" and "no such
      // skill" with the same empty string, so a format change would satisfy the
      // negative for free and the edited fixture would go unverified.
      const editedConfig = await loadConfigOrFail(fakeHome);
      expect(editedConfig.selectedDomains).toContain(API_DOMAIN);
      expect(editedConfig.skills.map((skill) => skill.id)).not.toContain(E2E_SKILL.hono.id);

      // Phase C: Run edit from HOME -- pass through without changes.
      wizard = await EditWizard.launch({
        projectDir: fakeHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
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
      const configTypesPath = configTypesTsPath(fakeHome);
      expect(await fileExists(configTypesPath), "config-types.ts must exist after edit").toBe(true);

      const configTypesContent = await readTestFile(configTypesPath);

      // The file must be auto-generated
      expect(configTypesContent).toContain("AUTO-GENERATED");

      // Extract the Domain type union from config-types.ts
      const domainTypeMatch = configTypesContent.match(/export type Domain\s*=\s*([\s\S]*?);/);
      expect(domainTypeMatch, "config-types.ts must contain a Domain type").not.toBeNull();
      const domainTypeBlock = domainTypeMatch![1];

      // Every domain the config declares must appear in the Domain type -- including
      // "api", whose skills were removed. The negative names a domain the config
      // never declared, so a Domain type that simply lists every known domain (and
      // would therefore pass the positives without reading the config) fails here.
      for (const domain of editedConfig.selectedDomains ?? []) {
        expect(domainTypeBlock).toContain(`"${domain}"`);
      }
      expect(domainTypeBlock).not.toContain(`"${UNDECLARED_DOMAIN}"`);
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
  }, TIMEOUTS.SETUP_DUAL);

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
      const globalConfigPath = configTsPath(fakeHome);
      const globalConfig = await readTestFile(globalConfigPath);

      // The top-level "source" field in the export default block should reference
      // the E2E source directory. The config writer formats it as:
      //   "source": "/path/to/source",
      expect(globalConfig, "Global config must contain a top-level source field").toContain(
        `"source": "${sourceDir}"`,
      );

      // Phase D: Verify project config also includes the source field
      const projectConfigPath = configTsPath(projectDir);
      const projectConfig = await readTestFile(projectConfigPath);

      expect(projectConfig, "Project config must contain a top-level source field").toContain(
        `"source": "${sourceDir}"`,
      );
    },
  );
});
