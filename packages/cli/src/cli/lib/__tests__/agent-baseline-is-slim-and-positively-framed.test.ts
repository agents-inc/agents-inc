/**
 * The baseline: what the template adds identically to every compiled sub-agent. Rendered, since
 * only a render joins template text, render tags and partials.
 */
import { describe, expect, it } from "vitest";

import { renderAgent } from "@workspace/compile/agent-source";

import { createLiquidEngine } from "../compiler.js";
import { createMockCompiledAgentData } from "./factories/agent-factories.js";
import { createMockSkillEntry } from "./factories/skill-factories.js";
import { parseCompiledAgentSections } from "./helpers/compiled-agent-sections.js";
import { RETIRED_FORM_STRINGS, SHOUTING } from "./helpers/retired-prose-forms.js";
import { offendingLines, retiredFormsIn } from "./helpers/text-scans.js";
import { SKILLS } from "./test-fixtures.js";
import type { CompiledAgentData } from "../../types";

const RENDER_VERSION = "0.0.0-baseline";

/** The skill fields that choose which block the template's closing `dynamicSkills` chain emits. */
type SkillPosture = Pick<
  CompiledAgentData,
  "skills" | "preloadedSkills" | "dynamicSkills" | "preloadedSkillIds"
>;

/**
 * Content fields empty so the measurement is the template's. The skill posture is a parameter
 * because it selects a branch, and a single-posture scan never reads the other two.
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

function withNoSkills(): SkillPosture {
  return { skills: [], preloadedSkills: [], dynamicSkills: [], preloadedSkillIds: [] };
}

function withOneDynamicSkill(): SkillPosture {
  const skill = createMockSkillEntry(SKILLS.react.id);

  return { skills: [skill], preloadedSkills: [], dynamicSkills: [skill], preloadedSkillIds: [] };
}

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
 * A ceiling in UTF-8 bytes (`Buffer.byteLength`; the baseline carries multi-byte dashes), measured
 * in the no-skills posture only, since skills add per-configuration entries. Deliberately not the
 * current figure, which a budget would satisfy by definition.
 */
const BASELINE_BYTE_BUDGET = 4_000;

/**
 * Prohibitions matched by position (where an imperative sits), not case: `Do not` is how they
 * survive, while a blanket case-insensitive scan fires on prose. Shouted capitals count anywhere.
 */
const PROHIBITIONS = [
  /(?:^|[.!?]\s+|\*\*|^[-*]\s+)(?:do not|don't|never|avoid|must not)\b/im,
  /\bDO NOT\b|\bNEVER\b|\bAVOID\b|\bMUST NOT\b/,
  /\bforbidden\b/i,
] as const;

/** Each branch's marker line, so a branch that never rendered cannot pass the scans for free. */
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
 * The compiled body is the sub-agent's system prompt, so stable sections must precede the volatile
 * version stamp and skill list to keep the prefix cacheable.
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
