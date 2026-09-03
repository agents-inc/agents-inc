import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { beforeAll, describe, expect, it } from "vitest";

import { bytewise } from "../../utils/string.js";
import { invokedNamesIn } from "./helpers/test-only-invocations.js";

/**
 * The gate over the shared-`/tmp` fixture family: who is allowed to WRITE a fixture that lives at
 * a machine-wide path.
 *
 * Two of these fixtures exist, both under `os.tmpdir()` and both at a path derived rather than
 * randomised, because `globalSetup` runs in vitest's own process and the specs run in forked
 * workers — neither side can be handed the location, so both compute it. `shared-source.ts`
 * carries that reasoning in full and states the rule this file enforces.
 *
 * What the fixed path costs is that the address belongs to the MACHINE and not to the run. The
 * unit and E2E projects are separate vitest runs over one tree and nothing orders them —
 * `turbo run test test:e2e` is one invocation and two concurrent tasks — so a second writer is
 * a writer into another run's fixture while it is being read. `shared-source.test.ts` was one for
 * months: collected by the `unit` project, it called `buildSharedSource` on the real E2E path in
 * six specs and `removeSharedSource()` in an `afterEach`, and both sides stayed green while it
 * deleted the tree those E2E specs read. Reproduced on 2026-09-02 by planting a file under
 * `/tmp/agents-inc-e2e-shared-fixtures/` and running that one spec file: seven passes, and the
 * planted file gone.
 *
 * Prose could not have caught that and this is not a second statement of the prose: what makes a
 * writer legitimate is WHERE IT IS CALLED FROM, which is a fact about the tree and therefore
 * something a walk can answer.
 */
const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Every TypeScript module the package holds — what ships, what builds it, and what tests it. */
const EVERY_MODULE = ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts", "scripts/**/*.ts", "*.ts"];

/**
 * Each function that writes to a machine-wide fixture path, against every file allowed to reach
 * it — asserted as an equality, so the roster fails in both directions.
 *
 * A NEW caller fails because it is not on its writer's list, which is the defect above. And a
 * RENAME fails because the stated symbol then has no caller at all, which is the quieter half:
 * a roster naming a symbol nothing invokes is a gate reporting green over a rule it has stopped
 * covering, and a rename is exactly how a scan keyed on names stops covering one.
 *
 * `handrun-journeys.ts` is on two of these lists and is not an exception to the rule. It is the
 * hand-run's own top-level runner — step 4 of the change workflow, started by a person and never
 * by a suite — so it owns its run's fixtures the way a `globalSetup` owns a suite's. What the
 * rule forbids is a SPEC writing one, because a spec runs inside somebody else's run.
 */
const MACHINE_WIDE_FIXTURE_WRITERS: Record<string, readonly string[]> = {
  buildSharedSource: ["e2e/global-setup.ts", "e2e/handrun-journeys.ts"],
  removeSharedSource: ["e2e/global-setup.ts", "e2e/handrun-journeys.ts"],
  ensureSharedMarketplaceCheckout: ["vitest.global-setup.ts"],
};

/** A file and the names it reaches as values, read once so each question below is a lookup. */
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

/** The smallest number of modules a walk that actually found this package can come back with. */
const A_TREE_RATHER_THAN_NOTHING = 100;

/**
 * Each root-taking seam against everything that reaches it: the shared wrapper that supplies the
 * machine-wide path, and the spec the seam exists for.
 *
 * Two callers is the whole design in one line — the wrapper is where the fixed path is named, and
 * the spec is where a root is created instead. A seam that loses its spec, or gains a caller that
 * is neither, fails here.
 */
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

  /**
   * The subject guard, both halves. A walk that matched nothing and a reader that recognised
   * nothing would each satisfy the gate above in silence — the first because no file was read,
   * the second because every roster would come back empty, and an all-empty comparison against
   * an all-empty roster is the shape a broken scan takes.
   */
  it("is judged by a walk that found the tree and a reader that finds an invocation", () => {
    expect(modules.length).toBeGreaterThan(A_TREE_RATHER_THAN_NOTHING);
    expect(invokedNamesIn("await buildSharedSource(build);", "planted.ts")).toContain(
      "buildSharedSource",
    );
  });

  /**
   * The mechanism each writer delegates to takes its root as a parameter, and that is what a spec
   * is meant to reach instead — `shared-source.test.ts` and `shared-marketplace-checkout.test.ts`
   * both drive one at a root they created. Named here so that deleting a seam fails beside the
   * rule that explains why it exists, rather than only inside the spec that happens to use it.
   */
  it("offers every writer a root-taking sibling for a spec to drive instead", () => {
    const seamCallers = Object.fromEntries(
      Object.keys(ROOT_TAKING_SEAMS).map((seam) => [seam, callersOf(seam)]),
    );

    expect(seamCallers).toStrictEqual(ROOT_TAKING_SEAMS);
  });
});
