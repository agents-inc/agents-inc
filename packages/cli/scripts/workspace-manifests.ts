/** The workspace, manifest and config readers the `bun run deps:check` checkers share. */
import { existsSync, readFileSync } from "fs";
import path from "path";

import fg from "fast-glob";
import ts from "typescript";
import { z } from "zod";

import { directoryAfterFlag } from "./directory-flag.ts";

export const PACKAGE_JSON = "package.json";

/** Lets the suite drive an entry point against a fixture repository. */
const ROOT_FLAG = "--root";

/** A shared config package, and the `package.json` key that records why a workspace opts out. */
export type SharedConfig = { packageName: string; optOutKey: string };

export type WorkspaceManifest = { optOutReason: string | undefined; declaresSharedConfig: boolean };

export type DivergedVerdict = { workspace: string; outcome: "diverged"; problems: string[] };

/** The tool a diverged workspace is told about, and which of its shared configs to extend. */
type Remedy = SharedConfig & { tool: string; extend: string };

/** The config basenames a tool tries and the extensions of each, both in its resolution order. */
export type ConfigFilenames = Readonly<{
  basenames: readonly string[];
  extensions: readonly string[];
}>;

/** Vitest reads a `vite.config` only where no `vitest.config` of any extension exists. */
export const VITEST_CONFIG_FILENAMES: ConfigFilenames = {
  basenames: ["vitest.config", "vite.config"],
  extensions: [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"],
};

/** Refused here, not only in the suite, so a root matching nothing cannot pass in CI. */
export const NO_WORKSPACES = "matches no workspace";

const RootManifestSchema = z.object({ workspaces: z.array(z.string()) });

const DependenciesSchema = z.object({
  dependencies: z.record(z.string(), z.string()).exactOptional(),
  devDependencies: z.record(z.string(), z.string()).exactOptional(),
});
type Dependencies = z.infer<typeof DependenciesSchema>;

export function findWorkspaces(repoRoot: string): string[] {
  const { workspaces } = RootManifestSchema.parse(readJson(path.join(repoRoot, PACKAGE_JSON)));

  return fg
    .sync(
      workspaces.map((glob) => `${glob}/${PACKAGE_JSON}`),
      { cwd: repoRoot },
    )
    .map((manifestPath) => path.posix.dirname(manifestPath))
    .sort();
}

/** Clean while no workspace has diverged from the shared config. */
export function judgeEveryWorkspace<Verdict extends { outcome: string }>(
  repoRoot: string,
  judgeWorkspace: (repoRoot: string, workspace: string) => Verdict,
): { clean: boolean; verdicts: Verdict[] } {
  const workspaces = findWorkspaces(repoRoot);
  if (workspaces.length === 0) throw new Error(`${repoRoot} ${NO_WORKSPACES}`);

  const verdicts = workspaces.map((workspace) => judgeWorkspace(repoRoot, workspace));

  return { clean: !verdicts.some(isDiverged), verdicts };
}

export function isDiverged<Verdict extends { outcome: string }>(
  verdict: Verdict,
): verdict is Extract<Verdict, { outcome: "diverged" }> {
  return verdict.outcome === "diverged";
}

export function reportDiverged(
  diverged: readonly DivergedVerdict[],
  { tool, extend, packageName, optOutKey }: Remedy,
): void {
  console.error(`Workspaces have diverged from the shared ${tool} config:\n`);

  for (const { workspace, problems } of diverged) {
    console.error(`  ${workspace}`);
    for (const problem of problems) {
      console.error(`    ${problem}`);
    }
  }

  console.error(
    [
      "",
      `Extend ${extend} and declare ${packageName},`,
      `or record the decision by adding "${optOutKey}": "<why>" to the workspace's package.json.`,
    ].join("\n"),
  );
}

export function readWorkspaceManifest(
  workspaceRoot: string,
  { packageName, optOutKey }: SharedConfig,
): WorkspaceManifest {
  const manifest = readJson(path.join(workspaceRoot, PACKAGE_JSON));
  const dependencies = DependenciesSchema.parse(manifest);
  const optOut = optOutSchema(optOutKey).parse(manifest);

  return {
    optOutReason: optOut[optOutKey],
    declaresSharedConfig: declares(dependencies, packageName),
  };
}

export function findConfig(
  workspaceRoot: string,
  { basenames, extensions }: ConfigFilenames,
): string | undefined {
  return basenames
    .flatMap((basename) =>
      extensions.map((extension) => path.join(workspaceRoot, `${basename}${extension}`)),
    )
    .find((candidate) => existsSync(candidate));
}

/** As a problem names them: `vitest.config.* or vite.config.*`. */
export function configNamesOf({ basenames }: ConfigFilenames): string {
  return basenames.map((basename) => `${basename}.*`).join(" or ");
}

/** Parsed rather than text-searched, so a comment naming the package does not count as compliance. */
export function findSharedImport(configPath: string, packageName: string): string | undefined {
  return moduleSpecifiers(configPath).find((specifier) => isEntryOf(specifier, packageName));
}

export function repoRootFromArgv(argv: string[]): string | undefined {
  return directoryAfterFlag(argv, ROOT_FLAG);
}

/** A key held in a variable widens to an index signature, so it gets a schema of its own. */
function optOutSchema(optOutKey: string) {
  return z.object({ [optOutKey]: z.string().exactOptional() });
}

function declares(manifest: Dependencies, packageName: string): boolean {
  return (
    manifest.dependencies?.[packageName] !== undefined ||
    manifest.devDependencies?.[packageName] !== undefined
  );
}

function isEntryOf(specifier: string, packageName: string): boolean {
  return specifier === packageName || specifier.startsWith(`${packageName}/`);
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

function readJson(filePath: string): unknown {
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf-8"));

  return parsed;
}
