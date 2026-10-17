import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import { EXIT_CODES } from "../pages/constants.js";
import { cleanupTempDir, readCompiledAgents } from "../helpers/test-utils.js";
import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder, type DualScopeHandle } from "../fixtures/project-builder.js";
import "../matchers/setup.js";

/** A project with both global and project configs compiles. */
describe("unified config view -- split writes", () => {
  let handle: DualScopeHandle | undefined;

  afterEach(async () => {
    if (handle) await cleanupTempDir(path.dirname(handle.project.dir));
  });

  describe("dual-scope compile verification", () => {
    it("should compile agents from project with global-only config", async () => {
      handle = await ProjectBuilder.dualScopeWithImport();
      const projectDir = handle.project.dir;
      const globalHome = handle.globalHome.dir;

      const { exitCode, output } = await CLI.run(
        ["compile"],
        { dir: projectDir },
        { env: { HOME: globalHome } },
      );

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      // The count: a bare "Discovered" matches a run that found zero local skills.
      expect(output).toContain("Discovered 2 local skills");

      // Only the project's own agent: a non-empty check passes for a stray global agent too.
      expect(Object.keys(await readCompiledAgents(projectDir))).toStrictEqual(["api-developer.md"]);
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("api-developer", {
        name: "api-developer",
      });
    });
  });
});
