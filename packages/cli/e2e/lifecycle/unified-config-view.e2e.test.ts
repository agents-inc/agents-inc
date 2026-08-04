import path from "path";
import { describe, it, expect, afterEach, beforeAll } from "vitest";
import { EXIT_CODES } from "../pages/constants.js";
import { cleanupTempDir, ensureBinaryExists } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder, type DualScopeHandle } from "../fixtures/project-builder.js";
import "../matchers/setup.js";

/**
 * Unified config view -- dual-scope compile verification E2E test.
 *
 * Verifies that a project with both global and project configs can compile.
 */
describe("unified config view -- split writes", () => {
  let handle: DualScopeHandle;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (handle) {
      // Clean up the temp dir that contains both global and project
      const tempDir = path.dirname(handle.project.dir);
      await cleanupTempDir(tempDir);
    }
  });

  describe("dual-scope compile verification", () => {
    it("should compile agents from project with global-only config", async () => {
      handle = await ProjectBuilder.dualScopeWithImport();
      const projectDir = handle.project.dir;
      const globalHome = handle.globalHome.dir;

      // Run compile from the project directory with HOME pointing to fake-home
      const { exitCode, output } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered");

      // Verify agents were compiled in the project directory
      await expect({ dir: projectDir }).toHaveCompiledAgents();
    });
  });
});
