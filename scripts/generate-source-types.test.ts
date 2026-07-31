import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import path from "path";
import { stringify as stringifyYaml } from "yaml";

import { createTempDir, cleanupTempDir } from "../src/cli/lib/__tests__/test-fs-utils";
import { createMockExtractedSkill } from "../src/cli/lib/__tests__/factories/skill-factories.js";
import { renderSkillMd } from "../src/cli/lib/__tests__/content-generators";

import {
  sortedGroupBy,
  resolveStack,
  extractSkills,
  extractAgents,
  generatePhase1,
  generatePhase2,
} from "./generate-source-types";

import type { AgentEntry } from "./generate-source-types";
import type { SkillId, Stack } from "../src/cli/types";

// -- sortedGroupBy -----------------------------------------------------------

describe("sortedGroupBy", () => {
  it("groups entries by key function, sorts both keys and values", () => {
    const entries: [string, { group: string }][] = [
      ["cherry", { group: "fruit" }],
      ["apple", { group: "fruit" }],
      ["carrot", { group: "vegetable" }],
      ["banana", { group: "fruit" }],
      ["broccoli", { group: "vegetable" }],
    ];

    const result = sortedGroupBy(entries, (v) => v.group);

    expect(result).toStrictEqual({
      fruit: ["apple", "banana", "cherry"],
      vegetable: ["broccoli", "carrot"],
    });
  });

  it("returns empty object for empty input", () => {
    const result = sortedGroupBy([], () => "any");
    expect(result).toStrictEqual({});
  });

  it("handles single entry", () => {
    const entries: [string, { group: string }][] = [["only", { group: "solo" }]];

    const result = sortedGroupBy(entries, (v) => v.group);

    expect(result).toStrictEqual({ solo: ["only"] });
  });
});

// -- resolveStack ------------------------------------------------------------

describe("resolveStack", () => {
  const KNOWN_SKILL_IDS = new Set<SkillId>([
    "web-framework-react",
    "web-state-zustand",
    "api-framework-hono",
  ]);

  /** A real skill ID deliberately absent from KNOWN_SKILL_IDS — models a stack
   * referencing a skill the current skills source no longer provides. */
  const UNKNOWN_SKILL_ID: SkillId = "web-framework-svelte";

  it("resolves valid skill IDs from stack assignments", () => {
    const stack: Stack = {
      id: "test-stack",
      name: "Test Stack",
      description: "A test stack",
      philosophy: "Test philosophy",
      agents: {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
      },
    };

    const result = resolveStack(stack, KNOWN_SKILL_IDS);

    expect(result.id).toBe("test-stack");
    expect(result.name).toBe("Test Stack");
    expect(result.description).toBe("A test stack");
    expect(result.philosophy).toBe("Test philosophy");
    expect(result.skills).toStrictEqual({
      "web-developer": {
        "web-framework": ["web-framework-react"],
      },
    });
  });

  it("filters out skill IDs not in skillIdSet", () => {
    const stack: Stack = {
      id: "mixed-stack",
      name: "Mixed",
      description: "Some valid, some not",
      agents: {
        "web-developer": {
          "web-framework": [
            { id: "web-framework-react", preloaded: true },
            { id: UNKNOWN_SKILL_ID, preloaded: false },
          ],
        },
      },
    };

    const result = resolveStack(stack, KNOWN_SKILL_IDS);

    expect(result.skills).toStrictEqual({
      "web-developer": {
        "web-framework": ["web-framework-react"],
      },
    });
  });

  it("deduplicates allSkillIds across agents", () => {
    const stack: Stack = {
      id: "dedup-stack",
      name: "Dedup",
      description: "Dedup test",
      agents: {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: true }],
        },
        "web-reviewer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      },
    };

    const result = resolveStack(stack, KNOWN_SKILL_IDS);

    expect(result.allSkillIds).toStrictEqual(["web-framework-react"]);
  });

  it("handles empty agents", () => {
    const stack: Stack = {
      id: "empty-stack",
      name: "Empty",
      description: "No agents",
      agents: {},
    };

    const result = resolveStack(stack, KNOWN_SKILL_IDS);

    expect(result.skills).toStrictEqual({});
    expect(result.allSkillIds).toStrictEqual([]);
  });

  it("sets philosophy to empty string when missing", () => {
    const stack: Stack = {
      id: "no-philo",
      name: "No Philosophy",
      description: "Missing philosophy",
      agents: {},
    };

    const result = resolveStack(stack, KNOWN_SKILL_IDS);

    expect(result.philosophy).toBe("");
  });
});

// -- extractSkills -----------------------------------------------------------

