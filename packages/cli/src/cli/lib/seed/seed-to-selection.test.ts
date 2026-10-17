import { DEFAULT_SELECTION_OPTIONS } from "@workspace/matrix";
import { beforeEach, describe, expect, it } from "vitest";

import { seedToInstallSelection } from "./seed-to-selection";
import { initializeMatrix } from "../matrix/matrix-provider";
import { buildAgentConfigs } from "../__tests__/factories/config-factories.js";
import { buildSeedPayload, buildSeedSkill } from "../__tests__/factories/seed-factories.js";
import { sa } from "../__tests__/factories/skill-factories.js";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { buildSkillConfigs } from "../__tests__/helpers/skill-config-builders.js";
import {
  REACT_HONO_WEB_API_DOMAINS_MATRIX,
  REACT_REQUIRES_ZUSTAND_WEB_API_DOMAINS_MATRIX,
} from "../__tests__/mock-data/mock-matrices.js";
import { SKILLS } from "../__tests__/test-fixtures.js";

/** An id no catalog in these specs knows, so the decode has to skip it. */
const UNKNOWN_SKILL_ID = "web-framework-does-not-exist";

/** What a config records about itself: a stack's own sentence, saved at install and never its id. */
const SHARED_DESCRIPTION = "Minimal stack for E2E testing";

