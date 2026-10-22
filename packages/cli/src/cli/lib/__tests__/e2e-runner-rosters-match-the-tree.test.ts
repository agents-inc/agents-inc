import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { check } from "../../../../scripts/check-spawn-doors.js";
import {
  E2E_RUNNER_DOORS,
  ENV_READS_BY_CONSTANT,
  NAMED_ENV_READS,
} from "./helpers/e2e-runner-doors.js";
import { envReadsIn } from "./helpers/env-reads.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const PRODUCT_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];
const NOT_PRODUCT = ["**/*.test.ts", "**/*.test.tsx", "**/__tests__/**", "**/__mocks__/**"];

/** `execCommand` spawns the Claude CLI, which is entitled to the user's whole environment. */
const WHOLE_ENV_FORWARDERS = ["src/cli/utils/exec.ts"];

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

/** `e2e-runner-environment.test.ts` drives every rostered runner against these rosters. */
describe("the variables the product reads are the ones every runner is asked to clear", () => {
  it("touches the environment only in shapes this gate can read", async () => {
    const unreadable = (await productEnvReads()).flatMap(({ file, reads }) =>
      reads.unrecognised.map((shape) => `${file}: ${shape}`),
    );

    expect(
      unreadable,
      "a process.env shape this gate cannot classify is one it would report as read-by-nobody, and every assertion below would agree",
    ).toStrictEqual([]);
  });

  it("reads exactly the variables named in NAMED_ENV_READS", async () => {
    const named = (await productEnvReads()).flatMap(({ reads }) => reads.named);

    expect(
      [...new Set(named)].sort(),
      "a variable the product reads and this roster does not name is one no runner was asked to clear",
    ).toStrictEqual([...NAMED_ENV_READS].sort());
  });

  it("reaches the environment through exactly the constants in ENV_READS_BY_CONSTANT", async () => {
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
});

describe("every way the suite starts the binary is a runner the environment spec drives", () => {
  it("answers for every file that starts the binary, and for no file that does not", () => {
    // Per file, not per door: the scan reports each of a file's calls.
    const doors = [...new Set(check().doors.map((door) => door.file))].sort();

    expect(
      E2E_RUNNER_DOORS.map(({ runner }) => runner).sort(),
      "a door missing from E2E_RUNNER_DOORS is one nothing asks to clear anything, and its specs read as covered by the runners that are",
    ).toStrictEqual(doors);
  });

  /** The environment spec opens each runner once, so a second door would pass on the first's answer. */
  it.each(E2E_RUNNER_DOORS)(
    "$spawns starts the binary through one door, by $spawnedBy",
    ({ runner, spawnedBy }) => {
      expect(
        check()
          .doors.filter((door) => door.file === runner)
          .map((door) => door.spawnedBy),
        `${runner} starts the binary somewhere other than the one door the environment spec drives`,
      ).toStrictEqual([spawnedBy]);
    },
  );
});
