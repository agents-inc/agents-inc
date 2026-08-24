import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { EXIT_CODES } from "../pages/constants.js";
import { cleanupTempDir, readCompiledAgents } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder, type DualScopeHandle } from "../fixtures/project-builder.js";
import "../matchers/setup.js";

/**
 * Unified config view -- dual-scope compile verification E2E test.
 *
 * Verifies that a project with both global and project configs can compile.
 */
describe("unified config view -- split writes", () => {
  let handle: DualScopeHandle | undefined;

  afterEach(async () => {
    // The temp dir contains both global and project.
    if (handle) await cleanupTempDir(path.dirname(handle.project.dir));
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
      // The count, not the word. `toContain("Discovered")` matched a run that found
      // zero local skills exactly as one that found both scopes' — which is the
      // whole point of an imported global config.
      expect(output).toContain("Discovered 2 local skills");

      // The project scope holds the agent its own config adds and nothing else. A
      // parameterless `toHaveCompiledAgents()` stood here and proved only that the
      // directory is non-empty — the global half alone would satisfy it, and so
      // would a run that wrote the global agent into the project scope.
      expect(Object.keys(await readCompiledAgents(projectDir))).toStrictEqual(["api-developer.md"]);
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("api-developer", {
        name: "api-developer",
      });
    });
  });
});
