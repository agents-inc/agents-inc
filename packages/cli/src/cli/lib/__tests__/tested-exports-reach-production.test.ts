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

const EVERY_MODULE = ["src/**/*.ts", "src/**/*.tsx", "e2e/**/*.ts", "scripts/**/*.ts", "*.ts"];

/** A script or a build config declares nothing a user calls. */
const SHIPPED_TREE = "src/";

type ScannedModule = {
  file: string;
  exported: readonly string[];
  invoked: readonly string[];
};

type ExportSite = { file: string; name: string };

type Posture =
  | "test utility"
  /** Undecided: dead, or a live path nothing wired up. */
  | "unjudged";

type TestOnlyExport = ExportSite & { posture: Posture };

/**
 * Exported `src/` symbols the suite invokes and the package never does, sorted by file then name.
 * `test utility`: the suite is its intended audience. `unjudged`: deleting or wiring it up is a
 * per-symbol ruling still owed. The list can only shrink; each entry's comment is its evidence.
 */
const TEST_ONLY_EXPORTS = [
  {
    file: "src/cli/components/common/summary-panel.tsx",
    name: "SummaryPanel",
    // Its production readers went with the wizard; kept for the unbuilt `edit --from` info table.
    posture: "unjudged",
  },
  {
    file: "src/cli/lib/configuration/config-writer.ts",
    name: "getGlobalConfigImportPath",
    // A production function with no caller: nothing selects the import-the-global-config form.
    posture: "unjudged",
  },
  {
    file: "src/cli/lib/hosts/claude-host.ts",
    name: "claudePluginMarketplaceRemove",
    // A marketplace is user-level state, so no project command may remove one; e2e setup does.
    posture: "test utility",
  },
  {
    file: "src/cli/lib/installation/install-layout.ts",
    name: "forgetTheProviderChosenForThisRun",
    // A worker outlives a `--provider` choice, so specs need the reset a one-shot CLI does not.
    posture: "test utility",
  },
  {
    file: "src/cli/lib/installation/install-layout.ts",
    name: "ownedRoots",
    // A host role nothing asks until a second provider can be installed.
    posture: "unjudged",
  },
  {
    file: "src/cli/lib/installation/install-layout.ts",
    name: "pluginRegistry",
    // A host role; `getInstalledPluginsRegistryPath` is the reader that would take it.
    posture: "unjudged",
  },
  {
    file: "src/cli/lib/testing/dist-staleness.ts",
    name: "assertDistIsFresh",
    // Run before suites to refuse a stale `dist/`; the shipped CLI must not check its own build.
    posture: "test utility",
  },
  {
    file: "src/cli/lib/testing/dist-staleness.ts",
    name: "assertDistIsPresent",
    // The E2E harness refuses a spec when `dist/` is empty; the shipped CLI must not.
    posture: "test utility",
  },
  {
    file: "src/cli/lib/testing/dist-staleness.ts",
    name: "guardAgainstDistReplacement",
    // Refuses a spec whose `dist/` was emptied mid-run; the shipped CLI must not watch its build.
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
 * A `src/` export only the suite invokes is dead code whose specs read as live coverage. Matched on
 * invocations, not references (barrels and doc links keep nothing alive); the reader's shapes are
 * planted in `helpers/test-only-invocations.test.ts`.
 */
describe("every exported symbol the suite invokes is one the package invokes too", () => {
  it("reaches production from each, or names it here with its posture", async () => {
    const modules = await scanTheTree();
    const reachedByProduction = namesInvokedBy(modules.filter(isProduction));
    const reachedByTests = namesInvokedBy(modules.filter(isTestSupport));
    const shipped = exportSitesOf(modules.filter(isShippedProductionModule));

    // Subject guard: an empty walk or a blind reader each satisfy the comparison for free.
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