describe("extractSkills", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("extract-skills-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  function createSkillDir(
    name: string,
    metadata: Record<string, unknown>,
    skillMdContent?: string,
  ): void {
    const skillDir = path.join(tempDir, "src/skills", name);
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, "metadata.yaml"), stringifyYaml(metadata));
    if (skillMdContent !== undefined) {
      writeFileSync(path.join(skillDir, "SKILL.md"), skillMdContent);
    }
  }

  it("extracts skill from valid metadata.yaml + SKILL.md pair", () => {
    createSkillDir(
      "react",
      {
        slug: "react",
        category: "web-framework",
        domain: "web",
        displayName: "React",
        cliDescription: "React framework skill",
        author: "@test",
        tags: ["ui", "frontend"],
      },
      renderSkillMd("web-framework-react", "React framework"),
    );

    const result = extractSkills(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("web-framework-react");
    expect(result[0].slug).toBe("react");
    expect(result[0].category).toBe("web-framework");
    expect(result[0].domain).toBe("web");
    expect(result[0].displayName).toBe("React");
    expect(result[0].description).toBe("React framework skill");
    expect(result[0].author).toBe("@test");
    expect(result[0].directoryPath).toBe("react");
    expect(result[0].path).toBe("skills/react");
  });

  it("skips directories missing metadata.yaml", () => {
    const skillDir = path.join(tempDir, "src/skills/no-metadata");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(path.join(skillDir, "SKILL.md"), renderSkillMd("web-framework-test", "Test"));

    const result = extractSkills(tempDir);

    expect(result).toHaveLength(0);
  });

  it("skips directories missing SKILL.md", () => {
    const skillDir = path.join(tempDir, "src/skills/no-skillmd");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(
      path.join(skillDir, "metadata.yaml"),
      stringifyYaml({
        slug: "test",
        category: "web-framework",
        domain: "web",
        displayName: "Test",
        cliDescription: "Test skill",
      }),
    );

    const result = extractSkills(tempDir);

    expect(result).toHaveLength(0);
  });

  it("skips custom skills (metadata.custom = true)", () => {
    createSkillDir(
      "custom-skill",
      {
        slug: "custom",
        category: "web-framework",
        domain: "web",
        displayName: "Custom",
        cliDescription: "A custom skill",
        custom: true,
      },
      renderSkillMd("web-framework-custom", "Custom skill"),
    );

    const result = extractSkills(tempDir);

    expect(result).toHaveLength(0);
  });

  it("skips skills with no SKILL.md frontmatter", () => {
    createSkillDir(
      "no-frontmatter",
      {
        slug: "nofm",
        category: "web-framework",
        domain: "web",
        displayName: "No FM",
        cliDescription: "No frontmatter",
      },
      "# Just a heading\n\nNo frontmatter here.",
    );

    const result = extractSkills(tempDir);

    expect(result).toHaveLength(0);
  });

  it("throws on missing cliDescription", () => {
    createSkillDir(
      "missing-desc",
      {
        slug: "nodesc",
        category: "web-framework",
        domain: "web",
        displayName: "No Desc",
      },
      renderSkillMd("web-framework-nodesc", "test"),
    );

    expect(() => extractSkills(tempDir)).toThrow("missing required 'cliDescription'");
  });

  it("throws on missing displayName", () => {
    createSkillDir(
      "missing-display",
      {
        slug: "noname",
        category: "web-framework",
        domain: "web",
        cliDescription: "Has description",
      },
      renderSkillMd("web-framework-noname", "test"),
    );

    expect(() => extractSkills(tempDir)).toThrow("missing required 'displayName'");
  });

  it("handles optional usageGuidance", () => {
    createSkillDir(
      "with-guidance",
      {
        slug: "guided",
        category: "web-framework",
        domain: "web",
        displayName: "Guided",
        cliDescription: "Guided skill",
        usageGuidance: "Use when building React apps",
      },
      renderSkillMd("web-framework-guided", "Guided"),
    );

    const result = extractSkills(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0].usageGuidance).toBe("Use when building React apps");
  });
});

// -- extractAgents -----------------------------------------------------------

