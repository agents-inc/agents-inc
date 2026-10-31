import { spawnSync, type SpawnSyncReturns } from "child_process";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

import { EXIT_CODES } from "../src/cli/lib/exit-codes.js";
import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";
import { typedEntries } from "../src/cli/utils/typed-object.js";

import { check, NO_WORKSPACES } from "./check-vitest-collects-every-test.js";

const RUNNER = path.resolve(import.meta.dirname, "run-check-vitest-collects-every-test.ts");
const ROOT_FLAG = "--root";

const REPOSITORY_ROOT = path.resolve(import.meta.dirname, "../../..");
const RUNNER_FROM_THE_REPOSITORY = "packages/cli/scripts/run-check-vitest-collects-every-test.ts";

const WORKSPACE_GLOBS = ["packages/*"];
const WORKSPACE_DIR = "packages/thing";
const OTHER_WORKSPACE_DIR = "packages/other";

const VITEST_CONFIG = "vitest.config.ts";

const SRC_TEST = "src/format.test.ts";
const SCRIPTS_TEST = "scripts/build.test.ts";
const COMPONENT_TEST = "src/view.test.tsx";
const INTEGRATION_TEST = "src/integration/flow.test.ts";
const DOT_FOLDER_TEST = ".config/setup.test.ts";
const E2E_TEST = "e2e/journey.e2e.test.ts";
const DEPENDENCY_TEST = "node_modules/some-dependency/index.test.ts";

const TEST_BODY = `import { it } from "vitest";\n\nit("runs", () => {});\n`;

const REPOSITORY_CHECK_TIMEOUT_MS = 30_000;

function vitestConfig(test: Record<string, unknown>): string {
  return `export default ${JSON.stringify({ test }, null, 2)};\n`;
}

const SRC_ONLY_CONFIG = vitestConfig({ include: ["src/**/*.test.ts"] });

const SRC_AND_SCRIPTS_CONFIG = vitestConfig({
  include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
});

const SRC_AND_DOT_FOLDER_CONFIG = vitestConfig({
  include: ["src/**/*.test.ts", ".config/**/*.test.ts"],
});

const NO_INCLUDE_CONFIG = vitestConfig({ environment: "node" });

const UNIT_PROJECT = {
  test: { name: "unit", include: ["src/**/*.test.ts"], exclude: ["src/integration/**"] },
};

const INTEGRATION_PROJECT = {
  test: { name: "integration", include: ["src/integration/**/*.test.ts"] },
};

const UNIT_ONLY_PROJECTS_CONFIG = vitestConfig({ projects: [UNIT_PROJECT] });

const UNIT_AND_INTEGRATION_PROJECTS_CONFIG = vitestConfig({
  projects: [UNIT_PROJECT, INTEGRATION_PROJECT],
});

type FixtureWorkspace = { directory: string; files: Record<string, string> };

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixtureRepo(workspaces: FixtureWorkspace[]): Promise<string> {
  const root = await createTempDir("vitest-collects-every-test-");
  roots.push(root);

  writeJson(path.join(root, "package.json"), { workspaces: WORKSPACE_GLOBS });

  for (const workspace of workspaces) {
    const workspaceRoot = path.join(root, workspace.directory);
    mkdirSync(workspaceRoot, { recursive: true });
    writeJson(path.join(workspaceRoot, "package.json"), {
      name: workspace.directory,
      type: "module",
    });

    for (const [file, content] of typedEntries(workspace.files)) {
      const filePath = path.join(workspaceRoot, file);
      mkdirSync(path.dirname(filePath), { recursive: true });
      writeFileSync(filePath, content);
    }
  }

  return root;
}

