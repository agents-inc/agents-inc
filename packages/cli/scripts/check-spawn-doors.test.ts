/**
 * Contract for `scripts/check-spawn-doors.ts` — the scan that every site starting the built binary
 * hands it `NO_BACKGROUND_VERSION_CHECK`.
 *
 * Two halves, like every check beside it. The first drives the scan against fixture packages,
 * because an unguarded door must not exist in this repository at all — the second half is the
 * assertion that none does, and a scan whose only input is a tree with nothing wrong in it has
 * never been shown to report anything.
 *
 * The fixtures are the three real doors' own shapes rather than invented ones: the guard spread
 * inline into the call's `env`, which is how `runCLI` and `CLI.run` are written, and the guard
 * reached through two local variables, which is how the PTY harness is written. The second is the
 * one that decides whether this scan is usable at all — a reader that only looked inside the call
 * would condemn `TerminalSession`, and a check whose hits are wrong is one that gets silenced.
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import { check, type DoorVerdict, GUARD_CONSTANT } from "./check-spawn-doors.js";

const DOOR_FILE = "e2e/helpers/runner.ts";
const GENERATED_FILE = "e2e/helpers/handrun.gen.mjs";

/** The env `runCLI` passes, and the same env with the guard deleted — the drift under test. */
const GUARDED_ENV = `{ ...${GUARD_CONSTANT}, ...options?.env, HOME: home }`;
const UNGUARDED_ENV = "{ ...options?.env, HOME: home }";

/**
 * The spawn `runCLI` and `CLI.run` both make, verbatim apart from the env handed to it. Two
 * arguments before the options object, the binary reached through `BIN_RUN` inside an array.
 */
function doorSpawningInline(env: string): string {
  return [
    `import { execa } from "execa";`,
    ``,
    `import { BIN_RUN, ${GUARD_CONSTANT} } from "./test-utils.js";`,
    ``,
    `export async function runCLI(args: string[], home: string, options?: { env?: object }) {`,
    `  return execa("node", [BIN_RUN, ...args], {`,
    `    cwd: home,`,
    `    reject: false,`,
    `    env: ${env},`,
    `  });`,
    `}`,
    ``,
  ].join("\n");
}

/**
 * The PTY harness's shape: the env is assembled into one local, filtered into a second, and the
 * spawn is handed the second. Nothing about the call names the guard, and the door is guarded.
 */
function doorSpawningThroughLocals(env: string): string {
  return [
    `import pty from "@lydell/node-pty";`,
    ``,
    `import { BIN_RUN, ${GUARD_CONSTANT} } from "./test-utils.js";`,
    ``,
    `export function open(args: string[], cwd: string) {`,
    `  const rawEnv: Record<string, string | undefined> = ${env};`,
    `  const cleanEnv = Object.fromEntries(Object.entries(rawEnv).filter(Boolean));`,
    ``,
    `  return pty.spawn("node", [BIN_RUN, ...args], { cwd, env: cleanEnv });`,
    `}`,
    ``,
  ].join("\n");
}

/** A door passing no env at all, which inherits whatever ran the suite and names nothing. */
const DOOR_WITH_NO_ENV = [
  `import { execa } from "execa";`,
  ``,
  `import { BIN_RUN } from "./test-utils.js";`,
  ``,
  `export async function runCLI(args: string[], cwd: string) {`,
  `  return execa("node", [BIN_RUN, ...args], { cwd, reject: false });`,
  `}`,
  ``,
].join("\n");

/**
 * The shape that makes this scan call-scoped rather than module-scoped: the guard is imported and
 * spread, into an env that no door is handed. A reader asking only whether the FILE mentions the
 * constant calls this guarded, and the door beneath it spawns bare.
 */
const DOOR_BESIDE_AN_UNRELATED_SPREAD = [
  `import { execa } from "execa";`,
  ``,
  `import { BIN_RUN, ${GUARD_CONSTANT} } from "./test-utils.js";`,
  ``,
  `export const documented = { ...${GUARD_CONSTANT} };`,
  ``,
  `export async function runCLI(args: string[], cwd: string) {`,
  `  return execa("node", [BIN_RUN, ...args], { cwd, env: { HOME: cwd } });`,
  `}`,
  ``,
].join("\n");

/**
 * A door that spells the binary's path rather than naming the constant — the shape that was read
 * as no door at all. `path.join` is how `BIN_RUN` itself is built one file away, so this is the
 * same expression with the name taken off it.
 */
const DOOR_SPELLING_THE_PATH = [
  `import { execa } from "execa";`,
  `import path from "path";`,
  ``,
  `export async function runCLI(args: string[], cwd: string) {`,
  `  return execa("node", [path.join(cwd, "..", "bin", "run.js"), ...args], {`,
  `    cwd,`,
  `    env: { HOME: cwd },`,
  `  });`,
  `}`,
  ``,
].join("\n");

/** The same door with the path in a template literal, whose pieces sit around a substitution. */
const DOOR_SPELLING_THE_PATH_IN_A_TEMPLATE = [
  `import { execa } from "execa";`,
  ``,
  `const CLI_ROOT = "/packages/cli";`,
  ``,
  `export async function runCLI(args: string[], cwd: string) {`,
  '  return execa("node", [`${CLI_ROOT}/bin/run.js`, ...args], { cwd, env: { HOME: cwd } });',
  `}`,
  ``,
].join("\n");

function guarded(file: string, spawnedBy: string): DoorVerdict {
  return { file, spawnedBy, outcome: "guarded" };
}