describe("extractAgents", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("extract-agents-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  function createAgentDir(
    group: string,
    agentName: string,
    metadata?: Record<string, unknown>,
  ): void {
    const agentDir = path.join(tempDir, "src/agents", group, agentName);
    mkdirSync(agentDir, { recursive: true });
    if (metadata) {
      writeFileSync(path.join(agentDir, "metadata.yaml"), stringifyYaml(metadata));
    }
  }

  it("extracts agent from valid metadata.yaml", () => {
    createAgentDir("developer", "web-developer", {
      id: "web-developer",
      domain: "web",
    });

    const result = extractAgents(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toStrictEqual({ id: "web-developer", domain: "web" });
  });

  it("skips _templates directory", () => {
    createAgentDir("_templates", "template-agent", {
      id: "template-agent",
      domain: "web",
    });

    const result = extractAgents(tempDir);

    expect(result).toHaveLength(0);
  });

  it("skips custom agents", () => {
    createAgentDir("developer", "custom-agent", {
      id: "custom-agent",
      domain: "web",
      custom: true,
    });

    const result = extractAgents(tempDir);

    expect(result).toHaveLength(0);
  });

  it("skips agents without id field", () => {
    createAgentDir("developer", "no-id-agent", {
      domain: "web",
    });

    const result = extractAgents(tempDir);

    expect(result).toHaveLength(0);
  });

  it("handles missing metadata.yaml gracefully", () => {
    createAgentDir("developer", "no-metadata");

    const result = extractAgents(tempDir);

    expect(result).toHaveLength(0);
  });

  it("handles agent without domain field", () => {
    createAgentDir("developer", "domainless-agent", {
      id: "domainless-agent",
    });

    const result = extractAgents(tempDir);

    expect(result).toHaveLength(1);
    expect(result[0]).toStrictEqual({ id: "domainless-agent", domain: undefined });
  });
});

// -- generatePhase1 ----------------------------------------------------------

describe("generatePhase1", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("gen-phase1-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("generates valid source-types.ts content with SKILL_MAP", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", { slug: "react" }),
      createMockExtractedSkill("api-framework-hono", { slug: "hono" }),
    ];
    const agents: AgentEntry[] = [{ id: "web-developer", domain: "web" }];

    const outDir = path.join(tempDir, "generated");
    const { outPath } = generatePhase1(skills, agents, outDir);

    const content = readFileSync(outPath, "utf-8");

    expect(content).toContain("export const SKILL_MAP = {");
    expect(content).toContain('"hono": "api-framework-hono"');
    expect(content).toContain('"react": "web-framework-react"');
    expect(content).toContain("export type SkillSlug = keyof typeof SKILL_MAP;");
    expect(content).toContain("export type SkillId = (typeof SKILL_MAP)[SkillSlug];");
  });

  it("throws on duplicate slugs", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", { slug: "react" }),
      createMockExtractedSkill("web-state-zustand", { slug: "react" }),
    ];
    const agents: AgentEntry[] = [];

    const outDir = path.join(tempDir, "generated");

    expect(() => generatePhase1(skills, agents, outDir)).toThrow("Duplicate slugs: react");
  });

  it("throws on duplicate skill IDs", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", { slug: "react" }),
      createMockExtractedSkill("web-framework-react", { slug: "svelte" }),
    ];
    const agents: AgentEntry[] = [];

    const outDir = path.join(tempDir, "generated");

    expect(() => generatePhase1(skills, agents, outDir)).toThrow(
      "Duplicate skill IDs: web-framework-react",
    );
  });

  it("sorts skills by slug in SKILL_MAP", () => {
    const skills = [
      createMockExtractedSkill("web-state-zustand", { slug: "zustand" }),
      createMockExtractedSkill("api-framework-hono", { slug: "hono" }),
      createMockExtractedSkill("web-framework-react", { slug: "react" }),
    ];
    const agents: AgentEntry[] = [];

    const outDir = path.join(tempDir, "generated");
    const { outPath } = generatePhase1(skills, agents, outDir);

    const content = readFileSync(outPath, "utf-8");

    const honoIdx = content.indexOf('"hono"');
    const reactIdx = content.indexOf('"react"');
    const zustandIdx = content.indexOf('"zustand"');

    expect(honoIdx).toBeLessThan(reactIdx);
    expect(reactIdx).toBeLessThan(zustandIdx);
  });

  it("includes all categories, domains, agent names", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", {
        slug: "react",
        category: "web-framework",
        domain: "web",
      }),
      createMockExtractedSkill("api-framework-hono", {
        slug: "hono",
        category: "api-framework",
        domain: "api",
      }),
    ];
    const agents: AgentEntry[] = [
      { id: "web-developer", domain: "web" },
      { id: "api-developer", domain: "api" },
    ];

    const outDir = path.join(tempDir, "generated");
    const { outPath } = generatePhase1(skills, agents, outDir);

    const content = readFileSync(outPath, "utf-8");

    // Categories
    expect(content).toContain('"api-framework"');
    expect(content).toContain('"web-framework"');

    // Domains
    expect(content).toContain('"api"');
    expect(content).toContain('"web"');

    // Agent names
    expect(content).toContain('"api-developer"');
    expect(content).toContain('"web-developer"');
  });

  it("deduplicates agent names", () => {
    const skills = [createMockExtractedSkill("web-framework-react", { slug: "react" })];
    const agents: AgentEntry[] = [
      { id: "web-developer", domain: "web" },
      { id: "web-developer", domain: "web" },
    ];

    const outDir = path.join(tempDir, "generated");
    const { outPath } = generatePhase1(skills, agents, outDir);

    const content = readFileSync(outPath, "utf-8");

    // Count occurrences of "web-developer" in AGENT_NAMES section
    const agentSection = content.slice(content.indexOf("AGENT_NAMES = ["));
    const matches = agentSection.match(/"web-developer"/g);
    expect(matches).toHaveLength(1);
  });

  it("returns skillIdSet with all skill IDs", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", { slug: "react" }),
      createMockExtractedSkill("api-framework-hono", { slug: "hono" }),
    ];
    const agents: AgentEntry[] = [];

    const outDir = path.join(tempDir, "generated");
    const { skillIdSet } = generatePhase1(skills, agents, outDir);

    expect(skillIdSet.has("web-framework-react")).toBe(true);
    expect(skillIdSet.has("api-framework-hono")).toBe(true);
    expect(skillIdSet.size).toBe(2);
  });
});

