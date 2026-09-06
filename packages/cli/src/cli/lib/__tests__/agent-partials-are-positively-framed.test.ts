/**
 * The eighteen sub-agents' OWN prose — the markdown partials under `src/agents/<group>/<agent>/`,
 * read off disk rather than rendered.
 *
 * `agent-baseline-is-slim-and-positively-framed.test.ts` renders with `identity`, `playbook`,
 * `output`, `criticalRequirementsTop` and `criticalReminders` all `""`, which is deliberate and
 * correct for what it measures — the cost the TEMPLATE adds to all eighteen. The consequence is
 * that no scan in this package has ever read a single sentence an agent actually ships, and the
 * partials are where the coercive forms lived: a rewrite landing 2026-09-04 took 228
 * `**(You MUST …)**` wrappers, 43 `CRITICAL:` openers — 16 written as headings and 27 in bold —
 * and 15 "Failure to follow these rules will…" closers out of them, and nothing in the repository
 * could have told anyone if they came back. `tsc` does not open a `.md`, ESLint does not lint one,
 * and the compile step reads them as opaque strings.
 *
 * Re-derive the figures above rather than trusting them. Each was measured against the revision
 * the rewrite landed on, which is what `<rev>` names:
 *
 * ```
 * git grep -ho '(You MUST' <rev> -- 'packages/cli/src/agents/*.md' | wc -l
 * git grep -h 'CRITICAL:' <rev> -- 'packages/cli/src/agents/*.md' | wc -l
 * git grep -h 'Failure to follow these rules will' <rev> -- 'packages/cli/src/agents/*.md' | wc -l
 * ```
 *
 * **`PROHIBITIONS` from the baseline spec is deliberately not run here.** Its first pattern is
 * case-insensitive and positional and its third is a bare case-insensitive `forbidden`, which is
 * the right bar for a baseline every sub-agent carries identically and the wrong one for a single
 * agent's playbook. Run over the partials on 2026-09-04 it reported nine lines, and every one of
 * them is prose the rewrite kept on purpose — "**Do not ask** what the codebase would answer",
 * "**Never stabilize a test by adding a retry…**", and an HTTP status table's `403 | Forbidden`
 * row. A guard that opens red against text its own programme just wrote is a guard that gets
 * muted, so the fuzzy prohibition scan stays where its subject is.
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

/** Every partial an agent ships: `<group>/<agent>/<partial>.md`, two levels below `src/agents/`. */
const PARTIAL_GLOB = "*/*/*.md";

/** One partial, with the path a failure names it by. */
type AgentPartial = { file: string; source: string };

/** Every partial on disk, in path order, so a failure list reads the same way twice. */
async function everyPartial(): Promise<AgentPartial[]> {
  const paths = await fg(PARTIAL_GLOB, { cwd: AGENTS_DIR, ignore: [`${TEMPLATES_DIR}/**`] });

  return Promise.all(
    paths.sort().map(async (file) => ({
      file,
      source: await readFile(path.join(AGENTS_DIR, file), "utf8"),
    })),
  );
}

/**
 * The `CLAUDE.md` rule format, cited by its own name.
 *
 * `codex-keeper` and `convention-keeper` both tell their agent where a convention belongs, and the
 * answer is a row under that file's `NEVER do this` / `ALWAYS do this` headings — which is the
 * structure's name rather than an instruction being shouted at the reader. Three lines across the
 * two agents carry it, and a guard that condemned them would leave the two agents whose whole
 * subject is this repository's conventions unable to name where a convention goes.
 */
const CLAUDE_MD_RULE_COLUMNS = "NEVER/ALWAYS";

/**
 * The one retired form written on purpose anywhere in the tree.
 *
 * `meta/agent-summoner/playbook.md` quotes it inside its `<voice>` section IN ORDER TO FORBID IT —
 * "it replaces the `**(You MUST ...)**` form". A guard that cannot tolerate a document naming what
 * it bans is the wrong guard: it would silence the one agent whose job is teaching this convention
 * to the next author, and the pressure to satisfy it would be to state the rule less clearly.
 *
 * Stated here as a named constant rather than narrowed out of the patterns below, so that a second
 * copy of this line appearing somewhere else still fails. The exemption is the SPELLING, not the
 * file.
 */
