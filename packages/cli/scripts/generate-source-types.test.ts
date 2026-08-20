/**
 * Contract for `scripts/generate-source-types.ts`, the writer of `src/cli/types/generated/`.
 *
 * Everything here runs against fixture roots, deliberately: the generator reads a `skills`
 * marketplace checkout that no CI job in this repository has, so a spec pointed at the real one
 * would be green on one machine and unrunnable on every other. The staleness question for the
 * committed artefacts is `generate:types:check`'s to answer, not this suite's.
 *
 * The check these specs pin is not the one `generate:types:check` used to run. That was
 * `bun run generate:types && git diff --exit-code src/cli/types/generated/`, which answers "does
 * this differ from what is staged or committed" rather than "is this stale against source", is
 * blind to a path git has never seen, and cannot be run at all by an agent working under the
 * no-write-git rule.
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from "vitest";
import { mkdirSync, statSync, unlinkSync, writeFileSync, readFileSync, readdirSync } from "fs";
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
  renderSourceTypes,
  renderMatrix,
  check,
  generate,
} from "./generate-source-types";

import type { AgentEntry } from "./generate-source-types";
import type { SkillId, Stack } from "../src/cli/types";
import { firstElement } from "../src/cli/lib/__tests__/helpers/element-at.js";

const CLI_ROOT = path.resolve(import.meta.dirname, "..");
const GENERATED_DIR = path.join(CLI_ROOT, "src/cli/types/generated");

/** Every file the generator owns, in emission order. */
const EMITTED_FILES = ["source-types.ts", "matrix.ts"];

const DRIFTED_FILE = "source-types.ts";
const DRIFTED_CONTENT = "// hand-edited after generation\n";

/** Stands in for a path the generator emits that git has never seen — absent from disk. */
const ABSENT_FILE = "matrix.ts";

const modifiedAt = (filePath: string): bigint => statSync(filePath, { bigint: true }).mtimeNs;

/** One `<skills-source>/src/skills/<id>/` pair, as the marketplace ships them. */
function writeFixtureSkill(
  skillsSource: string,
  id: SkillId,
  metadata: Record<string, unknown>,
): void {
  const skillDir = path.join(skillsSource, "src/skills", id);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(path.join(skillDir, "metadata.yaml"), stringifyYaml(metadata));
  writeFileSync(path.join(skillDir, "SKILL.md"), renderSkillMd(id, String(metadata.displayName)));
}

/** One `<cli-root>/src/agents/<group>/<agent>/metadata.yaml`. */
function writeFixtureAgent(cliRoot: string, group: string, id: string, domain: string): void {
  const agentDir = path.join(cliRoot, "src/agents", group, id);
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(path.join(agentDir, "metadata.yaml"), stringifyYaml({ id, domain }));
}

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
        reviewer: {
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
    expect(firstElement(result).id).toBe("web-framework-react");
    expect(firstElement(result).slug).toBe("react");
    expect(firstElement(result).category).toBe("web-framework");
    expect(firstElement(result).domain).toBe("web");
    expect(firstElement(result).displayName).toBe("React");
    expect(firstElement(result).description).toBe("React framework skill");
    expect(firstElement(result).author).toBe("@test");
    expect(firstElement(result).directoryPath).toBe("react");
    expect(firstElement(result).path).toBe("skills/react");
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
    expect(firstElement(result).usageGuidance).toBe("Use when building React apps");
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
    // An agent with no `domain:` yields an entry with no `domain` key at all.
    expect(result[0]).toStrictEqual({ id: "domainless-agent" });
  });
});

// -- renderSourceTypes -------------------------------------------------------

describe("renderSourceTypes", () => {
  it("generates valid source-types.ts content with SKILL_MAP", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", { slug: "react" }),
      createMockExtractedSkill("api-framework-hono", { slug: "hono" }),
    ];
    const agents: AgentEntry[] = [{ id: "web-developer", domain: "web" }];

    const content = renderSourceTypes(skills, agents);

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

    expect(() => renderSourceTypes(skills, agents)).toThrow("Duplicate slugs: react");
  });

  it("throws on duplicate skill IDs", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", { slug: "react" }),
      createMockExtractedSkill("web-framework-react", { slug: "svelte" }),
    ];
    const agents: AgentEntry[] = [];

    expect(() => renderSourceTypes(skills, agents)).toThrow(
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

    const content = renderSourceTypes(skills, agents);

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
        category: "api-api",
        domain: "api",
      }),
    ];
    const agents: AgentEntry[] = [
      { id: "web-developer", domain: "web" },
      { id: "api-developer", domain: "api" },
    ];

    const content = renderSourceTypes(skills, agents);

    // Categories
    expect(content).toContain('"api-api"');
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

    const content = renderSourceTypes(skills, agents);

    // The whole emitted declaration, byte for byte. A regex count over a slice of the
    // file stood here: it said how many times a name occurred somewhere after the
    // opening bracket, which is a number rather than a shape — it could not tell a
    // duplicate from a reordering, and it read the file's whole tail as the block.
    expect(content).toContain(`export const AGENT_NAMES = [\n"web-developer",\n] as const;`);
  });
});

// -- renderMatrix ------------------------------------------------------------

describe("renderMatrix", () => {
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

    const content = renderMatrix(skills, agents, skillIdSet);

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

    const content = renderMatrix(skills, agents, skillIdSet);

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

    const content = renderMatrix(skills, agents, skillIdSet);

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

    const content = renderMatrix(skills, agents, skillIdSet);

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

    const content = renderMatrix(skills, agents, skillIdSet);

    expect(content).toContain('"agentDefinedDomains"');
    expect(content).toContain('"web-developer": "web"');
    expect(content).toContain('"api-developer": "api"');
  });
});