/** The shape os.tmpdir() has on macOS, where /var links to /private/var. */
async function reachedThroughSymlink(root: string): Promise<string> {
  const holder = await createTempDir("vitest-collects-every-test-link-");
  roots.push(holder);
  const link = path.join(holder, "repo");
  symlinkSync(root, link, "dir");

  return link;
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function runTheCheck(root: string, cwd?: string): SpawnSyncReturns<string> {
  return spawnSync("bun", [RUNNER, ROOT_FLAG, root], { encoding: "utf-8", cwd });
}

describe("the entry point", () => {
  // Spawned: the runner sets the exit code at module scope.
  it("exits non-zero and names the workspace and the file when a test file is not collected", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_ONLY_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [SCRIPTS_TEST]: TEST_BODY,
        },
      },
    ]);

    const result = runTheCheck(root);

    expect(result.status).toBe(EXIT_CODES.ERROR);
    expect(result.stderr).toContain(WORKSPACE_DIR);
    expect(result.stderr).toContain(SCRIPTS_TEST);
    expect(result.stderr, "only the file nothing collects is reported").not.toContain(SRC_TEST);
  });

  it("exits zero when every test file is collected", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_AND_SCRIPTS_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [SCRIPTS_TEST]: TEST_BODY,
        },
      },
    ]);

    const result = runTheCheck(root);

    expect(result.status, result.stderr).toBe(EXIT_CODES.SUCCESS);
  });

  it("exits non-zero on a root matching no workspace, rather than reporting zero of them clean", async () => {
    const root = await writeFixtureRepo([]);

    const result = runTheCheck(root);

    expect(result.status).toBe(EXIT_CODES.ERROR);
    expect(result.stderr).toContain(NO_WORKSPACES);
  });
});

describe("a test file its workspace's vitest config does not collect", () => {
  it("is reported against its own workspace when it sits outside every include pattern", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_ONLY_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [SCRIPTS_TEST]: TEST_BODY,
        },
      },
      {
        directory: OTHER_WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_AND_SCRIPTS_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [SCRIPTS_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [
        {
          workspace: OTHER_WORKSPACE_DIR,
          collected: [SCRIPTS_TEST, SRC_TEST],
          uncollected: [],
        },
        { workspace: WORKSPACE_DIR, collected: [SRC_TEST], uncollected: [SCRIPTS_TEST] },
      ],
    });
  });

  it("is reported when it is a .test.tsx the include patterns do not reach", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_ONLY_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [COMPONENT_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [
        { workspace: WORKSPACE_DIR, collected: [SRC_TEST], uncollected: [COMPONENT_TEST] },
      ],
    });
  });

  it("is reported when it sits under a dot-folder the include patterns do not reach", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_ONLY_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [DOT_FOLDER_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [
        { workspace: WORKSPACE_DIR, collected: [SRC_TEST], uncollected: [DOT_FOLDER_TEST] },
      ],
    });
  });

  it("is reported when the only project including it also excludes it", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: UNIT_ONLY_PROJECTS_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [INTEGRATION_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [
        { workspace: WORKSPACE_DIR, collected: [SRC_TEST], uncollected: [INTEGRATION_TEST] },
      ],
    });
  });

  it("is reported when its workspace has no vitest config at all", async () => {
    const root = await writeFixtureRepo([
      { directory: WORKSPACE_DIR, files: { [SRC_TEST]: TEST_BODY } },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: false,
      verdicts: [{ workspace: WORKSPACE_DIR, collected: [], uncollected: [SRC_TEST] }],
    });
  });
});

describe("a workspace whose test files are all collected", () => {
  it("is clean when each test file matches an include pattern", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_AND_SCRIPTS_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [SCRIPTS_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [
        { workspace: WORKSPACE_DIR, collected: [SCRIPTS_TEST, SRC_TEST], uncollected: [] },
      ],
    });
  });

  it("is clean when a test under a dot-folder matches an include pattern", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_AND_DOT_FOLDER_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [DOT_FOLDER_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [
        { workspace: WORKSPACE_DIR, collected: [DOT_FOLDER_TEST, SRC_TEST], uncollected: [] },
      ],
    });
  });

  it("is clean when a test one project excludes is collected by another", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: UNIT_AND_INTEGRATION_PROJECTS_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [INTEGRATION_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [
        { workspace: WORKSPACE_DIR, collected: [SRC_TEST, INTEGRATION_TEST], uncollected: [] },
      ],
    });
  });

  it("is clean when its config sets no include, since vitest's default collects every test file", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: { [VITEST_CONFIG]: NO_INCLUDE_CONFIG, [SCRIPTS_TEST]: TEST_BODY },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, collected: [SCRIPTS_TEST], uncollected: [] }],
    });
  });

  it("does not judge a test under the workspace's e2e/ directory", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: { [VITEST_CONFIG]: SRC_ONLY_CONFIG, [SRC_TEST]: TEST_BODY, [E2E_TEST]: TEST_BODY },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, collected: [SRC_TEST], uncollected: [] }],
    });
  });

  it("does not judge a test a dependency ships under node_modules", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_ONLY_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [DEPENDENCY_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, collected: [SRC_TEST], uncollected: [] }],
    });
  });

  it("is clean when the workspace holds neither a vitest config nor a test file", async () => {
    const root = await writeFixtureRepo([{ directory: WORKSPACE_DIR, files: {} }]);

    expect(await check({ repoRoot: root })).toStrictEqual({
      clean: true,
      verdicts: [{ workspace: WORKSPACE_DIR, collected: [], uncollected: [] }],
    });
  });
});

