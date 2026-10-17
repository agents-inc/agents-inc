import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import fg from "fast-glob";
import { afterEach, describe, expect, it, vi } from "vitest";

import { check, clearances } from "../../../../scripts/check-spawn-doors.js";
import { typedEntries } from "../../utils/typed-object.js";
import { SOURCE_ENV_VAR } from "../configuration/config.js";
import { CLAUDE_CONFIG_DIR_VAR, CODEX_HOME_VAR } from "../installation/install-layout.js";
import { envReadsIn } from "./helpers/env-reads.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

type ChildEnv = Record<string, string | undefined>;

/**
 * Every binary start the doors make, recorded instead of performed. Both spawners (`execa` and
 * `@lydell/node-pty`) are replaced, so the environment is read where every door must pass.
 */
const spawned = vi.hoisted(() => vi.fn<(args: readonly string[], env: ChildEnv) => void>());

vi.mock("execa", async (importOriginal) => ({
  ...(await importOriginal<typeof import("execa")>()),
  execa: (_command: string, args: readonly string[], options: { env: ChildEnv }) => {
    spawned(args, options.env);
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

const PRODUCT_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];
const NOT_PRODUCT = ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/__mocks__/**"];

/**
 * Every way this suite starts the binary. Membership is held against
 * `scripts/check-spawn-doors.ts`, which finds doors by the constant they reach the binary through;
 * `spawns`, `spawnedBy` and `open` stay hand-written because a scan cannot say what a door is for.
 */
const RUNNERS: RunnerDoor[] = [
  {
    runner: "e2e/fixtures/cli.ts",
    spawns: "the non-interactive command runner",
    spawnedBy: "execa",
    open: (loaded, { projectDir }, callerEnv) =>
      (loaded as CliFixtureModule).CLI.run([], { dir: projectDir }, { env: callerEnv }),
  },
  {
    runner: "e2e/helpers/terminal-session.ts",
    spawns: "the PTY harness",
    spawnedBy: "pty.spawn",
    open: (loaded, { projectDir }, callerEnv) =>
      new (loaded as TerminalSessionModule).TerminalSession([], projectDir, { env: callerEnv }),
  },
  {
    runner: "e2e/helpers/test-utils.ts",
    spawns: "the bare-directory command runner",
    spawnedBy: "execa",
    open: (loaded, { projectDir }, callerEnv) =>
      (loaded as TestUtilsModule).runCLI([], projectDir, { env: callerEnv }),
  },
];

/**
 * Different directories on purpose: from one string, `path.join(home, ".codex")` and
 * `path.join(projectDir, ".codex")` agree, hiding the hazard (Codex keeps project agents there).
 */
type DriveFrom = {
  home: string;
  projectDir: string;
};

type RunnerDoor = {
  runner: string;
  spawns: string;
  spawnedBy: string;
  open: (loaded: unknown, places: DriveFrom, callerEnv: ChildEnv) => unknown;
};

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

/**
 * `CLAUDE_CONFIG_DIR` and `CODEX_HOME` beat `HOME`, so a door must pin both after the caller's
 * environment, derived from the HOME it hands the child; an overridable default leaks too.
 */
const HOST_STATE_DIRS = { CLAUDE_CONFIG_DIR: ".claude", CODEX_HOME: ".codex" };

/** Nothing creates it: every spawn is recorded. */
const HOME_UNDER_TEST = path.join(os.tmpdir(), "a-home-no-door-creates");

/** Inside that HOME, and never the same string as it. */
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
async function loadRunner(runner: string): Promise<unknown> {
  const loaded: unknown = await import(pathToFileURL(path.join(CLI_ROOT, runner)).href);
  return loaded;
}

/** Held against the scan: a new read nobody clears must move this line before it can ship. */
const NAMED_ENV_READS = ["AGENTS_INC_API_URL", "GIGET_AUTH", "XDG_CACHE_HOME"];

/**
 * Resolved from the constants, so a renamed variable moves what runners must clear. The host-state
 * variables are answered by a pin rather than a clearance.
 */
const ENV_READS_BY_CONSTANT = { CLAUDE_CONFIG_DIR_VAR, CODEX_HOME_VAR, SOURCE_ENV_VAR };

/** `execCommand` spawns the Claude CLI, which is entitled to the user's whole environment. */
const WHOLE_ENV_FORWARDERS = ["src/cli/utils/exec.ts"];

/**
 * Clearing is not enough: unset, the product falls back to the live store. Port 1 on loopback
 * refuses at once, so an unpointed run fails fast and locally.
 */
const SEED_API_VAR = "AGENTS_INC_API_URL";
const UNROUTABLE_SEED_API = "http://127.0.0.1:1";

const A_SPECS_OWN_STORE = "http://127.0.0.1:43210";

/**
 * Every variable a spawned binary must be cleared of. Host-state variables are answered by a pin
 * and the seed API by a default, each driven and compared in its own describe block below.
 */
const EVERY_PRODUCT_ENV_VAR = [...NAMED_ENV_READS, ...Object.values(ENV_READS_BY_CONSTANT)]
  .filter((name) => !(name in HOST_STATE_DIRS) && name !== SEED_API_VAR)
  .sort();

async function productEnvReads(): Promise<
  { file: string; reads: ReturnType<typeof envReadsIn> }[]
> {
  const files = await fg(PRODUCT_SOURCES, { cwd: CLI_ROOT, ignore: NOT_PRODUCT });
  return Promise.all(
    files.sort().map(async (file) => ({
      file,
      reads: envReadsIn(await readFile(path.join(CLI_ROOT, file), "utf8")),
    })),
  );
}

describe("a spawned binary is told about every environment variable the product reads", () => {
  it("touches the environment only in shapes this gate can read", async () => {
    const unreadable = (await productEnvReads()).flatMap(({ file, reads }) =>
      reads.unrecognised.map((shape) => `${file}: ${shape}`),
    );

    expect(
      unreadable,
      "a process.env shape this gate cannot classify is one it would report as read-by-nobody, and every assertion below would agree",
    ).toStrictEqual([]);
  });

  it("reads exactly the variables named here", async () => {
    const named = (await productEnvReads()).flatMap(({ reads }) => reads.named);

    expect(
      [...new Set(named)].sort(),
      "a variable the product reads and this roster does not name is one no runner was asked to clear",
    ).toStrictEqual([...NAMED_ENV_READS].sort());
  });

  it("reaches the environment through exactly the constants resolved here", async () => {
    const viaConstant = (await productEnvReads()).flatMap(({ reads }) => reads.viaConstant);

    expect(
      [...new Set(viaConstant)].sort(),
      "a bracket read through an unresolved constant names a variable this gate cannot see",
    ).toStrictEqual(Object.keys(ENV_READS_BY_CONSTANT).sort());
  });

  it("forwards the whole environment only where forwarding is the subject", async () => {
    const forwarders = (await productEnvReads())
      .filter(({ reads }) => reads.wholeObject > 0)
      .map(({ file }) => file);

    expect(
      forwarders,
      "a spread of the whole environment hands every variable to a child, named or not",
    ).toStrictEqual(WHOLE_ENV_FORWARDERS);
  });

  it("answers for every file that starts the binary, and for no file that does not", () => {
    // Per file, not per door: the scan reports each of a file's calls.
    const doors = [...new Set(check().doors.map((door) => door.file))].sort();

    expect(
      RUNNERS.map(({ runner }) => runner).sort(),
      "a door missing from this roster is one nothing below asks to clear anything, and its specs read as covered by the runners that are here",
    ).toStrictEqual(doors);
  });

  /** Per door and from the syntax tree: a source-text match passes on a comment saying it. */
  it.each(RUNNERS)("$spawns clears every one of them", ({ runner }) => {
    const doors = clearances().filter((door) => door.file === runner);

    // Two subject guards: an empty roster, or doors the scan cannot see, would pass for free.
    expect(
      EVERY_PRODUCT_ENV_VAR,
      "the roster is empty, so this runner is asked nothing",
    ).not.toStrictEqual([]);
    expect(
      doors,
      `${runner} is on the roster and starts the binary nowhere this scan can see`,
    ).not.toStrictEqual([]);

    const uncleared = doors.flatMap(({ spawnedBy, clears }) =>
      EVERY_PRODUCT_ENV_VAR.filter((name) => !clears.includes(name)).map(
        (name) => `${spawnedBy}: ${name}`,
      ),
    );

    expect(
      uncleared,
      `${runner} hands these through from whoever ran the suite — a spec's result is then the environment's, not the code's`,
    ).toStrictEqual([]);
  });
});

/**
 * Judged by the value each door hands the child, driven by a caller contradicting every pin, from a
 * project that is not the caller's HOME, so a pin derived from the project is told apart.
 */
describe("a spawned binary keeps each host's state inside the HOME it is handed", () => {
  it.each(RUNNERS)(
    "$spawns pins every host's state directory to that HOME, not to the project it works in",
    async ({ runner, spawnedBy, open }) => {
      // Subject guard: a second door here would pass on the first one's answer.
      expect(
        check()
          .doors.filter((door) => door.file === runner)
          .map((door) => door.spawnedBy),
        `${runner} starts the binary somewhere other than the one door this check drives`,
      ).toStrictEqual([spawnedBy]);

      // Subject guard: the two directories must differ, or both derivations agree.
      expect(
        DRIVEN_FROM.projectDir,
        "the project and the HOME are one directory, so a pin taken from either reads the same",
      ).not.toBe(DRIVEN_FROM.home);

      await open(await loadRunner(runner), DRIVEN_FROM, CONTRADICTING_CALLER_ENV);

      // Subject guard: the door started the built binary, once.
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

/** Driven three ways; the child may reach the store only when a spec names it. */
describe("a spawned binary reaches no seed API a spec did not name", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(RUNNERS)(
    "$spawns hands it an unroutable address when the caller names none",
    async ({ runner, open }) => {
      await open(await loadRunner(runner), DRIVEN_FROM, { HOME: HOME_UNDER_TEST });

      expect(
        spawned.mock.calls.map(([, env]) => env[SEED_API_VAR]),
        `${runner} leaves the child to fall back to the live store`,
      ).toStrictEqual([UNROUTABLE_SEED_API]);
    },
  );

  it.each(RUNNERS)(
    "$spawns hands it an unroutable address over one the developer's shell exports",
    async ({ runner, open }) => {
      vi.stubEnv(SEED_API_VAR, "https://a-developers-staging-store.invalid");

      await open(await loadRunner(runner), DRIVEN_FROM, { HOME: HOME_UNDER_TEST });

      expect(
        spawned.mock.calls.map(([, env]) => env[SEED_API_VAR]),
        `${runner} hands the child a store whoever ran the suite exported`,
      ).toStrictEqual([UNROUTABLE_SEED_API]);
    },
  );

  it.each(RUNNERS)("$spawns hands it the store a spec names", async ({ runner, open }) => {
    await open(await loadRunner(runner), DRIVEN_FROM, {
      HOME: HOME_UNDER_TEST,
      [SEED_API_VAR]: A_SPECS_OWN_STORE,
    });

    expect(
      spawned.mock.calls.map(([, env]) => env[SEED_API_VAR]),
      `${runner} overrides the store a spec started`,
    ).toStrictEqual([A_SPECS_OWN_STORE]);
  });
});
