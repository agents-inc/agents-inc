/**
 * Refuses a workspace that neither extends a `packages/typescript-config` base nor records in its
 * `package.json` why not. Run via `bun run deps:check`.
 */
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";

import fg from "fast-glob";
import ts from "typescript";
import { z } from "zod";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

const PACKAGE_JSON = "package.json";
const TSCONFIG_JSON = "tsconfig.json";
const JSON_EXTENSION = ".json";

export const SHARED_CONFIG_PACKAGE = "@workspace/typescript-config";
const SHARED_CONFIG_PREFIX = `${SHARED_CONFIG_PACKAGE}/`;

/** Opt-out key in a workspace's `package.json`; its value is the reason, which the runner prints. */
export const OPT_OUT_KEY = "//no-shared-tsconfig";

export const MISSING_TSCONFIG = `has no ${TSCONFIG_JSON}`;
export const NO_SHARED_BASE = `${TSCONFIG_JSON} reaches no ${SHARED_CONFIG_PREFIX}* config through its extends or references`;
export const MISSING_DEPENDENCY = `${PACKAGE_JSON} does not declare ${SHARED_CONFIG_PACKAGE}`;

/** Refused here, not only in the suite, so a root matching nothing cannot pass in CI. */
export const NO_WORKSPACES = "matches no workspace";

const RootManifestSchema = z.object({ workspaces: z.array(z.string()) });

const ManifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).exactOptional(),
  devDependencies: z.record(z.string(), z.string()).exactOptional(),
  [OPT_OUT_KEY]: z.string().exactOptional(),
});
type Manifest = z.infer<typeof ManifestSchema>;

const TsconfigSchema = z.object({
  extends: z.union([z.string(), z.array(z.string())]).exactOptional(),
  references: z.array(z.object({ path: z.string() })).exactOptional(),
});
type Tsconfig = z.infer<typeof TsconfigSchema>;

export type WorkspaceVerdict =
  | { workspace: string; outcome: "bound"; via: string }
  | { workspace: string; outcome: "opted-out"; reason: string }
  | { workspace: string; outcome: "diverged"; problems: string[] };

export type CheckResult = { clean: boolean; verdicts: WorkspaceVerdict[] };

export function check({
  repoRoot = REPO_ROOT,
}: { repoRoot?: string | undefined } = {}): CheckResult {
  const workspaces = findWorkspaces(repoRoot);
  if (workspaces.length === 0) throw new Error(`${repoRoot} ${NO_WORKSPACES}`);

  const verdicts = workspaces.map((workspace) => judgeWorkspace(repoRoot, workspace));

  return { clean: verdicts.every((verdict) => verdict.outcome !== "diverged"), verdicts };
}

function findWorkspaces(repoRoot: string): string[] {
  const { workspaces } = RootManifestSchema.parse(readJson(path.join(repoRoot, PACKAGE_JSON)));

  return fg
    .sync(
      workspaces.map((glob) => `${glob}/${PACKAGE_JSON}`),
      { cwd: repoRoot },
    )
    .map((manifestPath) => path.posix.dirname(manifestPath))
    .sort();
}

function judgeWorkspace(repoRoot: string, workspace: string): WorkspaceVerdict {
  const manifest = readManifest(path.join(repoRoot, workspace, PACKAGE_JSON));

  const optOutReason = manifest[OPT_OUT_KEY];
  if (optOutReason !== undefined) {
    return { workspace, outcome: "opted-out", reason: optOutReason };
  }

  const undeclared = declaresSharedConfig(manifest) ? [] : [MISSING_DEPENDENCY];
  const configPath = path.join(repoRoot, workspace, TSCONFIG_JSON);

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

function declaresSharedConfig(manifest: Manifest): boolean {
  return (
    manifest.dependencies?.[SHARED_CONFIG_PACKAGE] !== undefined ||
    manifest.devDependencies?.[SHARED_CONFIG_PACKAGE] !== undefined
  );
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

function readManifest(manifestPath: string): Manifest {
  return ManifestSchema.parse(readJson(manifestPath));
}

function readJson(filePath: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));

  return parsed;
}
