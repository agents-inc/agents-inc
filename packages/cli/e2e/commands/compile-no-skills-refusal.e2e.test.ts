import { describe, it, expect, afterEach } from "vitest";
import path from "path";
import { cleanupTempDir, createTempDir, writeProjectConfig } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { CLI_INVOKE_COMMAND, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";

/**
 * The no-skills refusal names a command this binary answers: the same constant is matched in the
 * refusal and then invoked.
 */
describe("compile's no-skills refusal names a command the CLI answers", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("hands out an invocation this binary runs", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");

    // A configured skill with nothing installed: the only route to the refusal.
    await writeProjectConfig(projectDir, {
      name: "e2e-no-skills-refusal",
      skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
    });

    const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(output).toContain(STEP_TEXT.COMPILE_NO_SKILLS_ERROR);
    // Flattened: oclif's wrap could split the invocation across lines.
    expect(flattenCliOutput(output)).toContain(
      `${CLI_INVOKE_COMMAND} ${STEP_TEXT.COMPILE_NO_SKILLS_REMEDY}`,
    );

    const remedy = await CLI.run([STEP_TEXT.COMPILE_NO_SKILLS_REMEDY, "--help"], {
      dir: projectDir,
    });

    expect(remedy.exitCode).toBe(EXIT_CODES.SUCCESS);
  });
});
