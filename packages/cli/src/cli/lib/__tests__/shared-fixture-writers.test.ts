import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { beforeAll, describe, expect, it } from "vitest";

import { bytewise } from "../../utils/string.js";
import { invokedNamesIn } from "./helpers/test-only-invocations.js";

/**
 * Who may write a fixture at a machine-wide `os.tmpdir()` path. The unit and E2E runs share one
 * machine and nothing orders them, so a spec writing one corrupts another run's fixture mid-read.
 * `shared-source.ts` states the rule.
 */
const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

const EVERY_MODULE = ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts", "scripts/**/*.ts", "*.ts"];

/**
 * Writer -> every file allowed to call it, as an equality: a new caller fails, and so does a rename
 * that leaves the writer with none. `handrun-journeys.ts` is a top-level runner, not a spec.
 */
const MACHINE_WIDE_FIXTURE_WRITERS: Record<string, readonly string[]> = {
  buildSharedSource: ["e2e/global-setup.ts", "e2e/handrun-journeys.ts"],
  removeSharedSource: ["e2e/global-setup.ts", "e2e/handrun-journeys.ts"],
  ensureSharedMarketplaceCheckout: ["vitest.global-setup.ts"],
};

type ScannedModule = { file: string; invoked: readonly string[] };

async function scanEveryModule(): Promise<ScannedModule[]> {
  const files = await fg(EVERY_MODULE, { cwd: CLI_ROOT, absolute: false });

  return Promise.all(
    files.sort(bytewise).map(async (file) => ({
      file,
      invoked: invokedNamesIn(await readFile(path.join(CLI_ROOT, file), "utf8"), file),
    })),
  );
}

const A_TREE_RATHER_THAN_NOTHING = 100;

/** Each root-taking seam's callers: the wrapper naming the fixed path, and its spec. */
const ROOT_TAKING_SEAMS: Record<string, readonly string[]> = {
  buildFrozenSourceTree: [
    "src/cli/lib/__tests__/helpers/shared-source.test.ts",
    "src/cli/lib/__tests__/helpers/shared-source.ts",
  ],
  removeFrozenSourceTree: [
    "src/cli/lib/__tests__/helpers/shared-source.test.ts",
    "src/cli/lib/__tests__/helpers/shared-source.ts",
  ],
  ensureRecordedCheckout: [
    "src/cli/lib/__tests__/helpers/shared-marketplace-checkout.test.ts",
    "src/cli/lib/__tests__/helpers/shared-marketplace-checkout.ts",
  ],
};

describe("the shared-/tmp fixture family", () => {
  let modules: ScannedModule[];

  beforeAll(async () => {
    modules = await scanEveryModule();
  });

  function callersOf(name: string): string[] {
    return modules.filter((module) => module.invoked.includes(name)).map((module) => module.file);
  }

  function callersByWriter(): Record<string, string[]> {
    return Object.fromEntries(
      Object.keys(MACHINE_WIDE_FIXTURE_WRITERS).map((name) => [name, callersOf(name)]),
    );
  }

  it("is written only from the runners that own it", () => {
    expect(callersByWriter()).toStrictEqual(MACHINE_WIDE_FIXTURE_WRITERS);
  });

  /** Subject guard: an empty walk or a blind reader would satisfy the gate above in silence. */
  it("is judged by a walk that found the tree and a reader that finds an invocation", () => {
    expect(modules.length).toBeGreaterThan(A_TREE_RATHER_THAN_NOTHING);
    expect(invokedNamesIn("await buildSharedSource(build);", "planted.ts")).toContain(
      "buildSharedSource",
    );
  });

  /** The root-taking sibling is what a spec drives instead; named here beside the rule. */
  it("offers every writer a root-taking sibling for a spec to drive instead", () => {
    const seamCallers = Object.fromEntries(
      Object.keys(ROOT_TAKING_SEAMS).map((seam) => [seam, callersOf(seam)]),
    );

    expect(seamCallers).toStrictEqual(ROOT_TAKING_SEAMS);
  });
});
