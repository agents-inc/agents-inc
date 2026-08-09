/**
 * Contract for `scripts/check-shared-vitest-config.ts` — the cross-workspace check that every
 * workspace running Vitest either extends `@workspace/vitest-config` or records why it does not.
 *
 * Two halves, like its tsconfig sibling. The first drives the check against fixture repositories,
 * because the shapes that matter (a standalone config, a re-export, a config that names the shared
 * package only in the comment explaining why it does not use it, an opt-out) cannot all exist in
 * this repository at once. The second runs it against this repository, which is the assertion that
 * actually holds the rule.
 */
import { spawnSync } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  check,
  MISSING_DEPENDENCY,
  NO_SHARED_IMPORT,
  OPT_OUT_KEY,
  SHARED_CONFIG_PACKAGE,
} from "./check-shared-vitest-config.js";

const RUNNER = path.resolve(import.meta.dirname, "run-check-shared-vitest-config.ts");
const ROOT_FLAG = "--root";

const WORKSPACE_GLOBS = ["packages/*"];
const WORKSPACE_DIR = "packages/thing";
const SHARED_NODE_ENTRY = `${SHARED_CONFIG_PACKAGE}/node`;

const VITEST_CONFIG_TS = "vitest.config.ts";
const VITEST_CONFIG_MTS = "vitest.config.mts";

const DECLARED_VERSION = "workspace:*";
const OPT_OUT_REASON =
  "a browser suite — the shared config is node-only, and every option it sets is the opposite of what this needs";

const MERGING_CONFIG = [
  `import { nodeConfig } from "${SHARED_NODE_ENTRY}"`,
  `import { mergeConfig } from "vitest/config"`,
  ``,
  `export default mergeConfig(nodeConfig, { test: { name: "thing" } })`,
].join("\n");

const RE_EXPORTING_CONFIG = `export { nodeConfig as default } from "${SHARED_NODE_ENTRY}"\n`;

const STANDALONE_CONFIG = [
  `import { defineConfig } from "vitest/config"`,
  ``,
  `export default defineConfig({ test: { environment: "node", globals: true } })`,
].join("\n");

const CONFIG_NAMING_THE_SHARED_PACKAGE_IN_A_COMMENT = [
  `import { defineConfig } from "vitest/config"`,
  ``,
  `// Standalone rather than ${SHARED_NODE_ENTRY}: this suite runs in a real browser.`,
  `export default defineConfig({ test: { browser: { enabled: true } } })`,
].join("\n");

/** One workspace to write into a fixture repository. */
type FixtureWorkspace = {
  directory: string;
  declaresSharedConfig?: boolean;
  manifestExtras?: Record<string, string>;
  configs?: Record<string, string>;
};

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixtureRepo(workspaces: FixtureWorkspace[]): Promise<string> {
  const root = await createTempDir("shared-vitest-config-");
  roots.push(root);

  writeJson(path.join(root, "package.json"), { workspaces: WORKSPACE_GLOBS });

  for (const workspace of workspaces) {
    const workspaceRoot = path.join(root, workspace.directory);
    mkdirSync(workspaceRoot, { recursive: true });

    writeJson(path.join(workspaceRoot, "package.json"), {
      name: workspace.directory,
      ...(workspace.declaresSharedConfig === false
        ? {}
        : { devDependencies: { [SHARED_CONFIG_PACKAGE]: DECLARED_VERSION } }),
      ...workspace.manifestExtras,
    });

    for (const [file, content] of Object.entries(workspace.configs ?? {})) {
      writeFileSync(path.join(workspaceRoot, file), content);
    }
  }

  return root;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("a workspace whose vitest config stands alone", () => {
  it("is reported, and the check is not clean", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [VITEST_CONFIG_TS]: STANDALONE_CONFIG } },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "diverged", problems: [NO_SHARED_IMPORT] }],
    });
  });

  it("is reported when it only names the shared package in a comment", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: { [VITEST_CONFIG_TS]: CONFIG_NAMING_THE_SHARED_PACKAGE_IN_A_COMMENT },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "diverged", problems: [NO_SHARED_IMPORT] },
    ]);
  });

  it("is reported when it extends the shared config without declaring the package", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        configs: { [VITEST_CONFIG_TS]: MERGING_CONFIG },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "diverged", problems: [MISSING_DEPENDENCY] },
    ]);
  });

  it("reports both problems when the config and the manifest have each drifted", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        configs: { [VITEST_CONFIG_TS]: STANDALONE_CONFIG },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      {
        workspace: WORKSPACE_DIR,
        outcome: "diverged",
        problems: [NO_SHARED_IMPORT, MISSING_DEPENDENCY],
      },
    ]);
  });
});

