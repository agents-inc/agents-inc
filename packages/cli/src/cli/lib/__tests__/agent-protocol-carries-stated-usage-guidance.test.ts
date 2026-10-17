/**
 * Each `<skill_activation_protocol>` entry's `- Use when:` line is all that tells a sub-agent when
 * to load a skill. Rendered through the real `agent.liquid` from a stack config, end to end.
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

const RENDER_VERSION = "0.0.0-usage-guidance";

/** The category key the assignment is filed under — the word a derived usage would take. */
const GUIDED_CATEGORY = "web-client-state";

/** `preloadedSkillIds` stays empty so the template takes its `dynamicSkills` branch. */
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
    // An absent section would make the negative assertion pass for free.
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
