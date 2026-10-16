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
  /** Combined stdout + stderr, ANSI-stripped. */
  output: string;
};

export class CLI {
  /**
   * Run a non-interactive CLI command against a project.
   *
   * HOME defaults to `project.globalHome` when the handle names one, so the
   * command reads the same "global" root the setup wrote. It falls back to
   * `project.dir` otherwise. An explicit `options.env.HOME` still wins.
   *
   * `CC_MARKETPLACE` is cleared because it is the CLI's own marketplace override:
   * left inherited, a developer's exported value would point `init` at a marketplace
   * no spec declares. The name is the variable the product reads — this line spent
   * its life spelling a variable nothing has ever set.
   *
   * `XDG_CACHE_HOME` and `GIGET_AUTH` are the rest of that same class, each one a knob a
   * developer's shell may legitimately carry for their own use. Cleared TOGETHER rather than one
   * at a time as each is found to matter, because "nobody exports that" is a fact about this
   * machine — a shared giget cache or a private-repo token reaching a spec is a run whose result
   * belongs to the environment rather than to the code. `AGENTS_INC_API_URL` is the one not
   * cleared but DEFAULTED, by {@link NO_LIVE_SEED_API}, because the product falls back to the
   * live store when it is unset. Every one sits ahead of `options.env`, so a spec that needs a
   * value still names its own. `src/cli/lib/__tests__/e2e-runner-environment.test.ts` is what
   * keeps this list and the other runners' copies of it complete.
   *
   * `VITEST` is cleared for the same class of reason, one layer up: it is the HARNESS's
   * variable, not the product's. A spawned `bin/run.js` is a user's binary and must see what a
   * user's environment holds.
   *
   * `CLAUDE_CONFIG_DIR` is the Claude CLI's equivalent override and is pinned to
   * the effective HOME's own `.claude` — the directory that HOME already implies.
   * It is set rather than merely inherited because it BEATS `HOME`: an exported
   * value would send every `claude plugin` call this command makes into the
   * developer's real installation, past the fake HOME entirely. It is derived
   * after `options.env` is applied, so it follows an overridden HOME rather than
   * contradicting it. `CODEX_HOME` is Codex's equivalent and is pinned beside it,
   * to `<home>/.codex`, for the same reason and in the same position.
   *
   * {@link NO_BACKGROUND_VERSION_CHECK} is the third class again — not hygiene but a race.
   * It stops oclif's update plugin spawning the detached child that writes into the fake
   * HOME's cache dir after this call has already returned. Its own doc carries the mechanism.
   */
  static async run(
    args: string[],
    project: ProjectHandle,
    options?: {
      env?: Record<string, string | undefined>;
      /**
       * Written to the spawned process's stdin, which also makes stdin a PIPE rather than a TTY.
       *
       * Both halves matter to a command that reads one. `execa` gives a child with no `input` an
       * inherited stdin, and under vitest that is not a terminal either — so a spec proving a
       * command refuses an empty pipe and a spec proving it reads a full one differ only by this
       * option, and neither can be written without it.
       */
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
        VITEST: undefined,
        ...options?.env,
        HOME: home,
        CLAUDE_CONFIG_DIR: claudeConfigDir(home),
        CODEX_HOME: codexHome(home),
        // The product resolves its Codex host's binary BY NAME, in THIS child, so pinning
        // `CODEX_HOME` above is only half of what a Codex spec needs — see `codex-on-path.ts`.
        //
        // PREPENDED to whatever PATH is in effect, never replacing it, and that is the whole of
        // the difference between this line and the two above. Those pin a value a spec must not
        // be able to override; a PATH is the opposite — `update`'s "the Claude CLI is missing"
        // cases hand over a PATH with no `claude` on it, and a pin would have handed the developer's
        // own back and made every one of them a test of this machine.
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
