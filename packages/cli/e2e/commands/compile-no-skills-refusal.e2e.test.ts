import { describe, it, expect, afterEach } from "vitest";
import path from "path";
import { cleanupTempDir, createTempDir, writeProjectConfig } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { CLI_INVOKE_COMMAND, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { CLI } from "../fixtures/cli.js";

/**
 * The refusal every compile pass with zero discovered skills ends on is the only line
 * that tells the reader what to do next, and the command it hands out has to be one
 * this binary answers. It named `add` for as long as the message existed — a command
 * the CLI has never registered — so the single instruction a stuck user was given
 * exited 127.
 *
 * The claim under test is therefore not that the wording changed. It is that the
 * command the refusal prints is a command the CLI runs, which is why the same
 * constant is both matched in the refusal and invoked afterwards: a probe of a
 * hardcoded command name would prove nothing about what the user was told.
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

    // A config listing a skill while nothing is installed for this scope: every pass
    // discovers zero skills, which is the only route to the refusal below.
    await writeProjectConfig(projectDir, {
      name: "e2e-no-skills-refusal",
      skills: [{ id: E2E_SKILL.react.id, scope: "project", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
    });

    const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(output).toContain(STEP_TEXT.COMPILE_NO_SKILLS_ERROR);
    // Flattened because oclif wraps error text at the terminal width, and where the
    // wrap falls decides whether the invocation straddles two lines.
    expect(flattenCliOutput(output)).toContain(
      `${CLI_INVOKE_COMMAND} ${STEP_TEXT.COMPILE_NO_SKILLS_REMEDY}`,
    );

    const remedy = await CLI.run([STEP_TEXT.COMPILE_NO_SKILLS_REMEDY, "--help"], {
      dir: projectDir,
    });

    expect(remedy.exitCode).toBe(EXIT_CODES.SUCCESS);
  });
});
