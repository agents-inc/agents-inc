/**
 * The BASELINE is the part of a compiled sub-agent that comes from the template rather than from
 * the agent's own five markdown files — every byte of it is carried identically by all eighteen,
 * so a sentence added here is added eighteen times.
 *
 * Rendered rather than read off disk. The template and its partials are three surfaces (literal
 * text, `{% render %}` tags, and the partial files themselves) and only the render puts them in
 * the same string; a scan of `agent.liquid` alone reports a baseline a fifth of its real size,
 * and would have called the 13.8 KB of methodology partials clean by never opening them.
 *
 * The two subjects here are the two that no other gate in this package can see. `tsc` does not
 * open a `.liquid` file, ESLint does not lint one, and the engine runs `strictVariables: false` —
 * so a baseline that doubled in size, or filled with prohibitions, would ship green.
 */
import { describe, expect, it } from "vitest";

import { renderAgent } from "@workspace/compile/agent-source";

import { createLiquidEngine } from "../compiler.js";
import { createMockCompiledAgentData } from "./factories/agent-factories.js";
import { createMockSkillEntry } from "./factories/skill-factories.js";
import { parseCompiledAgentSections } from "./helpers/compiled-agent-sections.js";
import { offendingLines, retiredFormsIn } from "./helpers/text-scans.js";
import { SKILLS } from "./test-fixtures.js";
import type { CompiledAgentData } from "../../types";

/** A version string the render is handed; the provenance stamp is not this file's subject. */
const RENDER_VERSION = "0.0.0-baseline";

/**
 * The four skill fields of a render, which between them choose which of the three blocks the
 * template's closing `{% if dynamicSkills.size > 0 %}` chain emits.
 */
type SkillPosture = Pick<
  CompiledAgentData,
  "skills" | "preloadedSkills" | "dynamicSkills" | "preloadedSkillIds"
>;

/**
 * The baseline in one skill posture: an agent rendered with every content field empty.
 *
 * Empty content fields are what make the measurement the TEMPLATE's rather than an agent's. A
 * fixture carrying prose would fold that prose into the number, and the budget below would then
 * be a fact about the fixture — passing or failing on an edit to the fixture's own text.
 *
 * The posture is a PARAMETER because it selects a branch, and a scan that only ever renders one
 * posture has never read the other two. The worst prose in this template's history lived inside
 * the `dynamicSkills` branch, which an empty-skill render leaves unentered — so both scans below
 * would have reported it clean.
 */
async function renderBaselineWith(skills: SkillPosture): Promise<string> {
  const engine = await createLiquidEngine();

  return renderAgent(
    engine,
    {
      ...createMockCompiledAgentData(),
      identity: "",
      playbook: "",
      output: "",
      criticalRequirementsTop: "",
      criticalReminders: "",
      ...skills,
    },
    RENDER_VERSION,
  );
}

/** Nothing configured: the template's no-skills `<skills_note>`, and what the budget measures. */
function withNoSkills(): SkillPosture {
  return { skills: [], preloadedSkills: [], dynamicSkills: [], preloadedSkillIds: [] };
}

/** One skill reached through the Skill tool, which is what renders `<skill_activation_protocol>`. */
function withOneDynamicSkill(): SkillPosture {
  const skill = createMockSkillEntry(SKILLS.react.id);

  return { skills: [skill], preloadedSkills: [], dynamicSkills: [skill], preloadedSkillIds: [] };
}

/** One skill carried in the frontmatter, which renders the preloaded `<skills_note>` instead. */
function withOnePreloadedSkill(): SkillPosture {
  const skill = createMockSkillEntry(SKILLS.react.id, true);

  return {
    skills: [skill],
    preloadedSkills: [skill],
    dynamicSkills: [],
    preloadedSkillIds: [skill.id],
  };
}

