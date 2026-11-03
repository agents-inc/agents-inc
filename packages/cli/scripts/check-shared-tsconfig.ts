/**
 * Refuses a workspace that neither extends a `packages/typescript-config` base nor records in its
 * `package.json` why not. Run via `bun run deps:check`.
 */
import { existsSync, statSync } from "fs";
import path from "path";

import ts from "typescript";
import { z } from "zod";

import {
  type DivergedVerdict,
  judgeEveryWorkspace,
  PACKAGE_JSON,
  readWorkspaceManifest,
  type SharedConfig,
} from "./workspace-manifests.ts";
import { REPOSITORY_ROOT } from "./repository-root.ts";

const TSCONFIG_JSON = "tsconfig.json";
const JSON_EXTENSION = ".json";

export const SHARED_CONFIG_PACKAGE = "@workspace/typescript-config";
const SHARED_CONFIG_PREFIX = `${SHARED_CONFIG_PACKAGE}/`;

/** Opt-out key in a workspace's `package.json`; its value is the reason, which the runner prints. */
export const OPT_OUT_KEY = "//no-shared-tsconfig";

const SHARED_CONFIG: SharedConfig = { packageName: SHARED_CONFIG_PACKAGE, optOutKey: OPT_OUT_KEY };

export const MISSING_TSCONFIG = `has no ${TSCONFIG_JSON}`;
export const NO_SHARED_BASE = `${TSCONFIG_JSON} reaches no ${SHARED_CONFIG_PREFIX}* config through its extends or references`;
export const MISSING_DEPENDENCY = `${PACKAGE_JSON} does not declare ${SHARED_CONFIG_PACKAGE}`;

const TsconfigSchema = z.object({
  extends: z.union([z.string(), z.array(z.string())]).exactOptional(),
  references: z.array(z.object({ path: z.string() })).exactOptional(),
});
type Tsconfig = z.infer<typeof TsconfigSchema>;

export type WorkspaceVerdict =
  | { workspace: string; outcome: "bound"; via: string }
  | { workspace: string; outcome: "opted-out"; reason: string }
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

  const undeclared = declaresSharedConfig ? [] : [MISSING_DEPENDENCY];
  const configPath = path.join(workspaceRoot, TSCONFIG_JSON);

  if (!existsSync(configPath)) {
    return { workspace, outcome: "diverged", problems: [MISSING_TSCONFIG, ...undeclared] };
  }

  const via = findSharedBase(configPath, new Set());
  if (via === undefined) {
    return { workspace, outcome: "diverged", problems: [NO_SHARED_BASE, ...undeclared] };
  }

  if (undeclared.length > 0) {
    return { workspace, outcome: "diverged", problems: undeclared };
  }

  return { workspace, outcome: "bound", via };
}

/** Follows relative `extends` and solution-style `references` to the configs that compile. */
function findSharedBase(configPath: string, visited: Set<string>): string | undefined {
  if (visited.has(configPath) || !existsSync(configPath)) return undefined;
  visited.add(configPath);

  const config = readTsconfig(configPath);

  const shared = basesOf(config).find((base) => base.startsWith(SHARED_CONFIG_PREFIX));
  if (shared !== undefined) return shared;

  for (const neighbour of localConfigsBehind(config, configPath)) {
    const reached = findSharedBase(neighbour, visited);
    if (reached !== undefined) return reached;
  }

  return undefined;
}

function basesOf(config: Tsconfig): string[] {
  if (config.extends === undefined) return [];

  return typeof config.extends === "string" ? [config.extends] : config.extends;
}

function localConfigsBehind(config: Tsconfig, configPath: string): string[] {
  const relativeBases = basesOf(config).filter((base) => base.startsWith("."));
  const referencedProjects = (config.references ?? []).map((reference) => reference.path);

  return [...relativeBases, ...referencedProjects].map((entry) =>
    resolveConfigPath(entry, configPath),
  );
}

/** tsc's own rules for a relative entry: it may name a file, a file without `.json`, or a directory. */
function resolveConfigPath(entry: string, fromConfigPath: string): string {
  const resolved = path.resolve(path.dirname(fromConfigPath), entry);

  if (existsSync(resolved) && statSync(resolved).isDirectory()) {
    return path.join(resolved, TSCONFIG_JSON);
  }

  return resolved.endsWith(JSON_EXTENSION) ? resolved : `${resolved}${JSON_EXTENSION}`;
}

/** tsconfigs are JSONC, which `JSON.parse` cannot read. */
function readTsconfig(configPath: string): Tsconfig {
  const read: { config?: unknown; error?: ts.Diagnostic } = ts.readConfigFile(
    configPath,
    (fileName) => ts.sys.readFile(fileName),
  );

  if (read.error !== undefined) {
    const reason = ts.flattenDiagnosticMessageText(read.error.messageText, " ");
    throw new Error(`${configPath} could not be read: ${reason}`);
  }

  return TsconfigSchema.parse(read.config);
}
