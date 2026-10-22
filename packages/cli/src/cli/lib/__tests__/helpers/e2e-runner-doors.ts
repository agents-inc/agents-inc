import { SOURCE_ENV_VAR } from "../../configuration/config.js";
import { CLAUDE_CONFIG_DIR_VAR, CODEX_HOME_VAR } from "../../installation/install-layout.js";

/**
 * Every way the E2E suite starts the binary. `e2e-runner-rosters-match-the-tree.test.ts` holds it to
 * the doors `scripts/check-spawn-doors.ts` finds; `e2e-runner-environment.test.ts` drives each one.
 */
export const E2E_RUNNER_DOORS = [
  {
    runner: "e2e/fixtures/cli.ts",
    spawns: "the non-interactive command runner",
    spawnedBy: "execa",
  },
  { runner: "e2e/helpers/terminal-session.ts", spawns: "the PTY harness", spawnedBy: "pty.spawn" },
  {
    runner: "e2e/helpers/test-utils.ts",
    spawns: "the bare-directory command runner",
    spawnedBy: "execa",
  },
] as const;

export type E2eRunner = (typeof E2E_RUNNER_DOORS)[number]["runner"];

/** Held against the product's reads: a new read nobody clears must move this line before it ships. */
export const NAMED_ENV_READS = ["AGENTS_INC_API_URL", "GIGET_AUTH", "XDG_CACHE_HOME"] as const;

/** Resolved from the constants, so a renamed variable moves what runners must clear. */
export const ENV_READS_BY_CONSTANT = {
  CLAUDE_CONFIG_DIR_VAR,
  CODEX_HOME_VAR,
  SOURCE_ENV_VAR,
} as const;

/**
 * `CLAUDE_CONFIG_DIR` and `CODEX_HOME` beat `HOME`, so a door must pin both after the caller's
 * environment, derived from the HOME it hands the child; an overridable default leaks too.
 */
export const HOST_STATE_DIRS = { CLAUDE_CONFIG_DIR: ".claude", CODEX_HOME: ".codex" } as const;

/** Clearing is not enough: unset, the product falls back to the live store. */
export const SEED_API_VAR = "AGENTS_INC_API_URL";

/** Host-state variables are answered by a pin and the seed API by a default; the rest are cleared. */
export const ENV_VARS_A_DOOR_CLEARS: readonly string[] = [
  ...NAMED_ENV_READS,
  ...Object.values(ENV_READS_BY_CONSTANT),
]
  .filter((name) => !(name in HOST_STATE_DIRS) && name !== SEED_API_VAR)
  .sort();
