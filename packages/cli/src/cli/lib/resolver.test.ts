import { describe, it, expect, beforeEach } from "vitest";
import type { Liquid } from "liquidjs";
import { pick } from "remeda";
import {
  resolveSkillReference,
  resolveSkillReferences,
  buildSkillRefsFromConfig,
  resolveAgentSkillRefs,
  resolveAgents,
} from "./resolver";
import { buildAgentTemplateContext, createLiquidEngine } from "./compiler";
import { expectAgentCompilation } from "./__tests__/assertions/agent-assertions";
import { parseCompiledAgentSections } from "./__tests__/helpers/compiled-agent-sections.js";
import {
  createMockSkillEntry,
  createMockSkillDefinition,
  sa,
  saUnflagged,
} from "./__tests__/factories/skill-factories";
import { createMockAgentConfig } from "./__tests__/factories/agent-factories";
import { createMockCompileConfig } from "./__tests__/factories/plugin-factories";
import { RESOLVE_AGENTS_DEFINITIONS } from "./__tests__/mock-data/mock-agents.js";
import {
  WEB_AND_API_SKILLS_COMPILE_CONFIG,
  WEB_SKILLS_API_NONE_COMPILE_CONFIG,
  WEB_ONLY_COMPILE_CONFIG,
} from "./__tests__/mock-data/mock-matrices.js";
import { EXPECTED_SKILLS } from "./__tests__/expected-values.js";
import { FALLBACK_USAGE } from "./__tests__/mock-data/mock-skills.js";
import { getSkillById } from "./matrix/matrix-provider.js";
import { elementAt, entryAt, firstElement } from "./__tests__/helpers/element-at.js";
import { typedKeys } from "../utils/typed-object.js";
import type {
  AgentConfig,
  AgentDefinition,
  CompileAgentConfig,
  Skill,
  SkillDefinition,
  SkillId,
  SkillReference,
  StackAgentConfig,
} from "../types";

const REACT_DEFINITION = createMockSkillDefinition("web-framework-react", {
  path: "skills/web/framework/react/",
  description: "React component patterns",
});

const HONO_DEFINITION = createMockSkillDefinition("api-framework-hono", {
  path: "skills/api/api/hono/",
  description: "Hono API framework",
});

const ZUSTAND_DEFINITION = createMockSkillDefinition("web-state-zustand", {
  path: "skills/web/client-state-management/zustand/",
  description: "Lightweight state management",
});

const SCSS_DEFINITION = createMockSkillDefinition("web-styling-scss-modules", {
  path: "skills/web/styling/scss-modules/",
  description: "SCSS Modules styling",
});

const DRIZZLE_DEFINITION = createMockSkillDefinition("api-database-drizzle", {
  path: "skills/api/database/drizzle/",
  description: "Drizzle ORM",
});

const RESOLVE_SKILL_MAP: Record<string, SkillDefinition> = {
  "web-framework-react": REACT_DEFINITION,
  "api-framework-hono": HONO_DEFINITION,
};

const RESOLVE_SKILLS_MAP: Record<string, SkillDefinition> = {
  "web-framework-react": REACT_DEFINITION,
  "web-state-zustand": ZUSTAND_DEFINITION,
};

const RESOLVE_AGENTS_SKILL_MAP: Record<string, SkillDefinition> = {
  "web-framework-react": REACT_DEFINITION,
  "web-styling-scss-modules": SCSS_DEFINITION,
  "api-framework-hono": HONO_DEFINITION,
  "api-database-drizzle": DRIZZLE_DEFINITION,
};

