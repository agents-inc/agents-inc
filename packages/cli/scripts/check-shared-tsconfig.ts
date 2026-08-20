/**
 * Cross-workspace check: every workspace either extends one of the shared configs in
 * `packages/typescript-config`, or records in its own `package.json` why it does not.
 *
 * It exists because no other gate can see this class of defect. `packages/cli/tsconfig.json`
 * extended nothing until 2026-08-06 — it restated target, module, strict and the rest inline, and
 * pulled DOM into a Node CLI by setting no `lib` — while `tsc --noEmit` three times, `eslint .`,
 * both suites, `tsup` and `turbo typecheck` stayed green the whole time. Each of those reads
 * whatever the config happens to say, so a config that has stopped agreeing with its siblings is
 * invisible to all of them. Comparing workspaces to each other is the only thing that sees it,
 * which is why this check sits beside `syncpack lint` rather than inside a workspace's own gates.
 *
 * Run: `bun run deps:check` from the repository root. Nothing runs at module scope here — argv,
 * the console output and the exit code live in `scripts/run-check-shared-tsconfig.ts`, and the
 * roots are parameters so the suite can drive the check against a fixture repository.
 */
import { existsSync, readFileSync, statSync } from "fs";
import path from "path";

import fg from "fast-glob";
import ts from "typescript";
import { z } from "zod";

/** Where the check reads from when no other root is given. */
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

const PACKAGE_JSON = "package.json";
const TSCONFIG_JSON = "tsconfig.json";
const JSON_EXTENSION = ".json";

/** The package that ships the shared configs, and the prefix every one of its specifiers carries. */
export const SHARED_CONFIG_PACKAGE = "@workspace/typescript-config";
const SHARED_CONFIG_PREFIX = `${SHARED_CONFIG_PACKAGE}/`;

/**
 * A workspace with a defensible reason not to extend records it under this key in its own
 * `package.json` — the one file every workspace has, including the four that carry no TypeScript
 * at all and so have no tsconfig to put it in. The `//` prefix matches the comment keys the root
 * `package.json` already uses for its documented decisions. The value is the reason, and it is
 * printed by the runner, so the next divergence is a recorded decision rather than an absence.
 */
export const OPT_OUT_KEY = "//no-shared-tsconfig";

export const MISSING_TSCONFIG = `has no ${TSCONFIG_JSON}`;
export const NO_SHARED_BASE = `${TSCONFIG_JSON} reaches no ${SHARED_CONFIG_PREFIX}* config through its extends or references`;
export const MISSING_DEPENDENCY = `${PACKAGE_JSON} does not declare ${SHARED_CONFIG_PACKAGE}`;

/**
 * A root matching no workspace has not been checked, whatever it answers about the workspaces in
 * it. The floor lives here rather than in the suite because `bun run deps:check` is what CI and
 * both hooks run: with it in the test file only, all three runners printed `✓ 0 workspaces` and
 * exited 0 against a root whose globs match nothing, which is the shape of a passing gate.
 */
export const NO_WORKSPACES = "matches no workspace";

/**
 * The globs are read rather than restated, for the reason `.syncpackrc.cjs` gives for omitting
 * `source`: one statement of which directories are workspaces cannot drift from itself.
 */
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

/** One workspace's answer: bound to a shared base, excused by a recorded reason, or neither. */
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

/**
 * The shared specifier this config reaches, if any. `extends` may be a string or an array, and a
 * relative entry is another config to follow — `packages/cli/tsconfig.scripts.json` inherits the
 * base that way. A solution-style config (`references` and no `extends`, which is what
 * `apps/editor/tsconfig.json` is) is followed through the projects it points at, because those
 * are the files that actually compile.
 */
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

/** The configs in this repository that this one is built from: relative bases, then references. */
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

/**
 * TypeScript's own reader, because these files are JSONC: every tsconfig in this repository
 * carries `//` comments recording why it says what it says, and `JSON.parse` cannot read one.
 */
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
