/**
 * Contract for `scripts/check-shared-tsconfig.ts` — the cross-workspace check that every workspace
 * either extends a config from `packages/typescript-config` or records why it does not.
 *
 * Two halves. The first drives the check against fixture repositories, because the shapes that
 * matter (a config that extends nothing, a solution-style config, an array of bases, an opt-out)
 * cannot all exist in this repository at once. The second runs it against this repository, which
 * is the assertion that actually holds the rule.
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
  MISSING_TSCONFIG,
  NO_SHARED_BASE,
  OPT_OUT_KEY,
  SHARED_CONFIG_PACKAGE,
} from "./check-shared-tsconfig.js";

const RUNNER = path.resolve(import.meta.dirname, "run-check-shared-tsconfig.ts");
const ROOT_FLAG = "--root";

const WORKSPACE_GLOBS = ["packages/*"];
const WORKSPACE_DIR = "packages/thing";
const SHARED_NODE_CONFIG = `${SHARED_CONFIG_PACKAGE}/node.json`;
const SHARED_BASE_CONFIG = `${SHARED_CONFIG_PACKAGE}/base.json`;

const DECLARED_VERSION = "workspace:*";
const OPT_OUT_REASON = "ships plain JavaScript — there is no TypeScript here to type-check";

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
  const root = await createTempDir("shared-tsconfig-");
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
      const target = path.join(workspaceRoot, file);
      mkdirSync(path.dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }

  return root;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

describe("a workspace that has stopped extending the shared config", () => {
  it("is reported, and the check is not clean", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: {
          "tsconfig.json": JSON.stringify({
            compilerOptions: { target: "ES2022", strict: true },
          }),
        },
      },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "diverged", problems: [NO_SHARED_BASE] }],
    });
  });

  it("is reported when it has no tsconfig.json at all", async () => {
    const root = await writeFixtureRepo([{ directory: WORKSPACE_DIR }]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "diverged", problems: [MISSING_TSCONFIG] }],
    });
  });

  it("is reported when it extends the shared config without declaring the package", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        configs: { "tsconfig.json": JSON.stringify({ extends: SHARED_NODE_CONFIG }) },
      },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "diverged", problems: [MISSING_DEPENDENCY] }],
    });
  });

  it("reports both problems when the config and the manifest have each drifted", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        configs: { "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }) },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      {
        workspace: WORKSPACE_DIR,
        outcome: "diverged",
        problems: [NO_SHARED_BASE, MISSING_DEPENDENCY],
      },
    ]);
  });
});

describe("a workspace that reaches the shared config", () => {
  it("is bound when it extends one directly, comments and all", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: {
          "tsconfig.json": [
            "{",
            "  // node.json, because this is a Node package.",
            `  "extends": "${SHARED_NODE_CONFIG}",`,
            '  "include": ["src/**/*"]',
            "}",
          ].join("\n"),
        },
      },
    ]);

    expect(check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_NODE_CONFIG }],
    });
  });

  it("is bound when the shared config is one entry of an extends array", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: {
          "tsconfig.json": JSON.stringify({
            extends: [SHARED_BASE_CONFIG, "astro/tsconfigs/strict"],
          }),
        },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_BASE_CONFIG },
    ]);
  });

  it("is bound when it reaches one through a relative base of its own", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: {
          "tsconfig.json": JSON.stringify({ extends: "./tsconfig.house.json" }),
          "tsconfig.house.json": JSON.stringify({ extends: SHARED_NODE_CONFIG }),
        },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_NODE_CONFIG },
    ]);
  });

  it("is bound when a solution-style config reaches one through its references", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: {
          "tsconfig.json": JSON.stringify({
            files: [],
            references: [{ path: "./tsconfig.app.json" }],
          }),
          "tsconfig.app.json": JSON.stringify({ extends: SHARED_BASE_CONFIG }),
        },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "bound", via: SHARED_BASE_CONFIG },
    ]);
  });

  it("does not loop when two configs extend each other", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: {
          "tsconfig.json": JSON.stringify({ extends: "./tsconfig.other.json" }),
          "tsconfig.other.json": JSON.stringify({ extends: "./tsconfig.json" }),
        },
      },
    ]);

    expect(check({ repoRoot: root }).verdicts).toStrictEqual([
      { workspace: WORKSPACE_DIR, outcome: "diverged", problems: [NO_SHARED_BASE] },
    ]);
  });
});

describe("a workspace that records why it does not extend", () => {
  it("is excused, and its reason is carried through", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        declaresSharedConfig: false,
        manifestExtras: { [OPT_OUT_KEY]: OPT_OUT_REASON },
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
      {
        directory: WORKSPACE_DIR,
        configs: { "tsconfig.json": JSON.stringify({ compilerOptions: { strict: true } }) },
      },
    ]);

    const result = spawnSync("bun", [RUNNER, ROOT_FLAG, root], { encoding: "utf-8" });

    expect(result.status).toBe(EXIT_CODES.ERROR);
    expect(result.stderr).toContain(WORKSPACE_DIR);
    expect(result.stderr).toContain(NO_SHARED_BASE);
    expect(result.stderr, "the message must say how to record a deliberate divergence").toContain(
      OPT_OUT_KEY,
    );
  });

  it("exits zero when every workspace is bound", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        configs: { "tsconfig.json": JSON.stringify({ extends: SHARED_NODE_CONFIG }) },
      },
    ]);

    const result = spawnSync("bun", [RUNNER, ROOT_FLAG, root], { encoding: "utf-8" });

    expect(result.status).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain(SHARED_CONFIG_PACKAGE);
  });
});

describe("this repository", () => {
  it("has no workspace that extends nothing and says nothing about it", () => {
    const { clean, verdicts } = check();

    expect(verdicts.length).toBeGreaterThan(0);
    expect(
      verdicts.filter((verdict) => verdict.outcome === "diverged"),
      "every workspace must extend a shared config or record why it does not",
    ).toStrictEqual([]);
    expect(clean).toBe(true);
  });
});
