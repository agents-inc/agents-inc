/**
 * Refuses a workspace holding a `*.test.ts(x)` outside its `e2e/` that its Vitest config does not
 * collect, since such a file never runs and its suite stays green without it. Run via
 * `bun run deps:check`.
 */
import { realpathSync } from "fs";
import path from "path";

import fg from "fast-glob";
import { createVitest } from "vitest/node";

import {
  findConfig,
  findWorkspaces,
  NO_WORKSPACES,
  VITEST_CONFIG_FILENAMES,
} from "./workspace-manifests.ts";
import { mapInTurn } from "../src/cli/utils/in-turn.ts";
import { toPosixPath } from "../src/cli/utils/posix-path.ts";
import { REPOSITORY_ROOT } from "./repository-root.ts";

const TEST_FILE_GLOBS = ["**/*.test.ts", "**/*.test.tsx"];
const NOT_JUDGED_GLOBS = ["e2e/**", "**/node_modules/**"];

export type WorkspaceVerdict = { workspace: string; collected: string[]; uncollected: string[] };

type CheckResult = { clean: boolean; verdicts: WorkspaceVerdict[] };

export async function check({
  repoRoot = REPOSITORY_ROOT,
}: { repoRoot?: string | undefined } = {}): Promise<CheckResult> {
  // Vitest reports real paths, and a relative root breaks once inWorkingDirectory changes folder.
  const root = realpathSync(path.resolve(repoRoot));
  const workspaces = findWorkspaces(root);
  if (workspaces.length === 0) throw new Error(`${repoRoot} ${NO_WORKSPACES}`);

  // In turn, not in parallel: each config loads from its own working directory.
  const verdicts = await mapInTurn(workspaces, (workspace) => judgeWorkspace(root, workspace));

  return { clean: verdicts.every(({ uncollected }) => uncollected.length === 0), verdicts };
}

async function judgeWorkspace(repoRoot: string, workspace: string): Promise<WorkspaceVerdict> {
  const workspaceRoot = path.join(repoRoot, workspace);
  const testFiles = findTestFiles(workspaceRoot);
  const collected = await filesVitestCollects(workspaceRoot);
  const isCollected = (file: string): boolean => collected.has(file);

  return {
    workspace,
    collected: testFiles.filter(isCollected),
    uncollected: testFiles.filter((file) => !isCollected(file)),
  };
}

function findTestFiles(workspaceRoot: string): string[] {
  // Vitest collects tests under dot-folders too.
  return fg
    .sync(TEST_FILE_GLOBS, { cwd: workspaceRoot, ignore: NOT_JUDGED_GLOBS, dot: true })
    .sort();
}

/** Vitest's own glob, so include, exclude, projects and its default include all apply. */
async function filesVitestCollects(workspaceRoot: string): Promise<Set<string>> {
  const config = findConfig(workspaceRoot, VITEST_CONFIG_FILENAMES);
  if (config === undefined) return new Set();

  return inWorkingDirectory(workspaceRoot, async () => {
    const vitest = await createVitest("test", { root: workspaceRoot, config, watch: false });
    try {
      const specifications = await vitest.globTestSpecifications();
      return new Set(specifications.map(({ moduleId }) => relativeTo(workspaceRoot, moduleId)));
    } finally {
      await vitest.close();
    }
  });
}

/** packages/ui's storybook plugin resolves its configDir against the working directory. */
async function inWorkingDirectory<T>(directory: string, run: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(directory);
  try {
    return await run();
  } finally {
    process.chdir(previous);
  }
}

/** Posix, so a verdict reads the same as the glob results it is compared with. */
function relativeTo(directory: string, filePath: string): string {
  return toPosixPath(path.relative(directory, filePath));
}
