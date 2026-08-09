/**
 * Every finding in `.ai-docs/agent-findings/` opens with a YAML block a parser can read.
 *
 * It exists because ten of them did not, and nothing said so. `TEMPLATE.md` defines a status
 * rollup, a link-integrity scan and a lifecycle-pairing check, all of them over parsed frontmatter
 * — so a finding whose block does not parse is skipped by every one of them while still reading, to
 * a human, exactly like its neighbours. A rollup that cannot read a `status:` field has no way to
 * say so, and a count over the files it could read is worth less than a scan that fails on the
 * files it could not.
 *
 * **One character sequence causes the whole class: a bare `: ` inside an unquoted value.** A plain
 * YAML scalar cannot contain colon-space — the parser reads it as a nested key and gives up. The
 * damage lands precisely on `resolved_by:` and `partial_note:`, the two fields `TEMPLATE.md` calls
 * REQUIRED, because they are the only ones carrying a paragraph of prose and prose is where a colon
 * turns up: a ratio, a time, a `key: value` quoted from source. Short enum fields cannot break this
 * way. Wrap prose in double quotes or write it as a `>-` block scalar.
 *
 * The second-order symptom is what surfaced it: Prettier does not leave an unreadable block alone,
 * it stops recognising the file as having frontmatter at all and reformats the block as Markdown.
 * `format:check` then reports a style violation, which reads as cosmetic and is not.
 *
 * Nothing runs at module scope here — the suite beside it is the enforcement, and the directory is
 * a parameter so it can be driven against a fixture.
 */
import { readdirSync, readFileSync } from "fs";
import path from "path";

import { parse } from "yaml";

import { getErrorMessage } from "../src/cli/utils/errors.ts";

/** Where the check reads from when no other directory is given. */
const FINDINGS_DIR = path.resolve(import.meta.dirname, "../.ai-docs/agent-findings");

const MARKDOWN_EXTENSION = ".md";

/** The frontmatter block: `---`, the YAML, `---`, all at the very top of the file. */
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n/;

export const NO_FRONTMATTER = "opens with no --- frontmatter block";

/** One finding's answer: its frontmatter parses, or it does not and this is why. */
export type FindingVerdict =
  { file: string; outcome: "readable" } | { file: string; outcome: "unreadable"; problem: string };

export type CheckResult = { clean: boolean; verdicts: FindingVerdict[] };

export function check({
  findingsDir = FINDINGS_DIR,
}: { findingsDir?: string | undefined } = {}): CheckResult {
  const verdicts = findingFiles(findingsDir).map((file) => judgeFinding(findingsDir, file));

  return { clean: verdicts.every((verdict) => verdict.outcome !== "unreadable"), verdicts };
}

function findingFiles(findingsDir: string): string[] {
  return readdirSync(findingsDir)
    .filter((entry) => entry.endsWith(MARKDOWN_EXTENSION))
    .sort();
}

function judgeFinding(findingsDir: string, file: string): FindingVerdict {
  const block = frontmatterOf(readFileSync(path.join(findingsDir, file), "utf-8"));
  if (block === undefined) {
    return { file, outcome: "unreadable", problem: NO_FRONTMATTER };
  }

  try {
    // The parse IS the assertion. What comes back is `TEMPLATE.md`'s business, not this check's.
    parse(block);
  } catch (error) {
    return { file, outcome: "unreadable", problem: firstLineOf(getErrorMessage(error)) };
  }

  return { file, outcome: "readable" };
}

function frontmatterOf(source: string): string | undefined {
  return FRONTMATTER.exec(source)?.[1];
}

/** A YAML error's own message plus a source excerpt; only the first line names the fault. */
function firstLineOf(message: string): string {
  return message.split("\n")[0] ?? message;
}
