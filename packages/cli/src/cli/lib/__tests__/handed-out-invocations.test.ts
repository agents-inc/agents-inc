import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { HANDED_OUT_INVOCATIONS, invocationsIn } from "./helpers/handed-out-invocations.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/**
 * Everything that ships. Tests are excluded because a spec quoting a message is not the CLI
 * saying anything to anybody, and a spec's own fixture is free to name a command deliberately
 * absent.
 */
const SHIPPED_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];
const NOT_SHIPPED = ["src/cli/**/*.test.ts", "src/cli/**/*.test.tsx", "src/cli/**/__tests__/**"];

async function everyShippedSource(): Promise<string> {
  const files = await fg(SHIPPED_SOURCES, { cwd: CLI_ROOT, ignore: NOT_SHIPPED });
  const sources = await Promise.all(
    files.sort().map((file) => readFile(path.join(CLI_ROOT, file), "utf8")),
  );
  return sources.join("\n");
}

/**
 * Half of a two-part guard, and the half that does the binding. The other half is
 * `e2e/commands/handed-out-invocations.e2e.test.ts`, which runs every entry of
 * `HANDED_OUT_INVOCATIONS` against the real binary.
 *
 * Separating them is the whole design. A run-it spec reading its own hand-written list proves
 * the binary answers for a list nobody has held against the messages — which is the state the
 * `add` refusal shipped in for as long as it existed. This end reads the messages and refuses a
 * list that has stopped describing them, so a new invocation cannot reach users without someone
 * deciding, here, that the binary should answer for it.
 */
describe("the invocations the CLI hands out are the ones a spec runs", () => {
  it("finds in src exactly the invocations the run-it list names", async () => {
    const found = invocationsIn(await everyShippedSource());

    // The subject guard: a scan that matched nothing satisfies nothing, and a renamed
    // interpolation would produce exactly that while every message still printed.
    expect(
      found.length,
      "no message in src/cli hands out an invocation at all — the reader has stopped matching what the messages are written through",
    ).toBeGreaterThan(0);

    expect(
      found,
      "a message hands out an invocation nothing runs — add it to HANDED_OUT_INVOCATIONS, which is what makes the binary answer for it",
    ).toStrictEqual(HANDED_OUT_INVOCATIONS);
  });
});
