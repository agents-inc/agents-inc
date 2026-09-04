/**
 * A compiled sub-agent's `<skill_activation_protocol>` lists every skill it can load, and each
 * entry's `- Use when:` line is the ONLY thing that tells it when to reach for one. The whole
 * dynamic-skill mechanism rests on that sentence being about the skill.
 *
 * Rendered through the real `agent.liquid` rather than asserted at the loader, because the loader
 * and the template are two surfaces and only a render puts them in one string. The chain under
 * test is the production one end to end: a stack's `StackAgentConfig` through
 * `resolveAgentConfigToSkills`, into `Skill`s through `resolveSkillReferences`, into the
 * template's `dynamicSkills`.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { renderAgent } from "@workspace/compile/agent-source";

import { createLiquidEngine } from "../compiler.js";
import { createMockCompiledAgentData } from "./factories/agent-factories.js";
import {
  createMockSkillAssignment,
  createMockSkillDefinition,
} from "./factories/skill-factories.js";
import { parseCompiledAgentSections } from "./helpers/compiled-agent-sections.js";
import { USAGE_GUIDANCE_MATRIX } from "./mock-data/mock-matrices.js";
import { FALLBACK_USAGE, GUIDED_SKILL, STATED_USAGE_GUIDANCE } from "./mock-data/mock-skills.js";
import { initializeMatrix } from "../matrix/matrix-provider.js";
import { resolveSkillReferences } from "../resolver.js";
import { resolveAgentConfigToSkills } from "../stacks/stacks-loader.js";
import type { SkillDefinitionMap, StackAgentConfig } from "../../types";

/** A version string the render is handed; the provenance stamp is not this file's subject. */
const RENDER_VERSION = "0.0.0-usage-guidance";

/** The category key the assignment is filed under — the word a derived usage would take. */
const GUIDED_CATEGORY = "web-client-state";

/**
 * One agent compiled with a single dynamic skill, taken the whole way from the stack config.
 *
 * `preloadedSkillIds` stays empty so the template takes its `dynamicSkills` branch; a skill in
 * the frontmatter renders no protocol entry at all and the assertions below would then be about
 * a section that is not there.
 */
async function renderAgentWithGuidedSkill(): Promise<string> {
  const agentConfig: StackAgentConfig = {
    [GUIDED_CATEGORY]: [createMockSkillAssignment(GUIDED_SKILL.id)],
  };
  const definitions: SkillDefinitionMap = {
    [GUIDED_SKILL.id]: createMockSkillDefinition(GUIDED_SKILL.id),
  };

  const dynamicSkills = resolveSkillReferences(
    resolveAgentConfigToSkills(agentConfig),
    definitions,
  );
  const engine = await createLiquidEngine();

  return renderAgent(
    engine,
    {
      ...createMockCompiledAgentData(),
      skills: dynamicSkills,
      preloadedSkills: [],
      dynamicSkills,
      preloadedSkillIds: [],
    },
    RENDER_VERSION,
  );
}

describe("skill activation protocol", () => {
  beforeEach(() => {
    initializeMatrix(USAGE_GUIDANCE_MATRIX);
  });

  it("renders the skill as a dynamic entry", async () => {
    // Neither assertion below means anything about a protocol the agent did not render, and an
    // absent section makes the negative one pass for free.
    const output = await renderAgentWithGuidedSkill();

    expect(parseCompiledAgentSections(output).dynamicEntries).toStrictEqual([
      { id: GUIDED_SKILL.id, invokeRef: GUIDED_SKILL.id },
    ]);
  });

  it("carries the guidance the skill states for itself", async () => {
    const output = await renderAgentWithGuidedSkill();

    expect(output).toContain(STATED_USAGE_GUIDANCE);
  });

  it("does not describe the skill by the category its assignment is filed under", async () => {
    const output = await renderAgentWithGuidedSkill();

    expect(
      output,
      "a category name states a filing, not when to reach for the skill",
    ).not.toContain(FALLBACK_USAGE["web-client-state"]);
  });
});
