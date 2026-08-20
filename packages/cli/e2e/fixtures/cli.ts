import { execa } from "execa";
import { stripVTControlCharacters } from "node:util";
import type { ProjectHandle } from "../pages/wizard-result.js";
import { BIN_RUN, NO_BACKGROUND_VERSION_CHECK, claudeConfigDir } from "../helpers/test-utils.js";

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
   * `CC_MARKETPLACE` is cleared because it is the CLI's own marketplace override:
   * left inherited, a developer's exported value would point `init` at a marketplace
   * no spec declares. The name is the variable the product reads — this line spent
   * its life spelling a variable nothing has ever set.
   *
   * `AGENTS_INC_API_URL`, `XDG_CACHE_HOME` and `GIGET_AUTH` are the rest of that same class:
   * every remaining variable `src/cli/` reads by name, each one a knob a developer's shell may
   * legitimately carry for their own use. Cleared TOGETHER rather than one at a time as each is
   * found to matter, because "nobody exports that" is a fact about this machine — a shared
   * giget cache, a staging seed API or a private-repo token reaching a spec is a run whose
   * result belongs to the environment rather than to the code. Every one sits ahead of
   * `options.env`, so a spec that needs a value still names its own.
   * `src/cli/lib/__tests__/e2e-runner-environment.test.ts` is what keeps this list and the PTY
   * harness's copy of it complete.
   *
   * `VITEST` is cleared for the same class of reason, one layer up: it is the HARNESS's
   * variable, not the product's, and `warn({ suppressInTest: true })`
   * (`src/cli/utils/logger.ts`) reads it. Inherited, it silences user-facing warnings in
   * every spawned binary — so a spec asserting one of those lines passes by not looking,
   * and the only way to see them is to run the command outside vitest. A spawned
   * `bin/run.js` is a user's binary and must print what a user would be shown.
   *
   * `CLAUDE_CONFIG_DIR` is the Claude CLI's equivalent override and is pinned to
   * the effective HOME's own `.claude` — the directory that HOME already implies.
   * It is set rather than merely inherited because it BEATS `HOME`: an exported
   * value would send every `claude plugin` call this command makes into the
   * developer's real installation, past the fake HOME entirely. It is derived
   * after `options.env` is applied, so it follows an overridden HOME rather than
   * contradicting it.
   *
   * {@link NO_BACKGROUND_VERSION_CHECK} is the third class again — not hygiene but a race.
   * It stops oclif's update plugin spawning the detached child that writes into the fake
   * HOME's cache dir after this call has already returned. Its own doc carries the mechanism.
   */
  static async run(
    args: string[],
    project: ProjectHandle,
    options?: { env?: Record<string, string | undefined> },
  ): Promise<CLIResult> {
    const home = options?.env?.HOME ?? project.globalHome ?? project.dir;
    const result = await execa("node", [BIN_RUN, ...args], {
      cwd: project.dir,
      reject: false,
      env: {
        ...NO_BACKGROUND_VERSION_CHECK,
        CC_MARKETPLACE: undefined,
        AGENTS_INC_API_URL: undefined,
        XDG_CACHE_HOME: undefined,
        GIGET_AUTH: undefined,
        VITEST: undefined,
        ...options?.env,
        HOME: home,
        CLAUDE_CONFIG_DIR: claudeConfigDir(home),
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
