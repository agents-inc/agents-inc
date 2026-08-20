import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { check } from "../../../../scripts/check-spawn-doors.js";
import { SOURCE_ENV_VAR } from "../configuration/config.js";
import { envReadsIn } from "./helpers/env-reads.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

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
 */
const RUNNERS = [
  { runner: "e2e/fixtures/cli.ts", spawns: "the non-interactive command runner" },
  { runner: "e2e/helpers/terminal-session.ts", spawns: "the PTY harness" },
  { runner: "e2e/helpers/test-utils.ts", spawns: "the bare-directory command runner" },
];

/**
 * Every environment variable `src/cli/` reads by NAME, which is the roster every runner answers
 * for below. Held against the scan rather than beside it: a new read that nobody clears is the
 * defect, and this is the line that has to move before it can ship.
 *
 * `VITEST` is the one the class was found through. It is the HARNESS's variable, not the
 * product's, and `warn({ suppressInTest: true })` reads it — so a spawned binary that inherits it
 * silences the very warnings a spec was written to assert, and the spec passes by not looking.
 * The others are the product's own overrides, each a knob a developer's shell may carry.
 */
const NAMED_ENV_READS = ["AGENTS_INC_API_URL", "GIGET_AUTH", "VITEST", "XDG_CACHE_HOME"];

/**
 * The constants a bracket read goes through, whose VALUES name variables just as directly.
 * Resolved by importing the constant rather than restating its value, so renaming the variable
 * moves what the runners must clear and reddens them until they follow.
 */
const ENV_READS_BY_CONSTANT = { SOURCE_ENV_VAR };

/**
 * The one place forwarding the WHOLE environment is the point rather than a leak: `execCommand`
 * spawns the Claude CLI, a different program, which is entitled to the user's environment. Named
 * so a second such spread arrives here with its reason instead of passing as this one's twin.
 */
const WHOLE_ENV_FORWARDERS = ["src/cli/utils/exec.ts"];

/** Every variable a spawned binary must be told about, whichever shape the product reads it in. */
const EVERY_PRODUCT_ENV_VAR = [...NAMED_ENV_READS, ...Object.values(ENV_READS_BY_CONSTANT)].sort();

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

  it.each(RUNNERS)("$spawns clears every one of them", async ({ runner }) => {
    const source = await readFile(path.join(CLI_ROOT, runner), "utf8");

    // The subject guard: an empty roster would leave the filter below satisfied for free, and
    // both the roster and the product would have to be emptied together to reach it.
    expect(
      EVERY_PRODUCT_ENV_VAR,
      "the roster is empty, so this runner is asked nothing",
    ).not.toStrictEqual([]);

    const uncleared = EVERY_PRODUCT_ENV_VAR.filter(
      (name) => !source.includes(`${name}: undefined`),
    );

    expect(
      uncleared,
      `${runner} hands these through from whoever ran the suite — a spec's result is then the environment's, not the code's`,
    ).toStrictEqual([]);
  });
});
