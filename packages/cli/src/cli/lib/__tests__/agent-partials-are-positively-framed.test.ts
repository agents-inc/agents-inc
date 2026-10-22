/**
 * Scans the sub-agents' own markdown partials, read off disk. The baseline's fuzzy `PROHIBITIONS`
 * scan is not run here: it flags prose these partials keep on purpose.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import fg from "fast-glob";
import { describe, expect, it } from "vitest";

import { RETIRED_FORM_STRINGS, SHOUTING } from "./helpers/retired-prose-forms.js";
import { offendingLines, retiredFormsIn, withExemptionsRemoved } from "./helpers/text-scans.js";
import { AGENT_NAMES } from "../../types/generated/source-types.js";

const CLI_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const AGENTS_DIR = path.join(CLI_ROOT, "src", "agents");
const TEMPLATES_DIR = "_templates";

const PARTIAL_GLOB = "*/*/*.md";

type AgentPartial = { file: string; source: string };

async function everyPartial(): Promise<AgentPartial[]> {
  const paths = await fg(PARTIAL_GLOB, { cwd: AGENTS_DIR, ignore: [`${TEMPLATES_DIR}/**`] });

  return Promise.all(
    paths.sort().map(async (file) => ({
      file,
      source: await readFile(path.join(AGENTS_DIR, file), "utf8"),
    })),
  );
}

/** The `CLAUDE.md` rule format's own name, which the keeper agents must be able to cite. */
const CLAUDE_MD_RULE_COLUMNS = "NEVER/ALWAYS";

/**
 * `agent-summoner`'s playbook quotes the retired form in order to forbid it. Exempted by spelling,
 * not by file, so a copy anywhere else still fails.
 */
const FORM_QUOTED_IN_ORDER_TO_FORBID_IT = "`**(You MUST ...)**`";

const EXEMPT_SPELLINGS = [CLAUDE_MD_RULE_COLUMNS, FORM_QUOTED_IN_ORDER_TO_FORBID_IT];

/** Patterns, not strings: each form is a class with as many spellings as instances. */
const RETIRED_AGENT_FORMS = [
  {
    form: "the bold parenthesised must-wrapper",
    pattern: /\*\*\(You MUST\b/,
  },
  {
    form: "a CRITICAL: opener, as a heading or in bold",
    pattern: /(?:^#{1,6}\s+|\*\*)CRITICAL:/,
  },
  {
    form: "the closer naming what an agent's failure would produce",
    pattern: /Failure to follow these rules will/,
  },
] as const;

/**
 * Capitalised words that are directives; a run of capitals is `SHOUTING`'s job. Acronyms, names
 * and a bare `NOT` in a scope heading are deliberately absent. Re-run the census from
 * `src/agents/` before adding:
 *
 * ```
 * grep -rohE '\b[A-Z]{2,}\b' --include='*.md' . | sort | uniq -c | sort -rn
 * ```
 */
const EMPHASIS_WORDS = [
  "ALWAYS",
  "NEVER",
  "MUST",
  "CRITICAL",
  "IMPORTANT",
  "REQUIRED",
  "MANDATORY",
  "FORBIDDEN",
  "STOP",
  "DO NOT",
  "DON'T",
  "ONLY",
  "EVERY",
  "ALL",
  "ANY",
  "NOTE",
  "WARNING",
  "CAUTION",
] as const;

/** Case-sensitive: only capitals shout. */
const SHOUTED_EMPHASIS = new RegExp(`\\b(?:${EMPHASIS_WORDS.join("|")})\\b`);

async function offendingPartialLines(patterns: readonly RegExp[]): Promise<string[]> {
  const partials = await everyPartial();

  return partials.flatMap(({ file, source }) =>
    offendingLines(withExemptionsRemoved(source, EXEMPT_SPELLINGS), patterns).map(
      (line) => `${file}: ${line}`,
    ),
  );
}

describe("the prose an agent ships states its rules rather than shouting them", () => {
  it("reads a partial from every agent the generated roster names", async () => {
    const partials = await everyPartial();
    const agents = [...new Set(partials.map(({ file }) => path.basename(path.dirname(file))))];

    expect(
      agents.sort(),
      "the scans below report nothing about an agent whose partials the glob did not reach",
    ).toStrictEqual([...AGENT_NAMES].sort());
  });

  it.each(RETIRED_AGENT_FORMS)("carries no instance of $form", async ({ pattern }) => {
    expect(
      await offendingPartialLines([pattern]),
      "a form the rewrite retired is back in an agent's prose — state the rule as the action to take and give its reason in the same breath",
    ).toStrictEqual([]);
  });

  it("names no rule by capitalising a word", async () => {
    expect(
      await offendingPartialLines([SHOUTED_EMPHASIS]),
      "shout every rule and none of them reads as one — open the paragraph with its claim in bold instead",
    ).toStrictEqual([]);
  });

  it("carries no shouted run of words", async () => {
    expect(
      await offendingPartialLines([SHOUTING]),
      "a shouted run spends an agent's emphasis budget before the rule it is attached to is read",
    ).toStrictEqual([]);
  });

  it("carries none of the forms the agent template retired", async () => {
    const partials = await everyPartial();

    expect(
      partials.flatMap(({ file, source }) =>
        retiredFormsIn(source, RETIRED_FORM_STRINGS).map((form) => `${file}: ${form}`),
      ),
      "a line retired from the template has reappeared in an agent's own prose, where the baseline scan cannot see it",
    ).toStrictEqual([]);
  });
});
