/**
 * Refuses a workspace whose root Vitest config neither extends `packages/vitest-config` nor
 * records in its `package.json` why not. Run via `bun run deps:check`.
 */
import path from "path";

import {
  configNamesOf,
  type DivergedVerdict,
  findConfig,
  findSharedImport,
  judgeEveryWorkspace,
  PACKAGE_JSON,
  readWorkspaceManifest,
  type SharedConfig,
  VITEST_CONFIG_FILENAMES,
} from "./workspace-manifests.ts";
import { REPOSITORY_ROOT } from "./repository-root.ts";

export const SHARED_CONFIG_PACKAGE = "@workspace/vitest-config";

/** Opt-out key in a workspace's `package.json`; its value is the reason, which the runner prints. */
export const OPT_OUT_KEY = "//no-shared-vitest-config";

const SHARED_CONFIG: SharedConfig = { packageName: SHARED_CONFIG_PACKAGE, optOutKey: OPT_OUT_KEY };

export const NO_SHARED_IMPORT = `${configNamesOf(VITEST_CONFIG_FILENAMES)} imports nothing from ${SHARED_CONFIG_PACKAGE}`;
export const MISSING_DEPENDENCY = `${PACKAGE_JSON} does not declare ${SHARED_CONFIG_PACKAGE}`;

export type WorkspaceVerdict =
  | { workspace: string; outcome: "bound"; via: string }
  | { workspace: string; outcome: "opted-out"; reason: string }
  | { workspace: string; outcome: "no-suite" }
  | DivergedVerdict;

export type CheckResult = { clean: boolean; verdicts: WorkspaceVerdict[] };

export function check({
  repoRoot = REPOSITORY_ROOT,
}: { repoRoot?: string | undefined } = {}): CheckResult {
  return judgeEveryWorkspace(repoRoot, judgeWorkspace);
}

function judgeWorkspace(repoRoot: string, workspace: string): WorkspaceVerdict {
  const workspaceRoot = path.join(repoRoot, workspace);
  const { optOutReason, declaresSharedConfig } = readWorkspaceManifest(
    workspaceRoot,
    SHARED_CONFIG,
  );

  if (optOutReason !== undefined) {
    return { workspace, outcome: "opted-out", reason: optOutReason };
  }

  const configPath = findConfig(workspaceRoot, VITEST_CONFIG_FILENAMES);
  if (configPath === undefined) {
    return { workspace, outcome: "no-suite" };
  }

  const undeclared = declaresSharedConfig ? [] : [MISSING_DEPENDENCY];

  const via = findSharedImport(configPath, SHARED_CONFIG_PACKAGE);
  if (via === undefined) {
    return { workspace, outcome: "diverged", problems: [NO_SHARED_IMPORT, ...undeclared] };
  }

  if (undeclared.length > 0) {
    return { workspace, outcome: "diverged", problems: undeclared };
  }

  return { workspace, outcome: "bound", via };
}
