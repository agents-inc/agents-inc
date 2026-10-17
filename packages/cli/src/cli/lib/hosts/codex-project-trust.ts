import path from "path";

import { codexGlobalConfigFile } from "../installation/install-layout.js";
import { ensureDir, fileExists, readFile, writeFile } from "../../utils/fs.js";

/**
 * Codex reads `<project>/.codex/agents/*.toml` only while the GLOBAL `config.toml` holds
 * `[projects."<abs path>"] trust_level = "trusted"`, failing silently otherwise. The install writes
 * that entry and says so, but never overrides a level the user already set.
 */

const TRUST_KEY = "trust_level";
const TRUSTED = "trusted";

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
  const table = `[projects."${path.resolve(projectDir)}"]`;

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

/** Hand-read, not TOML-parsed; any other spelling reads as untrusted, the safe direction. */
function declaresTrust(config: string, projectDir: string): boolean {
  const lines = config.split("\n").map((line) => line.trim());

  return trustsUnderTableHeader(lines, projectDir) || lines.includes(dottedTrustLine(projectDir));
}

function trustsUnderTableHeader(lines: readonly string[], projectDir: string): boolean {
  const header = lines.indexOf(projectTableHeader(projectDir));
  if (header === -1) return false;

  return linesUnderTableHeader(lines, header).includes(trustAssignment());
}

function linesUnderTableHeader(lines: readonly string[], header: number): readonly string[] {
  const after = lines.slice(header + 1);
  const nextTable = after.findIndex(opensATable);

  return nextTable === -1 ? after : after.slice(0, nextTable);
}

function opensATable(line: string): boolean {
  return line.startsWith("[");
}

function projectTableHeader(projectDir: string): string {
  return `[projects."${projectDir}"]`;
}

function dottedTrustLine(projectDir: string): string {
  return `projects."${projectDir}".${trustAssignment()}`;
}

function trustAssignment(): string {
  return `${TRUST_KEY} = "${TRUSTED}"`;
}

const TRUST_LEVEL_LINE = new RegExp(`^${TRUST_KEY}\\s*=\\s*"([^"]*)"$`);

/** The user's own `trust_level` for this project, which is never overwritten. */
function declaredLevel(config: string, projectDir: string): string | undefined {
  const lines = config.split("\n").map((line) => line.trim());
  const header = lines.indexOf(projectTableHeader(projectDir));
  const underHeader = header === -1 ? [] : linesUnderTableHeader(lines, header);
  const dottedPrefix = `projects."${projectDir}".`;
  const dotted = lines
    .filter((line) => line.startsWith(dottedPrefix))
    .map((line) => line.slice(dottedPrefix.length));

  return [...underHeader, ...dotted]
    .map((line) => TRUST_LEVEL_LINE.exec(line)?.[1])
    .find((level) => level !== undefined);
}

function withTrustFor(config: string, projectDir: string): string {
  const lines = config.split("\n");
  const header = lines.findIndex((line) => line.trim() === projectTableHeader(projectDir));

  if (header !== -1) {
    return [...lines.slice(0, header + 1), trustAssignment(), ...lines.slice(header + 1)].join(
      "\n",
    );
  }

  const theirs = config.trimEnd();
  const table = `${projectTableHeader(projectDir)}\n${trustAssignment()}\n`;
  return theirs === "" ? table : `${theirs}\n\n${table}`;
}