describe("buildSkillRefsFromConfig", () => {
  it("should build skill references from agent stack config", () => {
    const agentStack: StackAgentConfig = {
      "web-framework": [sa("web-framework-react")],
      "web-styling": [sa("web-styling-scss-modules")],
    };

    const result = buildSkillRefsFromConfig(agentStack);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.id)).toContain("web-framework-react");
    expect(result.map((r) => r.id)).toContain("web-styling-scss-modules");
  });

  it("should preserve preloaded flag from assignments", () => {
    const agentStack: StackAgentConfig = {
      "web-framework": [sa("web-framework-react", true)],
    };

    const result = buildSkillRefsFromConfig(agentStack);

    expect(result).toHaveLength(1);
    expect(firstElement(result).preloaded).toBe(true);
  });

  it("should set preloaded to false when not specified", () => {
    const agentStack: StackAgentConfig = {
      "web-framework": [saUnflagged("web-framework-react")],
    };

    const result = buildSkillRefsFromConfig(agentStack);

    expect(result).toHaveLength(1);
    expect(firstElement(result).preloaded).toBe(false);
  });

  it("carries the guidance the skill states for itself rather than the category name", () => {
    const agentStack: StackAgentConfig = {
      "web-framework": [sa("web-framework-react")],
    };

    // Read from BUILT_IN_MATRIX so a metadata edit cannot redden it; the negative keeps it honest.
    const stated = getSkillById("web-framework-react").usageGuidance;

    const result = buildSkillRefsFromConfig(agentStack);

    expect(stated, "the catalogue entry this spec reads must still state guidance").toEqual(
      expect.any(String),
    );
    expect(firstElement(result).usage).toBe(stated);
    expect(
      firstElement(result).usage,
      "a category name states a filing, not when to reach for the skill",
    ).not.toBe(FALLBACK_USAGE["web-framework"]);
  });

  it("should return empty array for empty config", () => {
    const result = buildSkillRefsFromConfig({});

    expect(result).toStrictEqual([]);
  });

  it("when config has undefined assignment values, should skip them and return only defined refs", () => {
    const agentStack: StackAgentConfig = {
      "web-framework": [sa("web-framework-react")],
    };

    const result = buildSkillRefsFromConfig(agentStack);

    expect(result).toHaveLength(1);
    expect(firstElement(result).id).toBe("web-framework-react");
  });

  it("should handle multiple skills per category", () => {
    const agentStack: StackAgentConfig = {
      "meta-reviewing": [
        sa("meta-methodology-research-methodology", true),
        sa("meta-reviewing-reviewing", true),
      ],
    };

    const result = buildSkillRefsFromConfig(agentStack);

    expect(result).toHaveLength(2);
    expect(firstElement(result).id).toBe("meta-methodology-research-methodology");
    expect(firstElement(result).preloaded).toBe(true);
    expect(elementAt(result, 1).id).toBe("meta-reviewing-reviewing");
    expect(elementAt(result, 1).preloaded).toBe(true);
  });
});

describe("resolveSkillReference", () => {
  it("should resolve a skill reference to a full Skill object", () => {
    const ref: SkillReference = {
      id: "web-framework-react",
      usage: "when building React components",
      preloaded: true,
    };

    const result = resolveSkillReference(ref, RESOLVE_SKILL_MAP);

    expect(result).toStrictEqual({
      id: "web-framework-react",
      path: "skills/web/framework/react/",
      description: "React component patterns",
      usage: "when building React components",
      preloaded: true,
      // `source` is threaded onto the resolved Skill so the compiler picks the pluginRef per skill.
    });
  });

  it("should default preloaded to false when not specified", () => {
    const ref: SkillReference = {
      id: "api-framework-hono",
      usage: "when building APIs",
    };

    const result = resolveSkillReference(ref, RESOLVE_SKILL_MAP);

    expect(result).not.toBeNull();
    expect(result!.preloaded).toBe(false);
  });

  it("when skill ID does not exist in skills map, should return null", () => {
    const ref: SkillReference = {
      id: "web-nonexistent-skill" as SkillId,
      usage: "never",
    };

    const result = resolveSkillReference(ref, RESOLVE_SKILL_MAP);
    expect(result).toBeNull();
  });

  it("should preserve `source` from the SkillReference onto the resolved Skill", () => {
    const ref: SkillReference = {
      id: "web-framework-react",
      usage: "when building React components",
      preloaded: true,
      source: "agents-inc",
    };

    const result = resolveSkillReference(ref, RESOLVE_SKILL_MAP);

    expect(result).not.toBeNull();
    expect(result!.source).toBe("agents-inc");
  });

  it("should leave `source` undefined on the resolved Skill when the SkillReference has no source", () => {
    const ref: SkillReference = {
      id: "web-framework-react",
      usage: "when building React components",
    };

    const result = resolveSkillReference(ref, RESOLVE_SKILL_MAP);

    expect(result).not.toBeNull();
    // The compiler reads missing source as eject, so a stale value would misclassify local skills.
    expect(result!.source).toBeUndefined();
  });
});

