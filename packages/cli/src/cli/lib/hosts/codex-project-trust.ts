import path from "path";

import { codexGlobalConfigFile } from "../installation/install-layout.js";
import { ensureDir, fileExists, readFile, writeFile } from "../../utils/fs.js";

/**
 * The trust a PROJECT installation's agent roles need before Codex reads them — written by the
 * install, and said.
 *
 * **Registration is gated on one line in a file this CLI does not own.** A role at
 * `<project>/.codex/agents/<anything>.toml` reaches the model only while the user's GLOBAL
 * `$CODEX_HOME/config.toml` holds `[projects."<exact absolute path>"] trust_level = "trusted"`.
 * Four kill switches were each measured on the pinned 0.155.1, and every one produces nothing
 * with NO warning anywhere: no `[projects]` entry; `trust_level = "untrusted"`, which beats a
 * permissive sandbox flag; a trailing slash on the path key; and the entry declared in the
 * project's OWN `.codex/config.toml`, which Codex refuses as self-authorisation.
 *
 * **So the install WRITES it, and prints exactly what it wrote.** Owner, 2026-09-26: _"it should be
 * automated on install"_ (CLI-893): the user chose a project install on their own machine, and a
 * project install Codex never reads is the silent failure this product exists to prevent. _Until
 * then this module detected the missing entry and printed the line for the user to add, on the
 * grounds that writing it would be the product granting itself trust; the disclosure is what
 * answers that now._
 *
 * **It never overrides an answer the user already gave.** An entry for this exact path with any
 * other `trust_level` — `"untrusted"` above all — is theirs, and is reported rather than changed.
 * And it is a STATE rather than a banner: a project already trusted is told nothing.
 */

/** The key Codex reads a project's trust from, and the only value that registers anything. */
const TRUST_KEY = "trust_level";
const TRUSTED = "trusted";

/** What {@link trustCodexProject} found, and what it did about it. */
export type CodexProjectTrust =
  | { readonly kind: "already trusted" }
  | { readonly kind: "trusted now"; readonly configFile: string }
  | {
      readonly kind: "left as the user set it";
      readonly configFile: string;
      readonly level: string;
    };

/**
 * Trusts `projectDir` in the user's GLOBAL Codex config, unless it already is or they said otherwise.
 *
 * **Merged, never rewritten**: every line of the file is theirs and is carried through unchanged.
 * Where their file already holds `[projects."<dir>"]` with no `trust_level` under it, the key goes
 * INTO that table, because a second table for the same path is a duplicate Codex refuses to parse
 * — taking every setting in the file with it.
 *
 * The path is written as `path.resolve` spells it: absolute, with no trailing separator, which is
 * the one spelling Codex matches.
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

/**
 * The line the install prints for what {@link trustCodexProject} did, or nothing when it did
 * nothing. It names the project, the file and the line, because a trust entry is the kind of
 * write a user has to be able to see and undo.
 */
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

/**
 * Whether `config` trusts `projectDir`, in either spelling Codex accepts.
 *
 * Hand-read rather than parsed: this package declares no TOML reader, the question is one key
 * under one exactly-named table, and a whole parser would have to be right about every other
 * construct in a file we never write. Both forms below were what the measurement wrote and read
 * back; anything else reads as untrusted, which is the safe direction — the cost of a false
 * negative is one notice a user can ignore, and the cost of a false positive is silence about the
 * thing that makes their sub-agents invisible.
 */
function declaresTrust(config: string, projectDir: string): boolean {
  const lines = config.split("\n").map((line) => line.trim());

  return trustsUnderTableHeader(lines, projectDir) || lines.includes(dottedTrustLine(projectDir));
}

/** `[projects."<dir>"]` with `trust_level = "trusted"` under it, before the next table. */
function trustsUnderTableHeader(lines: readonly string[], projectDir: string): boolean {
  const header = lines.indexOf(projectTableHeader(projectDir));
  if (header === -1) return false;

  return linesUnderTableHeader(lines, header).includes(trustAssignment());
}

/** Everything after a table header and before the next one — that table's body. */
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

/** `projects."<dir>".trust_level = "trusted"` written as one dotted key. */
function dottedTrustLine(projectDir: string): string {
  return `projects."${projectDir}".${trustAssignment()}`;
}

function trustAssignment(): string {
  return `${TRUST_KEY} = "${TRUSTED}"`;
}

/** A `trust_level` line: its key, then the quoted level. */
const TRUST_LEVEL_LINE = new RegExp(`^${TRUST_KEY}\\s*=\\s*"([^"]*)"$`);

/**
 * The `trust_level` the user's file gives this exact project, in either spelling, when it gives
 * one at all — the answer {@link trustCodexProject} must not overwrite.
 */
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

/**
 * `config` with this project trusted: the key added under the project's existing table where the
 * file has one, and a new table at the end where it does not.
 */
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
