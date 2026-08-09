/**
 * Cross-workspace check: every workspace that runs Vitest either extends the shared config in
 * `packages/vitest-config`, or records in its own `package.json` why it does not.
 *
 * The third axis of `bun run deps:check`, and it exists for the reason its tsconfig sibling gives:
 * no per-workspace gate can see this class of defect. Vitest reads whatever config it is handed, so
 * a suite that has quietly stopped agreeing with its siblings — globals switched back on, a
 * different include, mocks no longer cleared between tests — is green in its own workspace and
 * invisible from everywhere else. Comparing workspaces to each other is the only thing that sees
 * it. `apps/server` is what prompted this one: a standalone config restating three of the shared
 * config's settings by hand, with nothing anywhere recording whether that was a decision.
 *
 * Only the config at a workspace's root is judged. A nested one — `packages/cli/e2e/vitest.config.ts`
 * — is a project inside a workspace's own suite rather than that workspace's answer, and is covered
 * by whatever its root config says.
 *
 * Run: `bun run deps:check` from the repository root. Nothing runs at module scope here — argv, the
 * console output and the exit code live in `scripts/run-check-shared-vitest-config.ts`, and the
 * roots are parameters so the suite can drive the check against a fixture repository.
 */
import { existsSync, readFileSync } from "fs";
import path from "path";

import fg from "fast-glob";
import ts from "typescript";
import { z } from "zod";

/** Where the check reads from when no other root is given. */
const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

const PACKAGE_JSON = "package.json";

/** Vitest's own config filenames. Every one in this repository is `.ts`; the rest are its to allow. */
const VITEST_CONFIG_BASENAME = "vitest.config";
const CONFIG_EXTENSIONS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"];

/** The package that ships the shared config. Its one entry point today is `/node`. */
export const SHARED_CONFIG_PACKAGE = "@workspace/vitest-config";

/**
 * A workspace with a defensible reason to stand alone records it under this key in its own
 * `package.json`, beside the `//no-shared-tsconfig` the other cross-workspace check reads. Same
 * shape for the same reasons: the `//` prefix matches the comment keys the root `package.json`
 * already uses, the value is the reason, and the runner prints it — so a suite that does not extend
 * is a recorded decision rather than an absence.
 */
export const OPT_OUT_KEY = "//no-shared-vitest-config";

export const NO_SHARED_IMPORT = `${VITEST_CONFIG_BASENAME}.* imports nothing from ${SHARED_CONFIG_PACKAGE}`;
export const MISSING_DEPENDENCY = `${PACKAGE_JSON} does not declare ${SHARED_CONFIG_PACKAGE}`;

/**
 * The globs are read rather than restated, for the reason `.syncpackrc.cjs` gives for omitting
 * `source`: one statement of which directories are workspaces cannot drift from itself.
 */
const RootManifestSchema = z.object({ workspaces: z.array(z.string()) });

const ManifestSchema = z.object({
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
  [OPT_OUT_KEY]: z.string().optional(),
});
type Manifest = z.infer<typeof ManifestSchema>;

/** One workspace's answer: bound to the shared config, excused, running no suite, or none of those. */
export type WorkspaceVerdict =
  | { workspace: string; outcome: "bound"; via: string }
  | { workspace: string; outcome: "opted-out"; reason: string }
  | { workspace: string; outcome: "no-suite" }
  | { workspace: string; outcome: "diverged"; problems: string[] };

export type CheckResult = { clean: boolean; verdicts: WorkspaceVerdict[] };

export function check({
  repoRoot = REPO_ROOT,
}: { repoRoot?: string | undefined } = {}): CheckResult {
  const verdicts = findWorkspaces(repoRoot).map((workspace) => judgeWorkspace(repoRoot, workspace));

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

  // A workspace with no Vitest config runs no suite, so there is nothing here to agree or disagree
  // with — and no reason for it to declare a package it would never import.
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

/**
 * The shared specifier this config reaches, if any. Both spellings in use here count: `apps/editor`
 * imports `nodeConfig` to merge into its own, and `packages/matrix` re-exports it as its entire
 * config.
 *
 * Parsed rather than searched for. `packages/ui/vitest.config.ts` names this package four times in
 * the comment explaining why it does not use it, and a text match would read that as compliance —
 * which is the one mistake that would make this whole check worthless.
 */
function findSharedImport(configPath: string): string | undefined {
  return moduleSpecifiers(configPath).find(isSharedConfig);
}

function isSharedConfig(specifier: string): boolean {
  return specifier === SHARED_CONFIG_PACKAGE || specifier.startsWith(`${SHARED_CONFIG_PACKAGE}/`);
}

/** Every module the config imports or re-exports at its top level. */
function moduleSpecifiers(configPath: string): string[] {
  const source = ts.createSourceFile(
    configPath,
    readFileSync(configPath, "utf-8"),
    ts.ScriptTarget.Latest,
  );

  return source.statements.flatMap(specifiersOf);
}

/** The one module a statement names, or none: `export { x }` re-exports nothing and imports nothing. */
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
