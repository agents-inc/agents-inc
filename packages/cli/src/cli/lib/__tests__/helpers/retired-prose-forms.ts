// Shared prose scans. Not kept in a spec: importing a spec re-registers its tests in the importer.

/**
 * Four or more consecutive capitalised words; an interior numeral is a separator, so
 * `DISPLAY ALL 5 CORE PRINCIPLES…` still matches. Don't drop `(?:\d+\s+)?`.
 */
export const SHOUTING = /\b[A-Z][A-Z']{2,}(?:\s+(?:\d+\s+)?[A-Z][A-Z']{2,}){3,}\b/;

// Lines the agent template deliberately retired, matched as exact case-sensitive substrings.
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

export const RETIRED_FORM_STRINGS = RETIRED_FORMS.map(({ form }) => form);
