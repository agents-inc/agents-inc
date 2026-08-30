import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { bytewise } from "../../utils/string.js";
import {
  exportedCallablesIn,
  invokedNamesIn,
  isTestSupportModule,
} from "./helpers/test-only-invocations.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

/** Every TypeScript module the package holds — what ships, what builds it, and what tests it. */
const EVERY_MODULE = ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts", "scripts/**/*.ts", "*.ts"];

/** The tree whose exports are judged. A script or a build config declares nothing a user calls. */
const SHIPPED_TREE = "src/";

/** One module, read once, so every question below is a lookup rather than a second parse. */
type ScannedModule = {
  /** Path relative to the package root. */
  file: string;
  /** The callables this module offers under a name. */
  exported: readonly string[];
  /** The names this module reaches as values. */
  invoked: readonly string[];
};

/** An exported symbol and the module that declares it, which is what the roster is compared on. */
type ExportSite = { file: string; name: string };

type Posture =
  /** The suite is its whole audience by design, and nothing about it should change. */
  | "test utility"
  /** Nothing has decided whether this is dead or is a live path nothing wired up. */
  | "unjudged";

type TestOnlyExport = ExportSite & { posture: Posture };

/**
 * Every exported symbol in `src/` that the suite invokes and the package never does, with the
 * posture taken on each. Sorted by file and then name, which is the order the assertion imposes.
 *
 * **`posture` is the difference between a decision and a backlog row.** A `test utility` is a
 * symbol the suite is meant to be the whole audience of, and nothing about it should change:
 * `assertDistIsFresh` refuses the whole run when `dist/` predates the tree compiled into it, and
 * a production caller would mean the shipped CLI checks its own build freshness at runtime.
 * `unjudged` is the opposite — a symbol whose specs pass while nothing a user runs reaches it,
 * named rather than deleted because choosing between deleting one and wiring it up is a
 * per-symbol ruling. The deletions that preceded this file each needed one: establishing that
 * the largest of them was dead rather than the real entry point meant showing that the live path
 * differed from it in four separate ways.
 *
 * **The backlog is what makes this gate landable rather than what makes it weak.** A gate opening
 * with a demand for two dozen deletions is reverted the first time it is inconvenient. What it
 * buys immediately is the NEXT symbol, which fails here on the day it is written; and the list
 * can only fall, because a symbol deleted or wired up has to leave this array in the same change
 * for the comparison to hold. `posture` is the claim, and each entry's comment is its evidence.
 *
 * Re-derive rather than trusting the length of this array — the assertion prints the difference.
 */
const TEST_ONLY_EXPORTS = [
  {
    file: "src/cli/lib/configuration/config-writer.ts",
    name: "getGlobalConfigImportPath",
    // Not a test utility — a production function with no production caller, which is a different
    // thing and is stated rather than hidden. It builds the specifier for the config form that
    // extends the global config by IMPORTING it, and nothing selects that form: the one site
    // passing `isProjectConfig` (`writeProjectConfigPair` in `config-gate/propagate.ts`) always
    // passes `globalConfig` alongside, which takes the inlining branch instead. It became
    // test-only when the renderers moved into `@workspace/compile` and the path became an
    // argument (`options.globalImportPath`) rather than a read inside `generateConfigSource` —
    // a browser has no `os.homedir()`. Delete-or-keep is a decision the extraction deliberately
    // did not take.
    posture: "unjudged",
  },
  {
    file: "src/cli/lib/testing/dist-staleness.ts",
    name: "assertDistIsFresh",
    // The one decision here. Every caller is a runner's own entry point or the E2E harness, and
    // each is test support by definition: it runs before a suite to refuse a `dist/` that is
    // absent or predates the tree, so a production caller would mean the shipped CLI checks its
    // own build freshness at runtime, which it must not.
    posture: "test utility",
  },
  {
    file: "src/cli/lib/testing/dist-staleness.ts",
    name: "assertDistIsPresent",
    // Its sibling's decision again. `e2e/helpers/test-utils.ts` is its caller and is harness by
    // definition: it refuses a spec file that begins with nothing under `dist/` to spawn, so a
    // production caller would mean the shipped CLI checks for its own build before running.
    posture: "test utility",
  },
  {
    file: "src/cli/lib/testing/dist-staleness.ts",
    name: "guardAgainstDistReplacement",
    // Its sibling's decision, for its sibling's reason. `vitest.setup.ts` and `e2e/setup.ts` are
    // its only callers, and both are test support by definition: it refuses a spec whose `dist/`
    // was emptied mid-run by a build started elsewhere in the same checkout, so a production
    // caller would mean the shipped CLI watches its own build directory while it runs.
    posture: "test utility",
  },
  {
    file: "src/cli/utils/exec.ts",
    name: "claudePluginMarketplaceRemove",
    // The second decision. `Add` is reached from the marketplace operation, `Update` from
    // `update`, and `List` from this module's own `Exists` — so the door is live and this arm
    // is deliberately not: a marketplace is user-level state shared across every project under
    // one HOME, and no command creates it on a project's behalf, so no project-scoped command
    // may delete it. The suite is its whole audience because the suite IS the caller that
    // creates marketplaces of its own — `e2e/global-setup.ts` sweeps the ones a run leaves
    // behind, which is what keeps `home-isolation.smoke.test.ts` a statement about isolation.
    posture: "test utility",
  },
] as const satisfies readonly TestOnlyExport[];

