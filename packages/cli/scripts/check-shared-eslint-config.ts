/**
 * Cross-workspace check: every workspace that holds an ESLint config either extends the shared
 * configs in `packages/eslint-config`, or records in its own `package.json` why it does not.
 *
 * The fourth axis of `bun run deps:check`, and it exists for the reason its two siblings give:
 * ESLint reads whatever config it is handed, so a workspace whose config has quietly stopped
 * agreeing with its siblings is green in its own workspace and invisible from everywhere else.
 * `packages/cli` is what prompted this one. It composed `js.configs.recommended` and
 * `tseslint.configs.recommendedTypeChecked` itself rather than extending `@workspace/eslint-config`,
 * and the two overlap almost completely — so the divergence showed up only as a rule the shared
 * base adds beyond the recommended set and this package therefore never had. `eslint .` was clean
 * throughout, in both configs, because a rule that is not enabled reports nothing.
 *
 * Only the config at a workspace's root is judged: ESLint resolves a flat config from the directory
 * it runs in and its ancestors, so that file is the workspace's whole answer.
 *
 * Run: `bun run deps:check` from the repository root. Nothing runs at module scope here — argv, the
 * console output and the exit code live in `scripts/run-check-shared-eslint-config.ts`, and the
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

/**
 * ESLint's own flat-config filenames. Every one in this repository is `.js`; the rest are its to
 * allow, and it resolves them in this order.
 */
const ESLINT_CONFIG_BASENAME = "eslint.config";
const CONFIG_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts", ".mts", ".cts"];

/** The package that ships the shared configs. Its entry points today are `/base` and the two React ones. */
export const SHARED_CONFIG_PACKAGE = "@workspace/eslint-config";

/**
 * A workspace with a defensible reason to stand alone records it under this key in its own
 * `package.json`, beside the `//no-shared-tsconfig` and `//no-shared-vitest-config` the other two
 * cross-workspace checks read. Same shape for the same reasons: the `//` prefix matches the comment
 * keys the root `package.json` already uses, the value is the reason, and the runner prints it — so
 * a config that does not extend is a recorded decision rather than an absence.
 */
export const OPT_OUT_KEY = "//no-shared-eslint-config";

export const NO_SHARED_IMPORT = `${ESLINT_CONFIG_BASENAME}.* imports nothing from ${SHARED_CONFIG_PACKAGE}`;
export const MISSING_DEPENDENCY = `${PACKAGE_JSON} does not declare ${SHARED_CONFIG_PACKAGE}`;
export const UNDECLARED_CONFIG_LESS = `holds TypeScript but no ${ESLINT_CONFIG_BASENAME}.*, and ${PACKAGE_JSON} does not say why`;

/** What a workspace has to hold for its missing config to be worth declaring. */
const TYPESCRIPT_GLOB = "**/*.{ts,tsx}";
const NOT_SOURCE = ["**/node_modules/**", "**/dist/**"];

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

/** One workspace's answer: bound to the shared config, excused, linting nothing, or none of those. */
export type WorkspaceVerdict =
  | { workspace: string; outcome: "bound"; via: string }
  | { workspace: string; outcome: "opted-out"; reason: string }
  | { workspace: string; outcome: "no-config" }
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

  // A workspace with no flat config lints nothing, so there is nothing here to agree or disagree
  // with — and no reason for it to declare a package it would never import.
  //
  // Unless it holds TypeScript. Then the absence is load-bearing rather than uninteresting: ESLint
  // fails a whole invocation when it cannot resolve a config for ONE of the files it was handed, so
  // a single config-less .ts file takes down every staged file beside it. The root `lint-staged`
  // block routes around exactly this set by naming it as a literal glob, and a literal with no
  // source of truth is what this condition replaces. Declaring is how the set becomes readable.
  const configPath = findConfig(path.join(repoRoot, workspace));
  if (configPath === undefined) {
    return holdsTypeScript(path.join(repoRoot, workspace))
      ? { workspace, outcome: "diverged", problems: [UNDECLARED_CONFIG_LESS] }
      : { workspace, outcome: "no-config" };
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
    path.join(workspaceRoot, `${ESLINT_CONFIG_BASENAME}${extension}`),
  ).find((candidate) => existsSync(candidate));
}

/** Whether ESLint could ever be handed a file from here. A `.d.ts` counts — ESLint reads one. */
function holdsTypeScript(workspaceRoot: string): boolean {
  return fg.sync(TYPESCRIPT_GLOB, { cwd: workspaceRoot, ignore: NOT_SOURCE }).length > 0;
}

/**
 * The shared specifier this config reaches, if any. Every entry point counts: `apps/editor` and
 * `packages/ui` reach `/react-app` and `/react-library`, and the rest reach `/base`.
 *
 * Parsed rather than searched for. Two configs here name this package in the comment explaining
 * what they do with it, and `packages/cli`'s names it in the comment explaining a rule it does NOT
 * inherit — a text match would read that last one as compliance, which is the one mistake that
 * would make this whole check worthless.
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
