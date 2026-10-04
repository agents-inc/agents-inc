import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import fg from "fast-glob";
import { describe, expect, it, vi } from "vitest";

import { check, clearances } from "../../../../scripts/check-spawn-doors.js";
import { typedEntries } from "../../utils/typed-object.js";
import { SOURCE_ENV_VAR } from "../configuration/config.js";
import { CLAUDE_CONFIG_DIR_VAR, CODEX_HOME_VAR } from "../installation/install-layout.js";
import { envReadsIn } from "./helpers/env-reads.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** The environment a door hands its child, and the one a caller hands the door. */
type ChildEnv = Record<string, string | undefined>;

/**
 * Every start of the binary the doors below make, recorded INSTEAD of performed: the arguments
 * and the environment the child would have been handed. Both spawners are replaced, because the
 * two non-interactive doors start the binary through `execa` and the PTY harness through
 * `@lydell/node-pty` — and the environment a door computes is the subject, so it is read at the
 * one point every door must pass through, rather than from the door's source text.
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

/** The shipped CLI — everything a spawned `bin/run.js` executes, and nothing that tests it. */
const PRODUCT_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];
const NOT_PRODUCT = ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/__mocks__/**"];

/**
 * Every way this suite starts the compiled binary, and what each one is. A variable one runner
 * clears and another does not is not half-solved — the specs that leak are simply the ones on
 * the other runners, and nothing about them says so.
 *
 * The MEMBERSHIP is derived rather than stated: this list named two doors, called itself the
 * whole set in its own comment, and left `runCLI` — most of the non-interactive command specs —
 * spawning with the harness's environment. A hand-written roster of runners carries the same
 * defect the roster of variables below it would: the entry that matters is the one nobody
 * remembered to add. So it is held against `scripts/check-spawn-doors.ts`, which finds a door by
 * the constant it reaches the binary through rather than by having been told about it. `spawns`
 * stays hand-written, because a scan can name a file and a callee but not what the door is for.
 *
 * `spawnedBy` and `open` are hand-written for the same reason, and the pinning check below holds
 * the first against the scan: `open` starts the binary through the one door `spawnedBy` names, so
 * a second door in the same file is reported there rather than passing on the first one's answer.
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
 * Where a door is driven from. The two are DIFFERENT directories on purpose: every door takes the
 * project it works in as one argument and the HOME it hands over as another, and driving both from
 * one string makes `path.join(home, ".codex")` and `path.join(projectDir, ".codex")` the same
 * answer — so the pinning check below could not tell the correct derivation from the hazard.
 * `<project>/.codex` is not hypothetical: it is where Codex keeps a project's own agents.
 */
type DriveFrom = {
  /** The HOME the caller names, and the one every pin must be derived from. */
  home: string;
  /** The directory the door is told to work in, inside that HOME and never equal to it. */
  projectDir: string;
};

/** One door, and how to start the binary through it once. */
type RunnerDoor = {
  runner: string;
  spawns: string;
  spawnedBy: string;
  open: (loaded: unknown, places: DriveFrom, callerEnv: ChildEnv) => unknown;
};

// What each door's module offers, spelled structurally at the boundary where it is loaded by path.
// Importing the modules by name instead would pull the whole E2E harness into this project's
// program, where `@lydell/node-pty` has no types: its declarations reach only `e2e/tsconfig.json`,
// through the triple-slash reference in `e2e/helpers/node-pty.d.ts` (TS7016 without it).
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
 * The third-party binaries a spawned `bin/run.js` starts in its turn, each paired with the
 * directory under HOME it keeps its state in, keyed by the variable that relocates it.
 *
 * Faking HOME does not isolate either of them. `CLAUDE_CONFIG_DIR` BEATS `HOME` in the Claude CLI,
 * and `CODEX_HOME` beats it in Codex, so an exported value sends every call the child makes into
 * the developer's own installation, past the fake HOME entirely. A door therefore PINS both — set
 * after the caller's environment, derived from the HOME the child is actually handed — and a
 * default a caller can override is the same leak one layer up.
 */
