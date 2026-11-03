import path from "path";

import { codexGlobalConfigFile } from "../installation/install-layout.js";
import { ensureDir, fileExists, readFile, writeFile } from "../../utils/fs.js";

/**
 * Codex reads `<project>/.codex/agents/*.toml` only while the GLOBAL `config.toml` holds
 * `[projects."<abs path>"] trust_level = "trusted"`, failing silently otherwise. The install writes
 * that entry and says so, but never overrides a level the user already set; the uninstall takes a
 * trusted entry out whoever wrote it.
 */

const TRUST_KEY = "trust_level";
const TRUSTED = "trusted";
const TRUST_ASSIGNMENT = `${TRUST_KEY} = "${TRUSTED}"`;

export type CodexProjectTrust =
  | { readonly kind: "already trusted" }
  | { readonly kind: "trusted now"; readonly configFile: string }
  | {
      readonly kind: "left as the user set it";
      readonly configFile: string;
      readonly level: string;
    };

/**
 * Merged into the user's file, never rewritten: a second table for the same path would make Codex
 * refuse the whole file. `path.resolve` gives the one spelling Codex matches (no trailing slash).
 */
export async function trustCodexProject(projectDir: string): Promise<CodexProjectTrust> {
  const configFile = codexGlobalConfigFile();
  const dir = path.resolve(projectDir);
  const config = (await fileExists(configFile)) ? await readFile(configFile) : "";

  if (declaresTrust(config, dir)) return { kind: "already trusted" };

  const level = declaredLevel(config, dir);
  if (level !== undefined) return { kind: "left as the user set it", configFile, level };

  await ensureDir(path.dirname(configFile));
  await writeFile(configFile, withTrustFor(config, dir));
  return { kind: "trusted now", configFile };
}

export function codexProjectTrustMessage(
  projectDir: string,
  trust: CodexProjectTrust,
): string | undefined {
  const table = projectTableHeader(path.resolve(projectDir));

  switch (trust.kind) {
    case "already trusted":
      return undefined;
    case "trusted now":
      return (
        `Trusted this project in your Codex configuration, so Codex reads its sub-agents: added ` +
        `${table} with ${TRUST_KEY} = "${TRUSTED}" to ${trust.configFile}.`
      );
    case "left as the user set it":
      return (
        `Codex reads this project's sub-agents only once it is trusted, and ${trust.configFile} ` +
        `sets ${TRUST_KEY} = "${trust.level}" under ${table}. Left as you set it — change it to ` +
        `"${TRUSTED}" for Codex to read them.`
      );
    default: {
      const _exhaustive: never = trust;
      return _exhaustive;
    }
  }
}

export type CodexProjectTrustRemoval =
  | { readonly kind: "not trusted" }
  | { readonly kind: "trust removed"; readonly configFile: string };

/** A level other than trusted is the user's answer, and stays. */
export async function untrustCodexProject(projectDir: string): Promise<CodexProjectTrustRemoval> {
  const configFile = codexGlobalConfigFile();
  if (!(await fileExists(configFile))) return { kind: "not trusted" };

  const config = await readFile(configFile);
  const untrusted = withoutTrustFor(config, path.resolve(projectDir));
  if (untrusted === config) return { kind: "not trusted" };

  await writeFile(configFile, untrusted);
  return { kind: "trust removed", configFile };
}

export function codexProjectUntrustMessage(
  projectDir: string,
  removal: CodexProjectTrustRemoval,
): string | undefined {
  switch (removal.kind) {
    case "not trusted":
      return undefined;
    case "trust removed":
      return (
        `Removed this project's trust from your Codex configuration: deleted ${TRUST_ASSIGNMENT} ` +
        `under ${projectTableHeader(path.resolve(projectDir))} in ${removal.configFile}.`
      );
    default: {
      const _exhaustive: never = removal;
      return _exhaustive;
    }
  }
}

/** Hand-read, not TOML-parsed; any other spelling reads as untrusted, the safe direction. */
function declaresTrust(config: string, projectDir: string): boolean {
  return linesForProject(config, projectDir).includes(TRUST_ASSIGNMENT);
}