describe("a workspace whose vitest config reaches the shared one", () => {
  it("is bound when it merges the shared config into its own", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [VITEST_CONFIG_TS]: MERGING_CONFIG } },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_NODE_ENTRY }],
    });
  });

  it("is bound when its whole config is a re-export of the shared one", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [VITEST_CONFIG_TS]: RE_EXPORTING_CONFIG } },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_NODE_ENTRY },
    ]);
  });

  it("is bound when the config carries one of vitest's other extensions", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [VITEST_CONFIG_MTS]: MERGING_CONFIG } },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_NODE_ENTRY },
    ]);
  });
});

describe("a workspace that runs no vitest at all", () => {
  it("is not judged, and is not asked to declare a package it cannot use", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, declaresSharedConfig: false },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "no-suite" }],
    });
  });
});

describe("a workspace that records why it stands alone", () => {
  it("is excused, and its reason is carried through", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        manifestExtras: { [OPT_OUT_KEY]: OPT_OUT_REASON },
        configs: { [VITEST_CONFIG_TS]: STANDALONE_CONFIG },
      },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "opted-out", reason: OPT_OUT_REASON }],
    });
  });
});

describe("the entry point", () => {
  // Spawned rather than imported: the exit code is the thing under test, and the runner sets it at
  // module scope. `bun` is what runs every script in this package and what CI installs, so it is
  // available wherever this suite is.
  it("exits non-zero and names the workspace when one has diverged", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [VITEST_CONFIG_TS]: STANDALONE_CONFIG } },
    ]);

    const result = spawnSync("bun", [RUNNER, ROOT_FLAG, root], { encoding: "utf-8" });

    expect(result.status).toBe(EXIT_CODES.ERROR);
    expect(result.stderr).toContain(WORKSPACE_DIR);
    expect(result.stderr).toContain(NO_SHARED_IMPORT);
    expect(result.stderr, "the message must say how to record a deliberate divergence").toContain(
      OPT_OUT_KEY,
    );
  });

  it("exits zero when every workspace is bound", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, configs: { [VITEST_CONFIG_TS]: MERGING_CONFIG } },
    ]);

    const result = spawnSync("bun", [RUNNER, ROOT_FLAG, root], { encoding: "utf-8" });

    expect(result.status).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain(SHARED_CONFIG_PACKAGE);
  });
});

describe("this repository", () => {
  it("excuses the two suites that record why they stand alone", () => {
    const excused = check()
      .verdicts.filter((verdict) => verdict.outcome === "opted-out")
      .map((verdict) => verdict.workspace);

    expect(excused, "the CLI's multi-project suite is a recorded decision, not a defect").toContain(
      "packages/cli",
    );
    expect(excused, "the browser-mode Storybook suite is a recorded decision").toContain(
      "packages/ui",
    );
  });

  it("binds the suites that extend the shared config", () => {
    const bound = check()
      .verdicts.filter((verdict) => verdict.outcome === "bound")
      .map((verdict) => verdict.workspace);

    // Named rather than counted. A list pinned to today's membership is a limit that breaks the
    // next time the repository grows a workspace, which says nothing about this rule.
    expect(bound).toContain("apps/editor");
    expect(
      bound,
      "the standalone config that prompted this check must stay bound to the shared one",
    ).toContain("apps/server");
    expect(bound).toContain("packages/matrix");
  });

  it("does not judge the workspaces that run no suite", () => {
    const unjudged = check()
      .verdicts.filter((verdict) => verdict.outcome === "no-suite")
      .map((verdict) => verdict.workspace);

    // Named rather than counted, and named at all because `no-suite` is an EXIT
    // as well as an exemption: deleting a workspace's vitest.config.ts moves it
    // from `bound` to here, which passes. The repository-level test below cannot
    // see that, so this list and the `bound` list above are between them the only
    // thing that notices a workspace leaving the rule.
    expect(unjudged).toContain("apps/www");
    expect(unjudged).toContain("packages/api-mocks");
    expect(unjudged).toContain("packages/eslint-config");
    expect(unjudged).toContain("packages/prettier-config");
    expect(unjudged).toContain("packages/typescript-config");
    expect(unjudged).toContain("packages/vitest-config");
  });

  it("has no workspace whose vitest config extends nothing and says nothing about it", () => {
    const { clean, verdicts } = check();

    expect(verdicts.length).toBeGreaterThan(0);
    expect(
      verdicts.filter((verdict) => verdict.outcome === "diverged"),
      "every vitest config must extend the shared config or record why it does not",
    ).toStrictEqual([]);
    expect(clean).toBe(true);
  });
});