describe("resolveSkillReferences", () => {
  it("should resolve multiple skill references with full skill shape", () => {
    const refs: SkillReference[] = [
      { id: "web-framework-react", usage: "for components" },
      { id: "web-state-zustand", usage: "for state", preloaded: true },
    ];

    const results = resolveSkillReferences(refs, RESOLVE_SKILLS_MAP);

    expect(results).toStrictEqual([
      {
        id: "web-framework-react",
        path: "skills/web/framework/react/",
        description: "React component patterns",
        usage: "for components",
        preloaded: false,
      },
      {
        id: "web-state-zustand",
        path: "skills/web/client-state-management/zustand/",
        description: "Lightweight state management",
        usage: "for state",
        preloaded: true,
      },
    ]);
  });

  it("should filter out unresolvable skill references", () => {
    const refs: SkillReference[] = [
      { id: "web-framework-react", usage: "for components" },
      { id: "web-nonexistent-skill" as SkillId, usage: "never" },
    ];

    const results = resolveSkillReferences(refs, RESOLVE_SKILLS_MAP);

    expect(results).toHaveLength(1);
    expect(firstElement(results).id).toBe("web-framework-react");
  });

  it("should return empty array for empty input", () => {
    const results = resolveSkillReferences([], RESOLVE_SKILLS_MAP);
    expect(results).toStrictEqual([]);
  });
});

