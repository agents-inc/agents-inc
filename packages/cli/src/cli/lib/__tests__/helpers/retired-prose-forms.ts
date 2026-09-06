/**
 * The shouted-run pattern and the roster of exact retired lines — the two prose scans that read
 * both the compiled BASELINE every sub-agent carries and the agents' own markdown partials.
 *
 * Extracted rather than left in the spec that first needed them, because a second spec needs them
 * now and a spec cannot be imported from: Vitest collects a test file by importing it, so a
 * `describe` at the top level of an imported spec registers into the IMPORTER's suite and runs a
 * second time under it. Measured 2026-09-04 — a one-test spec importing a two-test spec reported
 * three tests passing.
 *
 * Both are `agent-baseline-is-slim-and-positively-framed.test.ts`'s work, moved unchanged.
 * `PROHIBITIONS` deliberately stayed behind: it is case-insensitive and positional, which is right
 * for a baseline all eighteen sub-agents carry identically and wrong for one agent's own playbook,
 * where a prohibition written as prose costs one reader rather than eighteen.
 */

/**
 * A shouted run: four or more consecutive capitalised words, with an interior NUMERAL treated as
 * a separator rather than as one of the four.
 *
 * The numeral alternative is not decoration. The spelling that motivated this whole guard is
 * `DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE` — the line `agent.liquid` opened
 * and closed with until it was retired — and without `(?:\d+\s+)?` the `5` cut it into
 * `DISPLAY ALL` and `CORE PRINCIPLES AT THE START`, neither of which is four words, so the one
 * line this pattern exists to catch was the one line it could not see. Do not simplify it back:
 * the spelled-out `ALL FIVE` variant matches either way, and the numeral one only matches here.
 * `retired-prose-forms.test.ts` holds both halves of that against the pattern.
 *
 * Four capitalised words are still required, so a number cannot pad a three-word run into a match
 * (`ONE TWO 3 FOUR` does not match), and prose carrying a figure stays quiet — "The CLI has 13
 * commands and 18 flags", "Use TypeScript 5 strict mode", "Run npm test 2 times".
 */
export const SHOUTING = /\b[A-Z][A-Z']{2,}(?:\s+(?:\d+\s+)?[A-Z][A-Z']{2,}){3,}\b/;

/**
 * Forms the agent template deliberately retired, as EXACT case-sensitive substrings.
 *
 * A third mechanism because one pattern was being asked to do two jobs with opposite requirements.
 * `SHOUTING` here, and `PROHIBITIONS` in the baseline spec, guard against prose nobody has written
 * yet, which is irreducibly fuzzy and carries permanent false-positive pressure — a bare `MUST` is
 * in half this repository's own standards, and a two-word capital run is `CLI JSON`. Guarding a
 * KNOWN, finite set of retired lines has the opposite requirement: the set is enumerable, so exact
 * matching gets zero false positives, and a fuzzy pattern is strictly worse at it. Eight of the
 * eleven entries below are unreachable by either pattern, and every one of the eleven was a
 * deliberate deletion.
 *
 * Derived from `git show HEAD:src/agents/_templates/agent.liquid` and the five partials that
 * template renders, by rendering the pre-slimming baseline, subtracting every line the two fuzzy
 * scans already catch, and keeping the retired coercive forms from what remained. Each entry
 * carries where it came from, so a reader meeting this list later can tell a retired form from an
 * arbitrary banned word. Entries the fuzzy scans DO catch are kept anyway — the roster is meant to
 * be readable as the whole record of what was taken out, rather than as the residue of two other
 * patterns whose tuning may move.
 *
 * Three things deliberately left out, because a roster that over-claims is worse than a short one:
 * the `**CRITICAL: Never speculate…**` / `**CRITICAL: Never report success…**` openers, which were
 * REWRITTEN into the positive framing of `operating-principles.liquid` rather than retired, and
 * which `PROHIBITIONS` already holds; the bare `You MUST read those files` construction, which is
 * an instance of a general shape rather than a distinctive line, so an exact substring for it would
 * pin one sentence and miss the class; and everything in `improvement-protocol.liquid`, which sits
 * beside the five but is rendered by no `{% render %}` tag, so an entry from it could never fire.
 */
const RETIRED_FORMS = [
  {
    form: "DISPLAY ALL 5 CORE PRINCIPLES AT THE START OF EVERY RESPONSE",
    retiredFrom: "the self-repetition instruction `agent.liquid` opened and closed its body with",
  },
  {
    form: "ALWAYS RE-READ FILES AFTER EDITING TO VERIFY CHANGES WERE WRITTEN",
    retiredFrom:
      "the last line of the pre-slimming `agent.liquid`, below every agent's own reminders",
  },
  {
    form: "you MUST follow this three-step protocol",
    retiredFrom:
      "what instituted the EVALUATE / ACTIVATE / IMPLEMENT scaffolding in the skills block",
  },
  {
    form: "Do this for EVERY skill. No exceptions.",
    retiredFrom:
      "the skills block's demand that an agent tabulate every skill before doing any work",
  },
  {
    form: "CRITICAL WARNING",
    retiredFrom: "the all-caps heading over the skills block's four coercive bullets",
  },
  {
    form: "COMPLETELY WORTHLESS",
    retiredFrom: "the first of those bullets, on an agent's own evaluation of which skills apply",
  },
  {
    form: "NOT AVAILABLE TO YOU",
    retiredFrom: "the second, on knowledge from a skill named but not invoked",
  },
  {
    form: "DOES NOT EXIST",
    retiredFrom: "the third, on a skill's content before the Skill tool loads it",
  },
  {
    form: "LYING TO YOURSELF",
    retiredFrom:
      "the fourth, addressed to an agent that calls a skill relevant and does not load it",
  },
  {
    form: "MISS PATTERNS, VIOLATE CONVENTIONS, AND PRODUCE INFERIOR CODE",
    retiredFrom: "what the skills block predicted of an agent implementing before loading",
  },
  {
    form: "The Skill tool exists for a reason. USE IT.",
    retiredFrom: "the line the skills block closed its warning on",
  },
] as const;

/** The `form` of every entry in {@link RETIRED_FORMS}, in the order the roster lists them. */
export const RETIRED_FORM_STRINGS = RETIRED_FORMS.map(({ form }) => form);
