import { beforeEach, describe, it, expect, vi } from "vitest";

vi.mock("../../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../utils/logger")>()),
  verbose: vi.fn(),
  warn: vi.fn(),
}));

import { verbose, warn } from "../../utils/logger";
import {
  generateProjectConfigFromSkills,
  buildStackProperty,
  splitConfigByScope,
} from "./config-generator";
import type { AgentName, SkillId, StackAgentConfig } from "../../types";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { initializeMatrix } from "../matrix/matrix-provider";
import { normalizeStackRecord } from "../stacks/stacks-loader";
import { sa } from "../__tests__/factories/skill-factories.js";
import { buildSkillConfigs } from "../__tests__/helpers/wizard-simulation.js";
import { buildProjectConfig, buildAgentConfigs } from "../__tests__/factories/config-factories.js";
import {
  expectConfigSkills,
  expectConfigAgents,
  expectSkillConfigs,
  expectAgentConfigs,
} from "../__tests__/assertions/index.js";
import {
  FULLSTACK_STACK,
  EMPTY_AGENTS_STACK,
  WEB_REACT_AND_SCSS_STACK,
  SHARED_CATEGORY_STACK,
  STACK_WITH_EMPTY_AGENTS,
  MULTI_METHODOLOGY_STACK,
  STACK_WITH_EMPTY_CATEGORY,
  MANY_CATEGORIES_STACK,
  LOCAL_SKILL_STACK,
  UNFLAGGED_TWO_AGENT_STACK,
  AUTHORED_FLAGS_STACK,
} from "../__tests__/mock-data/mock-stacks.js";
import { CUSTOM_HOUSE_TOOLING_ID } from "../__tests__/mock-data/mock-skills.js";
import { CLI_INVOKE_COMMAND } from "../../consts";
import {
  CUSTOM_SKILL_MATRIX,
  LOCAL_SKILL_MATRIX,
  MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX,
  MIXED_LOCAL_REMOTE_MATRIX,
  METHODOLOGY_MATRIX,
  NAMESPACED_SKILL_MATRIX,
  SHARED_SECURITY_MATRIX,
  VITEST_MATRIX,
  EMPTY_MATRIX,
  SINGLE_REACT_MATRIX,
  FULLSTACK_PAIR_MATRIX,
  REACT_SCSS_MATRIX,
  REACT_SCSS_HONO_MATRIX,
  MULTI_STYLING_MATRIX,
} from "../__tests__/mock-data/mock-matrices.js";

