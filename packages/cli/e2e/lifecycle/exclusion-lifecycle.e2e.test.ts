import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import "../matchers/setup.js";
import { expectDualScopeInstallation } from "../assertions/scope-assertions.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { TIMEOUTS, EXIT_CODES, TERMINAL_SIZE } from "../pages/constants.js";
import { EditWizard } from "../pages/wizards/edit-wizard.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
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
  beforeAll(async () => {
    await ensureBinaryExists();
  }, TIMEOUTS.SETUP);

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

      await setupDualScopeWithEject(E2E_SOURCE, fakeHome, projectDir);

      // --- User-visible outcomes after setup ---

      // 1. Both scopes have correct config and compiled agents
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id],
          agents: [],
        },
        project: {
          skillIds: [E2E_SKILL.hono.id],
          agents: ["api-developer"],
        },
      });
      //    web-developer stayed global → its .md should be at global scope
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // 2. Global agent files from Phase A still exist (untouched)
      await expect({ dir: fakeHome }).toHaveCompiledAgent("api-developer");
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // Excluded tombstone entries must exist in project config
      const configWithExclusions = await readTestFile(configTsPath(projectDir));
      expect(configWithExclusions).toContain('"excluded":true');

      // Snapshot config before passthrough edit
      const configBeforeEdit = await readTestFile(configTsPath(projectDir));

      // ================================================================
      // Phase C: Edit passthrough — navigate through without changes
      // ================================================================

      const editWizard = await EditWizard.launch({
        projectDir,
        source: E2E_SOURCE,
        env: { HOME: fakeHome },
        ...TERMINAL_SIZE.TALL,
      });

      // The badge on the skill whose scope this phase pins, read off the live build
      // grid. `rawOutput.toContain("[G]")` / `("[P]")` stood here — two-character
      // substrings on a whole session's output, which cannot say which skill they
      // belong to, in a file whose sibling assertions all use `toStrictEqual`.
      expect(
        await editWizard.build.getScopeBadgesForSkill(E2E_SKILL.react.display),
        "react is global-only after the exclusion phase above",
      ).toStrictEqual(["G"]);

      const editResult = await editWizard.passThrough();
      const editExitCode = await editResult.exitCode;
      expect(editExitCode).toBe(EXIT_CODES.SUCCESS);

      await editResult.destroy();

      // --- User-visible outcomes after edit passthrough ---

      // 5. Both scopes have correct config and compiled agents after edit passthrough
      await expectDualScopeInstallation(fakeHome, projectDir, {
        global: {
          skillIds: [E2E_SKILL.react.id, E2E_SKILL.hono.id],
          agents: [],
        },
        project: {
          skillIds: [E2E_SKILL.hono.id],
          agents: ["api-developer"],
        },
      });
      await expect({ dir: fakeHome }).toHaveCompiledAgent("web-developer");

      // Verify config unchanged by passthrough
      const configAfterEdit = await readTestFile(configTsPath(projectDir));
      expect(configAfterEdit).toStrictEqual(configBeforeEdit);

      // 8. api-developer agent at project scope carries its own domain's skill
      // alone — relevance-scoped assignment keeps the web skill off it.
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("api-developer", {
        contains: [E2E_SKILL.hono.id],
        notContains: [E2E_SKILL.react.id],
      });

      // 8b. web-developer agent at global scope carries the web skill alone.
      await expect({ dir: fakeHome }).toHaveCompiledAgentContent("web-developer", {
        contains: [E2E_SKILL.react.id],
        notContains: [E2E_SKILL.hono.id],
      });

      // 9. No duplicate agent files in either scope directory
      const projectAgentFiles = await listFiles(agentsPath(projectDir));
      const globalAgentFiles = await listFiles(agentsPath(fakeHome));
      const projectMdFiles = projectAgentFiles.filter((f) => f.endsWith(".md"));
      const globalMdFiles = globalAgentFiles.filter((f) => f.endsWith(".md"));
      const projectDupes = projectMdFiles.filter((f, i) => projectMdFiles.indexOf(f) !== i);
      const globalDupes = globalMdFiles.filter((f, i) => globalMdFiles.indexOf(f) !== i);
      expect(projectDupes, "Duplicate agent files in project dir").toStrictEqual([]);
      expect(globalDupes, "Duplicate agent files in global dir").toStrictEqual([]);
    },
  );
});