/** Rendered through the shipped `agent.liquid`; the expected text is the template's own. */
describe("preloaded vs dynamic skills in compiled agent output", () => {
  let engine: Liquid;

  const AGENT_FILES = {
    identity: "Test identity content",
    playbook: "Test playbook content",
    output: "Test output content",
    criticalRequirementsTop: "",
    criticalReminders: "",
  };

  beforeEach(async () => {
    // No project directory, so no local override shadows the shipped template.
    engine = await createLiquidEngine();
  });

  function makeSkill(
    id: SkillId,
    preloaded: boolean,
    usage = "when working with this skill",
  ): Skill {
    return createMockSkillEntry(id, preloaded, {
      description: `${id} skill description`,
      usage,
    });
  }

  async function compileAgentWithSkills(skills: Skill[]): Promise<string> {
    const agent = createMockAgentConfig("test-agent", skills, {
      title: "Test Agent",
      description: "A test agent for skill testing",
      model: "opus",
      tools: ["Read", "Write", "Edit"],
    });

    return engine.renderFile("agent", buildAgentTemplateContext(agent.name, agent, AGENT_FILES));
  }

  describe("preloaded skills appear in agent frontmatter", () => {
    it("should include skills: field in YAML frontmatter when preloaded skills exist", async () => {
      const skills = [
        makeSkill("web-framework-react", true),
        makeSkill("web-testing-vitest", false),
      ];

      const output = await compileAgentWithSkills(skills);
      const { preloadedRefs } = parseCompiledAgentSections(output);

      expect(preloadedRefs.length).toBeGreaterThan(0);
    });

    it("should list preloaded skill IDs in the skills array", async () => {
      const skills = [makeSkill("web-framework-react", true), makeSkill("web-state-zustand", true)];

      const output = await compileAgentWithSkills(skills);

      expectAgentCompilation(output, {
        preloadedSkills: [...EXPECTED_SKILLS.WEB_DEFAULT],
      });
    });

    it("should NOT include preloaded skills in the dynamic skill section", async () => {
      const skills = [makeSkill("web-framework-react", true, "when building React components")];

      const output = await compileAgentWithSkills(skills);

      expectAgentCompilation(output, {
        preloadedSkills: ["web-framework-react"],
        noDynamicSkills: ["web-framework-react"],
      });
      expect(output).toContain("<skills_note>");
      expect(output).toContain("This agent's skills are preloaded through its frontmatter");
    });

    it("should include multiple preloaded skills in frontmatter", async () => {
      const skills = [
        makeSkill("web-framework-react", true),
        makeSkill("web-state-zustand", true),
        makeSkill("web-testing-vitest", true),
      ];

      const output = await compileAgentWithSkills(skills);

      expectAgentCompilation(output, {
        preloadedSkills: ["web-framework-react", "web-state-zustand", "web-testing-vitest"],
      });
    });

    it("should not include skills: field when no preloaded skills exist", async () => {
      const skills = [makeSkill("web-testing-vitest", false)];

      const output = await compileAgentWithSkills(skills);
      const { preloadedRefs } = parseCompiledAgentSections(output);

      expect(preloadedRefs).toStrictEqual([]);
    });
  });

  describe("dynamic skills referenced in agent body", () => {
    it("should reference dynamic skill in body with skill: format", async () => {
      const skills = [makeSkill("web-testing-vitest", false, "when working with vitest")];

      const output = await compileAgentWithSkills(skills);

      expectAgentCompilation(output, {
        dynamicSkills: ["web-testing-vitest"],
      });
    });

    it("should include Invoke: instruction for dynamic skills", async () => {
      const skills = [makeSkill("web-testing-vitest", false)];

      const output = await compileAgentWithSkills(skills);

      expect(output).toContain('Invoke: `skill: "web-testing-vitest"`');
    });

    it("should NOT include dynamic skills in frontmatter skills array", async () => {
      const skills = [
        makeSkill("web-framework-react", true),
        makeSkill("web-testing-vitest", false),
      ];

      const output = await compileAgentWithSkills(skills);

      expectAgentCompilation(output, {
        preloadedSkills: ["web-framework-react"],
        noPreloadedSkills: ["web-testing-vitest"],
      });
    });

    it("should include the usage guidance for each dynamic skill", async () => {
      const skills = [
        makeSkill("web-testing-vitest", false, "when working with vitest"),
        makeSkill("web-build-turborepo" as SkillId, false, "when working with turborepo"),
      ];

      const output = await compileAgentWithSkills(skills);

      expect(output).toContain("- when working with vitest");
      expect(output).toContain("- when working with turborepo");
    });

    it("should include skill_activation_protocol section for dynamic skills", async () => {
      const skills = [makeSkill("web-testing-vitest", false)];

      const output = await compileAgentWithSkills(skills);

      expect(output).toContain("<skill_activation_protocol>");
      expect(output).toContain("The skills below are available through the Skill tool.");
    });

    it("should include description for each dynamic skill", async () => {
      const skills = [makeSkill("web-testing-vitest", false)];

      const output = await compileAgentWithSkills(skills);

      expect(output).toContain("Description: web-testing-vitest skill description");
    });
  });

  describe("mixed preloaded and dynamic skills", () => {
    const mixedSkills = [
      makeSkill("web-framework-react", true, "when building React components"),
      makeSkill("web-state-zustand", true, "when managing state"),
      makeSkill("web-testing-vitest", false, "when working with vitest"),
      makeSkill("web-build-turborepo" as SkillId, false, "when working with turborepo"),
    ];

    it("when mixed skills exist, should include only preloaded skills in frontmatter", async () => {
      const output = await compileAgentWithSkills(mixedSkills);

      expectAgentCompilation(output, {
        preloadedSkills: [...EXPECTED_SKILLS.WEB_DEFAULT],
      });
    });

    it("when mixed skills exist, should exclude dynamic skills from frontmatter", async () => {
      const output = await compileAgentWithSkills(mixedSkills);

      expectAgentCompilation(output, {
        noPreloadedSkills: ["web-testing-vitest", "web-build-turborepo"],
      });
    });

    it("when mixed skills exist, should include dynamic skills in body activation protocol", async () => {
      const output = await compileAgentWithSkills(mixedSkills);

      expectAgentCompilation(output, {
        dynamicSkills: ["web-testing-vitest", "web-build-turborepo"],
      });
      expect(output).toContain("<skill_activation_protocol>");
    });

    it("when mixed skills exist, should exclude preloaded skills from body invocations", async () => {
      const output = await compileAgentWithSkills(mixedSkills);

      expectAgentCompilation(output, {
        noDynamicSkills: [...EXPECTED_SKILLS.WEB_DEFAULT],
      });
    });
  });

  describe("empty skills handling", () => {
    it("when no skills exist, should not include skills field in frontmatter", async () => {
      const output = await compileAgentWithSkills([]);
      const { preloadedRefs } = parseCompiledAgentSections(output);

      expect(preloadedRefs).toStrictEqual([]);
    });

    it("when no skills exist, should show skills_note instead of activation protocol", async () => {
      const output = await compileAgentWithSkills([]);

      expect(output).toContain("<skills_note>");
      expect(output).not.toContain("<skill_activation_protocol>");
    });
  });
});

