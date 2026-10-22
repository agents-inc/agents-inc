import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { typedEntries } from "../../utils/typed-object.js";
import {
  E2E_RUNNER_DOORS,
  ENV_VARS_A_DOOR_CLEARS,
  HOST_STATE_DIRS,
  SEED_API_VAR,
  type E2eRunner,
} from "./helpers/e2e-runner-doors.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

type ChildEnv = Record<string, string | undefined>;

/**
 * Every binary start the doors make, recorded instead of performed, with the environment the child
 * would have been handed. Both spawners (`execa` and `@lydell/node-pty`) are replaced, so the
 * environment is read where every door must pass.
 */
const spawned = vi.hoisted(() => vi.fn<(args: readonly string[], env: ChildEnv) => void>());

/** execa lays `env` over this process's own unless `extendEnv` is off; spawn drops `undefined`. */
const execaChildEnv = vi.hoisted(
  () =>
    (options: { env?: ChildEnv; extendEnv?: boolean }): ChildEnv =>
      Object.fromEntries(
        Object.entries(
          options.extendEnv === false ? { ...options.env } : { ...process.env, ...options.env },
        ).filter(([, value]) => value !== undefined),
      ),
);

vi.mock("execa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("execa")>()),
  execa: (
    _command: string,
    args: readonly string[],
    options: { env?: ChildEnv; extendEnv?: boolean },
  ) => {
    spawned(args, execaChildEnv(options));
    return Promise.resolve({ exitCode: 0, stdout: "", stderr: "" });
  },
}));

vi.mock("@lydell/node-pty", () => ({
  default: {
    spawn: (_command: string, args: readonly string[], options: { env: ChildEnv }) => {
      spawned(args, options.env);
      return { onData: () => undefined, onExit: () => undefined };
    },
  },
}));

/**
 * Different directories on purpose: from one string, `path.join(home, ".codex")` and
 * `path.join(projectDir, ".codex")` agree, hiding the hazard (Codex keeps project agents there).
 */
type DriveFrom = {
  home: string;
  projectDir: string;
};

type OpenRunner = (loaded: unknown, places: DriveFrom, callerEnv: ChildEnv) => unknown;

// Structural module types: importing by name would pull the E2E harness into this program, where
// `@lydell/node-pty` has no types (TS7016 without `e2e/helpers/node-pty.d.ts`).
type CliFixtureModule = {
  CLI: { run: (args: string[], project: { dir: string }, options: { env: ChildEnv }) => unknown };
};
type TerminalSessionModule = {
  TerminalSession: new (args: string[], cwd: string, options: { env: ChildEnv }) => unknown;
};
type TestUtilsModule = {
  runCLI: (args: string[], cwd: string, options: { env: ChildEnv }) => unknown;
};

/** Keyed by the roster, so a runner added there cannot be left undriven here. */
const OPEN: Record<E2eRunner, OpenRunner> = {
  "e2e/fixtures/cli.ts": (loaded, { projectDir }, callerEnv) =>
    (loaded as CliFixtureModule).CLI.run([], { dir: projectDir }, { env: callerEnv }),
  "e2e/helpers/terminal-session.ts": (loaded, { projectDir }, callerEnv) =>
    new (loaded as TerminalSessionModule).TerminalSession([], projectDir, { env: callerEnv }),
  "e2e/helpers/test-utils.ts": (loaded, { projectDir }, callerEnv) =>
    (loaded as TestUtilsModule).runCLI([], projectDir, { env: callerEnv }),
};

/** Nothing creates it: every spawn is recorded. */
const HOME_UNDER_TEST = path.join(os.tmpdir(), "a-home-no-door-creates");

const DRIVEN_FROM: DriveFrom = {
  home: HOME_UNDER_TEST,
  projectDir: path.join(HOME_UNDER_TEST, "project"),
};

/** Contradicts every pin, as an exported variable would reach a door through its env spread. */
const CONTRADICTING_CALLER_ENV: ChildEnv = {
  HOME: HOME_UNDER_TEST,
  CLAUDE_CONFIG_DIR: path.join(os.tmpdir(), "a-developers-claude-config"),
  CODEX_HOME: path.join(os.tmpdir(), "a-developers-codex-home"),
};

const BIN_RUN_PATH = path.join(CLI_ROOT, "bin", "run.js");

/** Port 1 on loopback refuses at once, so an unpointed run fails fast and locally. */
const UNROUTABLE_SEED_API = "http://127.0.0.1:1";

