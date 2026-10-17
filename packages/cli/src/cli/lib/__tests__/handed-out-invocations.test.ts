import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { HANDED_OUT_INVOCATIONS, invocationsIn } from "./helpers/handed-out-invocations.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Tests are excluded: a spec quoting a message is not the CLI saying it. */
const SHIPPED_SOURCES = ["src/cli/**/*.ts", "src/cli/**/*.tsx"];
const NOT_SHIPPED = ["src/cli/**/*.test.ts", "src/cli/**/*.test.tsx", "src/cli/**/__tests__/**"];

async function everyShippedSource(): Promise<string> {
  const files = await fg(SHIPPED_SOURCES, { cwd: CLI_ROOT, ignore: NOT_SHIPPED });
  const sources = await Promise.all(
    files.sort().map((file) => readFile(path.join(CLI_ROOT, file), "utf8")),
  );
  return sources.join("\n");
}

/** Binds `HANDED_OUT_INVOCATIONS` to the messages; `handed-out-invocations.e2e.test.ts` runs it. */
describe("the invocations the CLI hands out are the ones a spec runs", () => {
  it("finds in src exactly the invocations the run-it list names", async () => {
    const found = invocationsIn(await everyShippedSource());

    // Subject guard: a scan matching nothing would satisfy everything.
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
