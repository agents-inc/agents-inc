import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { expectPhaseSuccess } from "../assertions/phase-assertions.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { E2E_AGENTS } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
  isClaudeCLIAvailable,
  normalizeGlobalConfig,
  readTestFile,
} from "../helpers/test-utils.js";
import { loadProjectConfigFromDir } from "../../src/cli/lib/configuration/project-config.js";
import {
  createTestEnvironment,
  initGlobal,
  initGlobalWithEject,
  initProject,
  setupDualScopeWithEject,
} from "../fixtures/dual-scope-helpers.js";

const claudeAvailable = await isClaudeCLIAvailable();

/**
 * Dual-scope edit lifecycle E2E test -- agent content and config integrity.
 *
 */

describe("dual-scope edit lifecycle -- agent content and config integrity", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
    await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);
  });

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Compiled agents contain only their assigned skills",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Verify both scopes have correct config and compiled agents
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          agents: [...E2E_AGENTS.WEB],
        },
        project: {
          skillIds: ["api-framework-hono"],
          agents: [...E2E_AGENTS.API],
        },
      });

      // web-developer (global) contains its preloaded skills and all selected skills
      await expect({ dir: fakeHome }).toHaveAgentFrontmatter("web-developer", {
        skills: ["web-framework-react"],
      });
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["api-framework-hono"],
      });

      // api-developer (project) contains its assigned skill and all selected skills
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("api-developer", {
        skills: ["api-framework-hono"],
      });
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["web-framework-react"],
      });
    },
  );

  it(
    "Cross-cutting meta skills appear in both agents compiled output",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // web-developer (global) contains both cross-cutting meta skills
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["meta-reviewing-reviewing", "meta-methodology-research-methodology"],
      });

      // api-developer (project) also contains both cross-cutting meta skills
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["meta-reviewing-reviewing", "meta-methodology-research-methodology"],
      });
    },
  );
});

describe.skipIf(!claudeAvailable)("dual-scope edit lifecycle -- config preservation", () => {
  let pluginFixture: E2EPluginSource;

  beforeAll(async () => {
    await ensureBinaryExists();
    // Marketplace name "agents-inc" matches DEFAULT_PUBLIC_SOURCE_NAME so the
    // saved config source field is "agents-inc" — the exact value this test
    // asserts on to verify marketplace source preservation.
    pluginFixture = await createE2EPluginSource({ marketplaceName: "agents-inc" });
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (pluginFixture) await cleanupTempDir(pluginFixture.tempDir);
  });

  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
  });

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Config split preserves source fields after edit",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Phase A: Init global (completeWithDefaults — marketplace source "agents-inc")
      const phaseA = await initGlobal(pluginFixture.sourceDir, pluginFixture.tempDir, fakeHome);
      await expectPhaseSuccess(
        { project: { dir: fakeHome }, exitCode: phaseA.exitCode },
        {
          skillIds: [
            "web-framework-react",
            "web-testing-vitest",
            "web-state-zustand",
            "api-framework-hono",
          ],
          agents: E2E_AGENTS.WEB_AND_API,
          source: "agents-inc",
        },
      );
      const globalConfigPath = path.join(fakeHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const globalConfigAfterA = await readTestFile(globalConfigPath);

      // Phase B: Init project with scope toggling (eject for project-scoped skills)
      const phaseB = await initProject(
        pluginFixture.sourceDir,
        pluginFixture.tempDir,
        fakeHome,
        projectDir,
      );
      await expectPhaseSuccess(
        { project: { dir: projectDir }, exitCode: phaseB.exitCode },
        {
          skillIds: ["api-framework-hono"],
          agents: [...E2E_AGENTS.API],
          source: "eject",
        },
      );

      // Assert: global config data is preserved (project init must never modify global config)
      // Strip "projects" tracking line and sort to ignore property reordering from re-serialization
      const globalConfigAfterB = await readTestFile(globalConfigPath);
      expect(globalConfigAfterB).toContain("agents-inc");
      expect(normalizeGlobalConfig(globalConfigAfterB)).toStrictEqual(
        normalizeGlobalConfig(globalConfigAfterA),
      );
    },
  );
});

describe("dual-scope edit lifecycle -- eject scope toggle copies skill to project", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
  });

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Globally-ejected skill toggled to project scope exists at both paths",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);

      // Assert: api-framework-hono exists at both project and global paths
      await expect({ dir: projectDir }).toHaveSkillCopied("api-framework-hono");
      await expect({ dir: fakeHome }).toHaveSkillCopied("api-framework-hono");

      // Assert: dual-scope config and compiled agents are correct
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "web-testing-vitest", "web-state-zustand"],
          agents: [...E2E_AGENTS.WEB],
        },
        project: {
          skillIds: ["api-framework-hono"],
          agents: [...E2E_AGENTS.API],
        },
      });
    },
  );
});

describe("dual-scope edit lifecycle -- stack field preserves selected agents", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP * 2);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(async () => {
    const { tempDir, fakeHome: fh, projectDir: pd } = await createTestEnvironment();
    testTempDir = tempDir;
    fakeHome = fh;
    projectDir = pd;
  });

  afterEach(async () => {
    await cleanupTempDir(testTempDir);
  });

  it(
    "Stack field contains only selected agents and survives passthrough edit",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      // Phase A: Global init with eject (all agents selected by default)
      const phaseA = await initGlobalWithEject(sourceDir, sourceTempDir, fakeHome);
      expect(phaseA.exitCode, `Phase A init failed: ${phaseA.output}`).toBe(EXIT_CODES.SUCCESS);

      // Load config.ts structurally and read the stack's agent keys
      const readStackAgentKeys = async (): Promise<string[]> => {
        const loaded = await loadProjectConfigFromDir(fakeHome);
        expect(loaded, `config.ts must exist at ${fakeHome}`).not.toBeNull();
        const stack = loaded?.config.stack;
        expect(stack, "Config must have a stack variable").toBeDefined();
        return Object.keys(stack ?? {}).sort();
      };

      const stackKeysAfterInit = await readStackAgentKeys();

      // Stack must contain both agents from the E2E test stack
      expect(stackKeysAfterInit).toContain("web-developer");
      expect(stackKeysAfterInit).toContain("api-developer");

      // Phase B: Edit wizard passthrough (no changes)
      const wizard = await EditWizard.launch({
        projectDir: fakeHome,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      const result = await wizard.passThrough();
      const exitCode = await result.exitCode;
      expect(exitCode, "Edit passthrough must succeed").toBe(EXIT_CODES.SUCCESS);
      await result.destroy();

      // Stack must still contain the same agents (no agents added or removed)
      const stackKeysAfterEdit = await readStackAgentKeys();
      expect(stackKeysAfterEdit).toContain("web-developer");
      expect(stackKeysAfterEdit).toContain("api-developer");
      expect(stackKeysAfterEdit).toStrictEqual(stackKeysAfterInit);
    },
  );
});
