import { execa } from "execa";
import { stripVTControlCharacters } from "node:util";
import type { ProjectHandle } from "../pages/wizard-result.js";
import { BIN_RUN } from "../helpers/test-utils.js";

export type CLIResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** Combined stdout + stderr, ANSI-stripped. */
  output: string;
};

export class CLI {
  /**
   * Run a non-interactive CLI command against a project.
   *
   * HOME defaults to `project.globalHome` when the wizard that produced this
   * handle installed content into an explicit global HOME (launchInProject /
   * launchInGlobal), so the command reads the same "global" root the wizard
   * wrote. It falls back to `project.dir` otherwise — byte-identical to the
   * previous hardcoded default for handles that carry no globalHome. An
   * explicit `options.env.HOME` still wins.
   *
   * `CC_SOURCE` is cleared because it is the CLI's own source override
   * (`SOURCE_ENV_VAR`): left inherited, a developer's exported value would point
   * `init` at a marketplace no spec declares. The name is the constant the product
   * reads — this line spent its life spelling a variable nothing has ever set.
   */
  static async run(
    args: string[],
    project: ProjectHandle,
    options?: { env?: Record<string, string | undefined> },
  ): Promise<CLIResult> {
    const result = await execa("node", [BIN_RUN, ...args], {
      cwd: project.dir,
      reject: false,
      env: {
        HOME: project.globalHome ?? project.dir,
        CC_SOURCE: undefined,
        ...options?.env,
      },
    });

    return {
      exitCode: result.exitCode ?? 1,
      stdout: stripVTControlCharacters(result.stdout),
      stderr: stripVTControlCharacters(result.stderr),
      output: stripVTControlCharacters(result.stdout + result.stderr),
    };
  }
}