/**
 * What the baseline may weigh, in UTF-8 bytes.
 *
 * **The unit is measured rather than assumed, and it did not used to be.** The assertion below
 * read `baseline.length`, which counts UTF-16 code units, while this docblock, the constant's own
 * name and the failure message all said bytes — and the baseline carries em-dashes and arrows,
 * each one unit and three bytes. `Buffer.byteLength` is what makes the four agree, and it is the
 * quantity that means something about a file eighteen agents are compiled into.
 *
 * A ceiling rather than a measurement, and deliberately not the current figure: a budget set to
 * whatever the tree happens to render is satisfied by definition on the day it is written and
 * never fails afterwards. This one was chosen against **15,412 B — what the pre-slimming template
 * rendered in the NO-SKILLS posture**, literal template text plus the five rendered methodology
 * partials — and leaves room for a baseline roughly a quarter that size.
 *
 * The posture belongs to the figure. The same template rendered 15,444 B carrying one preloaded
 * skill and 16,952 B carrying one dynamic skill, so a byte count with no posture attached names
 * three different numbers and settles none of them.
 *
 * The methodology partials were slimmed to one after those three figures were taken. Re-measured
 * through this test's own render path on 2026-09-04, the same three postures render 2,324 B
 * no-skills, 2,622 B one dynamic skill and 2,327 B one preloaded skill — under a fifth of the
 * pre-slimming figures above, and comfortably inside the ceiling below rather than pressed against
 * it. This docblock previously said 2,290 / 2,586 / 2,293 B; measured against the tree that
 * carried them those postures rendered 2,204 / 2,500 / 2,207 code units and 2,216 / 2,514 / 2,219
 * bytes, so the stated figures reproduced in neither unit.
 *
 * Measured in the no-skills posture, and only there. A budget taken over a render carrying skills
 * would be a fact about a project's configuration rather than about the template — every skill a
 * user selects adds an entry, so the same template would pass for one stack and fail for another.
 *
 * The reason a ceiling is worth having at all: the baseline is the one block in the product that
 * grows without anyone deciding to grow it. Every rule anybody wanted every agent to follow was
 * added here, because here is where it reaches all eighteen at once.
 */
const BASELINE_BYTE_BUDGET = 4_000;

/**
 * Prohibitions and shouting, as the shapes they are actually written in.
 *
 * Matched by POSITION rather than by case, which is what makes the scan both complete and quiet.
 * A case-sensitive scan for `DO NOT` misses `Do NOT` and `Do not`, and those are the spellings a
 * prohibition actually survives in — every one that outlived nine review passes of `prompt-bible.md`
 * was spelled that way. A blanket case-insensitive scan then over-fires on ordinary prose: "a burden
 * they never agreed to" is description, and the generated-file notice "do not edit" is addressed to
 * a human opening the file rather than to the agent reading it.
 *
 * So a prohibition counts when it sits where an imperative sits — opening a line, a sentence, a
 * bullet, or a bold run. The second pattern keeps the shouted forms wherever they appear, since
 * ALL-CAPS is a directive in any position. The all-caps shape is separate because the
 * damage it does is tonal rather than grammatical — a baseline that tells eighteen agents they
 * are LYING TO THEMSELVES spends its emphasis budget before any agent's own critical rules are
 * read.
 */
const PROHIBITIONS = [
  /(?:^|[.!?]\s+|\*\*|^[-*]\s+)(?:do not|don't|never|avoid|must not)\b/im,
  /\bDO NOT\b|\bNEVER\b|\bAVOID\b|\bMUST NOT\b/,
  /\bforbidden\b/i,
] as const;

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
 *
 * Four capitalised words are still required, so a number cannot pad a three-word run into a match
 * (`ONE TWO 3 FOUR` does not match), and prose carrying a figure stays quiet — "The CLI has 13
 * commands and 18 flags", "Use TypeScript 5 strict mode", "Run npm test 2 times".
 */
const SHOUTING = /\b[A-Z][A-Z']{2,}(?:\s+(?:\d+\s+)?[A-Z][A-Z']{2,}){3,}\b/;

/**
 * Forms this template deliberately retired, as EXACT case-sensitive substrings.
 *
 * A third mechanism because the file was asking one to do two jobs with opposite requirements.
 * `PROHIBITIONS` and `SHOUTING` guard against prose nobody has written yet, which is irreducibly
 * fuzzy and carries permanent false-positive pressure — a bare `MUST` is in half this repository's
 * own standards, and a two-word capital run is `CLI JSON`. Guarding a KNOWN, finite set of retired
 * lines has the opposite requirement: the set is enumerable, so exact matching gets zero false
 * positives, and a fuzzy pattern is strictly worse at it. Eight of the eleven entries below are
 * unreachable by either pattern, and every one of the eleven was a deliberate deletion.
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
const RETIRED_FORM_STRINGS = RETIRED_FORMS.map(({ form }) => form);

/**
 * The three branches of the chain that closes the template, each with a line only it emits.
 *
 * The marker is what stops the two scans from passing for free. `offendingLines` answers `[]` as
 * readily for a block that never rendered as for one that rendered calmly, so a posture that
 * quietly selected the wrong branch — or a later edit that deleted a branch outright — would
 * leave both assertions green with the text they name unread. The dynamic-skills marker carries
 * the second half of that: the protocol block is the concept of dynamic skills, so its presence
 * is an invariant in its own right rather than only scaffolding for the scans.
 */