async function scanModule(file: string): Promise<ScannedModule> {
  const source = await readFile(path.join(CLI_ROOT, file), "utf8");

  return {
    file,
    exported: exportedCallablesIn(source, file),
    invoked: invokedNamesIn(source, file),
  };
}

async function scanTheTree(): Promise<ScannedModule[]> {
  const files = (await fg(EVERY_MODULE, { cwd: CLI_ROOT })).sort();

  return Promise.all(files.map(scanModule));
}

function namesInvokedBy(modules: readonly ScannedModule[]): Set<string> {
  return new Set(modules.flatMap((module) => module.invoked));
}

function isTestSupport(module: ScannedModule): boolean {
  return isTestSupportModule(module.file);
}

function isProduction(module: ScannedModule): boolean {
  return !isTestSupport(module);
}

/** A module that ships. Its exports are the ones a user could reach, so they are the ones judged. */
function isShippedProductionModule(module: ScannedModule): boolean {
  return module.file.startsWith(SHIPPED_TREE) && isProduction(module);
}

function exportSitesOf(modules: readonly ScannedModule[]): ExportSite[] {
  return modules.flatMap((module) => module.exported.map((name) => ({ file: module.file, name })));
}

function byFileThenName(left: ExportSite, right: ExportSite): number {
  return bytewise(`${left.file}:${left.name}`, `${right.file}:${right.name}`);
}

/**
 * An exported symbol in `src/` that the SUITE invokes and the package never does is dead code
 * whose specs read as coverage of a live feature.
 *
 * `installEject`'s own docblock called it "the main entry point for the 'eject' install mode"
 * while `init.tsx` called the operations layer instead. Twelve such symbols were deleted at once,
 * carrying 116 test invocations between them, and every one of those specs was green about a code
 * path no run could reach — which is the strongest form of the defect, because the tests look
 * like the coverage that would have caught it.
 *
 * **INVOCATIONS rather than references, which is the whole difficulty.** The census that produced
 * those deletions reported two of them as reached: a barrel's `export { installEject } from ...`
 * and a doc comment's link tag naming it are production references, and neither keeps a
 * symbol alive. It also condemned a live one, because `isSnakeCase` is handed straight to
 * `.filter(isSnakeCase)` and a reader keying on `name(` cannot see that. All three shapes are
 * planted against the reader in `helpers/test-only-invocations.test.ts`, because a scan whose
 * only input is a tree with nothing wrong in it has never been shown to report anything.
 */
describe("every exported symbol the suite invokes is one the package invokes too", () => {
  it("reaches production from each, or names it here with its posture", async () => {
    const modules = await scanTheTree();
    const reachedByProduction = namesInvokedBy(modules.filter(isProduction));
    const reachedByTests = namesInvokedBy(modules.filter(isTestSupport));
    const shipped = exportSitesOf(modules.filter(isShippedProductionModule));

    // Subject guard, both halves. A walk that matched nothing and a reader that recognised none of
    // what it matched each satisfy the comparison below for free, and they fail differently: the
    // first leaves nothing to judge, the second leaves everything judged dead. Neither says
    // anything about which shapes the reader accepts — that is proved beside the reader itself.
    expect(
      shipped.length,
      "no exported callable was found anywhere in src/ — the scan has stopped reading",
    ).toBeGreaterThan(0);
    expect(
      shipped.filter(({ name }) => reachedByProduction.has(name)).length,
      "no exported callable is reached by production code at all — the invocation side has stopped reading",
    ).toBeGreaterThan(0);

    const invokedByTestsAlone = shipped
      .filter(({ name }) => reachedByTests.has(name) && !reachedByProduction.has(name))
      .sort(byFileThenName);

    expect(
      invokedByTestsAlone,
      "an exported symbol only the suite invokes — its specs read as coverage of a live feature and cover nothing a user reaches",
    ).toStrictEqual(TEST_ONLY_EXPORTS.map(({ file, name }) => ({ file, name })));
  });
});
