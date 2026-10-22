import { execa } from "execa";
import { globalHomeFor } from "../../src/cli/lib/__tests__/helpers/global-home.js";
import { stripVTControlCharacters } from "node:util";
import type { ProjectHandle } from "./project-handle.js";
import {
  BIN_RUN,
  NO_BACKGROUND_VERSION_CHECK,
  NO_LIVE_SEED_API,
  claudeConfigDir,
  codexHome,
} from "../helpers/test-utils.js";
import { withCodexOnIt } from "./codex-on-path.js";

export type CLIResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  output: string;
};

export class CLI {
  // HOME defaults to the handle's global home. Developer-shell overrides (CC_MARKETPLACE, XDG_CACHE_HOME,
  // GIGET_AUTH, AGENTS_INC_EDITOR_URL, VITEST) are cleared; CLAUDE_CONFIG_DIR and CODEX_HOME are pinned
  // after `options.env` because they beat HOME. e2e-runner-environment.test.ts keeps the runners' lists
  // in step.
  static async run(
    args: string[],
    project: ProjectHandle,
    options?: {
      env?: Record<string, string | undefined>;
      /** Also makes stdin a pipe rather than an inherited non-TTY. */
      input?: string;
    },
  ): Promise<CLIResult> {
    const home = options?.env?.HOME ?? globalHomeFor(project);
    const result = await execa("node", [BIN_RUN, ...args], {
      cwd: project.dir,
      reject: false,
      ...(options?.input !== undefined && { input: options.input }),
      env: {
        ...NO_BACKGROUND_VERSION_CHECK,
        ...NO_LIVE_SEED_API,
        CC_MARKETPLACE: undefined,
        XDG_CACHE_HOME: undefined,
        GIGET_AUTH: undefined,
        AGENTS_INC_EDITOR_URL: undefined,
        VITEST: undefined,
        ...options?.env,
        HOME: home,
        CLAUDE_CONFIG_DIR: claudeConfigDir(home),
        CODEX_HOME: codexHome(home),
        // Prepended, not pinned: some specs hand over a PATH deliberately missing `claude`.
        PATH: withCodexOnIt(options?.env?.["PATH"]),
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
