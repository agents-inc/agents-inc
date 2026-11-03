/**
 * Refuses a workspace whose ESLint config neither extends `packages/eslint-config` nor records
 * in its `package.json` why not. Run via `bun run deps:check`.
 */
import path from "path";

import fg from "fast-glob";

import {
  type ConfigFilenames,
  configNamesOf,
  type DivergedVerdict,
  findConfig,
  findSharedImport,
  judgeEveryWorkspace,
  PACKAGE_JSON,
  readWorkspaceManifest,
  type SharedConfig,
} from "./workspace-manifests.ts";
import { REPOSITORY_ROOT } from "./repository-root.ts";

const ESLINT_CONFIG_FILENAMES: ConfigFilenames = {
  basenames: ["eslint.config"],
  extensions: [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"],
};

export const SHARED_CONFIG_PACKAGE = "@workspace/eslint-config";

/** Opt-out key in a workspace's `package.json`; its value is the reason, which the runner prints. */
export const OPT_OUT_KEY = "//no-shared-eslint-config";

const SHARED_CONFIG: SharedConfig = { packageName: SHARED_CONFIG_PACKAGE, optOutKey: OPT_OUT_KEY };

export const NO_SHARED_IMPORT = `${configNamesOf(ESLINT_CONFIG_FILENAMES)} imports nothing from ${SHARED_CONFIG_PACKAGE}`;
export const MISSING_DEPENDENCY = `${PACKAGE_JSON} does not declare ${SHARED_CONFIG_PACKAGE}`;
export const UNDECLARED_CONFIG_LESS = `holds TypeScript but no ${configNamesOf(ESLINT_CONFIG_FILENAMES)}, and ${PACKAGE_JSON} does not say why`;

const TYPESCRIPT_GLOB = "**/*.{ts,tsx}";
const NOT_SOURCE = ["**/node_modules/**", "**/dist/**"];

export type WorkspaceVerdict =
  | { workspace: string; outcome: "bound"; via: string }
  | { workspace: string; outcome: "opted-out"; reason: string }
  | { workspace: string; outcome: "no-config" }
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

  // No config lints nothing, unless the workspace holds TypeScript: ESLint then fails the whole
  // invocation over one config-less file.
  const configPath = findConfig(workspaceRoot, ESLINT_CONFIG_FILENAMES);
  if (configPath === undefined) {
    return holdsTypeScript(workspaceRoot)
      ? { workspace, outcome: "diverged", problems: [UNDECLARED_CONFIG_LESS] }
      : { workspace, outcome: "no-config" };
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

function holdsTypeScript(workspaceRoot: string): boolean {
  return fg.sync(TYPESCRIPT_GLOB, { cwd: workspaceRoot, ignore: NOT_SOURCE }).length > 0;
}
