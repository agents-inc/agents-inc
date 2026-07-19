import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { TIMEOUTS, EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  cleanupTempDir,
  ensureBinaryExists,
  listFiles,
  readTestFile,
} from "../helpers/test-utils.js";
import { createTestEnvironment, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";

/**
 * Exclusion lifecycle E2E test.
 *
 * Verifies user-visible outcomes after scope toggling in a dual-scope environment:
 * - Agent files land in the correct scope directory
 * - Scope badges persist through edit passthroughs
 * - Global installations are never modified by project-level operations
 */

describe("exclusion lifecycle: scope toggle persistence and file placement", () => {
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  let testTempDir: string | undefined;

  afterEach(async () => {
    if (testTempDir) {
      await cleanupTempDir(testTempDir);
      testTempDir = undefined;
    }
  });

  it(
    "should place agent files at correct scope and persist through edit passthrough",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const { tempDir, fakeHome, projectDir } = await createTestEnvironment();
      testTempDir = tempDir;

      // ================================================================
      // Phase A+B: setupDualScope
      // Phase A inits globally (all skills/agents at global scope).
      // Phase B inits from project, toggling api-framework-hono to project
      // scope and api-developer agent to project scope.
      // ================================================================

      await setupDualScopeWithEject(sourceDir, sourceTempDir, fakeHome, projectDir);

      // --- User-visible outcomes after setup ---

      // 1. Both scopes have correct config and compiled agents
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "api-framework-hono"],
          agents: [],
        },
        project: {
          skillIds: ["api-framework-hono"],
          agents: ["api-developer"],
        },
      });
      //    web-developer stayed global → its .md should be at global scope
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // 2. Global agent files from Phase A still exist (untouched)
      await expect({ dir: fakeHome }).toHaveCompiledAgent("api-developer");
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // Excluded tombstone entries must exist in project config
      const configWithExclusions = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(configWithExclusions).toContain('"excluded":true');

      // Snapshot config before passthrough edit
      const configBeforeEdit = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );

      // ================================================================
      // Phase C: Edit passthrough — navigate through without changes
      // ================================================================

      const editWizard = await EditWizard.launch({
        projectDir,
        source: { sourceDir, tempDir: sourceTempDir },
        env: { HOME: fakeHome },
        rows: 60,
        cols: 120,
      });

      const editResult = await editWizard.passThrough();
      const editExitCode = await editResult.exitCode;
      expect(editExitCode).toBe(EXIT_CODES.SUCCESS);

      // Edit passthrough shows scope badges in the output
      const rawOutput = editResult.rawOutput;
      expect(rawOutput).toContain("[G]");
      expect(rawOutput).toContain("[P]");

      await editResult.destroy();

      // --- User-visible outcomes after edit passthrough ---

      // 5. Both scopes have correct config and compiled agents after edit passthrough
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: ["web-framework-react", "api-framework-hono"],
          agents: [],
        },
        project: {
          skillIds: ["api-framework-hono"],
          agents: ["api-developer"],
        },
      });
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // Verify config unchanged by passthrough
      const configAfterEdit = await readTestFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
      );
      expect(configAfterEdit).toStrictEqual(configBeforeEdit);

      // 8. api-developer agent at project scope contains all selected skills
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: ["api-framework-hono", "web-framework-react"],
      });

      // 8b. web-developer agent at global scope contains all selected skills
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: ["web-framework-react", "api-framework-hono"],
      });

      // 9. No duplicate agent files in either scope directory
      const projectAgentFiles = await listFiles(path.join(projectDir, DIRS.CLAUDE, DIRS.AGENTS));
      const globalAgentFiles = await listFiles(path.join(fakeHome, DIRS.CLAUDE, DIRS.AGENTS));
      const projectMdFiles = projectAgentFiles.filter((f) => f.endsWith(".md"));
      const globalMdFiles = globalAgentFiles.filter((f) => f.endsWith(".md"));
      const projectDupes = projectMdFiles.filter((f, i) => projectMdFiles.indexOf(f) !== i);
      const globalDupes = globalMdFiles.filter((f, i) => globalMdFiles.indexOf(f) !== i);
      expect(projectDupes, "Duplicate agent files in project dir").toStrictEqual([]);
      expect(globalDupes, "Duplicate agent files in global dir").toStrictEqual([]);
    },
  );
});