const FORM_QUOTED_IN_ORDER_TO_FORBID_IT = "`**(You MUST ...)**`";

/** Every spelling a scan below is licensed to ignore, with the reason on each constant. */
const EXEMPT_SPELLINGS = [CLAUDE_MD_RULE_COLUMNS, FORM_QUOTED_IN_ORDER_TO_FORBID_IT];

/**
 * The three coercive forms the rewrite took out of the partials, as PATTERNS rather than exact
 * strings.
 *
 * Exact substrings are the right mechanism for a finite retired set — that is what
 * `RETIRED_FORM_STRINGS` is — and the wrong one here, because each of these three is a CLASS with
 * as many spellings as it had instances. There were 26 `CRITICAL:` openers and no two of them said
 * the same thing after the colon. What is fixed is the opener itself, so that is what each pattern
 * pins, and each pattern stops at the boundary the form is recognisable by rather than reaching
 * into the sentence behind it.
 */
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
 * Words that are a directive rather than a term when written in capitals.
 *
 * Single words, because a RUN of them is `SHOUTING`'s subject and a two-mechanism split is what
 * keeps both quiet: this roster catches `**ALWAYS verify…**` where the run pattern needs four
 * words, and the run pattern catches `PRODUCE INFERIOR CODE` where no single word here appears.
 *
 * Derived from a census of the tree rather than from imagination, and the census is what a reader
 * should re-run from `src/agents/` before adding to it:
 *
 * ```
 * grep -rohE '\b[A-Z]{2,}\b' --include='*.md' . | sort | uniq -c | sort -rn
 * ```
 *
 * Three classes it returns that are not shouting and are not on this list. **Acronyms and
 * technical terms** — `API`, `CLI`, `JSON`, `SDK`, `TTY`, `SIGINT`, `GET`/`POST`/`DELETE` — which
 * no entry here spells. **Names of things**: `SKILL`, `TEMPLATE`, `PASS`/`FAIL`, `APPROVE`, and
 * the `SETUP`/`VERIFY`/`ITERATE` phase labels inside the testers' workflow blocks, all of them
 * identifiers rather than instructions.
 *
 * And **`NOT` as a negation marker in a scope heading** — `## What NOT to Test`,
 * `### Must NOT Have (Explicitly Out of Scope)`, `## What's NOT Covered (Intentionally)`,
 * `**Files NOT to Touch:**`. Ten such sites, and `NOT` is deliberately absent from this roster:
 * every pattern that separates them from shouting reduces to "unless the neighbouring words are
 * also capitals", which is `SHOUTING`'s own rule — so the shouted spellings are already covered
 * (`DO NOT` below as a two-word entry, `NOT AVAILABLE TO YOU` by the run pattern) and a bare `NOT`
 * between two lower-case words carries no emphasis to spend.
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

/** {@link EMPHASIS_WORDS} as one whole-word alternation, case-sensitive: only capitals shout. */
const SHOUTED_EMPHASIS = new RegExp(`\\b(?:${EMPHASIS_WORDS.join("|")})\\b`);

/** Every line of every partial that a pattern matches, once the licensed spellings are gone. */
async function offendingPartialLines(patterns: readonly RegExp[]): Promise<string[]> {
  const partials = await everyPartial();

  return partials.flatMap(({ file, source }) =>
    offendingLines(withExemptionsRemoved(source, EXEMPT_SPELLINGS), patterns).map(
      (line) => `${file}: ${line}`,
    ),
  );
}

describe("the prose an agent ships states its rules rather than shouting them", () => {
  /**
   * The sentinel every assertion below rests on. `offendingLines` answers `[]` as readily for a
   * file it never opened as for one that reads calmly, so a glob that stopped matching — a tree
   * that moved, an `ignore` that widened — would leave this whole file green having read nothing.
   */
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