// -- Built-in relationship narrowing -----------------------------------------

describe("renderMatrix relationship narrowing", () => {
  it("records no unresolved slug for a catalogue smaller than the built-in rules describe", () => {
    const skills = [createMockExtractedSkill("web-framework-react")];

    const content = renderMatrix(skills, [], new Set(skills.map((skill) => skill.id)));

    expect(
      content,
      "the built-in rules are narrowed to the slugs the catalogue ships, so none is left dangling",
    ).not.toContain("unresolvedSlugs");
  });

  it("keeps a built-in conflict whose members the catalogue both ship", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react"),
      createMockExtractedSkill("web-framework-vue-composition-api"),
    ];

    const content = renderMatrix(skills, [], new Set(skills.map((skill) => skill.id)));

    expect(
      content,
      "narrowing drops the members a catalogue lacks, never a rule it can still express",
    ).toContain('"skillId": "web-framework-vue-composition-api"');
  });
});

// -- Deterministic emission --------------------------------------------------

describe("renderMatrix determinism", () => {
  it("emits byte-identical matrix.ts regardless of input enumeration order", () => {
    const skills = [
      createMockExtractedSkill("web-framework-react", { slug: "react" }),
      createMockExtractedSkill("api-queue-bullmq", { slug: "bullmq" }),
      createMockExtractedSkill("ai-provider-cohere-sdk", { slug: "cohere-sdk" }),
    ];
    const agents: AgentEntry[] = [
      { id: "web-developer", domain: "web" },
      { id: "api-developer", domain: "api" },
    ];
    const skillIdSet = new Set(skills.map((s) => s.id));

    const emitted = renderMatrix(skills, agents, skillIdSet);
    const reversed = renderMatrix([...skills].reverse(), [...agents].reverse(), skillIdSet);

    expect(emitted).toStrictEqual(reversed);
  });
});

// -- Module shape ------------------------------------------------------------

describe("generate-source-types module", () => {
  it("exports generate and check, and importing it writes nothing", async () => {
    const committedFiles = readdirSync(GENERATED_DIR).map((name) => path.join(GENERATED_DIR, name));
    const modifiedBefore = committedFiles.map(modifiedAt);

    const reimported = await import("./generate-source-types.js");

    expect(typeof reimported.generate).toBe("function");
    expect(typeof reimported.check).toBe("function");
    expect(
      committedFiles.map(modifiedAt),
      "importing the generator must not touch src/cli/types/generated",
    ).toStrictEqual(modifiedBefore);
  });
});

// -- Check mode --------------------------------------------------------------

describe("check mode", () => {
  let skillsSource: string;
  let cliRoot: string;
  const outDirs: string[] = [];

  beforeAll(async () => {
    skillsSource = await createTempDir("types-check-skills-");
    cliRoot = await createTempDir("types-check-cli-");
    writeFixtureSkill(skillsSource, "web-framework-react", {
      slug: "react",
      category: "web-framework",
      domain: "web",
      displayName: "React",
      cliDescription: "React framework skill",
    });
    writeFixtureAgent(cliRoot, "developer", "web-developer", "web");
  });

  afterAll(async () => {
    await cleanupTempDir(skillsSource);
    await cleanupTempDir(cliRoot);
    for (const dir of outDirs) await cleanupTempDir(dir);
  });

  /** A directory holding exactly what the fixture marketplace generates, in `os.tmpdir()`. */
  async function generatedFixture(prefix: string): Promise<string> {
    const outDir = await createTempDir(prefix);
    outDirs.push(outDir);
    await generate({ outDir, skillsSource, cliRoot });
    return outDir;
  }

  it("emits both files and reports no drift against what it just wrote", async () => {
    const outDir = await generatedFixture("types-check-clean-");

    expect(readdirSync(outDir).sort()).toStrictEqual([...EMITTED_FILES].sort());
    expect(await check({ outDir, skillsSource, cliRoot })).toStrictEqual({
      clean: true,
      drifted: [],
    });
  });

  it("names the drifted file and leaves the tree untouched", async () => {
    const outDir = await generatedFixture("types-check-drift-");
    writeFileSync(path.join(outDir, DRIFTED_FILE), DRIFTED_CONTENT);
    const filesBefore = readdirSync(outDir).sort();

    const result = await check({ outDir, skillsSource, cliRoot });

    expect(result).toStrictEqual({ clean: false, drifted: [DRIFTED_FILE] });
    expect(
      readFileSync(path.join(outDir, DRIFTED_FILE), "utf-8"),
      "check must not rewrite the file it reports as drifted",
    ).toBe(DRIFTED_CONTENT);
    expect(readdirSync(outDir).sort()).toStrictEqual(filesBefore);
  });

  it("names an emitted path that is not on disk at all", async () => {
    const outDir = await generatedFixture("types-check-absent-");
    unlinkSync(path.join(outDir, ABSENT_FILE));

    expect(await check({ outDir, skillsSource, cliRoot })).toStrictEqual({
      clean: false,
      drifted: [ABSENT_FILE],
    });
  });

  it("reaches its verdict from the bytes, in a directory no repository tracks", async () => {
    const clean = await generatedFixture("types-check-untracked-clean-");
    const drifted = await generatedFixture("types-check-untracked-drift-");
    writeFileSync(path.join(drifted, DRIFTED_FILE), DRIFTED_CONTENT);

    expect(await check({ outDir: clean, skillsSource, cliRoot })).toStrictEqual({
      clean: true,
      drifted: [],
    });
    expect(
      await check({ outDir: drifted, skillsSource, cliRoot }),
      "the verdict must come from the bytes, not from what a diff can see",
    ).toStrictEqual({ clean: false, drifted: [DRIFTED_FILE] });
  });
});