// Skills are global where sub-agents rest at the default, since the decode refuses that pair.
describe("seedToInstallSelection", () => {
  beforeEach(() => {
    initializeMatrix(REACT_HONO_WEB_API_DOMAINS_MATRIX);
  });

  it("carries model and effort onto the named agent and leaves an assignment-only agent bare", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "global",
          assignments: { "web-developer": "lazy", "api-developer": "lazy" },
        }),
      },
      agents: { "web-developer": { model: "haiku", effort: "xhigh" } },
    });

    const { result } = seedToInstallSelection(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    // Assignment order, so the two rows are positionally stable; the point is the shapes.
    expect(result.agentConfigs).toStrictEqual([
      ...buildAgentConfigs(["web-developer"], {
        scope: "global",
        model: "haiku",
        effort: "xhigh",
      }),
      ...buildAgentConfigs(["api-developer"], { scope: "global" }),
    ]);
  });

  it("scopes an agent that names no scope to the shared selection default, global", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "global",
          assignments: { "web-developer": "lazy" },
        }),
      },
    });

    const { result } = seedToInstallSelection(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    // Constant and literal both: one binds the decode, the other stops the spelling drifting.
    expect(result.agentConfigs).toStrictEqual(
      buildAgentConfigs(["web-developer"], { scope: DEFAULT_SELECTION_OPTIONS.scope }),
    );
    expect(DEFAULT_SELECTION_OPTIONS.scope).toBe("global");
  });

  it("selects an agent switched on in the map even when no skill is assigned to it", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "global",
          assignments: { "web-developer": "lazy" },
        }),
      },
      agents: { "api-developer": { on: true } },
    });

    const { result } = seedToInstallSelection(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    // Sorted: a map-only agent's roster position is not part of the contract.
    expect([...result.selectedAgents].sort()).toStrictEqual(["api-developer", "web-developer"]);
    expect(result.agentConfigs.filter((ac) => ac.name === "api-developer")).toStrictEqual(
      buildAgentConfigs(["api-developer"], { scope: "global" }),
    );
    expect(result.agentConfigs).toHaveLength(2);
  });

  it("ignores an agent switched off in the map, and the assignment rows that name it", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "global",
          assignments: { "web-developer": "lazy", "api-developer": "lazy" },
        }),
      },
      agents: { "api-developer": { on: false } },
    });

    const { result } = seedToInstallSelection(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    expect(result.selectedAgents).toStrictEqual(["web-developer"]);
    expect(result.agentConfigs).toStrictEqual(
      buildAgentConfigs(["web-developer"], { scope: "global" }),
    );
  });

  it("scopes each sub-agent by its own entry: named project, entry without a scope, no entry at all", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "global",
          assignments: { "web-developer": "lazy", "web-tester": "lazy", "api-developer": "lazy" },
        }),
      },
      agents: {
        "web-developer": { scope: "project" },
        // An entry that says something else entirely: with no scope of its own it goes global,
        // so "has an entry" is not what decides the scope — naming one is.
        "web-tester": { model: "haiku" },
        // api-developer has no entry at all: the map is sparse, and absence is the default too.
      },
    });

    const { result } = seedToInstallSelection(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    // Assignment order, so the three rows are positionally stable; the point is the scopes.
    expect(result.agentConfigs).toStrictEqual([
      ...buildAgentConfigs(["web-developer"], { scope: "project" }),
      ...buildAgentConfigs(["web-tester"], { scope: "global", model: "haiku" }),
      ...buildAgentConfigs(["api-developer"], { scope: "global" }),
    ]);
    // A sub-agent's scope is its own: the skill it carries stays where its own entry put it, and
    // a global skill reaches every sub-agent whatever scope each one rests at.
    expect(result.skills).toStrictEqual(buildSkillConfigs([SKILLS.react.id], { scope: "global" }));
  });

  it("refuses a project-scoped skill assigned to a sub-agent that rests global, naming both", () => {
    const payload = buildSeedPayload({
      skills: {
        // Nothing pins web-developer, so it takes the shared selection default...
        [SKILLS.react.id]: buildSeedSkill({
          scope: "project",
          assignments: { "web-developer": "lazy" },
        }),
        // ...while api-developer says global in as many words. Both are the same unwritable pair,
        // and both have to be reported: naming only the first would hide half the payload's work.
        [SKILLS.hono.id]: buildSeedSkill({
          scope: "project",
          assignments: { "api-developer": "lazy" },
        }),
      },
      agents: { "api-developer": { scope: "global" } },
    });

    expect(() => seedToInstallSelection(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX)).toThrow(
      new RegExp(
        `${SKILLS.react.id}[\\s\\S]*web-developer[\\s\\S]*${SKILLS.hono.id}[\\s\\S]*api-developer`,
      ),
    );
  });

  it("does not refuse over assignment rows it was going to ignore anyway", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "project",
          assignments: {
            "web-developer": "lazy",
            // Both of these rest global and would be unwritable pairs — except the decode drops
            // them before the pair exists, one for being switched off and one for not being real.
            "api-developer": "lazy",
            "sub-agent-that-does-not-exist": "lazy",
          },
        }),
      },
      agents: { "web-developer": { scope: "project" }, "api-developer": { on: false } },
    });

    const { result, skippedAgentNames } = seedToInstallSelection(
      payload,
      REACT_HONO_WEB_API_DOMAINS_MATRIX,
    );

    expect(result.selectedAgents).toStrictEqual(["web-developer"]);
    expect(skippedAgentNames).toStrictEqual(["sub-agent-that-does-not-exist"]);
    expect(result.assignedStack).toStrictEqual({
      "web-developer": { "web-framework": [sa(SKILLS.react.id)] },
    });
  });

  it("carries a description the payload states onto the install selection", () => {
    const payload = buildSeedPayload({
      description: SHARED_DESCRIPTION,
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "global",
          assignments: { "web-developer": "lazy" },
        }),
      },
    });

    const { result } = seedToInstallSelection(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    expect(result.description).toBe(SHARED_DESCRIPTION);
    expect(
      result.selectedStackId,
      "the id stays null: recording one makes the receiver overlay that stack's own agents over the curation being shared",
    ).toBeNull();
  });

  it("leaves the description off a result decoded from a payload that states none", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "global",
          assignments: { "web-developer": "lazy" },
        }),
      },
    });

    const { result } = seedToInstallSelection(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

    expect(result).not.toHaveProperty("description");
  });

  it("skips an agent name in the map this CLI does not know, and reports it by name", () => {
    const payload = buildSeedPayload({
      skills: {
        [SKILLS.react.id]: buildSeedSkill({
          scope: "global",
          assignments: { "web-developer": "lazy" },
        }),
      },
      agents: { "sub-agent-that-does-not-exist": { on: true, model: "haiku" } },
    });

    const { result, skippedAgentNames } = seedToInstallSelection(
      payload,
      REACT_HONO_WEB_API_DOMAINS_MATRIX,
    );

    expect(skippedAgentNames).toStrictEqual(["sub-agent-that-does-not-exist"]);
    expect(result.selectedAgents).toStrictEqual(["web-developer"]);
  });

  describe("revalidating the decoded selection against this catalog", () => {
    /** React needs Zustand here; the payloads below differ only in whether it arrives. */
    const REACT_ONLY_ASSIGNMENT = { "web-developer": "lazy" } as const;

    beforeEach(() => {
      initializeMatrix(REACT_REQUIRES_ZUSTAND_WEB_API_DOMAINS_MATRIX);
    });

    it("reports a requirement this catalog says is unmet", () => {
      const payload = buildSeedPayload({
        skills: {
          [SKILLS.react.id]: buildSeedSkill({
            scope: "global",
            assignments: REACT_ONLY_ASSIGNMENT,
          }),
        },
      });

      const { result } = seedToInstallSelection(
        payload,
        REACT_REQUIRES_ZUSTAND_WEB_API_DOMAINS_MATRIX,
      );

      expect(result.validation.valid).toBe(false);
      expect(firstElement(result.validation.errors).type).toBe("missingRequirement");
      expect(firstElement(result.validation.errors).skills).toContain(SKILLS.zustand.id);
    });

    it("names the unmet requirement beside the skip, so the pair reads as one verdict", () => {
      const payload = buildSeedPayload({
        skills: {
          [SKILLS.react.id]: buildSeedSkill({
            scope: "global",
            assignments: REACT_ONLY_ASSIGNMENT,
          }),
          [UNKNOWN_SKILL_ID]: buildSeedSkill({
            scope: "global",
            assignments: REACT_ONLY_ASSIGNMENT,
          }),
        },
      });

      const { result, skippedSkillIds } = seedToInstallSelection(
        payload,
        REACT_REQUIRES_ZUSTAND_WEB_API_DOMAINS_MATRIX,
      );

      expect(skippedSkillIds).toStrictEqual([UNKNOWN_SKILL_ID]);
      expect(firstElement(result.validation.errors).type).toBe("missingRequirement");
    });

    it("stays silent on a payload this catalog still finds consistent", () => {
      const payload = buildSeedPayload({
        skills: {
          [SKILLS.react.id]: buildSeedSkill({
            scope: "global",
            assignments: REACT_ONLY_ASSIGNMENT,
          }),
          [SKILLS.zustand.id]: buildSeedSkill({
            scope: "global",
            assignments: REACT_ONLY_ASSIGNMENT,
          }),
        },
      });

      const { result } = seedToInstallSelection(
        payload,
        REACT_REQUIRES_ZUSTAND_WEB_API_DOMAINS_MATRIX,
      );

      expect(result.validation).toStrictEqual({ valid: true, errors: [] });
    });
  });
});