const A_SPECS_OWN_STORE = "http://127.0.0.1:43210";

function hostStateIn(env: ChildEnv): ChildEnv {
  return {
    HOME: env.HOME,
    ...Object.fromEntries(typedEntries(HOST_STATE_DIRS).map(([name]) => [name, env[name]])),
  };
}

function hostStatePinnedTo(home: string): ChildEnv {
  return {
    HOME: home,
    ...Object.fromEntries(
      typedEntries(HOST_STATE_DIRS).map(([name, dir]) => [name, path.join(home, dir)]),
    ),
  };
}

/** Loaded by a computed specifier, so the type checker does not follow it; see the module types. */
async function loadRunner(runner: E2eRunner): Promise<unknown> {
  const loaded: unknown = await import(pathToFileURL(path.join(CLI_ROOT, runner)).href);
  return loaded;
}

async function openRunner(runner: E2eRunner, callerEnv: ChildEnv): Promise<void> {
  await OPEN[runner](await loadRunner(runner), DRIVEN_FROM, callerEnv);
}

describe("a spawned binary is handed nothing the developer's shell exports for the product", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(E2E_RUNNER_DOORS)(
    "$spawns hands the child none of the variables the product reads",
    async ({ runner }) => {
      expect(
        ENV_VARS_A_DOOR_CLEARS,
        "the roster is empty, so this runner is asked nothing",
      ).not.toStrictEqual([]);
      for (const name of ENV_VARS_A_DOOR_CLEARS) vi.stubEnv(name, `a-developers-${name}`);

      await openRunner(runner, { HOME: HOME_UNDER_TEST });

      expect(
        spawned.mock.calls.map(([, env]) =>
          ENV_VARS_A_DOOR_CLEARS.filter((name) => env[name] !== undefined),
        ),
        `${runner} hands these through from whoever ran the suite — a spec's result is then the environment's, not the code's`,
      ).toStrictEqual([[]]);
    },
  );
});

describe("a spawned binary keeps each host's state inside the HOME it is handed", () => {
  it.each(E2E_RUNNER_DOORS)(
    "$spawns pins every host's state directory to that HOME, not to the project it works in",
    async ({ runner }) => {
      expect(
        DRIVEN_FROM.projectDir,
        "the project and the HOME are one directory, so a pin taken from either reads the same",
      ).not.toBe(DRIVEN_FROM.home);

      await openRunner(runner, CONTRADICTING_CALLER_ENV);

      expect(
        spawned.mock.calls.map(([args]) => args.slice(0, 1)),
        `${runner} did not start the built binary exactly once`,
      ).toStrictEqual([[BIN_RUN_PATH]]);

      expect(
        spawned.mock.calls.map(([, env]) => hostStateIn(env)),
        `${runner} lets a caller's value, or none at all, decide where a host keeps its state`,
      ).toStrictEqual([hostStatePinnedTo(HOME_UNDER_TEST)]);
    },
  );
});

describe("a spawned binary reaches no seed API a spec did not name", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(E2E_RUNNER_DOORS)(
    "$spawns hands it an unroutable address when the caller names none",
    async ({ runner }) => {
      await openRunner(runner, { HOME: HOME_UNDER_TEST });

      expect(
        spawned.mock.calls.map(([, env]) => env[SEED_API_VAR]),
        `${runner} leaves the child to fall back to the live store`,
      ).toStrictEqual([UNROUTABLE_SEED_API]);
    },
  );

  it.each(E2E_RUNNER_DOORS)(
    "$spawns hands it an unroutable address over one the developer's shell exports",
    async ({ runner }) => {
      vi.stubEnv(SEED_API_VAR, "https://a-developers-staging-store.invalid");

      await openRunner(runner, { HOME: HOME_UNDER_TEST });

      expect(
        spawned.mock.calls.map(([, env]) => env[SEED_API_VAR]),
        `${runner} hands the child a store whoever ran the suite exported`,
      ).toStrictEqual([UNROUTABLE_SEED_API]);
    },
  );

  it.each(E2E_RUNNER_DOORS)("$spawns hands it the store a spec names", async ({ runner }) => {
    await openRunner(runner, {
      HOME: HOME_UNDER_TEST,
      [SEED_API_VAR]: A_SPECS_OWN_STORE,
    });

    expect(
      spawned.mock.calls.map(([, env]) => env[SEED_API_VAR]),
      `${runner} overrides the store a spec started`,
    ).toStrictEqual([A_SPECS_OWN_STORE]);
  });
});
