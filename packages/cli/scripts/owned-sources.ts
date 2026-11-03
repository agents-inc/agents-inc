import { existsSync, readdirSync } from "fs";
import path from "path";

import ts from "typescript";

export const NO_PACKAGE_ROOT = "names a package root that does not exist";
export const NO_PROJECT_CONFIG = "names a project config that does not exist";
export const UNREADABLE_PROJECT_CONFIG = "names a project config TypeScript will not read";
export const NO_OWN_SOURCE = "names a project holding no source file of this package";

export type OwnedFile = { file: ts.SourceFile; checker: ts.TypeChecker };

/**
 * Each file is judged once, since the projects overlap. The emptiness guard is per project so the
 * roster's order cannot decide a pass.
 */
export function ownedFiles(packageRoot: string, projects: readonly string[]): OwnedFile[] {
  if (!existsSync(packageRoot)) throw refusal(NO_PACKAGE_ROOT, packageRoot);

  const seen = new Set<string>();

  return projects.flatMap((project) => {
    const program = programFor(packageRoot, project);
    const held = program.getSourceFiles().filter((file) => isOwnSource(packageRoot, file));
    if (held.length === 0) throw refusal(NO_OWN_SOURCE, project);

    const checker = program.getTypeChecker();

    return held.filter((file) => isFirstSighting(file, seen)).map((file) => ({ file, checker }));
  });
}

export function importedNamesIn(file: ts.SourceFile): Set<string> {
  return new Set(file.statements.flatMap(importedNamesOf));
}

/** Paths relative to `directoryPath`. */
export function filesUnder(
  directoryPath: string,
  keep: (name: string) => boolean,
  prefix = "",
): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = path.join(prefix, entry.name);
    if (entry.isDirectory()) {
      return filesUnder(path.join(directoryPath, entry.name), keep, relativePath);
    }

    return keep(entry.name) ? [relativePath] : [];
  });
}

export function refusal(problem: string, subject: string): Error {
  return new Error(`${problem}: ${subject}`);
}

/** `getParsedCommandLineOfConfigFile` takes a diagnostics reporter, so a bad config refuses. */
function programFor(packageRoot: string, project: string): ts.Program {
  const configPath = path.join(packageRoot, project);
  if (!existsSync(configPath)) throw refusal(NO_PROJECT_CONFIG, project);

  const parsed = ts.getParsedCommandLineOfConfigFile(configPath, undefined, parseHost(project));
  if (parsed === undefined) throw refusal(UNREADABLE_PROJECT_CONFIG, project);

  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
}

function parseHost(project: string): ts.ParseConfigFileHost {
  return {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw refusal(
        UNREADABLE_PROJECT_CONFIG,
        `${project} — ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      );
    },
  };
}

function isOwnSource(packageRoot: string, file: ts.SourceFile): boolean {
  if (file.isDeclarationFile) return false;

  const filePath = path.resolve(file.fileName);

  return filePath.startsWith(packageRoot + path.sep) && !filePath.includes("node_modules");
}

function isFirstSighting(file: ts.SourceFile, seen: Set<string>): boolean {
  const filePath = path.resolve(file.fileName);
  if (seen.has(filePath)) return false;
  seen.add(filePath);

  return true;
}

function importedNamesOf(statement: ts.Statement): string[] {
  if (!ts.isImportDeclaration(statement) || statement.importClause === undefined) return [];

  const { name, namedBindings } = statement.importClause;
  const defaultName = name === undefined ? [] : [name.text];
  if (namedBindings === undefined) return defaultName;

  return ts.isNamespaceImport(namedBindings)
    ? [...defaultName, namedBindings.name.text]
    : [...defaultName, ...namedBindings.elements.map((element) => element.name.text)];
}