const HOST_STATE_DIRS = { CLAUDE_CONFIG_DIR: ".claude", CODEX_HOME: ".codex" };

/** Where the pinning check says the child's home is. Nothing creates it: every spawn is recorded. */
const HOME_UNDER_TEST = path.join(os.tmpdir(), "a-home-no-door-creates");

/** The project each door is driven in — inside that HOME, and never the same string as it. */
const DRIVEN_FROM: DriveFrom = {
  home: HOME_UNDER_TEST,
  projectDir: path.join(HOME_UNDER_TEST, "project"),
};

/**
 * A caller contradicting every pin at once — the shape an exported variable reaches a door in,
 * since each door spreads its caller's environment. A pin is the door's answer winning over this.
 */
const CONTRADICTING_CALLER_ENV: ChildEnv = {
  HOME: HOME_UNDER_TEST,
  CLAUDE_CONFIG_DIR: path.join(os.tmpdir(), "a-developers-claude-config"),
  CODEX_HOME: path.join(os.tmpdir(), "a-developers-codex-home"),
};

/** The built binary, as every door names it in the arguments it hands the spawner. */
const BIN_RUN_PATH = path.join(CLI_ROOT, "bin", "run.js");

/** The HOME a child is handed and where each host would keep its state under it. */
function hostStateIn(env: ChildEnv): ChildEnv {
  return {
    HOME: env.HOME,
    ...Object.fromEntries(typedEntries(HOST_STATE_DIRS).map(([name]) => [name, env[name]])),
  };
}

/** What {@link hostStateIn} must read for a child handed `home`. */
function hostStatePinnedTo(home: string): ChildEnv {
  return {
    HOME: home,
    ...Object.fromEntries(
      typedEntries(HOST_STATE_DIRS).map(([name, dir]) => [name, path.join(home, dir)]),
    ),
  };
}

/**
 * A door's module, loaded by path. The specifier is computed, so the type checker does not follow
 * it — which is the point: see the structural module types above.
 */
async function loadRunner(runner: string): Promise<unknown> {
  const loaded: unknown = await import(pathToFileURL(path.join(CLI_ROOT, runner)).href);
  return loaded;
}

/**
 * Every environment variable `src/cli/` reads by NAME, which is the roster every runner answers
 * for below. Held against the scan rather than beside it: a new read that nobody clears is the
 * defect, and this is the line that has to move before it can ship. Each is one of the product's
 * own overrides, a knob a developer's shell may carry.
 */
const NAMED_ENV_READS = ["AGENTS_INC_API_URL", "GIGET_AUTH", "XDG_CACHE_HOME"];

/**
 * The constants a bracket read goes through, whose VALUES name variables just as directly.
 * Resolved by importing the constant rather than restating its value, so renaming the variable
 * moves what the runners must clear and reddens them until they follow.
 *
 * `CODEX_HOME_VAR` is the layout module's read: the host roles hang a Codex installation off
 * whichever root the variable names, so the product now reads a variable the doors were already
 * pinning. It is answered by that pin rather than by a clearance — see
 * {@link EVERY_PRODUCT_ENV_VAR}. `CLAUDE_CONFIG_DIR_VAR` is the same module's read of where Claude
 * Code keeps its state file, answered the same way.
 */
const ENV_READS_BY_CONSTANT = { CLAUDE_CONFIG_DIR_VAR, CODEX_HOME_VAR, SOURCE_ENV_VAR };

/**
 * The one place forwarding the WHOLE environment is the point rather than a leak: `execCommand`
 * spawns the Claude CLI, a different program, which is entitled to the user's environment. Named
 * so a second such spread arrives here with its reason instead of passing as this one's twin.
 */
const WHOLE_ENV_FORWARDERS = ["src/cli/utils/exec.ts"];

/**
 * Every variable a spawned binary must be CLEARED of, whichever shape the product reads it in.
 *
 * A {@link HOST_STATE_DIRS} variable is left out, and is the one case where that is not a hole: a
 * host's state directory is answered by a PIN and never by a clearance, and the second describe
 * block below drives every door and compares the value it would hand the child — which is the
 * stronger check of the two, because clearing `CODEX_HOME` only leaves the child falling back to
 * `.codex` under whichever HOME it was given, while the pin says which directory that is. Holding
 * such a variable to the clearance check would ask every door to undo the pin the same file
 * requires of it.
 */
