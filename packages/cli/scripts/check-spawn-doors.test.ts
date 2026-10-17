/** Fixtures copy the real doors: the guard spread inline, or reached through two locals. */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  check,
  clearances,
  type DoorVerdict,
  GUARD_CONSTANTS,
  NO_DOORS,
} from "./check-spawn-doors.js";
import { expectRefusal } from "./refusal-expectations.js";

const DOOR_FILE = "e2e/helpers/runner.ts";
const GENERATED_FILE = "e2e/helpers/handrun.gen.mjs";

const GUARDS = GUARD_CONSTANTS.map((name) => `...${name}`).join(", ");
const IMPORTED_GUARDS = GUARD_CONSTANTS.join(", ");

const GUARDED_ENV = `{ ${GUARDS}, ...options?.env, HOME: home }`;
const UNGUARDED_ENV = "{ ...options?.env, HOME: home }";

/** The spawn `runCLI` and `CLI.run` both make, apart from the env. */
function doorSpawningInline(env: string): string {
  return [
    `import { execa } from "execa";`,
    ``,
    `import { BIN_RUN, ${IMPORTED_GUARDS} } from "./test-utils.js";`,
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

/** The PTY harness: the spawn gets a filtered local, so the call never names the guard. */
function doorSpawningThroughLocals(env: string): string {
  return [
    `import pty from "@lydell/node-pty";`,
    ``,
    `import { BIN_RUN, ${IMPORTED_GUARDS} } from "./test-utils.js";`,
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

/** The guard is spread into an env no door is handed, so a file-level check would pass it. */
const DOOR_BESIDE_AN_UNRELATED_SPREAD = [
  `import { execa } from "execa";`,
  ``,
  `import { BIN_RUN, ${IMPORTED_GUARDS} } from "./test-utils.js";`,
  ``,
  `export const documented = { ${GUARDS} };`,
  ``,
  `export async function runCLI(args: string[], cwd: string) {`,
  `  return execa("node", [BIN_RUN, ...args], { cwd, env: { HOME: cwd } });`,
  `}`,
  ``,
].join("\n");

/** Spells the binary's path instead of naming `BIN_RUN`. */
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

/** Writes the guard's name as an env key instead of spreading it, which suppresses nothing. */
const DOOR_NAMING_THE_GUARD_AS_A_KEY = [
  `import pty from "@lydell/node-pty";`,
  ``,
  `import { BIN_RUN } from "./test-utils.js";`,
  ``,
  `export function open(args: string[], cwd: string) {`,
  `  return pty.spawn("node", [BIN_RUN, ...args], {`,
  `    cwd,`,
  `    env: { ...process.env, ${GUARD_CONSTANTS.map((name) => `${name}: "1"`).join(", ")} },`,
  `  });`,
  `}`,
  ``,
].join("\n");

const CLEARED_VARIABLE = "VITEST";

const DOOR_CLEARING_INLINE = [
  `import { execa } from "execa";`,
  ``,
  `import { BIN_RUN, ${IMPORTED_GUARDS} } from "./test-utils.js";`,
  ``,
  `export async function runCLI(args: string[], cwd: string) {`,
  `  return execa("node", [BIN_RUN, ...args], {`,
  `    cwd,`,
  `    env: { ${GUARDS}, ${CLEARED_VARIABLE}: undefined, HOME: cwd },`,
  `  });`,
  `}`,
  ``,
].join("\n");

/** Clears nothing; only a comment names the clearing, which a substring scan would accept. */
const DOOR_NAMING_THE_VARIABLE_IN_PROSE = [
  `import { execa } from "execa";`,
  ``,
  `import { BIN_RUN, ${IMPORTED_GUARDS} } from "./test-utils.js";`,
  ``,
  `export async function runCLI(args: string[], cwd: string) {`,
  `  return execa("node", [BIN_RUN, ...args], {`,
  `    cwd,`,
  `    // the runners hand the spawned binary ${CLEARED_VARIABLE}: undefined`,
  `    env: { ${GUARDS}, HOME: cwd },`,
  `  });`,
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

  it.each(GUARD_CONSTANTS)("is reported when it spreads every guard but %s", async (missing) => {
    const others = GUARD_CONSTANTS.filter((name) => name !== missing)
      .map((name) => `...${name}`)
      .join(", ");
    const root = await writeFixturePackage({
      [DOOR_FILE]: doorSpawningInline(`{ ${others}, ...options?.env, HOME: home }`),
    });

    expect(
      check({ packageRoot: root }).doors,
      "a door carrying one default and not the other is half-guarded, and that half is the one a spec hits",
    ).toStrictEqual([unguarded(DOOR_FILE, "execa")]);
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
      [DOOR_FILE]: doorSpawningThroughLocals(`{ ...process.env, ${GUARDS} }`),
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
  it("is reported when it writes the guard's own name as an environment key rather than its contents", async () => {
    const root = await writeFixturePackage({ [DOOR_FILE]: DOOR_NAMING_THE_GUARD_AS_A_KEY });

    expect(
      check({ packageRoot: root }).doors,
      "the constant's identifier is not the variable oclif reads, so a door spelling it as a key suppresses nothing",
    ).toStrictEqual([unguarded(DOOR_FILE, "pty.spawn")]);
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

    expectRefusal(() => check({ packageRoot: root }), NO_DOORS);
  });
});

describe("the variables a door clears for the child", () => {
  it("names one the call sets to undefined in the env it hands over", async () => {
    const root = await writeFixturePackage({ [DOOR_FILE]: DOOR_CLEARING_INLINE });

    expect(clearances({ packageRoot: root })).toStrictEqual([
      { file: DOOR_FILE, spawnedBy: "execa", clears: [CLEARED_VARIABLE] },
    ]);
  });

  it("names one reached through the locals the PTY harness assembles its env from", async () => {
    const root = await writeFixturePackage({
      [DOOR_FILE]: doorSpawningThroughLocals(`{ ...process.env, ${CLEARED_VARIABLE}: undefined }`),
    });

    expect(
      clearances({ packageRoot: root }),
      "the PTY harness clears every variable two locals away from its spawn, and reading only the call reports none of them",
    ).toStrictEqual([{ file: DOOR_FILE, spawnedBy: "pty.spawn", clears: [CLEARED_VARIABLE] }]);
  });

  it("names nothing when the file only says so in a comment", async () => {
    const root = await writeFixturePackage({ [DOOR_FILE]: DOOR_NAMING_THE_VARIABLE_IN_PROSE });

    expect(
      clearances({ packageRoot: root }),
      "a substring scan reads this door as clearing the variable, and the binary it spawns still inherits it",
    ).toStrictEqual([{ file: DOOR_FILE, spawnedBy: "execa", clears: [] }]);
  });

  it("refuses a tree holding no door, rather than reporting that nothing needs clearing", async () => {
    const root = await writeFixturePackage({ "e2e/helpers/nothing.ts": "export const x = 1;\n" });

    expectRefusal(() => clearances({ packageRoot: root }), NO_DOORS);
  });
});

const DOORS_ON_DISK: DoorVerdict[] = [
  guarded("e2e/fixtures/cli.ts", "execa"),
  guarded("e2e/helpers/terminal-session.ts", "pty.spawn"),
  guarded("e2e/helpers/test-utils.ts", "execa"),
];

describe("this repository", () => {
  it("starts the binary from exactly these doors, each carrying the guard", () => {
    expect(
      check().doors,
      `a door here missing one of ${IMPORTED_GUARDS} either lets oclif's update plugin detach a child into a fixture's fake HOME, or lets a run reach the live seed API`,
    ).toStrictEqual(DOORS_ON_DISK);
  });

  it("has no unguarded door", () => {
    expect(check().clean).toBe(true);
  });
});
