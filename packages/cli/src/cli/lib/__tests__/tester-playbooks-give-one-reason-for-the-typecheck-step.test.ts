import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import type { AgentName } from "../../types/generated/source-types.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const TESTERS_DIR = path.join(CLI_ROOT, "src", "agents", "tester");

/** Typed to `AgentName`, so retiring a tester is a compile error here. */
const TESTERS = [
  "ai-tester",
  "api-tester",
  "cli-tester",
  "web-tester",
] as const satisfies readonly AgentName[];

/** The step's reason as every tester words it, with the playbook's line wrap collapsed. */
const TYPECHECK_REASON =
  "fix every error it reports in a test file — a runner that strips types runs a test file the compiler rejects";

async function playbookOf(tester: AgentName): Promise<string> {
  const source = await readFile(path.join(TESTERS_DIR, tester, "playbook.md"), "utf8");
  return source.replace(/\s+/g, " ");
}

describe("the testers' typecheck step", () => {
  it("names every tester on disk", async () => {
    const onDisk = await fg("*", { cwd: TESTERS_DIR, onlyDirectories: true });

    expect(onDisk.sort()).toStrictEqual([...TESTERS]);
  });

  it.each(TESTERS)("%s gives the reason every tester gives", async (tester) => {
    expect(await playbookOf(tester)).toContain(TYPECHECK_REASON);
  });
});