const EVERY_PRODUCT_ENV_VAR = [...NAMED_ENV_READS, ...Object.values(ENV_READS_BY_CONSTANT)]
  .filter((name) => !(name in HOST_STATE_DIRS))
  .sort();

/** Each product source paired with what it does to `process.env`. */
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
    // Per FILE, not per door: a file spawning twice is read once here, and the scan reports
    // each of its calls.
    const doors = [...new Set(check().doors.map((door) => door.file))].sort();

    expect(
      RUNNERS.map(({ runner }) => runner).sort(),
      "a door missing from this roster is one nothing below asks to clear anything, and its specs read as covered by the runners that are here",
    ).toStrictEqual(doors);
  });

  /**
   * Judged per DOOR and from the syntax tree, because the two coarser readings both pass on a
   * runner that clears nothing. This asked whether the runner's SOURCE TEXT contained
   * `<NAME>: undefined` anywhere, and a comment satisfies that — measured, by replacing `runCLI`'s
   * clearing line with a comment saying it: this file stayed green while the door leaked `VITEST`
   * into every binary it spawned. Per file rather than per door is the same defect one step up, a
   * file with two spawns passing on whichever of them is written correctly.
   */
  it.each(RUNNERS)("$spawns clears every one of them", ({ runner }) => {
    const doors = clearances().filter((door) => door.file === runner);

    // Two subject guards. An empty roster leaves the filter below satisfied for free, and so does
    // a runner whose doors this scan cannot see — each would report a clean runner for a reason
    // that has nothing to do with the environment it hands over.
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
 * Judged by what a door HANDS the child rather than by what its source says, because the question
 * is a value and not a name: a door naming `CODEX_HOME` BEFORE the caller's spread defaults it,
 * a door deriving it from anything but the HOME it hands over points it somewhere else, and both
 * read the same to a scan for the key. So each door is driven once, with the spawner recorded
 * rather than run, by a caller contradicting every pin — and the environment it would have started
 * the binary with is compared against the one its own HOME implies.
 *
 * **Driven from a project that is NOT the caller's HOME**, which is the half that was missing. Each
 * door was opened with its project directory and the caller's HOME set to one string, so a pin
 * taken from the project and a pin taken from the HOME produced the same value and the second
 * hazard in the paragraph above was unreachable — the check read as covering it and could not fail
 * for it. `<project>/.codex` is where Codex keeps a project's own agents, so a door deriving
 * `CODEX_HOME` from the directory it works in is the shape this now separates.
 *
 * The PTY harness is the door this was written against: it pinned neither variable, and handed
 * whatever the caller or the developer's shell carried straight to the binary it spawned.
 */
describe("a spawned binary keeps each host's state inside the HOME it is handed", () => {
  it.each(RUNNERS)(
    "$spawns pins every host's state directory to that HOME, not to the project it works in",
    async ({ runner, spawnedBy, open }) => {
      // Subject guard: the door driven below is the only one this file holds. A second door here
      // would otherwise pass on the first one's answer, which is the per-file reading the
      // clearing check above was rewritten to stop.
      expect(
        check()
          .doors.filter((door) => door.file === runner)
          .map((door) => door.spawnedBy),
        `${runner} starts the binary somewhere other than the one door this check drives`,
      ).toStrictEqual([spawnedBy]);

      // Subject guard: the two directories must differ, or both derivations answer the same and
      // the comparison below is satisfied by the door this is written against.
      expect(
        DRIVEN_FROM.projectDir,
        "the project and the HOME are one directory, so a pin taken from either reads the same",
      ).not.toBe(DRIVEN_FROM.home);

      await open(await loadRunner(runner), DRIVEN_FROM, CONTRADICTING_CALLER_ENV);

      // Subject guard: the door started the built binary, once — an empty record would satisfy no
      // comparison below, but it would fail it for a reason that has nothing to do with pinning.
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
