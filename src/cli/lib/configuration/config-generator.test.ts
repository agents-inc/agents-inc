import { describe, it, expect } from "vitest";
import {
  generateProjectConfigFromSkills,
  buildStackProperty,
  splitConfigByScope,
} from "./config-generator";
import type { AgentName, SkillAssignment, SkillId, StackAgentConfig } from "../../types";
import { initializeMatrix } from "../matrix/matrix-provider";
import { createMockSkillAssignment } from "../__tests__/factories/skill-factories.js";
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
} from "../__tests__/mock-data/mock-stacks.js";
import {
  LOCAL_SKILL_MATRIX,
  MIXED_LOCAL_REMOTE_MATRIX,
  METHODOLOGY_MATRIX,
  VITEST_MATRIX,
  EMPTY_MATRIX,
  SINGLE_REACT_MATRIX,
  FULLSTACK_PAIR_MATRIX,
  REACT_SCSS_MATRIX,
  REACT_SCSS_HONO_MATRIX,
  MULTI_STYLING_MATRIX,
} from "../__tests__/mock-data/mock-matrices.js";

/** Shorthand: creates a SkillAssignment from an id and optional preloaded flag */
const sa = (id: SkillId, preloaded = false): SkillAssignment =>
  createMockSkillAssignment(id, preloaded);

