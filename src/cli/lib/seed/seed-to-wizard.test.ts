import { beforeEach, describe, expect, it } from "vitest";

import { seedToWizardResult } from "./seed-to-wizard";
import { initializeMatrix } from "../matrix/matrix-provider";
import { buildAgentConfigs } from "../__tests__/factories/config-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation.js";
import { REACT_HONO_WEB_API_DOMAINS_MATRIX } from "../__tests__/mock-data/mock-matrices.js";
import { SKILLS } from "../__tests__/test-fixtures.js";

/**
 * The `agents` map is the only place a shared configuration can say anything about a sub-agent
 * that no skill mentions, so these cover the four ways an agent can reach — or fail to reach —
 * the wizard result: named by the map, named only by an assignment, switched off, or not real.
 */
describe("seedToWizardResult", () => {
  beforeEach(() => {
    initializeMatrix(REACT_HONO_WEB_API_DOMAINS_MATRIX);
  });

  it("carries model and effort onto the named agent and leaves an assignment-only agent bare", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          assignments: { "web-developer": "lazy", "api-developer": "lazy" },
        }),
      },
      agents: { "web-developer": { model: "haiku", effort: "xhigh" } },
    });

    const { result } = seedToWizardResult(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    // Assignment order, so the two rows are positionally stable; the point is the shapes.
    expect(result.agentConfigs).toStrictEqual([
      ...buildAgentConfigs(["web-developer"], {
        scope: "project",
        model: "haiku",
        effort: "xhigh",
      }),
      ...buildAgentConfigs(["api-developer"], { scope: "project" }),
    ]);
  });

  it("selects an agent switched on in the map even when no skill is assigned to it", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({ assignments: { "web-developer": "lazy" } }),
      },
      agents: { "api-developer": { on: true } },
    });

    const { result } = seedToWizardResult(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    // Sorted rather than positional: where a map-only agent lands in the roster is not part of
    // the contract, that it is IN the roster with a project-scoped config is.
    expect([...result.selectedAgents].sort()).toStrictEqual(["api-developer", "web-developer"]);
    expect(result.agentConfigs.filter((ac) => ac.name === "api-developer")).toStrictEqual(
      buildAgentConfigs(["api-developer"], { scope: "project" }),
    );
    expect(result.agentConfigs).toHaveLength(2);
  });

  it("ignores an agent switched off in the map, and the assignment rows that name it", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          assignments: { "web-developer": "lazy", "api-developer": "lazy" },
        }),
      },
      agents: { "api-developer": { on: false } },
    });

    const { result } = seedToWizardResult(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    expect(result.selectedAgents).toStrictEqual(["web-developer"]);
    expect(result.agentConfigs).toStrictEqual(
      buildAgentConfigs(["web-developer"], { scope: "project" }),
    );
  });

  it("scopes each sub-agent by its own entry: named global, entry without a scope, no entry at all", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          assignments: { "web-developer": "lazy", "web-tester": "lazy", "api-developer": "lazy" },
        }),
      },
      agents: {
        "web-developer": { scope: "global" },
        // An entry that says something else entirely: with no scope of its own it stays in the
        // project, so "has an entry" is not what decides the scope — naming one is.
        "web-tester": { model: "haiku" },
        // api-developer has no entry at all: the map is sparse, and absence is the default too.
      },
    });

    const { result } = seedToWizardResult(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    // Assignment order, so the three rows are positionally stable; the point is the scopes.
    expect(result.agentConfigs).toStrictEqual([
      ...buildAgentConfigs(["web-developer"], { scope: "global" }),
      ...buildAgentConfigs(["web-tester"], { scope: "project", model: "haiku" }),
      ...buildAgentConfigs(["api-developer"], { scope: "project" }),
    ]);
    // A sub-agent's scope is its own: the skill it carries stays where its own entry put it.
    expect(result.skills).toStrictEqual(buildSkillConfigs([SKILLS.react.id]));
  });

  it("leaves a globally-scoped skill alone when no sub-agent names a scope", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "global",
          assignments: { "web-developer": "lazy" },
        }),
      },
    });

    const { result } = seedToWizardResult(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    expect(result.skills).toStrictEqual(buildSkillConfigs([SKILLS.react.id], { scope: "global" }));
    expect(result.agentConfigs).toStrictEqual(
      buildAgentConfigs(["web-developer"], { scope: "project" }),
    );
  });

  it("skips an agent name in the map this CLI does not know, and reports it by name", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({ assignments: { "web-developer": "lazy" } }),
      },
      agents: { "sub-agent-that-does-not-exist": { on: true, model: "haiku" } },
    });

    const { result, skippedAgentNames } = seedToWizardResult(
      payload,
      REACT_HONO_WEB_API_DOMAINS_MATRIX,
    );

    expect(skippedAgentNames).toStrictEqual(["sub-agent-that-does-not-exist"]);
    expect(result.selectedAgents).toStrictEqual(["web-developer"]);
  });
});