const TRUST_LEVEL_LINE = new RegExp(`^${TRUST_KEY}\\s*=\\s*"([^"]*)"$`);

/** The user's own `trust_level` for this project, which is never overwritten. */
function declaredLevel(config: string, projectDir: string): string | undefined {
  return linesForProject(config, projectDir)
    .map(levelSetBy)
    .find((level) => level !== undefined);
}

function levelSetBy(trimmedLine: string): string | undefined {
  return TRUST_LEVEL_LINE.exec(trimmedLine)?.[1];
}

function setsTrusted(line: string): boolean {
  return levelSetBy(line.trim()) === TRUSTED;
}

/** Trimmed: the lines under the project's table header, then its dotted keys with the prefix cut. */
function linesForProject(config: string, projectDir: string): string[] {
  const lines = config.split("\n").map((line) => line.trim());
  const prefix = dottedPrefix(projectDir);
  const dotted = lines
    .filter((line) => line.startsWith(prefix))
    .map((line) => line.slice(prefix.length));

  return [...linesUnderProjectTable(lines, projectDir), ...dotted];
}

function linesUnderProjectTable(lines: readonly string[], projectDir: string): readonly string[] {
  const table = projectTableSpan(lines, projectDir);
  return table === undefined ? [] : lines.slice(table.header + 1, table.end);
}

/** `end` is the next table's header, or the end of the file. */
function projectTableSpan(
  lines: readonly string[],
  projectDir: string,
): { header: number; end: number } | undefined {
  const header = lines.findIndex((line) => line.trim() === projectTableHeader(projectDir));
  if (header === -1) return undefined;

  const nextTable = lines.slice(header + 1).findIndex(opensATable);
  return { header, end: nextTable === -1 ? lines.length : header + 1 + nextTable };
}

function opensATable(line: string): boolean {
  return line.trim().startsWith("[");
}

function projectTableHeader(projectDir: string): string {
  return `[projects."${projectDir}"]`;
}

function dottedPrefix(projectDir: string): string {
  return `projects."${projectDir}".`;
}

function withoutTrustFor(config: string, projectDir: string): string {
  const lines = config.split("\n").filter((line) => !trustsAsADottedKey(line, projectDir));
  return withoutTrustInTable(lines, projectDir).join("\n");
}

function trustsAsADottedKey(line: string, projectDir: string): boolean {
  const trimmed = line.trim();
  const prefix = dottedPrefix(projectDir);
  return trimmed.startsWith(prefix) && setsTrusted(trimmed.slice(prefix.length));
}

/**
 * A table left with nothing under it goes with the blank lines above it, as the install added it;
 * those below it stay to separate what follows.
 */
function withoutTrustInTable(lines: readonly string[], projectDir: string): readonly string[] {
  const table = projectTableSpan(lines, projectDir);
  if (table === undefined) return lines;

  const body = lines.slice(table.header + 1, table.end);
  const kept = body.filter((line) => !setsTrusted(line));
  if (kept.length === body.length) return lines;

  const after = lines.slice(table.end);
  if (kept.some(isNotBlank)) return [...lines.slice(0, table.header + 1), ...kept, ...after];
  return [...withoutTrailingBlankLines(lines.slice(0, table.header)), ...kept, ...after];
}

function withoutTrailingBlankLines(lines: readonly string[]): readonly string[] {
  return lines.slice(0, lines.findLastIndex(isNotBlank) + 1);
}

function isNotBlank(line: string): boolean {
  return line.trim() !== "";
}

function withTrustFor(config: string, projectDir: string): string {
  const lines = config.split("\n");
  const theirTable = projectTableSpan(lines, projectDir);

  if (theirTable !== undefined) {
    const { header } = theirTable;
    return [...lines.slice(0, header + 1), TRUST_ASSIGNMENT, ...lines.slice(header + 1)].join("\n");
  }

  const theirs = config.trimEnd();
  const table = `${projectTableHeader(projectDir)}\n${TRUST_ASSIGNMENT}\n`;
  return theirs === "" ? table : `${theirs}\n\n${table}`;
}