describe("config-generator", () => {
  describe("generateProjectConfigFromSkills", () => {
    it("returns a minimal ProjectConfig structure with stack when selectedAgents provided", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "reviewer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expect(config.name).toBe("my-project");
      expectAgentConfigs(config, buildAgentConfigs(["web-developer", "reviewer"]));
      expect(config.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
        reviewer: {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
      });
      // Should NOT have these fields by default
      expect(config.author).toBeUndefined();
      expect(config.description).toBeUndefined();
    });

    it("builds stack with category->SkillAssignment[] mappings for multiple skills", () => {
      initializeMatrix(REACT_SCSS_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "reviewer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react", "web-styling-scss-modules"],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react", "web-styling-scss-modules"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      // Styling is preloaded for the roles that build with it and lazy for the
      // reviewer — the same skill, two answers, straight from the mapping.
      expect(config.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
          "web-styling": [{ id: "web-styling-scss-modules", preloaded: true }],
        },
        reviewer: {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
          "web-styling": [{ id: "web-styling-scss-modules" }],
        },
      });
    });

    it("preserves all skills in the same category (multi-select categories)", () => {
      initializeMatrix(MULTI_STYLING_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react", "web-styling-scss-modules", "web-styling-tailwind"],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs([
            "web-framework-react",
            "web-styling-scss-modules",
            "web-styling-tailwind",
          ]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      // Both styling skills must survive — regression: Object.fromEntries overwrote duplicates
      expect(config).toStrictEqual({
        name: "my-project",
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs([
          "web-framework-react",
          "web-styling-scss-modules",
          "web-styling-tailwind",
        ]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [
              { id: "web-styling-scss-modules", preloaded: true },
              { id: "web-styling-tailwind", preloaded: true },
            ],
          },
        },
      });
    });

    it("uses selectedAgents when provided", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "reviewer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expectAgentConfigs(config, buildAgentConfigs(["web-developer", "reviewer"]));
      expect(config.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
        reviewer: {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
      });
    });

    it("handles empty skill selection", () => {
      initializeMatrix(EMPTY_MATRIX);
      const config = generateProjectConfigFromSkills("my-project", []);

      expect(config.name).toBe("my-project");
      expectAgentConfigs(config, []);
      expect(config.stack).toBeUndefined();
    });

    it("skips local skills in stack (no category)", () => {
      initializeMatrix(LOCAL_SKILL_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer"];

      // Fabricated test ID outside the SkillId union — matrix entry is defined locally
      const config = generateProjectConfigFromSkills("my-project", ["web-local-skill" as SkillId], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-local-skill" as SkillId]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      // Local skills have category "local" which is excluded from stack. With an
      // agent selected, the generator authoritatively rebuilt the stack and found
      // nothing to preload, so it emits an explicit empty `{}` (not an omitted
      // key) — the merger trusts `{}` and won't resurrect a stale existing stack.
      expect(config).toStrictEqual({
        name: "my-project",
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-local-skill" as SkillId]),
        stack: {},
      });
    });

    it("handles both remote and local skills", () => {
      initializeMatrix(MIXED_LOCAL_REMOTE_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "reviewer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        // Fabricated test ID outside the SkillId union — matrix entry is defined locally
        ["web-framework-react", "meta-company-patterns" as SkillId],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs([
            "web-framework-react",
            "meta-company-patterns" as SkillId,
          ]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      // Stack should have framework mapping from remote skill (local skills have no category)
      expect(config.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
        reviewer: {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
      });
    });

    it("includes optional fields when provided", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        description: "My awesome project",
        author: "@vince",
        selectedAgents: ["web-developer"],
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(["web-developer"]),
      });

      expect(config).toStrictEqual({
        name: "my-project",
        description: "My awesome project",
        author: "@vince",
        agents: buildAgentConfigs(["web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });
    });

    it("skips unknown skills gracefully", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react", "web-unknown-skill" as SkillId],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react", "web-unknown-skill" as SkillId]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      // Stack should only contain known skills
      expect(config.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
      });
      expectAgentConfigs(config, buildAgentConfigs(["web-developer"]));
    });

    describe("what the user is told about a skill this marketplace does not carry", () => {
      /** An id no marketplace declares — the whole point of the warning under test. */
      const ABSENT_SKILL_ID = "web-unknown-skill" as SkillId;
      /** The developer-only half of the old warning: five arbitrary matrix keys. */
      const MATRIX_SAMPLE_LABEL = "Matrix keys sample";

      beforeEach(() => {
        vi.clearAllMocks();
        initializeMatrix(SINGLE_REACT_MATRIX);
      });

      function generateWithAbsentSkill(): void {
        const selectedAgents: AgentName[] = ["web-developer"];
        generateProjectConfigFromSkills("my-project", ["web-framework-react", ABSENT_SKILL_ID], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react", ABSENT_SKILL_ID]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        });
      }

      it("names the skill and what to do about it", () => {
        generateWithAbsentSkill();

        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(ABSENT_SKILL_ID),
          expect.anything(),
        );
        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining(`${CLI_INVOKE_COMMAND} update`),
          expect.anything(),
        );
      });

      it("says the skill stays in the configuration rather than that it was not found", () => {
        generateWithAbsentSkill();

        expect(warn).toHaveBeenCalledWith(
          expect.stringContaining("marketplace"),
          expect.anything(),
        );
        expect(warn).not.toHaveBeenCalledWith(
          expect.stringContaining("NOT FOUND"),
          expect.anything(),
        );
      });

      it("keeps the matrix key sample in verbose diagnostics, out of the warning", () => {
        generateWithAbsentSkill();

        expect(warn).not.toHaveBeenCalledWith(
          expect.stringContaining(MATRIX_SAMPLE_LABEL),
          expect.anything(),
        );
        expect(verbose).toHaveBeenCalledWith(expect.stringContaining(MATRIX_SAMPLE_LABEL));
      });

      it("says nothing when every selected skill is in the marketplace", () => {
        const selectedAgents: AgentName[] = ["web-developer"];
        generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        });

        expect(warn).not.toHaveBeenCalled();
      });
    });

    it("deduplicates agents across skills in the same domain", () => {
      initializeMatrix(REACT_SCSS_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "reviewer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react", "web-styling-scss-modules"],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react", "web-styling-scss-modules"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      // Both skills share the same domain agents — each agent should appear exactly once
      expectAgentConfigs(config, buildAgentConfigs(["web-developer", "reviewer"]));
    });

    it("sorts agents alphabetically", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      // Input order is deliberately unsorted to verify the function sorts
      const selectedAgents: AgentName[] = ["reviewer", "api-developer", "web-developer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      // Order IS the subject here, so the comparison has to be order-sensitive.
      // `expectAgentConfigs` sorts both sides — right for its other callers, who
      // ask about membership, and blind here: this `it` passed unchanged with the
      // producer's own `.sort()` removed.
      expect(config.agents).toStrictEqual(
        buildAgentConfigs(["api-developer", "reviewer", "web-developer"]),
      );
    });

    it("assigns each selected skill to its own domain's agents plus the reviewer", () => {
      initializeMatrix(FULLSTACK_PAIR_MATRIX);
      const selectedAgents: AgentName[] = ["api-developer", "web-developer", "reviewer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react", "api-framework-hono"],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      expectAgentConfigs(config, buildAgentConfigs(["api-developer", "web-developer", "reviewer"]));
      // Relevance-scoped: each implementation skill reaches its own domain's
      // agents and never the other domain's — while the cross-domain reviewer
      // carries both, preloaded per each skill's reviewer-flavor row.
      expect(config.stack).toStrictEqual({
        "api-developer": {
          "api-api": [{ id: "api-framework-hono", preloaded: true }],
        },
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
        reviewer: {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
          "api-api": [{ id: "api-framework-hono", preloaded: true }],
        },
      });
    });

    it("builds a per-agent stack scoped to each skill's domain", () => {
      initializeMatrix(FULLSTACK_PAIR_MATRIX);
      const selectedAgents: AgentName[] = ["api-developer", "web-developer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react", "api-framework-hono"],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      expect(config.stack).toStrictEqual({
        "api-developer": {
          "api-api": [{ id: "api-framework-hono", preloaded: true }],
        },
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
      });
    });

    it("assigns a shared skill to every selected agent, loading per its role row", () => {
      initializeMatrix(SHARED_SECURITY_MATRIX);
      const selectedAgents: AgentName[] = ["api-tester", "web-developer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["shared-security-auth-security"],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["shared-security-auth-security"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      // Cross-domain use is a shared skill's nature: both agents carry it, and
      // the mapping's row — developer yes, tester no — decides each load.
      expect(config.stack).toStrictEqual({
        "api-tester": {
          "shared-security": [{ id: "shared-security-auth-security" }],
        },
        "web-developer": {
          "shared-security": [{ id: "shared-security-auth-security", preloaded: true }],
        },
      });
    });

    it("assigns a shared skill to no meta agent", () => {
      initializeMatrix(SHARED_SECURITY_MATRIX);
      const selectedAgents: AgentName[] = ["agent-summoner", "web-developer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["shared-security-auth-security"],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["shared-security-auth-security"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      expect(config.stack).toStrictEqual({
        "web-developer": {
          "shared-security": [{ id: "shared-security-auth-security", preloaded: true }],
        },
      });
      expect(config.stack?.["agent-summoner"]).toBeUndefined();
    });

    it("handles bare category paths", () => {
      initializeMatrix(VITEST_MATRIX);
      const selectedAgents: AgentName[] = ["web-tester"];

      const config = generateProjectConfigFromSkills("my-project", ["web-testing-vitest"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-testing-vitest"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expect(config.stack).toStrictEqual({
        "web-tester": {
          "web-testing": [{ id: "web-testing-vitest", preloaded: true }],
        },
      });
    });

    it("preserves all selected skill IDs in skills array", () => {
      const selectedSkills: SkillId[] = [
        "web-framework-react",
        "web-styling-scss-modules",
        "api-framework-hono",
      ];

      initializeMatrix(REACT_SCSS_HONO_MATRIX);
      const config = generateProjectConfigFromSkills("my-project", selectedSkills, {
        selectedAgents: ["web-developer"],
        skillConfigs: buildSkillConfigs(selectedSkills),
        agentConfigs: buildAgentConfigs(["web-developer"]),
      });

      expectSkillConfigs(config, buildSkillConfigs(selectedSkills));
    });

    it("includes unknown skill IDs in skills array even when skipped for agents", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react", "web-unknown-skill" as SkillId],
        {
          selectedAgents: ["web-developer"],
          skillConfigs: buildSkillConfigs(["web-framework-react", "web-unknown-skill" as SkillId]),
          agentConfigs: buildAgentConfigs(["web-developer"]),
        },
      );

      expectSkillConfigs(
        config,
        buildSkillConfigs(["web-framework-react", "web-unknown-skill" as SkillId]),
      );
    });

    it("produces no stack when all skills are unknown", () => {
      initializeMatrix(EMPTY_MATRIX);
      const config = generateProjectConfigFromSkills("my-project", [
        "web-nonexistent-skill" as SkillId,
        "api-nonexistent-thing" as SkillId,
      ]);

      expect(config).toStrictEqual({
        name: "my-project",
        agents: [],
        skills: buildSkillConfigs([
          "web-nonexistent-skill" as SkillId,
          "api-nonexistent-thing" as SkillId,
        ]),
      });
    });

    it("does not add description when options.description is empty string", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        description: "",
        author: "@vince",
      });

      expect(config).toStrictEqual({
        name: "my-project",
        author: "@vince",
        agents: [],
        skills: buildSkillConfigs(["web-framework-react"]),
      });
    });

    it("does not add author when options.author is empty string", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        description: "A project",
        author: "",
      });

      expect(config).toStrictEqual({
        name: "my-project",
        description: "A project",
        agents: [],
        skills: buildSkillConfigs(["web-framework-react"]),
      });
    });

    it("does not add optional fields when options is undefined", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react"],
        undefined,
      );

      expect(config).toStrictEqual({
        name: "my-project",
        agents: [],
        skills: buildSkillConfigs(["web-framework-react"]),
      });
    });

    it("assigns a skill to every selected agent whose domain owns the skill's category", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "reviewer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expect(config).toStrictEqual({
        name: "my-project",
        agents: buildAgentConfigs(["reviewer", "web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });
    });

    it("stack only contains selectedAgents", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "reviewer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expect(config).toStrictEqual({
        name: "my-project",
        agents: buildAgentConfigs(["reviewer", "web-developer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        },
      });
    });

    it("returns empty agents when selectedAgents is not provided", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"]);

      expect(config).toStrictEqual({
        name: "my-project",
        agents: [],
        skills: buildSkillConfigs(["web-framework-react"]),
      });
    });

    it("assigns a meta skill to the flavors its mapping row names", () => {
      initializeMatrix(METHODOLOGY_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "reviewer"];

      const config = generateProjectConfigFromSkills("my-project", ["meta-reviewing-reviewing"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["meta-reviewing-reviewing"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expectAgentConfigs(config, buildAgentConfigs(["web-developer", "reviewer"]));
      // The reviewing skill's row names the reviewer flavor alone, so the
      // reviewer carries it — preloaded, as authored — and the developer does
      // not carry it at all.
      expect(config.stack).toStrictEqual({
        reviewer: {
          "meta-reviewing": [{ id: "meta-reviewing-reviewing", preloaded: true }],
        },
      });
      expect(config.stack?.["web-developer"]).toBeUndefined();
    });

    it("assigns a meta skill to nobody when no selected agent has a named flavor", () => {
      initializeMatrix(METHODOLOGY_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "api-developer"];

      const config = generateProjectConfigFromSkills("my-project", ["meta-reviewing-reviewing"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["meta-reviewing-reviewing"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expectAgentConfigs(config, buildAgentConfigs(["api-developer", "web-developer"]));
      // Agents are in play, so the generator rebuilt the stack and found no
      // relevant pair — an explicit empty `{}`, not an omitted key.
      expect(config.stack).toStrictEqual({});
    });

    describe("stack ownership contract", () => {
      it("places api-framework-hono on the api agent alone", () => {
        initializeMatrix(FULLSTACK_PAIR_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["api-framework-hono"], {
          selectedAgents: ["api-developer", "web-developer"],
          skillConfigs: buildSkillConfigs(["api-framework-hono"]),
          agentConfigs: buildAgentConfigs(["api-developer", "web-developer"]),
        });

        expect(config.stack).toStrictEqual({
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: true }],
          },
        });
        expect(config.stack?.["web-developer"]).toBeUndefined();
      });

      it("places web-framework-react on the web agent alone", () => {
        initializeMatrix(FULLSTACK_PAIR_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["api-developer", "web-developer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(["api-developer", "web-developer"]),
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
        expect(config.stack?.["api-developer"]).toBeUndefined();
      });

      // Per-agent curation preservation outranks relevance: an entry the
      // prior save carries is the user's curation, wherever it sits, and
      // survives verbatim. Only NEW triples take the scoped rule.
      it("keeps a prior cross-domain entry verbatim through an edit", () => {
        initializeMatrix(FULLSTACK_PAIR_MATRIX);
        const selectedAgents: AgentName[] = ["api-developer", "web-developer"];
        // A broadcast-era save: the web skill sits on the api agent, lazily.
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "api-developer": {
            "web-framework": [{ id: "web-framework-react" }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack,
          newlyAddedSkillIds: [],
        });

        expect(config.stack).toStrictEqual({
          "api-developer": {
            "web-framework": [{ id: "web-framework-react" }],
          },
          // New to the selection, so the seeding branch runs for this agent —
          // and the scoped rule places the web skill here.
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
      });

      it("does not append a newly added skill to another domain's existing agent", () => {
        initializeMatrix(REACT_SCSS_HONO_MATRIX);
        const selectedAgents: AgentName[] = ["api-developer", "web-developer"];
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: true }],
          },
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        };

        const config = generateProjectConfigFromSkills(
          "my-project",
          ["web-framework-react", "api-framework-hono", "web-styling-scss-modules"],
          {
            selectedAgents,
            skillConfigs: buildSkillConfigs([
              "web-framework-react",
              "api-framework-hono",
              "web-styling-scss-modules",
            ]),
            agentConfigs: buildAgentConfigs(selectedAgents),
            existingStack,
            newlyAddedSkillIds: ["web-styling-scss-modules"],
          },
        );

        // The new web skill lands on the web agent and never crosses to the
        // api agent, whose prior entries ride through untouched.
        expect(config.stack).toStrictEqual({
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: true }],
          },
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: true }],
          },
        });
      });

      it("excludes project-scoped skills from global-scoped agents", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["web-developer", "reviewer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["reviewer"]),
          ],
        });

        expect(config.stack).toStrictEqual({
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
      });

      it("includes global-scoped skills on agents of both scopes", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["web-developer", "reviewer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["reviewer"]),
          ],
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
      });

      it("omits excluded skills from every agent's stack", () => {
        initializeMatrix(REACT_SCSS_MATRIX);
        const config = generateProjectConfigFromSkills(
          "my-project",
          ["web-framework-react", "web-styling-scss-modules"],
          {
            selectedAgents: ["web-developer"],
            skillConfigs: [
              ...buildSkillConfigs(["web-framework-react"]),
              ...buildSkillConfigs(["web-styling-scss-modules"], { excluded: true }),
            ],
            agentConfigs: buildAgentConfigs(["web-developer"]),
          },
        );

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
      });

      it("omits excluded agents from the stack", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["web-developer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"]),
            ...buildAgentConfigs(["reviewer"], { excluded: true }),
          ],
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
        expect(config.stack?.["reviewer"]).toBeUndefined();
      });

      it("inherits preloaded: true from existingStack when the same (agent, skill) pair re-appears", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["web-developer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(["web-developer"]),
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
      });

      // The pair already in the stack keeps the flag it was saved with; the one
      // arriving this session has nothing to keep and takes the mapping's word.
      it("takes the mapping's default on a new (agent, skill) pair absent from existingStack", () => {
        initializeMatrix(REACT_SCSS_MATRIX);
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        };

        const config = generateProjectConfigFromSkills(
          "my-project",
          ["web-framework-react", "web-styling-scss-modules"],
          {
            selectedAgents: ["web-developer"],
            skillConfigs: buildSkillConfigs(["web-framework-react", "web-styling-scss-modules"]),
            agentConfigs: buildAgentConfigs(["web-developer"]),
            existingStack,
          },
        );

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: true }],
          },
        });
      });

      it("prunes skills that were present in existingStack but are no longer selected", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["web-developer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(["web-developer"]),
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
      });

      it("prunes agents that were in existingStack but are no longer selected", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["web-developer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(["web-developer"]),
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
        expect(config.stack?.["reviewer"]).toBeUndefined();
      });

      // A saved config.ts keys each agent's stack by the category the skill sat
      // in when it was written, and the generator looks a prior entry up under
      // the LIVE one. The loader is what makes the two agree: it re-keys every
      // saved entry to its skill's live category before the generator sees it,
      // so a moved skill's curation is still the user's word here.
      describe("a saved stack entry whose skill has since changed category", () => {
        const MOVED_SKILL: SkillId = "shared-monorepo-turborepo";
        const STALE_CATEGORY_KEY = "shared-monorepo";
        const LIVE_CATEGORY_KEY = "shared-task-runner";

        /**
         * The saved block as the generator receives it — through the same
         * `normalizeStackRecord` that `loadProjectConfigFromDir` runs, which is
         * the only way an on-disk stack reaches this function.
         */
        function savedStackAsLoaded(): Partial<Record<AgentName, StackAgentConfig>> {
          // Boundary cast: normalizeStackRecord returns string-keyed agents (it
          // takes the parsed TS shape); narrow to typed AgentName keys.
          return normalizeStackRecord({
            "web-developer": {
              [STALE_CATEGORY_KEY]: [{ id: MOVED_SKILL, preloaded: true }],
            },
          });
        }

        it("keeps the entry on an ordinary edit, under the skill's live category", () => {
          initializeMatrix(BUILT_IN_MATRIX);
          const selectedAgents: AgentName[] = ["web-developer"];

          const config = generateProjectConfigFromSkills("my-project", [MOVED_SKILL], {
            selectedAgents,
            skillConfigs: buildSkillConfigs([MOVED_SKILL]),
            agentConfigs: buildAgentConfigs(selectedAgents),
            existingStack: savedStackAsLoaded(),
            newlyAddedSkillIds: [],
          });

          expect(
            config.stack,
            "a category move is a change of storage key, never a loss of the user's curation",
          ).toStrictEqual({
            "web-developer": {
              [LIVE_CATEGORY_KEY]: [{ id: MOVED_SKILL, preloaded: true }],
            },
          });
        });

        it("keeps the saved load flag when the same save calls the skill newly added", () => {
          initializeMatrix(BUILT_IN_MATRIX);
          const selectedAgents: AgentName[] = ["web-developer"];

          const config = generateProjectConfigFromSkills("my-project", [MOVED_SKILL], {
            selectedAgents,
            skillConfigs: buildSkillConfigs([MOVED_SKILL]),
            agentConfigs: buildAgentConfigs(selectedAgents),
            existingStack: savedStackAsLoaded(),
            newlyAddedSkillIds: [MOVED_SKILL],
          });

          expect(config.stack).toStrictEqual({
            "web-developer": {
              [LIVE_CATEGORY_KEY]: [{ id: MOVED_SKILL, preloaded: true }],
            },
          });
        });
      });

      describe("a saved stack entry whose skill moved out of a bucket that was split apart", () => {
        const SPLIT_SKILL: SkillId = "api-database-drizzle";
        const RETIRED_CATEGORY_KEY = "api-database";
        const SPLIT_CATEGORY_KEY = "api-orm";

        it("keeps the curation the user saved under the bucket's name", () => {
          initializeMatrix(BUILT_IN_MATRIX);
          const selectedAgents: AgentName[] = ["api-developer"];
          // Boundary cast: normalizeStackRecord takes the parsed TS shape and returns
          // string-keyed agents; narrow to typed AgentName keys.
          const existingStack = normalizeStackRecord({
            "api-developer": {
              [RETIRED_CATEGORY_KEY]: [{ id: SPLIT_SKILL, preloaded: true }],
            },
          }) as Partial<Record<AgentName, StackAgentConfig>>;

          const config = generateProjectConfigFromSkills("my-project", [SPLIT_SKILL], {
            selectedAgents,
            skillConfigs: buildSkillConfigs([SPLIT_SKILL]),
            agentConfigs: buildAgentConfigs(selectedAgents),
            existingStack,
            newlyAddedSkillIds: [],
          });

          expect(
            config.stack,
            "a bucket split is a change of storage key, never a loss of the user's curation",
          ).toStrictEqual({
            "api-developer": {
              [SPLIT_CATEGORY_KEY]: [{ id: SPLIT_SKILL, preloaded: true }],
            },
          });
        });
      });

      it("is idempotent — feeding the output back as existingStack yields the same stack", () => {
        initializeMatrix(FULLSTACK_PAIR_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "api-developer"];
        const selectedSkills: SkillId[] = ["web-framework-react", "api-framework-hono"];

        const first = generateProjectConfigFromSkills("my-project", selectedSkills, {
          selectedAgents,
          skillConfigs: buildSkillConfigs(selectedSkills),
          agentConfigs: buildAgentConfigs(selectedAgents),
        });

        const second = generateProjectConfigFromSkills("my-project", selectedSkills, {
          selectedAgents,
          skillConfigs: buildSkillConfigs(selectedSkills),
          agentConfigs: buildAgentConfigs(selectedAgents),
          // Boundary cast: ProjectConfig.stack is Record<string, StackAgentConfig>
          // (parsed TS shape); narrow to typed AgentName keys for the mutator input.
          existingStack: first.stack as Partial<Record<AgentName, StackAgentConfig>>,
        });

        expect(second.stack).toStrictEqual(first.stack);
      });

      it("is idempotent with preloaded: true entries — round-trips preserve the flag", () => {
        initializeMatrix(REACT_SCSS_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];
        const selectedSkills: SkillId[] = ["web-framework-react", "web-styling-scss-modules"];
        const seededExistingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
        };

        const first = generateProjectConfigFromSkills("my-project", selectedSkills, {
          selectedAgents,
          skillConfigs: buildSkillConfigs(selectedSkills),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack: seededExistingStack,
        });

        const second = generateProjectConfigFromSkills("my-project", selectedSkills, {
          selectedAgents,
          skillConfigs: buildSkillConfigs(selectedSkills),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack: first.stack as Partial<Record<AgentName, StackAgentConfig>>,
        });

        expect(first.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules" }],
          },
        });
        expect(second.stack).toStrictEqual(first.stack);
      });

      it("rule 3: source toggle (eject → plugin) does not change SkillAssignment shape in stack", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];
        const ejectExistingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react"], { origin: "agents-inc" }),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack: ejectExistingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
      });

      it("rule 3: source toggle (plugin → eject) does not change SkillAssignment shape in stack", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];
        const pluginExistingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react"], { origin: "eject" }),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack: pluginExistingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react" }],
          },
        });
      });

      it("rule 4: flipping a skill to project scope retroactively drops it from global agents", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "reviewer"];
        // Seed: skill was previously global, so it landed on the global web-developer
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          // Flip skill from global → project
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["reviewer"]),
          ],
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          reviewer: {
            "web-framework": [{ id: "web-framework-react" }],
          },
        });
        expect(config.stack?.["web-developer"]).toBeUndefined();
      });

      it("rule 4: flipping a skill to global scope retroactively re-adds it to global agents", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "reviewer"];
        // Seed: skill was previously project-scoped, so global web-developer had no entry
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          // Flip skill from project → global
          skillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
          }),
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["reviewer"]),
          ],
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          // The developer's entry is new — the flip is what brought the skill
          // into reach — so it arrives with the mapping's default rather than
          // the reviewer's saved flag.
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
      });

      it("rule 7: flipping one skill's scope preserves the other's preloaded flag byte-identically", () => {
        initializeMatrix(REACT_SCSS_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
        };

        const config = generateProjectConfigFromSkills(
          "my-project",
          ["web-framework-react", "web-styling-scss-modules"],
          {
            selectedAgents,
            // Only scss changes source; react's entry must be byte-identical in the output
            skillConfigs: [
              ...buildSkillConfigs(["web-framework-react"]),
              ...buildSkillConfigs(["web-styling-scss-modules"], { origin: "agents-inc" }),
            ],
            agentConfigs: buildAgentConfigs(selectedAgents),
            existingStack,
          },
        );

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules" }],
          },
        });
      });

      it("edit mode: adding a project-scoped skill to an existing stack applies the scope filter", () => {
        initializeMatrix(REACT_SCSS_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "reviewer"];
        // Seed: react is already present on both agents (web-developer is global, reviewer is project)
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        };

        const config = generateProjectConfigFromSkills(
          "my-project",
          ["web-framework-react", "web-styling-scss-modules"],
          {
            selectedAgents,
            // Newly added scss is project-scoped; react stays global
            skillConfigs: [
              ...buildSkillConfigs(["web-framework-react"], {
                scope: "global",
                origin: "agents-inc",
              }),
              ...buildSkillConfigs(["web-styling-scss-modules"]),
            ],
            agentConfigs: [
              ...buildAgentConfigs(["web-developer"], { scope: "global" }),
              ...buildAgentConfigs(["reviewer"]),
            ],
            existingStack,
          },
        );

        expect(config.stack).toStrictEqual({
          "web-developer": {
            // Only the global skill lands here — project scss is filtered out
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          reviewer: {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules" }],
          },
        });
      });
    });

    /**
     * A triple with no prior entry has nobody's word to inherit, so it takes
     * the shared mapping's — the same table the editor resolves against, so a
     * skill picked in either place arrives loaded the same way. A triple that
     * DOES have a prior entry keeps it, mapping or no mapping: that entry is
     * the user's curation, and a bare `{ id }` states lazy as plainly as the
     * flag states preloaded.
     */
    describe("load state on triples the prior stack does not carry", () => {
      it("preloads a new triple on a role the mapping names", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        });
      });

      // The mapping lists the testing skills on `tester` alone, so the same
      // skill lands preloaded on one agent and lazy on the next.
      it("loads a new triple lazily on a role the mapping leaves out", () => {
        initializeMatrix(VITEST_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "web-tester"];

        const config = generateProjectConfigFromSkills("my-project", ["web-testing-vitest"], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-testing-vitest"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-testing": [{ id: "web-testing-vitest" }],
          },
          "web-tester": {
            "web-testing": [{ id: "web-testing-vitest", preloaded: true }],
          },
        });
      });

      it("keeps a prior bare entry lazy where the mapping would preload", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react" }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react" }],
          },
        });
      });

      it("keeps a prior preloaded: false entry lazy where the mapping would preload", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react" }],
          },
        });
      });

      it("keeps a prior preloaded entry preloaded where the mapping would not", () => {
        initializeMatrix(VITEST_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-testing": [{ id: "web-testing-vitest", preloaded: true }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-testing-vitest"], {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-testing-vitest"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-testing": [{ id: "web-testing-vitest", preloaded: true }],
          },
        });
      });

      // A skill whose category this matrix places in no domain has no taxonomy
      // to be targeted on. Relevance unknown means it reaches nobody as a new
      // triple — assignment is the user's to make, not a broadcast's.
      it("assigns a skill whose category names no domain to no agent", () => {
        initializeMatrix(CUSTOM_SKILL_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];
        // Fabricated test ID outside the SkillId union — the matrix entry is local
        const customSkillIds = ["web-framework-arbitrary" as SkillId];

        const config = generateProjectConfigFromSkills("my-project", customSkillIds, {
          selectedAgents,
          skillConfigs: buildSkillConfigs(customSkillIds),
          agentConfigs: buildAgentConfigs(selectedAgents),
        });

        expect(config.stack).toStrictEqual({});
      });

      // A marketplace's own skill is namespaced, so no catalog lookup can
      // answer for its id — and targeting never needed one. The matrix carries
      // the domain its category belongs to, and the skill lands on that
      // domain's agents like any other, whatever marketplace shipped it.
      it("assigns a marketplace-namespaced skill to its own domain's agents", () => {
        initializeMatrix(NAMESPACED_SKILL_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "api-developer"];
        // Boundary cast: a marketplace-namespaced id is outside the generated union
        const namespacedSkillIds = ["acme-web-state-zustand" as SkillId];

        const config = generateProjectConfigFromSkills("my-project", namespacedSkillIds, {
          selectedAgents,
          skillConfigs: buildSkillConfigs(namespacedSkillIds),
          agentConfigs: buildAgentConfigs(selectedAgents),
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-client-state": [{ id: "acme-web-state-zustand" }],
          },
        });
      });

      // A skill the user wrote is targeted the same way a marketplace's is: by
      // the taxonomy the loaded matrix carries. Provenance decides nothing about
      // reach, so a custom skill in a real category lands on that domain's
      // agents — lazily, because eagerness is keyed by catalog id and no custom
      // skill has one.
      it("assigns a custom skill in a real category to its own domain's agents", () => {
        initializeMatrix(MARKETPLACE_AND_CUSTOM_TAGGED_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "api-developer"];

        const config = generateProjectConfigFromSkills("my-project", [CUSTOM_HOUSE_TOOLING_ID], {
          selectedAgents,
          skillConfigs: buildSkillConfigs([CUSTOM_HOUSE_TOOLING_ID]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-tooling": [{ id: CUSTOM_HOUSE_TOOLING_ID }],
          },
        });
      });

      // The prior save's word covers outside-catalog entries too: what an
      // earlier release or a hand edit placed is curation, not a candidate for
      // the relevance rule to reclaim.
      it("keeps a prior outside-catalog entry verbatim", () => {
        initializeMatrix(CUSTOM_SKILL_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];
        // Fabricated test ID outside the SkillId union — the matrix entry is local
        const customSkillIds = ["web-framework-arbitrary" as SkillId];
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            // Boundary cast: same fabricated outside-union id, as saved on disk
            "web-framework": [{ id: "web-framework-arbitrary" as SkillId }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", customSkillIds, {
          selectedAgents,
          skillConfigs: buildSkillConfigs(customSkillIds),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-arbitrary" }],
          },
        });
      });
    });

    /**
     * A stack map's category keys are emitted into `config.ts` in the order the
     * map carries them, and the compiled agent's Available-Skills section follows
     * the same order. That makes key order CONTENT: two sessions that end on the
     * same roster owe the same bytes. The order the user happened to tick the
     * skills in is a property of the session, not of the roster.
     */
    describe("stack category order is a property of the roster, not of the session", () => {
      /** One skill in each of three categories the matrix declares in a fixed order. */
      const ROSTER: SkillId[] = [
        "web-framework-react",
        "web-styling-tailwind",
        "web-testing-vitest",
      ];

      function stackFromSelectionOrder(selectedSkillIds: SkillId[]): StackAgentConfig {
        initializeMatrix(BUILT_IN_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer"];

        const config = generateProjectConfigFromSkills("my-project", selectedSkillIds, {
          selectedAgents,
          skillConfigs: buildSkillConfigs(selectedSkillIds),
          agentConfigs: buildAgentConfigs(selectedAgents),
        });
        const agentStack = config.stack?.["web-developer"];
        if (!agentStack) throw new Error("the roster must place every skill on web-developer");
        return agentStack;
      }

      it("emits the same category order whichever order the skills were picked in", () => {
        const asPicked = Object.keys(stackFromSelectionOrder(ROSTER));
        const pickedInReverse = Object.keys(stackFromSelectionOrder([...ROSTER].reverse()));

        // Subject guard: both sessions really did place all three categories, so
        // the equality below is not comparing two empty lists.
        expect([...asPicked].sort()).toStrictEqual(["web-framework", "web-styling", "web-testing"]);
        expect(
          pickedInReverse,
          "a stack's category order must follow the roster, never the pick order",
        ).toStrictEqual(asPicked);
      });
    });
  });

  describe("buildStackProperty", () => {
    it("preserves full SkillAssignment[] from stack agents", () => {
      const result = buildStackProperty(FULLSTACK_STACK);

      expect(result).toStrictEqual({
        "web-developer": {
          "web-framework": [sa("web-framework-react", true)],
          "web-styling": [sa("web-styling-scss-modules")],
        },
        "api-developer": {
          "api-api": [sa("api-framework-hono", true)],
          "api-orm": [sa("api-database-drizzle", true)],
        },
      });
    });

    it("skips agents with empty config", () => {
      const result = buildStackProperty(STACK_WITH_EMPTY_AGENTS);

      expect(result).toStrictEqual({
        "web-developer": {
          "web-framework": [sa("web-framework-react", true)],
        },
      });
      expect(result["cli-tester"]).toBeUndefined();
      expect(result["pm"]).toBeUndefined();
    });

    it("preserves single-element arrays", () => {
      const result = buildStackProperty(WEB_REACT_AND_SCSS_STACK);

      expect(result).toStrictEqual({
        "web-developer": {
          "web-framework": [sa("web-framework-react", true)],
          "web-styling": [sa("web-styling-scss-modules")],
        },
      });
    });

    it("handles stack with no agents", () => {
      const result = buildStackProperty(EMPTY_AGENTS_STACK);

      expect(result).toStrictEqual({});
    });

    it("preserves multi-element arrays with all assignments", () => {
      const result = buildStackProperty(MULTI_METHODOLOGY_STACK);

      expect(result).toStrictEqual({
        "codex-keeper": {
          "meta-reviewing": [
            sa("meta-methodology-research-methodology", true),
            sa("meta-reviewing-reviewing", true),
            sa("meta-reviewing-cli-reviewing", true),
          ],
        },
      });
    });

    it("skips empty array categories", () => {
      const result = buildStackProperty(STACK_WITH_EMPTY_CATEGORY);

      expect(result).toStrictEqual({
        "web-developer": {
          "web-framework": [sa("web-framework-react", true)],
          // Empty array is skipped
        },
      });
    });

    it("preserves preloaded flag in assignments", () => {
      const result = buildStackProperty(WEB_REACT_AND_SCSS_STACK);

      expect(result["web-developer"]?.["web-framework"]).toStrictEqual([
        sa("web-framework-react", true),
      ]);
      expect(result["web-developer"]?.["web-styling"]).toStrictEqual([
        sa("web-styling-scss-modules", false),
      ]);
    });

    it("handles multiple agents with identical categories", () => {
      const result = buildStackProperty(SHARED_CATEGORY_STACK);

      expect(result["web-developer"]?.["web-framework"]).toStrictEqual([sa("web-framework-react")]);
      expect(result["reviewer"]?.["web-framework"]).toStrictEqual([sa("web-framework-react")]);
    });

    it("handles single agent with many categories", () => {
      const result = buildStackProperty(MANY_CATEGORIES_STACK);

      expect(result["web-developer"]).toStrictEqual({
        "web-framework": [sa("web-framework-react")],
        "web-styling": [sa("web-styling-scss-modules")],
        "web-client-state": [sa("web-state-zustand")],
        "web-testing": [sa("web-testing-vitest")],
      });
    });

    it("handles local skill assignments in stack", () => {
      const result = buildStackProperty(LOCAL_SKILL_STACK);

      expect(result).toStrictEqual({
        "web-developer": {
          "web-framework": [
            {
              id: "web-framework-react",
              preloaded: true,
              local: true,
              path: ".claude/skills/react/",
            },
          ],
        },
      });
    });

    // A stack that states only which skills an agent gets has said nothing
    // about the load, so the shared mapping answers — per pair, which is how
    // one skill can preload on one of its agents and not on another.
    it("gives an unflagged entry the shared mapping's load, per agent", () => {
      const result = buildStackProperty(UNFLAGGED_TWO_AGENT_STACK);

      expect(result).toStrictEqual({
        "web-developer": {
          "web-framework": [sa("web-framework-react", true)],
        },
        "codex-keeper": {
          "web-framework": [{ id: "web-framework-react" }],
        },
      });
    });

    // Third-party stack YAML is the explicit tier: what its author wrote wins
    // over the mapping in both directions.
    it("leaves an authored flag exactly as the author wrote it", () => {
      const result = buildStackProperty(AUTHORED_FLAGS_STACK);

      expect(result).toStrictEqual({
        "web-developer": {
          "web-framework": [sa("web-framework-react", false)],
        },
        "codex-keeper": {
          "web-framework": [sa("web-framework-react", true)],
        },
      });
    });
  });

  describe("splitConfigByScope", () => {
    it("puts global-scoped skills and agents into the global partition", () => {
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer", "reviewer"], { scope: "global" }),
      });

      const result = splitConfigByScope(config);

      expectSkillConfigs(
        result.global,
        buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
          origin: "agents-inc",
        }),
      );
      expectAgentConfigs(
        result.global,
        buildAgentConfigs(["web-developer", "reviewer"], { scope: "global" }),
      );
      expectSkillConfigs(result.project, []);
      expectAgentConfigs(result.project, []);
    });

    it("puts project-scoped skills and agents into the project partition", () => {
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"]),
      });

      const result = splitConfigByScope(config);

      expectSkillConfigs(result.global, []);
      expectAgentConfigs(result.global, []);
      expectSkillConfigs(result.project, buildSkillConfigs(["web-framework-react"]));
      expectAgentConfigs(result.project, buildAgentConfigs(["web-developer"]));
    });

    it("correctly separates mixed-scope items", () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"]),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["reviewer"]),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
          reviewer: {
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      });

      const result = splitConfigByScope(config);

      // Global partition
      expectConfigSkills(result.global, ["web-framework-react"]);
      expectConfigAgents(result.global, ["web-developer"]);
      expect(result.global.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      });

      // Project partition
      expectConfigSkills(result.project, ["web-testing-vitest"]);
      expectConfigAgents(result.project, ["reviewer"]);
      expect(result.project.stack).toStrictEqual({
        reviewer: {
          "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
        },
      });
    });

    it("preserves metadata fields in project partition", () => {
      const config = buildProjectConfig({
        name: "my-project",
        description: "A test project",
        author: "@vince",
        marketplace: "github:org/repo",
        skills: buildSkillConfigs(["web-framework-react"]),
      });

      const result = splitConfigByScope(config);

      expect(result.project.name).toBe("my-project");
      expect(result.project.description).toBe("A test project");
      expect(result.project.author).toBe("@vince");
      expect(result.project.marketplace).toBe("github:org/repo");
    });

    it("sets global partition name to 'global'", () => {
      const config = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
      });

      const result = splitConfigByScope(config);

      expect(result.global.name).toBe("global");
    });

    it("splits global agents' stack between global and project when skills have mixed scope", () => {
      // Bug regression: when all agents are global but skills are mixed scope,
      // project skills' stack mappings must appear in the project config under the
      // same global agent name. Before the fix, only globalFiltered was built and
      // project skills were silently dropped from the stack.
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"]),
        ],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
          },
        },
      });

      const result = splitConfigByScope(config);

      // Global partition should contain only the global skill's stack mapping
      expect(result.global.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      });

      // Project partition should contain the project skill's stack mapping
      // under the same global agent name
      expect(result.project.stack).toStrictEqual({
        "web-developer": {
          "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
        },
      });
    });

    /**
     * The global partition holds only what the global partition declares. `stack` on it is
     * derived from the global agents, never inherited from the whole config — and today it is
     * inherited whenever the derivation yields nothing, because the override guarding the
     * spread is conditional and the spread underneath it is not.
     *
     * The assertion reads `result.global.stack` with no `?? {}` fallback, and that is the whole
     * of what makes it an assertion about an EMPTY stack rather than about a missing one: the
     * two states are what the function's own doc comment calls load-bearing, because the merger
     * reads an absent stack as no statement and keeps the stale one. A `?? {}` launders them
     * together, and a conditional `stack` key then satisfies this `it` unchanged.
     *
     * See `.ai-docs/agent-findings/2026-08-17-the-global-split-carries-the-whole-stack-when-no-global-agent-survives.md`.
     */
    it("gives the global partition an empty stack when no global agent survives", () => {
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"]),
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const result = splitConfigByScope(config);

      // The subject guard for the assertion below: the split kept no global agent, so every
      // stack row left names a sub-agent the global partition does not install.
      expectConfigAgents(result.global, []);
      expect(
        result.global.stack,
        "an empty stack says the derivation ran and yielded nothing; an absent one says nothing at all, and the merger keeps the stale rows",
      ).toStrictEqual({});
    });

    /**
     * The same rule read from the other side. Both partitions override `stack` over the same
     * unconditional spread, so a derivation that yields nothing inherits the whole config's
     * stack on either — and a fix that closes one side leaves the mirror live.
     */
    it("gives the project partition an empty stack when no project agent survives", () => {
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });

      const result = splitConfigByScope(config);

      // The subject guard: every agent went global, so every stack row left names a sub-agent
      // the project partition does not install.
      expectConfigAgents(result.project, []);
      expect(
        result.project.stack,
        "an empty stack says the derivation ran and yielded nothing; an absent one says nothing at all, and the merger keeps the stale rows",
      ).toStrictEqual({});
    });

    /**
     * The ruling this pins (owner, 2026-08-20): a project owns its own domain
     * selection rather than inheriting the global one.
     *
     * It is pinned on BOTH partitions deliberately. The field was uncovered here until this
     * test, which is exactly why the function's own doc comment could claim for months that
     * the project half was cleared while the code copied it — both project writers recompute
     * the field before writing, so no emitted config could tell the two stories apart.
     */
    it("carries selectedDomains onto both partitions, because a project owns its own domains", () => {
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        selectedDomains: ["web"],
      });

      const result = splitConfigByScope(config);

      expect(result.global.selectedDomains, "the global partition keeps the selection").toEqual([
        "web",
      ]);
      expect(
        result.project.selectedDomains,
        "the project partition keeps its OWN selection — it does not inherit global's",
      ).toEqual(["web"]);
    });
  });

  describe("splitConfigByScope — excluded routing", () => {
    it("should route excluded global skills to project partition", () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "agents-inc" }),
        ],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const result = splitConfigByScope(config);

      // Excluded global skill routes to project partition
      expectSkillConfigs(
        result.project,
        buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        }),
      );
      // Active global skill stays in global partition
      expectSkillConfigs(
        result.global,
        buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "agents-inc" }),
      );
    });

    it("should route excluded global agents to project partition", () => {
      const config = buildProjectConfig({
        skills: [],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
          ...buildAgentConfigs(["reviewer"], { scope: "global" }),
        ],
      });

      const result = splitConfigByScope(config);

      // Excluded global agent routes to project partition
      expectAgentConfigs(
        result.project,
        buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      );
      // Active global agent stays in global partition
      expectAgentConfigs(result.global, buildAgentConfigs(["reviewer"], { scope: "global" }));
    });

    it("should keep active global skills in global partition", () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"], {
            scope: "global",
            origin: "agents-inc",
            excluded: true,
          }),
          ...buildSkillConfigs(["web-state-zustand"]),
        ],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const result = splitConfigByScope(config);

      // Active global skill in global partition
      expectSkillConfigs(
        result.global,
        buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
      );
      // Excluded global + project skills in project partition
      expectSkillConfigs(result.project, [
        ...buildSkillConfigs(["web-testing-vitest"], {
          scope: "global",
          origin: "agents-inc",
          excluded: true,
        }),
        ...buildSkillConfigs(["web-state-zustand"]),
      ]);
    });

    it("should keep excluded project-scope skills in project partition", () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { excluded: true }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "agents-inc" }),
        ],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const result = splitConfigByScope(config);

      // Excluded project-scope skill stays in project partition with excluded preserved
      expectSkillConfigs(
        result.project,
        buildSkillConfigs(["web-framework-react"], { excluded: true }),
      );
      // Does NOT appear in global partition
      expectSkillConfigs(
        result.global,
        buildSkillConfigs(["web-testing-vitest"], { scope: "global", origin: "agents-inc" }),
      );
    });
  });

  describe("splitConfigByScope correctness (moved from E2E)", () => {
    // Moved from e2e/lifecycle/unified-config-view.e2e.test.ts — these are pure unit tests
    // that call splitConfigByScope directly, not E2E tests.

    it("should produce empty project split when all items are global", () => {
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
          origin: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const { project } = splitConfigByScope(config);

      expectSkillConfigs(project, []);
      expectAgentConfigs(project, []);
    });

    it("should correctly split mixed-scope configs", () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", origin: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"]),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["api-developer"]),
        ],
      });

      const { global: g, project: p } = splitConfigByScope(config);

      expectConfigSkills(g, ["web-framework-react"]);
      expectConfigAgents(g, ["web-developer"]);
      expectConfigSkills(p, ["web-testing-vitest"]);
      expectConfigAgents(p, ["api-developer"]);
    });
  });
});
