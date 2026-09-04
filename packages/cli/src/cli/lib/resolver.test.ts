import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { Liquid } from "liquidjs";
import { pick } from "remeda";
import {
  resolveSkillReference,
  resolveSkillReferences,
  buildSkillRefsFromConfig,
  resolveAgentSkillRefs,
  resolveAgents,
} from "./resolver";
import { expectAgentCompilation } from "./__tests__/assertions/agent-assertions";
import { parseCompiledAgentSections } from "./__tests__/helpers/compiled-agent-sections.js";
import { createTempDir, cleanupTempDir } from "./__tests__/test-fs-utils";
import {
  createMockSkillEntry,
  createMockSkillDefinition,
  sa,
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
  CompiledAgentData,
  Skill,
  SkillDefinition,
  SkillId,
  SkillReference,
  StackAgentConfig,
} from "../types";

// Skill definitions (single-consumer — only used in this test file)

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

// Composite skill maps (test-specific groupings of shared definitions)

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
      "web-framework": [{ id: "web-framework-react" }],
    };

    const result = buildSkillRefsFromConfig(agentStack);

    expect(result).toHaveLength(1);
    expect(firstElement(result).preloaded).toBe(false);
  });

  it("carries the guidance the skill states for itself rather than the category name", () => {
    const agentStack: StackAgentConfig = {
      "web-framework": [sa("web-framework-react")],
    };

    // Nothing in this file calls `initializeMatrix`, so the lookup runs against
    // BUILT_IN_MATRIX — the shipped catalogue, where this skill states its own trigger
    // sentence. Read rather than written out: the subject is the wiring, and a copy of the
    // sentence here would redden on any edit to the skill's own metadata. The negative below
    // is what stops that read from being vacuous.
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
      // The resolver propagates `source` from SkillReference onto the
      // resolved Skill so the compiler can emit per-skill pluginRef formats.
      // Absent on the input → absent on the output, no `source` key at all
      // (see dedicated test below).
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
    // The resolver must thread `source` through so the compiler can key off it
    // per-skill — that is the contract this asserts.
    expect(result!.source).toBe("agents-inc");
  });

  it("should leave `source` undefined on the resolved Skill when the SkillReference has no source", () => {
    const ref: SkillReference = {
      id: "web-framework-react",
      usage: "when building React components",
    };

    const result = resolveSkillReference(ref, RESOLVE_SKILL_MAP);

    expect(result).not.toBeNull();
    // Absent on the input → undefined on the output. The compiler treats
    // missing-source as eject (no pluginRef), so leaking a stale value
    // would silently misclassify user-authored local skills.
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
        // See the resolveSkillReference test above for shape rationale.
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

describe("preloaded vs dynamic skills in compiled agent output", () => {
  let tempDir: string;
  let engine: Liquid;

  // Minimal agent template that mirrors the real agent.liquid structure
  const testTemplate = `---
name: {{ agent.name }}
description: {{ agent.description }}
tools: {{ agent.tools | join: ", " }}
{% if preloadedSkillIds.size > 0 %}skills:
{% for skillId in preloadedSkillIds %}  - {{ skillId }}
{% endfor %}{% endif %}---

# {{ agent.title }}

{% if dynamicSkills.size > 0 %}
<skill_activation_protocol>
## Available Skills (Require Loading)

{% for skill in dynamicSkills %}
### {{ skill.id }}
- Description: {{ skill.description }}
- Invoke: \`skill: "{{ skill.id }}"\`
- Use when: {{ skill.usage }}

{% endfor %}
</skill_activation_protocol>
{% else %}
<skills_note>
All skills for this agent are preloaded via frontmatter. No additional skill activation required.
</skills_note>
{% endif %}
`;

  beforeEach(async () => {
    tempDir = await createTempDir("resolver-test-");

    // Create Liquid engine with test template
    const templatesDir = path.join(tempDir, "templates");
    await mkdir(templatesDir, { recursive: true });
    await writeFile(path.join(templatesDir, "agent.liquid"), testTemplate);

    engine = new Liquid({
      root: [templatesDir],
      extname: ".liquid",
      strictVariables: false,
      strictFilters: true,
    });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
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
    const preloadedSkills = skills.filter((s) => s.preloaded);
    const dynamicSkills = skills.filter((s) => !s.preloaded);
    const preloadedSkillIds = preloadedSkills.map((s) => s.id);

    const agent = createMockAgentConfig("test-agent", skills, {
      title: "Test Agent",
      description: "A test agent for skill testing",
      model: "opus",
      tools: ["Read", "Write", "Edit"],
    });

    const data: CompiledAgentData = {
      agent,
      identity: "Test identity content",
      playbook: "Test playbook content",
      output: "Test output content",
      criticalRequirementsTop: "",
      criticalReminders: "",
      skills,
      preloadedSkills,
      dynamicSkills,
      preloadedSkillIds,
    };

    return engine.renderFile("agent", data);
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
      expect(output).toContain("All skills for this agent are preloaded via frontmatter");
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

    it("should include Use when: guidance for each dynamic skill", async () => {
      const skills = [
        makeSkill("web-testing-vitest", false, "when working with vitest"),
        makeSkill("web-build-turborepo" as SkillId, false, "when working with turborepo"),
      ];

      const output = await compileAgentWithSkills(skills);

      expect(output).toContain("Use when: when working with vitest");
      expect(output).toContain("Use when: when working with turborepo");
    });

    it("should include skill_activation_protocol section for dynamic skills", async () => {
      const skills = [makeSkill("web-testing-vitest", false)];

      const output = await compileAgentWithSkills(skills);

      expect(output).toContain("<skill_activation_protocol>");
      expect(output).toContain("## Available Skills (Require Loading)");
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

  /**
   * The agent's own metadata.yaml carries the default; the project config carries the user's
   * choice. `RESOLVE_AGENTS_DEFINITIONS` pins `web-developer` at `model: sonnet`, which is neither
   * the `haiku` the override spec sets nor the `opus` every bundled agent declares — so a value
   * that survives resolution names which side it came from in both directions, and neither
   * assertion can be satisfied by a resolver that ignored one of them.
   */
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
  });

  /**
   * `resolveAgents` builds its `AgentConfig` from an explicit field list rather than by spreading
   * the definition, so a field the list omits is dropped between `metadata.yaml` and the template —
   * silently, because the template runs `strictVariables: false` and renders a missing variable as
   * nothing at all.
   *
   * Four fields were being dropped that way, and each is read by `agent.liquid`: an agent declaring
   * `isolation` compiled without it, one declaring its own `hooks` silently got the emitted
   * completion gate instead, and `disallowedTools` had never reached a compiled agent at all. The
   * one spec that appeared to cover the pair — `WEB_DEV_TUNED_PERMISSIONS` in `compiler.test.ts` —
   * hands `compileAgentForPlugin` an `AgentConfig` it built itself, so it enters the pipeline
   * downstream of this function and could not see the gap.
   *
   * A roster rather than a field-by-field check: the subject is which fields survive, and a per-key
   * assertion cannot see the next one to be dropped. Bound to {@link TUNED_OPTIONAL_FIELDS} rather
   * than written twice, because a field once already went missing this way without either test
   * reddening: `experimental` reached `resolveAgents`'s own field list correctly, but was added to
   * the fixture below with no matching line in the assertion, so the roster passed on a field it
   * never looked at. Binding both tests to one constant makes that class of drift a compile error
   * instead of a silent gap — add a key here and it is fed to the fixture and checked by both
   * assertions in the same edit.
   */
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
      // `createMockAgent` defaults `permissionMode`, so the shared definition declares one and
      // cannot be the subject here. Dropping the key is what makes this the absent case.
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