function unguarded(file: string, spawnedBy: string): DoorVerdict {
  return { file, spawnedBy, outcome: "unguarded" };
}

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixturePackage(files: Record<string, string>): Promise<string> {
  const root = await createTempDir("spawn-doors-");
  roots.push(root);

  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(root, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  return root;
}

describe("a site that starts the built binary", () => {
  it("is guarded when the call spreads the constant into its own env", async () => {
    const root = await writeFixturePackage({ [DOOR_FILE]: doorSpawningInline(GUARDED_ENV) });

    expect(check({ packageRoot: root })).toStrictEqual({
      clean: true,
      doors: [guarded(DOOR_FILE, "execa")],
    });
  });

  it("is reported when the same call hands over an env the constant is missing from", async () => {
    const root = await writeFixturePackage({ [DOOR_FILE]: doorSpawningInline(UNGUARDED_ENV) });

    expect(check({ packageRoot: root })).toStrictEqual({
      clean: false,
      doors: [unguarded(DOOR_FILE, "execa")],
    });
  });

  it("is reported when it passes no env at all, which inherits whoever ran the suite", async () => {
    const root = await writeFixturePackage({ [DOOR_FILE]: DOOR_WITH_NO_ENV });

    expect(check({ packageRoot: root }).doors).toStrictEqual([unguarded(DOOR_FILE, "execa")]);
  });

  it("is guarded when its env is assembled through locals, which is how the PTY harness writes it", async () => {
    const root = await writeFixturePackage({
      [DOOR_FILE]: doorSpawningThroughLocals(`{ ...process.env, ...${GUARD_CONSTANT} }`),
    });

    expect(
      check({ packageRoot: root }).doors,
      "a reader that only looked inside the call would condemn the one door written this way",
    ).toStrictEqual([guarded(DOOR_FILE, "pty.spawn")]);
  });

  it("is reported when the locals its env is assembled from never reach the constant", async () => {
    const root = await writeFixturePackage({
      [DOOR_FILE]: doorSpawningThroughLocals("{ ...process.env }"),
    });

    expect(check({ packageRoot: root }).doors).toStrictEqual([unguarded(DOOR_FILE, "pty.spawn")]);
  });

  it("is reported when the file spreads the constant somewhere no door is handed", async () => {
    const root = await writeFixturePackage({ [DOOR_FILE]: DOOR_BESIDE_AN_UNRELATED_SPREAD });

    expect(
      check({ packageRoot: root }).doors,
      "asking whether the FILE mentions the constant passes a door that spawns bare beneath one that does",
    ).toStrictEqual([unguarded(DOOR_FILE, "execa")]);
  });
  it("is seen at all when it spells the binary's path rather than naming the constant", async () => {
    const root = await writeFixturePackage({ [DOOR_FILE]: DOOR_SPELLING_THE_PATH });

    expect(
      check({ packageRoot: root }).doors,
      "requiring the constant read this door as no door at all, which is a silence rather than a hit",
    ).toStrictEqual([unguarded(DOOR_FILE, "execa")]);
  });

  it("is seen when the path is a template literal, whose pieces sit either side of a substitution", async () => {
    const root = await writeFixturePackage({
      [DOOR_FILE]: DOOR_SPELLING_THE_PATH_IN_A_TEMPLATE,
    });

    expect(check({ packageRoot: root }).doors).toStrictEqual([unguarded(DOOR_FILE, "execa")]);
  });
});

describe("the scan", () => {
  it("reports every door in a tree rather than stopping at the first", async () => {
    const other = "e2e/fixtures/cli.ts";
    const root = await writeFixturePackage({
      [DOOR_FILE]: doorSpawningInline(UNGUARDED_ENV),
      [other]: doorSpawningInline(GUARDED_ENV),
    });

    expect(check({ packageRoot: root }).doors).toStrictEqual([
      guarded(other, "execa"),
      unguarded(DOOR_FILE, "execa"),
    ]);
  });

  it("judges no generated bundle, whose doors are the ones it was built from", async () => {
    const root = await writeFixturePackage({
      [DOOR_FILE]: doorSpawningInline(GUARDED_ENV),
      [GENERATED_FILE]: doorSpawningInline(UNGUARDED_ENV),
    });

    expect(
      check({ packageRoot: root }).doors,
      "a stale bundle would red for a defect no edit fixes, and the fix a reader would reach for is a rebuild",
    ).toStrictEqual([guarded(DOOR_FILE, "execa")]);
  });

  it("refuses a tree holding no door at all, rather than calling it clean", async () => {
    const root = await writeFixturePackage({ "e2e/helpers/nothing.ts": "export const x = 1;\n" });

    expect(() => check({ packageRoot: root })).toThrow();
  });
});

/**
 * The three doors this repository has, named rather than counted, each with the guard.
 *
 * Named because a count cannot see a swap, and because the roster IS the subject: the whole reason
 * this scan exists is that nothing made a FOURTH door inherit what the three carry, and its only
 * detector was a flaky red in one spec. A door arriving here fails this line and has to be judged.
 */
const DOORS_ON_DISK: DoorVerdict[] = [
  guarded("e2e/fixtures/cli.ts", "execa"),
  guarded("e2e/helpers/terminal-session.ts", "pty.spawn"),
  guarded("e2e/helpers/test-utils.ts", "execa"),
];

describe("this repository", () => {
  it("starts the binary from exactly these doors, each carrying the guard", () => {
    expect(
      check().doors,
      `a door here that no longer carries ${GUARD_CONSTANT} lets oclif's update plugin detach a child into a fixture's fake HOME after the run returns`,
    ).toStrictEqual(DOORS_ON_DISK);
  });

  it("has no unguarded door", () => {
    expect(check().clean).toBe(true);
  });
});
