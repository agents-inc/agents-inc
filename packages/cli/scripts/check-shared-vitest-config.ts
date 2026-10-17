/**
 * Refuses a workspace whose root Vitest config neither extends `packages/vitest-config` nor
 * records in its `package.json` why not. Run via `bun run deps:check`.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

import fg from "fast-glob";
import ts from "typescript";
import { z } from "zod";

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

const PACKAGE_JSON = "package.json";

const VITEST_CONFIG_BASENAME = "vitest.config";
const CONFIG_EXTENSIONS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];

export const SHARED_CONFIG_PACKAGE = "@workspace/vitest-config";

/** Opt-out key in a workspace's `package.json`; its value is the reason, which the runner prints. */
export const OPT_OUT_KEY = "//no-shared-vitest-config";

export const NO_SHARED_IMPORT = `${VITEST_CONFIG_BASENAME}.* imports nothing from ${SHARED_CONFIG_PACKAGE}`;
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

export type WorkspaceVerdict =
  | { workspace: string; outcome: "bound"; via: string }
  | { workspace: string; outcome: "opted-out"; reason: string }
  | { workspace: string; outcome: "no-suite" }
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

  const configPath = findConfig(path.join(repoRoot, workspace));
  if (configPath === undefined) {
    return { workspace, outcome: "no-suite" };
  }

  const undeclared = declaresSharedConfig(manifest) ? [] : [MISSING_DEPENDENCY];

  const via = findSharedImport(configPath);
  if (via === undefined) {
    return { workspace, outcome: "diverged", problems: [NO_SHARED_IMPORT, ...undeclared] };
  }

  if (undeclared.length > 0) {
    return { workspace, outcome: "diverged", problems: undeclared };
  }

  return { workspace, outcome: "bound", via };
}

function findConfig(workspaceRoot: string): string | undefined {
  return CONFIG_EXTENSIONS.map((extension) =>
    path.join(workspaceRoot, `${VITEST_CONFIG_BASENAME}${extension}`),
  ).find((candidate) => existsSync(candidate));
}

/** Parsed rather than text-searched, so a comment naming the package does not count as compliance. */
function findSharedImport(configPath: string): string | undefined {
  return moduleSpecifiers(configPath).find(isSharedConfig);
}

function isSharedConfig(specifier: string): boolean {
  return specifier === SHARED_CONFIG_PACKAGE || specifier.startsWith(`${SHARED_CONFIG_PACKAGE}/`);
}

function moduleSpecifiers(configPath: string): string[] {
  const source = ts.createSourceFile(
    configPath,
    readFileSync(configPath, "utf-8"),
    ts.ScriptTarget.Latest,
  );

  return source.statements.flatMap(specifiersOf);
}

function specifiersOf(statement: ts.Statement): string[] {
  if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];

  const specifier = statement.moduleSpecifier;
  if (specifier === undefined || !ts.isStringLiteral(specifier)) return [];

  return [specifier.text];
}

function declaresSharedConfig(manifest: Manifest): boolean {
  return (
    manifest.dependencies?.[SHARED_CONFIG_PACKAGE] !== undefined ||
    manifest.devDependencies?.[SHARED_CONFIG_PACKAGE] !== undefined
  );
}

function readManifest(manifestPath: string): Manifest {
  return ManifestSchema.parse(readJson(manifestPath));
}

function readJson(filePath: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));

  return parsed;
}