describe("a root given by a path other than its real one", () => {
  it("is clean when reached through a symlink and every test file is collected", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_AND_SCRIPTS_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [SCRIPTS_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: await reachedThroughSymlink(root) })).toStrictEqual({
      clean: true,
      verdicts: [
        { workspace: WORKSPACE_DIR, collected: [SCRIPTS_TEST, SRC_TEST], uncollected: [] },
      ],
    });
  });

  it("reports only the uncollected file when reached through a symlink", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_ONLY_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [SCRIPTS_TEST]: TEST_BODY,
        },
      },
    ]);

    expect(await check({ repoRoot: await reachedThroughSymlink(root) })).toStrictEqual({
      clean: false,
      verdicts: [{ workspace: WORKSPACE_DIR, collected: [SRC_TEST], uncollected: [SCRIPTS_TEST] }],
    });
  });

  it("is clean when given relative to the working directory and every test file is collected", async () => {
    const root = await writeFixtureRepo([
      {
        directory: WORKSPACE_DIR,
        files: {
          [VITEST_CONFIG]: SRC_AND_SCRIPTS_CONFIG,
          [SRC_TEST]: TEST_BODY,
          [SCRIPTS_TEST]: TEST_BODY,
        },
      },
    ]);

    const result = runTheCheck(path.basename(root), path.dirname(root));

    expect(result.status, result.stderr).toBe(EXIT_CODES.SUCCESS);
    expect(result.stdout).toContain("2 test files");
  });
});

describe("this repository", () => {
  let repository: Awaited<ReturnType<typeof check>>;

  beforeAll(async () => {
    repository = await check();
  }, REPOSITORY_CHECK_TIMEOUT_MS);

  it("has no test file outside e2e/ that its workspace's vitest config does not collect", () => {
    expect(
      repository.verdicts.filter((verdict) => verdict.uncollected.length > 0),
      "a test file no include reaches never runs, so the gate stays green without it",
    ).toStrictEqual([]);
    expect(repository.clean).toBe(true);
  });

  it("collects the editor's scripts test, which the shared include alone does not reach", () => {
    expect(repository.verdicts).toContainEqual(
      expect.objectContaining({
        workspace: "apps/editor",
        collected: expect.arrayContaining(["scripts/spa-fallback-shell.test.ts"]),
      }),
    );
  });

  it("collects tests through each workspace's projects, including one a sibling project excludes", () => {
    expect(repository.verdicts).toContainEqual(
      expect.objectContaining({
        workspace: "packages/cli",
        collected: expect.arrayContaining([
          "scripts/check-vitest-collects-every-test.test.ts",
          "src/cli/lib/__tests__/commands/compile.test.ts",
        ]),
      }),
    );
    expect(repository.verdicts).toContainEqual(
      expect.objectContaining({
        workspace: "packages/ui",
        collected: expect.arrayContaining(["src/lib/utils.test.ts"]),
      }),
    );
  });

  it("runs the check as part of deps:check", () => {
    const manifest = z
      .object({ scripts: z.record(z.string(), z.string()) })
      .parse(JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, "package.json"), "utf-8")));

    expect(manifest.scripts["deps:check"]).toContain(RUNNER_FROM_THE_REPOSITORY);
  });
});