const BASELINE_BRANCHES = [
  {
    posture: "no skills configured",
    build: withNoSkills,
    marker: "No skills are configured for this agent.",
  },
  {
    posture: "a skill loaded through the Skill tool",
    build: withOneDynamicSkill,
    marker: "<skill_activation_protocol>",
  },
  {
    posture: "a skill preloaded through frontmatter",
    build: withOnePreloadedSkill,
    marker: "This agent's skills are preloaded through its frontmatter",
  },
] as const;

describe("the baseline every compiled sub-agent carries", () => {
  it("stays within its byte budget", async () => {
    const bytes = Buffer.byteLength(await renderBaselineWith(withNoSkills()), "utf8");

    expect(
      bytes,
      `the baseline is carried identically by all eighteen sub-agents, so it is over budget by ${bytes - BASELINE_BYTE_BUDGET} bytes eighteen times`,
    ).toBeLessThanOrEqual(BASELINE_BYTE_BUDGET);
  });
});

describe.each(BASELINE_BRANCHES)("the baseline of an agent with $posture", ({ build, marker }) => {
  it("renders the block this posture selects", async () => {
    const baseline = await renderBaselineWith(build());

    expect(
      baseline,
      "neither scan below means anything about a block the render did not reach",
    ).toContain(marker);
  });

  it("states what to do rather than what to refrain from", async () => {
    const baseline = await renderBaselineWith(build());

    expect(
      offendingLines(baseline, PROHIBITIONS),
      "a prohibition in the baseline reaches every sub-agent — reframe it as the action to take",
    ).toStrictEqual([]);
  });

  it("carries its emphasis in ordinary sentences", async () => {
    const baseline = await renderBaselineWith(build());

    expect(
      offendingLines(baseline, [SHOUTING]),
      "shouted runs in the baseline spend the emphasis budget before any agent's own rules are read",
    ).toStrictEqual([]);
  });

  it("carries none of the forms this template retired", async () => {
    const baseline = await renderBaselineWith(build());

    expect(
      retiredFormsIn(baseline, RETIRED_FORM_STRINGS),
      "a retired form is back in the baseline — the two scans above are tuned for prose nobody has written yet and cannot be widened to reach these without over-firing",
    ).toStrictEqual([]);
  });
});

/**
 * The body's order is a cache decision before it is an editorial one.
 *
 * A sub-agent's compiled markdown IS its system prompt, so the file's leading bytes are the
 * cacheable prefix of every invocation of it. Two things in the body change without the agent's
 * role changing at all — the CLI version stamped into the provenance marker, and the skill list,
 * which moves whenever a user edits their stack — and both sat UPSTREAM of the largest static
 * blocks, so a patch release or a stack edit invalidated the playbook and the output format
 * beneath them.
 *
 * Relocating both below everything static is the whole of the fix, and the order below is what
 * records it. `toStrictEqual` rather than a `toContain` per section: the subject is the sequence,
 * and a containment check passes for every permutation of it.
 */
describe("the compiled body puts everything stable before everything volatile", () => {
  it("closes with the volatile block and nothing after it", async () => {
    const engine = await createLiquidEngine();
    const rendered = await renderAgent(engine, createMockCompiledAgentData(), RENDER_VERSION);

    const { sectionOrder } = parseCompiledAgentSections(rendered);

    expect(
      sectionOrder.at(-1),
      "the last block of a compiled body is the one carrying data that changes without the role changing",
    ).toBe("<system-reminder>");
  });

  /**
   * The version is the only environment-derived byte a compiled agent has ever carried, and it
   * sat on the first body line. Two claims, and the pair is the point: it is gone from the top,
   * and it is still somewhere — dropping it silently would be a different change wearing this
   * one's clothes.
   */
  it("keeps the generator version out of the cacheable prefix and inside the volatile block", async () => {
    const engine = await createLiquidEngine();
    const rendered = await renderAgent(engine, createMockCompiledAgentData(), RENDER_VERSION);

    const lines = rendered.split("\n");
    const firstBodyLine = lines[lines.indexOf("---", 1) + 1];
    const volatileBlockAt = lines.findIndex((line) => line === "<system-reminder>");
    const versionAt = lines.findIndex((line) => line.includes(RENDER_VERSION));

    expect(
      firstBodyLine,
      "the version is back on the first body line, so every release rewrites the first cacheable byte of all eighteen agents",
    ).not.toContain(RENDER_VERSION);
    expect(versionAt, "the version stopped travelling with the agent entirely").toBeGreaterThan(
      volatileBlockAt,
    );
  });
});