describe("resolveAgentSkillRefs", () => {
  it("should return the skill references the compile config names", () => {
    const agentConfig: CompileAgentConfig = {
      skills: [
        {
          id: "web-styling-scss-modules",
          usage: "when styling",
          preloaded: true,
        },
      ],
    };

    const result = resolveAgentSkillRefs(agentConfig);

    expect(result).toHaveLength(1);
    expect(firstElement(result).id).toBe("web-styling-scss-modules");
    expect(firstElement(result).preloaded).toBe(true);
  });

  it("should return an empty array when the compile config names no skills", () => {
    const result = resolveAgentSkillRefs({});

    expect(result).toStrictEqual([]);
  });
});

describe("resolveAgents", () => {
  describe("when every agent's compile config names skills", () => {
    it("should assign correct skill IDs to web-developer", async () => {
      const result = await resolveAgents(
        RESOLVE_AGENTS_DEFINITIONS,
        RESOLVE_AGENTS_SKILL_MAP,
        WEB_AND_API_SKILLS_COMPILE_CONFIG,
        "/test/path",
      );

      expect(result["web-developer"]?.skills).toHaveLength(2);

      const webSkillIds = result["web-developer"]?.skills.map((s) => s.id);
      expect(webSkillIds).toContain("web-framework-react");
      expect(webSkillIds).toContain("web-styling-scss-modules");
    });

    it("should set correct preloaded flags on web-developer skills", async () => {
      const result = await resolveAgents(
        RESOLVE_AGENTS_DEFINITIONS,
        RESOLVE_AGENTS_SKILL_MAP,
        WEB_AND_API_SKILLS_COMPILE_CONFIG,
        "/test/path",
      );

      const reactSkill = result["web-developer"]?.skills.find(
        (s) => s.id === "web-framework-react",
      );
      expect(reactSkill?.preloaded).toBe(true);

      const scssSkill = result["web-developer"]?.skills.find(
        (s) => s.id === "web-styling-scss-modules",
      );
      expect(scssSkill?.preloaded).toBe(false);
    });

    it("should assign correct skill IDs to api-developer", async () => {
      const result = await resolveAgents(
        RESOLVE_AGENTS_DEFINITIONS,
        RESOLVE_AGENTS_SKILL_MAP,
        WEB_AND_API_SKILLS_COMPILE_CONFIG,
        "/test/path",
      );

      expect(result["api-developer"]?.skills).toHaveLength(2);

      const apiSkillIds = result["api-developer"]?.skills.map((s) => s.id);
      expect(apiSkillIds).toContain("api-framework-hono");
      expect(apiSkillIds).toContain("api-database-drizzle");
    });

    it("should set correct preloaded flags on api-developer skills", async () => {
      const result = await resolveAgents(
        RESOLVE_AGENTS_DEFINITIONS,
        RESOLVE_AGENTS_SKILL_MAP,
        WEB_AND_API_SKILLS_COMPILE_CONFIG,
        "/test/path",
      );

      const honoSkill = result["api-developer"]?.skills.find((s) => s.id === "api-framework-hono");
      expect(honoSkill?.preloaded).toBe(true);

      const drizzleSkill = result["api-developer"]?.skills.find(
        (s) => s.id === "api-database-drizzle",
      );
      expect(drizzleSkill?.preloaded).toBe(true);
    });
  });

  it("should return agents without skills when the compile config names none", async () => {
    const result = await resolveAgents(
      RESOLVE_AGENTS_DEFINITIONS,
      RESOLVE_AGENTS_SKILL_MAP,
      WEB_ONLY_COMPILE_CONFIG,
      "/test/path",
    );

    expect(result["web-developer"]?.skills).toStrictEqual([]);
  });

  it("should throw when agent is referenced in compile config but not in agent definitions", async () => {
    const unknownAgentConfig = createMockCompileConfig({ "unknown-agent": {} });

    await expect(
      resolveAgents(
        RESOLVE_AGENTS_DEFINITIONS,
        RESOLVE_AGENTS_SKILL_MAP,
        unknownAgentConfig,
        "/test/path",
      ),
    ).rejects.toThrow("Agent 'unknown-agent' referenced in compile config but not found");
  });

  it("should list available agents in error message when agent not found", async () => {
    const nonexistentAgentConfig = createMockCompileConfig({ "nonexistent-agent": {} });

    await expect(
      resolveAgents(
        RESOLVE_AGENTS_DEFINITIONS,
        RESOLVE_AGENTS_SKILL_MAP,
        nonexistentAgentConfig,
        "/test/path",
      ),
    ).rejects.toThrow("Available agents: web-developer, api-developer");
  });

  it("should resolve each agent from its own compile config entry", async () => {
    const result = await resolveAgents(
      RESOLVE_AGENTS_DEFINITIONS,
      RESOLVE_AGENTS_SKILL_MAP,
      WEB_SKILLS_API_NONE_COMPILE_CONFIG,
      "/test/path",
    );

    expect(result["web-developer"]?.skills).toHaveLength(1);
    expect(result["web-developer"]?.skills[0]?.id).toBe("web-framework-react");

    expect(result["api-developer"]?.skills).toStrictEqual([]);
  });

  /** The definition pins `sonnet`, unlike override and bundle, so a value names its side. */
  describe("model and effort", () => {
    it("should prefer the config model and effort over the agent metadata default", async () => {
      const tunedConfig = createMockCompileConfig({
        "web-developer": { model: "haiku", effort: "xhigh" },
      });

      const result = await resolveAgents(
        RESOLVE_AGENTS_DEFINITIONS,
        RESOLVE_AGENTS_SKILL_MAP,
        tunedConfig,
        "/test/path",
      );

      expect(result["web-developer"]?.model).toBe("haiku");
      expect(result["web-developer"]?.effort).toBe("xhigh");
    });

    it("should keep the metadata model when the config sets only effort", async () => {
      const effortOnlyConfig = createMockCompileConfig({
        "web-developer": { effort: "low" },
      });

      const result = await resolveAgents(
        RESOLVE_AGENTS_DEFINITIONS,
        RESOLVE_AGENTS_SKILL_MAP,
        effortOnlyConfig,
        "/test/path",
      );

      expect(result["web-developer"]?.model).toBe("sonnet");
      expect(result["web-developer"]?.effort).toBe("low");
    });

    it("should carry the config's Codex model beside the Claude one", async () => {
      const pinnedConfig = createMockCompileConfig({
        "web-developer": { model: "haiku", codexModel: "gpt-5.6-terra" },
      });

      const result = await resolveAgents(
        RESOLVE_AGENTS_DEFINITIONS,
        RESOLVE_AGENTS_SKILL_MAP,
        pinnedConfig,
        "/test/path",
      );

      expect(result["web-developer"]?.model).toBe("haiku");
      expect(result["web-developer"]?.codexModel).toBe("gpt-5.6-terra");
    });
  });

  /** One constant feeds fixture and assertions: a field `resolveAgents` drops renders nothing. */
  const TUNED_OPTIONAL_FIELDS = {
    disallowedTools: ["Bash", "WebFetch"],
    permissionMode: "plan",
    isolation: "worktree",
    hooks: { SubagentStop: [{ hooks: [{ type: "command", command: "echo gate" }] }] },
    experimental: { cacheTtl: "1h" },
  } as const satisfies Partial<AgentConfig>;

  describe("fields the template reads", () => {
    it("carries every optional frontmatter field from the metadata through to the template", async () => {
      const definitions: Record<string, AgentDefinition> = {
        "web-developer": {
          ...elementAt(Object.values(RESOLVE_AGENTS_DEFINITIONS), 0),
          ...TUNED_OPTIONAL_FIELDS,
        },
      };

      const result = await resolveAgents(
        definitions,
        RESOLVE_AGENTS_SKILL_MAP,
        WEB_ONLY_COMPILE_CONFIG,
        "/test/path",
      );

      expect(
        pick(entryAt(result, "web-developer"), typedKeys(TUNED_OPTIONAL_FIELDS)),
      ).toStrictEqual(TUNED_OPTIONAL_FIELDS);
    });

    it("leaves each of them off entirely when the metadata declares none", async () => {
      // `createMockAgent` defaults `permissionMode`, so dropping it makes the absent case.
      const { permissionMode: _declared, ...declaresNone } = elementAt(
        Object.values(RESOLVE_AGENTS_DEFINITIONS),
        0,
      );

      const result = await resolveAgents(
        { "web-developer": declaresNone },
        RESOLVE_AGENTS_SKILL_MAP,
        WEB_ONLY_COMPILE_CONFIG,
        "/test/path",
      );

      expect(
        typedKeys(TUNED_OPTIONAL_FIELDS).filter((key) => key in entryAt(result, "web-developer")),
        "an absent field must stay absent — an explicit undefined renders as an empty frontmatter key",
      ).toStrictEqual([]);
    });
  });
});