// -- generatePhase2 ----------------------------------------------------------

describe("generatePhase2", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("gen-phase2-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it("generates matrix.ts with BUILT_IN_MATRIX export", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", {
        slug: "react",
        category: "web-framework",
        domain: "web",
        displayName: "React",
      }),
    ];
    const agents: AgentEntry[] = [];
    const skillIdSet = new Set(["web-framework-react"]);

    const outDir = path.join(tempDir, "generated");
    mkdirSync(outDir, { recursive: true });
    generatePhase2(skills, agents, skillIdSet, outDir);

    const content = readFileSync(path.join(outDir, "matrix.ts"), "utf-8");

    expect(content).toContain("export const BUILT_IN_MATRIX: MergedSkillsMatrix =");
  });

  it("generates SKILL_IDS_BY_CATEGORY lookup", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", {
        slug: "react",
        category: "web-framework",
        domain: "web",
        displayName: "React",
      }),
    ];
    const agents: AgentEntry[] = [];
    const skillIdSet = new Set(["web-framework-react"]);

    const outDir = path.join(tempDir, "generated");
    mkdirSync(outDir, { recursive: true });
    generatePhase2(skills, agents, skillIdSet, outDir);

    const content = readFileSync(path.join(outDir, "matrix.ts"), "utf-8");

    expect(content).toContain("export const SKILL_IDS_BY_CATEGORY:");
  });

  it("generates CATEGORIES_BY_DOMAIN lookup", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", {
        slug: "react",
        category: "web-framework",
        domain: "web",
        displayName: "React",
      }),
    ];
    const agents: AgentEntry[] = [];
    const skillIdSet = new Set(["web-framework-react"]);

    const outDir = path.join(tempDir, "generated");
    mkdirSync(outDir, { recursive: true });
    generatePhase2(skills, agents, skillIdSet, outDir);

    const content = readFileSync(path.join(outDir, "matrix.ts"), "utf-8");

    expect(content).toContain("export const CATEGORIES_BY_DOMAIN:");
  });

  it("sets generatedAt to 'build'", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", {
        slug: "react",
        category: "web-framework",
        domain: "web",
        displayName: "React",
      }),
    ];
    const agents: AgentEntry[] = [];
    const skillIdSet = new Set(["web-framework-react"]);

    const outDir = path.join(tempDir, "generated");
    mkdirSync(outDir, { recursive: true });
    generatePhase2(skills, agents, skillIdSet, outDir);

    const content = readFileSync(path.join(outDir, "matrix.ts"), "utf-8");

    expect(content).toContain('"generatedAt": "build"');
  });

  it("includes agentDefinedDomains when agents have domains", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", {
        slug: "react",
        category: "web-framework",
        domain: "web",
        displayName: "React",
      }),
    ];
    const agents: AgentEntry[] = [
      { id: "web-developer", domain: "web" },
      { id: "api-developer", domain: "api" },
    ];
    const skillIdSet = new Set(["web-framework-react"]);

    const outDir = path.join(tempDir, "generated");
    mkdirSync(outDir, { recursive: true });
    generatePhase2(skills, agents, skillIdSet, outDir);

    const content = readFileSync(path.join(outDir, "matrix.ts"), "utf-8");

    expect(content).toContain('"agentDefinedDomains"');
    expect(content).toContain('"web-developer": "web"');
    expect(content).toContain('"api-developer": "api"');
  });
});