describe("config-generator", () => {
  describe("generateProjectConfigFromSkills", () => {
    it("returns a minimal ProjectConfig structure with stack when selectedAgents provided", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expect(config.name).toBe("my-project");
      expectAgentConfigs(config, buildAgentConfigs(["web-developer", "web-reviewer"]));
      expect(config.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
        "web-reviewer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      });
      // Should NOT have these fields by default
      expect(config.author).toBeUndefined();
      expect(config.description).toBeUndefined();
    });

    it("builds stack with category->SkillAssignment[] mappings for multiple skills", () => {
      initializeMatrix(REACT_SCSS_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react", "web-styling-scss-modules"],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react", "web-styling-scss-modules"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      expect(config.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
          "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
        },
        "web-reviewer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
          "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
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
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-styling": [
              { id: "web-styling-scss-modules", preloaded: false },
              { id: "web-styling-tailwind", preloaded: false },
            ],
          },
        },
      });
    });

    it("uses selectedAgents when provided", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expectAgentConfigs(config, buildAgentConfigs(["web-developer", "web-reviewer"]));
      expect(config.stack).toStrictEqual({
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
        "web-reviewer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
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
      const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];

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
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
        "web-reviewer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
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
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
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
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      });
      expectAgentConfigs(config, buildAgentConfigs(["web-developer"]));
    });

    it("deduplicates agents across skills in the same domain", () => {
      initializeMatrix(REACT_SCSS_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];

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
      expectAgentConfigs(config, buildAgentConfigs(["web-developer", "web-reviewer"]));
    });

    it("sorts agents alphabetically", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      // Input order is deliberately unsorted to verify the function sorts
      const selectedAgents: AgentName[] = ["web-reviewer", "api-developer", "web-developer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      // Output should be alphabetically sorted regardless of input order
      expectAgentConfigs(
        config,
        buildAgentConfigs(["api-developer", "web-developer", "web-reviewer"]),
      );
    });

    it("assigns all selected skills to every selected agent", () => {
      initializeMatrix(FULLSTACK_PAIR_MATRIX);
      const selectedAgents: AgentName[] = [
        "api-developer",
        "api-reviewer",
        "web-developer",
        "web-reviewer",
      ];

      const config = generateProjectConfigFromSkills(
        "my-project",
        ["web-framework-react", "api-framework-hono"],
        {
          selectedAgents,
          skillConfigs: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
          agentConfigs: buildAgentConfigs(selectedAgents),
        },
      );

      expectAgentConfigs(
        config,
        buildAgentConfigs(["api-developer", "api-reviewer", "web-developer", "web-reviewer"]),
      );
      // All skills land on all agents (no domain ownership filtering)
      expect(config.stack).toStrictEqual({
        "api-developer": {
          "api-api": [{ id: "api-framework-hono", preloaded: false }],
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
        "api-reviewer": {
          "api-api": [{ id: "api-framework-hono", preloaded: false }],
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
        "web-developer": {
          "api-api": [{ id: "api-framework-hono", preloaded: false }],
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
        "web-reviewer": {
          "api-api": [{ id: "api-framework-hono", preloaded: false }],
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      });
    });

    it("builds a per-agent stack with all skills on all agents", () => {
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
          "api-api": [{ id: "api-framework-hono", preloaded: false }],
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
        "web-developer": {
          "api-api": [{ id: "api-framework-hono", preloaded: false }],
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      });
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
          "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
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
      const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expect(config).toStrictEqual({
        name: "my-project",
        agents: buildAgentConfigs(["web-developer", "web-reviewer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
    });

    it("stack only contains selectedAgents", () => {
      initializeMatrix(SINGLE_REACT_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];

      const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["web-framework-react"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expect(config).toStrictEqual({
        name: "my-project",
        agents: buildAgentConfigs(["web-developer", "web-reviewer"]),
        skills: buildSkillConfigs(["web-framework-react"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
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

    it("assigns methodology skills to all selectedAgents", () => {
      initializeMatrix(METHODOLOGY_MATRIX);
      const selectedAgents: AgentName[] = ["web-developer", "api-developer"];

      const config = generateProjectConfigFromSkills("my-project", ["meta-reviewing-reviewing"], {
        selectedAgents,
        skillConfigs: buildSkillConfigs(["meta-reviewing-reviewing"]),
        agentConfigs: buildAgentConfigs(selectedAgents),
      });

      expectAgentConfigs(config, buildAgentConfigs(["api-developer", "web-developer"]));
      const expectedMethodologyStack = {
        "meta-reviewing": [{ id: "meta-reviewing-reviewing", preloaded: false }],
      };
      expect(config.stack).toStrictEqual({
        "api-developer": expectedMethodologyStack,
        "web-developer": expectedMethodologyStack,
      });
    });

    describe("stack ownership contract", () => {
      it("places api-framework-hono on all selected agents", () => {
        initializeMatrix(FULLSTACK_PAIR_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["api-framework-hono"], {
          selectedAgents: ["api-developer", "web-developer"],
          skillConfigs: buildSkillConfigs(["api-framework-hono"]),
          agentConfigs: buildAgentConfigs(["api-developer", "web-developer"]),
        });

        expect(config.stack).toStrictEqual({
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: false }],
          },
          "web-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: false }],
          },
        });
      });

      it("places web-framework-react on all selected agents", () => {
        initializeMatrix(FULLSTACK_PAIR_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["api-developer", "web-developer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: buildAgentConfigs(["api-developer", "web-developer"]),
        });

        expect(config.stack).toStrictEqual({
          "api-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        });
      });

      it("places cross-cutting (meta) skills on every selected agent", () => {
        initializeMatrix(METHODOLOGY_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["meta-reviewing-reviewing"], {
          selectedAgents: ["web-developer", "api-developer", "cli-developer"],
          skillConfigs: buildSkillConfigs(["meta-reviewing-reviewing"]),
          agentConfigs: buildAgentConfigs(["web-developer", "api-developer", "cli-developer"]),
        });

        const expected = {
          "meta-reviewing": [{ id: "meta-reviewing-reviewing", preloaded: false }],
        };
        expect(config.stack).toStrictEqual({
          "api-developer": expected,
          "cli-developer": expected,
          "web-developer": expected,
        });
      });

      it("excludes project-scoped skills from global-scoped agents", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["web-developer", "web-reviewer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["web-reviewer"]),
          ],
        });

        expect(config.stack).toStrictEqual({
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        });
      });

      it("includes global-scoped skills on agents of both scopes", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents: ["web-developer", "web-reviewer"],
          skillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["web-reviewer"]),
          ],
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
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
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
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
            ...buildAgentConfigs(["web-reviewer"], { excluded: true }),
          ],
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        });
        expect(config.stack?.["web-reviewer"]).toBeUndefined();
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

      it("defaults new (agent, skill) pairs to preloaded: false when absent from existingStack", () => {
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
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
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
          "web-reviewer": {
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
        expect(config.stack?.["web-reviewer"]).toBeUndefined();
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
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
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
          skillConfigs: buildSkillConfigs(["web-framework-react"], { source: "agents-inc" }),
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
          skillConfigs: buildSkillConfigs(["web-framework-react"], { source: "eject" }),
          agentConfigs: buildAgentConfigs(selectedAgents),
          existingStack: pluginExistingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        });
      });

      it("rule 4: flipping a skill to project scope retroactively drops it from global agents", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];
        // Seed: skill was previously global, so it landed on the global web-developer
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          // Flip skill from global → project
          skillConfigs: buildSkillConfigs(["web-framework-react"]),
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["web-reviewer"]),
          ],
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        });
        expect(config.stack?.["web-developer"]).toBeUndefined();
      });

      it("rule 4: flipping a skill to global scope retroactively re-adds it to global agents", () => {
        initializeMatrix(SINGLE_REACT_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];
        // Seed: skill was previously project-scoped, so global web-developer had no entry
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
        };

        const config = generateProjectConfigFromSkills("my-project", ["web-framework-react"], {
          selectedAgents,
          // Flip skill from project → global
          skillConfigs: buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
          }),
          agentConfigs: [
            ...buildAgentConfigs(["web-developer"], { scope: "global" }),
            ...buildAgentConfigs(["web-reviewer"]),
          ],
          existingStack,
        });

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
          "web-reviewer": {
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
              ...buildSkillConfigs(["web-styling-scss-modules"], { source: "agents-inc" }),
            ],
            agentConfigs: buildAgentConfigs(selectedAgents),
            existingStack,
          },
        );

        expect(config.stack).toStrictEqual({
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
        });
      });

      it("edit mode: adding a project-scoped skill to an existing stack applies the scope filter", () => {
        initializeMatrix(REACT_SCSS_MATRIX);
        const selectedAgents: AgentName[] = ["web-developer", "web-reviewer"];
        // Seed: react is already present on both agents (web-developer is global, web-reviewer is project)
        const existingStack: Partial<Record<AgentName, StackAgentConfig>> = {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          "web-reviewer": {
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
                source: "agents-inc",
              }),
              ...buildSkillConfigs(["web-styling-scss-modules"]),
            ],
            agentConfigs: [
              ...buildAgentConfigs(["web-developer"], { scope: "global" }),
              ...buildAgentConfigs(["web-reviewer"]),
            ],
            existingStack,
          },
        );

        expect(config.stack).toStrictEqual({
          "web-developer": {
            // Only the global skill lands here — project scss is filtered out
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-styling": [{ id: "web-styling-scss-modules", preloaded: false }],
          },
        });
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
          "api-database": [sa("api-database-drizzle", true)],
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
      expect(result["web-pm"]).toBeUndefined();
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
        "pattern-scout": {
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
      expect(result["web-reviewer"]?.["web-framework"]).toStrictEqual([sa("web-framework-react")]);
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
  });

  describe("splitConfigByScope", () => {
    it("puts global-scoped skills and agents into the global partition", () => {
      const config = buildProjectConfig({
        skills: buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
          source: "agents-inc",
        }),
        agents: buildAgentConfigs(["web-developer", "web-reviewer"], { scope: "global" }),
      });

      const result = splitConfigByScope(config);

      expectSkillConfigs(
        result.global,
        buildSkillConfigs(["web-framework-react", "web-testing-vitest"], {
          scope: "global",
          source: "agents-inc",
        }),
      );
      expectAgentConfigs(
        result.global,
        buildAgentConfigs(["web-developer", "web-reviewer"], { scope: "global" }),
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
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"]),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["web-reviewer"]),
        ],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
          "web-reviewer": {
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
      expectConfigAgents(result.project, ["web-reviewer"]);
      expect(result.project.stack).toStrictEqual({
        "web-reviewer": {
          "web-testing": [{ id: "web-testing-vitest", preloaded: false }],
        },
      });
    });

    it("preserves metadata fields in project partition", () => {
      const config = buildProjectConfig({
        name: "my-project",
        description: "A test project",
        author: "@vince",
        source: "github:org/repo",
        skills: buildSkillConfigs(["web-framework-react"]),
      });

      const result = splitConfigByScope(config);

      expect(result.project.name).toBe("my-project");
      expect(result.project.description).toBe("A test project");
      expect(result.project.author).toBe("@vince");
      expect(result.project.source).toBe("github:org/repo");
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
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
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
  });

  describe("splitConfigByScope — excluded routing", () => {
    it("should route excluded global skills to project partition", () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], {
            scope: "global",
            source: "agents-inc",
            excluded: true,
          }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "global", source: "agents-inc" }),
        ],
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });

      const result = splitConfigByScope(config);

      // Excluded global skill routes to project partition
      expectSkillConfigs(
        result.project,
        buildSkillConfigs(["web-framework-react"], {
          scope: "global",
          source: "agents-inc",
          excluded: true,
        }),
      );
      // Active global skill stays in global partition
      expectSkillConfigs(
        result.global,
        buildSkillConfigs(["web-testing-vitest"], { scope: "global", source: "agents-inc" }),
      );
    });

    it("should route excluded global agents to project partition", () => {
      const config = buildProjectConfig({
        skills: [],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
          ...buildAgentConfigs(["web-reviewer"], { scope: "global" }),
        ],
      });

      const result = splitConfigByScope(config);

      // Excluded global agent routes to project partition
      expectAgentConfigs(
        result.project,
        buildAgentConfigs(["web-developer"], { scope: "global", excluded: true }),
      );
      // Active global agent stays in global partition
      expectAgentConfigs(result.global, buildAgentConfigs(["web-reviewer"], { scope: "global" }));
    });

    it("should keep active global skills in global partition", () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
          ...buildSkillConfigs(["web-testing-vitest"], {
            scope: "global",
            source: "agents-inc",
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
        buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
      );
      // Excluded global + project skills in project partition
      expectSkillConfigs(result.project, [
        ...buildSkillConfigs(["web-testing-vitest"], {
          scope: "global",
          source: "agents-inc",
          excluded: true,
        }),
        ...buildSkillConfigs(["web-state-zustand"]),
      ]);
    });

    it("should keep excluded project-scope skills in project partition", () => {
      const config = buildProjectConfig({
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { excluded: true }),
          ...buildSkillConfigs(["web-testing-vitest"], { scope: "global", source: "agents-inc" }),
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
        buildSkillConfigs(["web-testing-vitest"], { scope: "global", source: "agents-inc" }),
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
          source: "agents-inc",
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
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", source: "agents-inc" }),
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
