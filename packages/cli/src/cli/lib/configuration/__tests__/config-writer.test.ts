/* eslint-disable @typescript-eslint/no-implied-eval --
 * `new Function(source)` only parses the writer's own output as JavaScript; it is never called.
 */
import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import { matrix } from "../../matrix/matrix-provider";
import { generateConfigSource, generateBlankGlobalConfigSource } from "../config-writer";
import { generateBlankGlobalConfigTypesSource } from "../config-types-writer";
import { buildSkillConfigs } from "../../__tests__/helpers/skill-config-builders.js";
import {
  buildProjectConfig,
  buildAgentConfigs,
} from "../../__tests__/factories/config-factories.js";
import { sa, saUnflagged } from "../../__tests__/factories/skill-factories.js";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../../consts";
import type { ProjectConfig, SkillId } from "../../../types";
import { EXPECTED_SKILLS } from "../../__tests__/expected-values";
import { TEST_SOURCE_URL } from "../../__tests__/test-constants.js";
import {
  extractNamedSection,
  extractScopeSections,
} from "../../__tests__/helpers/config-source-sections.js";

/** A project a global config registers, so `projects` has something to emit. */
const REGISTERED_PROJECT = path.join(os.tmpdir(), "registered-project");

// Boundary cast: a skill outside every marketplace is outside the generated union by construction
const EXTERNAL_SKILL_ID = "external-web-tooling-house" as SkillId;

const SOURCE_LAYOUT_ROOT = "catalogue/";

/** The four fields a source repository declares its own layout with, each set off its default. */
const SOURCE_LAYOUT = {
  skillsDir: `${SOURCE_LAYOUT_ROOT}skills`,
  stacksFile: `${SOURCE_LAYOUT_ROOT}stacks.ts`,
  categoriesFile: `${SOURCE_LAYOUT_ROOT}skill-categories.ts`,
  rulesFile: `${SOURCE_LAYOUT_ROOT}skill-rules.ts`,
} satisfies Partial<ProjectConfig>;

describe("generateConfigSource", () => {
  it("produces valid TypeScript with import type, export default, and named variables", () => {
    const config = buildProjectConfig();
    const source = generateConfigSource(config, matrix);
    expect(source).not.toContain("defineConfig");
    expect(source).toContain("from './config-types'");
    expect(source).toContain("export default {");
    expect(source).toContain("satisfies ProjectConfig");
    expect(source).toContain("name: 'test-project'");
    expect(source).toContain("const skills: SkillConfig[]");
    expect(source).toContain("const agents: AgentScopeConfig[]");
  });

  it("puts named variables before export default", () => {
    const config = buildProjectConfig();
    const source = generateConfigSource(config, matrix);
    const exportIdx = source.indexOf("export default");
    const skillsIdx = source.indexOf("const skills:");
    const agentsIdx = source.indexOf("const agents:");
    expect(skillsIdx).toBeLessThan(exportIdx);
    expect(agentsIdx).toBeLessThan(exportIdx);
  });

  it("omits undefined fields", () => {
    const config = buildProjectConfig({
      name: "sparse-project",
      agents: [],
      skills: [],
    });
    const source = generateConfigSource(config, matrix);
    expect(source).not.toContain("description");
    expect(source).not.toContain("author");
    expect(source).toContain("name: 'sparse-project'");
  });

  /**
   * A field missing from the canonical order is emitted at the tail, reordering configs on re-emit.
   */
  it("gives the renamed marketplace fields their place in the canonical order", () => {
    const config = buildProjectConfig({
      marketplace: TEST_SOURCE_URL,
      marketplaceName: DEFAULT_PUBLIC_SOURCE_NAME,
      projects: [REGISTERED_PROJECT],
    });

    const source = generateConfigSource(config, matrix);

    const marketplaceIdx = source.indexOf(`marketplace: '${TEST_SOURCE_URL}'`);
    const nameIdx = source.indexOf(`marketplaceName: '${DEFAULT_PUBLIC_SOURCE_NAME}'`);
    const projectsIdx = source.indexOf("projects:");
    expect(marketplaceIdx).toBeGreaterThan(-1);
    expect(nameIdx, "the marketplace name follows the ref it names").toBeGreaterThan(
      marketplaceIdx,
    );
    expect(
      projectsIdx,
      "a canonically-ordered field must not be pushed behind a schema field it precedes",
    ).toBeGreaterThan(nameIdx);
  });

  it("emits a skill entry's provenance under origin", () => {
    const config = buildProjectConfig({
      skills: buildSkillConfigs(["web-framework-react"], { origin: EJECT_SOURCE }),
    });

    const source = generateConfigSource(config, matrix);

    expect(source).toContain(`origin: '${EJECT_SOURCE}'`);
    expect(source, "no skill entry may still be keyed by the pre-rename name").not.toContain(
      "source: '",
    );
  });

  it("writes no custom flag beside a skill entry's origin", () => {
    const config = buildProjectConfig({
      skills: buildSkillConfigs([EXTERNAL_SKILL_ID], { origin: EJECT_SOURCE }),
    });

    const source = generateConfigSource(config, matrix);

    expect(source).toContain(`origin: '${EJECT_SOURCE}'`);
    expect(
      source,
      "whether a skill is custom is the matrix's answer and every reader of it holds one — a second copy written into config.ts is a copy that can disagree",
    ).not.toContain("custom:");
  });

  it("uses inline empty arrays for empty skills/agents", () => {
    const config = buildProjectConfig({
      name: "sparse-project",
      agents: [],
      skills: [],
    });
    const source = generateConfigSource(config, matrix);
    expect(source).toContain("skills: [],");
    expect(source).toContain("agents: [],");
    expect(source).not.toContain("const skills:");
    expect(source).not.toContain("const agents:");
  });

  it("compacts a single non-preloaded skill in an exclusive category to a bare string", () => {
    const config = buildProjectConfig({
      name: "stack-project",
      stack: {
        "web-developer": {
          "web-framework": [sa("web-framework-react", false)],
        },
      },
    });
    const source = generateConfigSource(config, matrix);
    // web-framework is exclusive, so the array wrapper carries no information the reader needs
    expect(source).toContain("'web-framework': 'web-framework-react'");
    expect(source).not.toMatch(/'web-framework':\s*\[/);
    expect(source).toContain("const stack: Partial<Record<ProjectAgentName, StackAgentConfig>>");
  });

  it("emits a bare id string for an assignment that carries no flags at all", () => {
    const config = buildProjectConfig({
      name: "flagless-assignment-project",
      stack: {
        "web-developer": {
          "web-framework": [saUnflagged("web-framework-react")],
        },
      },
    });
    const source = generateConfigSource(config, matrix);
    // An assignment with nothing but an id says everything the id says — the object wrapper is noise
    expect(source).toContain("'web-framework': 'web-framework-react'");
    // Scoped to the stack: the skills array carries `id:` for every entry.
    expect(extractNamedSection(source, "stack")).not.toContain("id:");
  });

  it("keeps the object form for an assignment carrying local and path", () => {
    const config = buildProjectConfig({
      name: "local-assignment-project",
      stack: {
        "web-developer": {
          "web-framework": [
            { id: "web-framework-react", local: true, path: ".claude/skills/react/" },
          ],
        },
      },
    });
    const source = generateConfigSource(config, matrix);
    // local/path are not defaults — flattening to a bare id would silently drop them
    expect(source).toContain("id: 'web-framework-react'");
    expect(source).toContain("local: true");
    expect(source).toContain("path: '.claude/skills/react/'");
  });

  it("preserves preloaded flag as a bare object in an exclusive category", () => {
    const config = buildProjectConfig({
      name: "preloaded-project",
      agents: buildAgentConfigs(["api-developer"]),
      skills: buildSkillConfigs([...EXPECTED_SKILLS.API_DEFAULT]),
      stack: {
        "api-developer": {
          "api-api": [sa("api-framework-hono", true)],
        },
      },
    });
    const source = generateConfigSource(config, matrix);
    expect(source).toContain("preloaded: true");
    expect(source).toContain("'api-framework-hono'");
    // Exclusive, so unwrapped. Single-quoted, as the writer quotes keys.
    expect(source).not.toMatch(/'api-api':\s*\[/);
  });

  it("keeps a single-skill non-exclusive category as a one-element array", () => {
    const config = buildProjectConfig({
      name: "non-exclusive-project",
      skills: buildSkillConfigs(["web-styling-tailwind"]),
      stack: {
        "web-developer": {
          "web-styling": [sa("web-styling-tailwind", false)],
        },
      },
    });
    const source = generateConfigSource(config, matrix);
    // web-styling can hold several skills, so the array is load-bearing even at length one
    expect(source).toContain("'web-styling': ['web-styling-tailwind']");
  });

  it("throws, naming the category, when an exclusive category holds two skills", () => {
    const config = buildProjectConfig({
      name: "over-filled-project",
      skills: buildSkillConfigs(["web-framework-react", "web-framework-svelte"]),
      stack: {
        "web-developer": {
          "web-framework": [sa("web-framework-react", false), sa("web-framework-svelte", false)],
        },
      },
    });
    // Dropping the second entry silently would write a config that does not match the selection.
    expect(() => generateConfigSource(config, matrix)).toThrow("web-framework");
  });

  it("handles config without stack", () => {
    const config = buildProjectConfig({ name: "simple-project" });
    const source = generateConfigSource(config, matrix);
    expect(source).not.toContain("const stack:");
    expect(source).not.toContain("stack,");
  });

  it("only imports used types", () => {
    const config = buildProjectConfig({ name: "minimal", agents: [], skills: [] });
    const source = generateConfigSource(config, matrix);
    const importLine = source.split("\n")[0];
    expect(importLine).toBe("import type { ProjectConfig } from './config-types'");
    expect(source).not.toContain("defineConfig");
    expect(source).not.toContain("agents-inc/config");
  });

  it("imports SkillConfig and AgentScopeConfig when skills and agents are present", () => {
    const config = buildProjectConfig();
    const source = generateConfigSource(config, matrix);
    expect(source).toContain("SkillConfig");
    expect(source).toContain("AgentScopeConfig");
  });

  it("imports ProjectAgentName and StackAgentConfig when stack is present", () => {
    const config = buildProjectConfig({
      stack: {
        "web-developer": {
          "web-framework": [sa("web-framework-react", false)],
        },
      },
    });
    const source = generateConfigSource(config, matrix);
    expect(source).toContain("ProjectAgentName");
    expect(source).toContain("StackAgentConfig");
  });

  it("never imports SelectedAgentName — no emitted field references it", () => {
    const config = buildProjectConfig({
      stack: {
        "web-developer": {
          "web-framework": [sa("web-framework-react", false)],
        },
      },
    });
    const source = generateConfigSource(config, matrix);
    expect(source).not.toContain("SelectedAgentName");
  });

  it("imports Domain when selected domains are present", () => {
    const config = buildProjectConfig({ selectedDomains: ["web"] });
    const source = generateConfigSource(config, matrix);
    expect(source).toContain("Domain");
    expect(source).toContain("const selectedDomains: Domain[] = ['web']");
  });

  it("extracts selected domains as named variable", () => {
    const config = buildProjectConfig({ selectedDomains: ["web", "api"] });
    const source = generateConfigSource(config, matrix);
    expect(source).toContain("const selectedDomains: Domain[]");
    expect(source).toContain("'web'");
    expect(source).toContain("'api'");
    const exportBlock = source.slice(
      source.indexOf("export default"),
      source.indexOf("satisfies ProjectConfig"),
    );
    expect(exportBlock).toContain("selectedDomains,");
  });

  describe("empty config", () => {
    it("handles config with no skills, no agents, no selected domains, no stack", () => {
      const config = buildProjectConfig({
        name: "empty-project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("name: 'empty-project'");
      expect(source).toContain("skills: [],");
      expect(source).toContain("agents: [],");
      expect(source).not.toContain("const stack:");
      expect(source).not.toContain("const selectedDomains:");
      expect(source).toContain("satisfies ProjectConfig");
      const importLine = source.split("\n")[0];
      expect(importLine).toBe("import type { ProjectConfig } from './config-types'");
    });

    it("does not emit a selectedDomains field when selectedDomains is undefined", () => {
      const config = buildProjectConfig({
        name: "test-empty",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, matrix);
      expect(source).not.toContain("selectedDomains");
    });

    it("handles empty selectedDomains array", () => {
      const config = buildProjectConfig({
        name: "empty-domains",
        skills: [],
        agents: [],
        selectedDomains: [],
      });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("selectedDomains: [],");
      expect(source).not.toContain("const selectedDomains:");
    });
  });

  describe("global-scope items", () => {
    it("serializes skills with global scope", () => {
      const config = buildProjectConfig({
        name: "global-project",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("scope: 'global'");
      expect(source).toContain("id: 'web-framework-react'");
    });

    it("serializes agents with global scope", () => {
      const config = buildProjectConfig({
        name: "global-agents",
        skills: [],
        agents: buildAgentConfigs(["web-developer", "api-developer"], { scope: "global" }),
      });
      const source = generateConfigSource(config, matrix);
      const agentSection = extractNamedSection(source, "agents");
      expect(agentSection).toContain("scope: 'global'");
      expect(agentSection).toContain("name: 'web-developer'");
      expect(agentSection).toContain("name: 'api-developer'");
    });

    it("mixes project and global scope items", () => {
      const config = buildProjectConfig({
        name: "mixed-scope",
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global" }),
          ...buildSkillConfigs(["api-framework-hono"], { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["api-developer"], { scope: "project" }),
        ],
      });
      const source = generateConfigSource(config, matrix);
      const globalCount = (source.match(/scope: 'global'/g) || []).length;
      const projectCount = (source.match(/scope: 'project'/g) || []).length;
      expect(globalCount).toBe(2); // 1 skill + 1 agent
      expect(projectCount).toBe(2); // 1 skill + 1 agent
    });
  });

  describe("special characters in name", () => {
    it("keeps the quote that needs no escape in a project name", () => {
      const config = buildProjectConfig({
        name: 'my "quoted" project',
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, matrix);
      // Single quotes, as prettier would pick: the value carries double ones.
      expect(source).toContain(`name: 'my "quoted" project'`);
    });

    it("escapes backslashes in project name", () => {
      const config = buildProjectConfig({
        name: "my\\backslash\\project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, matrix);
      // A backslash is escaped whichever quote encloses the value.
      expect(source).toContain("my\\\\backslash\\\\project");
    });

    it("handles names with unicode characters", () => {
      const config = buildProjectConfig({
        name: "projet-francais",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("name: 'projet-francais'");
      expect(source).toContain("satisfies ProjectConfig");
    });
  });

  describe("project config without the global it extends", () => {
    it("refuses the emission rather than answering it with a global-shaped file", () => {
      const config = buildProjectConfig({ name: "project-without-a-global" });

      expect(() => generateConfigSource(config, matrix, { isProjectConfig: true })).toThrowError(
        "pass `globalConfig` to inline its entries.",
      );
    });

    it("emits the project config once its global is given", () => {
      const config = buildProjectConfig({ name: "project-without-a-global" });
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-researcher"], { scope: "global" }),
      });

      expect(
        generateConfigSource(config, matrix, { isProjectConfig: true, globalConfig }),
        "the inlined global must not be caught by the refusal",
      ).toContain("'web-framework-react'");
    });
  });

  describe("project config with inlined global", () => {
    const globalConfig = buildProjectConfig({
      name: "global",
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: buildAgentConfigs(["web-researcher"], { scope: "global" }),
      marketplace: "/path/to/skills",
      marketplaceName: "agents-inc",
    });

    it("inlines global skills with // global comment", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain("// global");
      expect(source).toContain("'web-framework-react'");
      expect(source).toContain("scope: 'global'");
    });

    it("inlines global agents with // global comment", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      const agentsSection = extractNamedSection(source, "agents");
      expect(agentsSection).toContain("// global");
      expect(agentsSection).toContain("'web-researcher'");
    });

    it("adds // project comment only when project items exist", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain("// project");
      expect(source).toContain("'web-styling-tailwind'");
      expect(source).toContain("'web-developer'");
    });

    it("omits // project comment when no project skills exist", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      const skillsSection = extractNamedSection(source, "skills");
      expect(skillsSection).toContain("// global");
      expect(skillsSection).not.toContain("// project");
    });

    it("inlines global scalar fields in export default", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain("marketplace: '/path/to/skills'");
      expect(source).toContain("marketplaceName: 'agents-inc'");
    });

    it("uses project name instead of global name", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain("name: 'my-project'");
      expect(source).not.toContain("name: 'global'");
    });

    /**
     * A project declaring none reads the global's at run time, so an inlined copy would go stale.
     */
    it("inlines none of the global config's hand-written fields", () => {
      const brandedGlobal = buildProjectConfig({
        ...globalConfig,
        branding: { name: "Northwind" },
        ...SOURCE_LAYOUT,
      });
      const projectConfig = buildProjectConfig({ name: "my-project", skills: [], agents: [] });

      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: brandedGlobal,
      });

      expect(source, "the global's name must stay in the global config").not.toContain("Northwind");
      expect(source, "the global's layout must stay in the global config").not.toContain(
        SOURCE_LAYOUT_ROOT,
      );
    });

    it("keeps the project's own hand-written fields beside an inlined global", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
        branding: { name: "Northwind" },
        ...SOURCE_LAYOUT,
      });

      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });

      expect(source).toContain("name: 'Northwind'");
      expect(source).toContain("skillsDir: 'catalogue/skills'");
      expect(source).toContain("stacksFile: 'catalogue/stacks.ts'");
      expect(source).toContain("categoriesFile: 'catalogue/skill-categories.ts'");
      expect(source).toContain("rulesFile: 'catalogue/skill-rules.ts'");
    });

    it("uses default plugin name when project name is 'global'", () => {
      const projectConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain("name: 'agents-inc'");
    });

    it("never emits a selectedAgents constant when inlining global", () => {
      const globalWithAgents = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-researcher"], { scope: "global" }),
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: globalWithAgents,
      });
      expect(source, "the active agents list is the only record of who is selected").not.toContain(
        "selectedAgents",
      );
    });

    it("merges global and project selected domains", () => {
      const globalWithDomains = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        selectedDomains: ["web"],
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
        selectedDomains: ["api"],
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: globalWithDomains,
      });
      expect(source).toContain("'web'");
      expect(source).toContain("'api'");
      expect(source).toContain("const selectedDomains: Domain[]");
    });

    it("handles empty global config with project items", () => {
      const emptyGlobal = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-framework-react"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: emptyGlobal,
      });
      expect(source).not.toContain("// global");
      expect(source).toContain("// project");
      expect(source).toContain("'web-framework-react'");
    });

    it("generates valid JavaScript when type annotations are stripped", () => {
      const projectConfig = buildProjectConfig({
        name: "valid-inlined",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      let source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      source = source
        .replace(/import type \{[^}]+\} from '\.\/config-types'\n/, "")
        .replace(/ satisfies ProjectConfig/, "")
        .replace(/const (\w+): [^=]+=/g, "const $1 =")
        .replace("export default", "const __config =");

      expect(() => {
        new Function(source);
      }).not.toThrow();
    });

    it("contains satisfies ProjectConfig", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain("} satisfies ProjectConfig");
    });

    it("excludes global agent stack entries from inlined project config", () => {
      const globalWithStack = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs([...EXPECTED_SKILLS.API_DEFAULT]),
        agents: buildAgentConfigs(["api-developer"]),
        stack: {
          "api-developer": {
            "api-api": [sa("api-framework-hono", false)],
          },
        },
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: globalWithStack,
      });

      expect(source).toContain("'api-developer'");
      expect(source).toContain("'api-framework-hono'");
      // Global agents' stack entries live in the global config. Single-quoted, as keys are.
      expect(source).not.toMatch(/'web-developer':\s*\{/);
    });

    it("omits stack when only global agents have stack entries", () => {
      const globalWithStack = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: globalWithStack,
      });

      // No project agents means no stack in project config
      expect(source).not.toContain("const stack:");
    });

    it("deduplicates scalar fields when both global and project have the same key", () => {
      const globalWithSource = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        marketplace: "/global/skills",
        marketplaceName: "agents-inc",
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
        marketplace: "/project/skills",
        marketplaceName: "custom-marketplace",
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: globalWithSource,
      });

      // Project values should appear (they take precedence)
      expect(source).toContain("marketplace: '/project/skills'");
      expect(source).toContain("marketplaceName: 'custom-marketplace'");

      expect(source).not.toContain("marketplace: '/global/skills'");
      expect(source).not.toContain("marketplaceName: 'agents-inc'");

      const exportBlock = source.slice(source.indexOf("export default {"));
      const sourceMatches = exportBlock.match(/\bmarketplace:/g);
      const marketplaceMatches = exportBlock.match(/\bmarketplaceName:/g);
      expect(sourceMatches).toHaveLength(1);
      expect(marketplaceMatches).toHaveLength(1);
    });

    it("drops the array wrapper for single-skill exclusive categories in inlined stack", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-framework-react"]),
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: buildProjectConfig({ name: "global", skills: [], agents: [] }),
      });

      const stackSection = extractNamedSection(source, "stack");
      // Exclusive category, one skill: the bare value IS the assignment
      expect(stackSection).toMatch(/'web-framework':\s*'web-framework-react'/);
      expect(stackSection).not.toMatch(/'web-framework':\s*\[/);
    });

    it("preserves multi-skill non-exclusive categories as multi-element arrays in inlined stack", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [
          ...buildSkillConfigs(["web-styling-tailwind"]),
          ...buildSkillConfigs(["web-styling-scss-modules"]),
        ],
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-styling": [
              sa("web-styling-tailwind", false),
              sa("web-styling-scss-modules", false),
            ],
          },
        },
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: buildProjectConfig({ name: "global", skills: [], agents: [] }),
      });

      const stackSection = extractNamedSection(source, "stack");
      expect(stackSection).toContain("'web-styling': [");
      expect(stackSection).toContain("'web-styling-tailwind'");
      expect(stackSection).toContain("'web-styling-scss-modules'");
    });

    it("compacts non-preloaded assignments to bare strings and preserves preloaded objects in inlined stack", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-styling-tailwind"]),
        ],
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
            "web-styling": [sa("web-styling-tailwind", true)],
          },
        },
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: buildProjectConfig({ name: "global", skills: [], agents: [] }),
      });

      const stackSection = extractNamedSection(source, "stack");
      // Exclusive + non-preloaded: bare string, no array and no object wrapper
      expect(stackSection).toMatch(/'web-framework':\s*'web-framework-react'/);
      expect(stackSection).not.toMatch(/'web-framework':\s*\[/);
      // Non-exclusive + preloaded: object with preloaded: true, still inside its array
      expect(stackSection).toContain("'web-styling': [");
      expect(stackSection).toContain("preloaded: true");
      expect(stackSection).toContain("id: 'web-styling-tailwind'");
    });

    it("never leaks global agent stack entries into project config", () => {
      const globalWithStack = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-styling-tailwind"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer", "web-researcher"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
            "web-styling": [sa("web-styling-tailwind", false)],
          },
          "web-researcher": {
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs([...EXPECTED_SKILLS.API_DEFAULT]),
        agents: buildAgentConfigs(["api-developer"]),
        stack: {
          "api-developer": {
            "api-api": [sa("api-framework-hono", false)],
          },
        },
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig: globalWithStack,
      });

      expect(source).toContain("const stack:");
      expect(source).toContain("'api-developer'");
      expect(source).toContain("'api-framework-hono'");

      const stackSection = extractNamedSection(source, "stack");
      expect(stackSection).not.toMatch(/'web-developer':\s*\{/);
      expect(stackSection).not.toMatch(/'web-researcher':\s*\{/);
      expect(stackSection).not.toContain("'web-framework-react'");
      expect(stackSection).not.toContain("'web-styling-tailwind'");
    });

    it("shows skill in both sections when same skill exists at project and global scope", () => {
      const globalWithReact = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });
      const projectWithReact = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      });
      const source = generateConfigSource(projectWithReact, matrix, {
        isProjectConfig: true,
        globalConfig: globalWithReact,
      });

      const skillsSection = extractNamedSection(source, "skills");

      const reactMatches = skillsSection.match(/'web-framework-react'/g);
      expect(reactMatches).toHaveLength(2);

      const { global: globalSection, project: projectSection } =
        extractScopeSections(skillsSection);
      expect(globalSection).toContain("'web-framework-react'");
      expect(globalSection).toContain("scope: 'global'");
      expect(projectSection).toContain("'web-framework-react'");
      expect(projectSection).toContain("scope: 'project'");
    });

    it("shows agent in both sections when same agent exists at project and global scope", () => {
      const globalWithAgent = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });
      const projectWithAgent = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      });
      const source = generateConfigSource(projectWithAgent, matrix, {
        isProjectConfig: true,
        globalConfig: globalWithAgent,
      });

      const agentsSection = extractNamedSection(source, "agents");

      const agentMatches = agentsSection.match(/'web-developer'/g);
      expect(agentMatches).toHaveLength(2);

      const { global: globalSection, project: projectSection } =
        extractScopeSections(agentsSection);
      expect(globalSection).toContain("'web-developer'");
      expect(globalSection).toContain("scope: 'global'");
      expect(projectSection).toContain("'web-developer'");
      expect(projectSection).toContain("scope: 'project'");
    });

    it("preserves both scope entries for overlapping skill, non-overlapping skills kept", () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: [],
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
          ...buildSkillConfigs(["web-styling-tailwind"]),
        ],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });

      const skillsSection = extractNamedSection(source, "skills");

      const reactMatches = skillsSection.match(/'web-framework-react'/g);
      expect(reactMatches).toHaveLength(2);

      const { global: globalSection, project: projectSection } =
        extractScopeSections(skillsSection);
      expect(globalSection).toContain("'web-framework-react'");
      expect(globalSection).toContain("scope: 'global'");
      expect(projectSection).toContain("'web-framework-react'");
      expect(projectSection).toContain("scope: 'project'");

      expect(skillsSection).toContain("'web-styling-tailwind'");
    });

    it("emits excluded tombstone in global section when same skill is active at project scope", () => {
      // Global react active; the project carries its tombstone and an active entry.
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: [],
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [
          // Excluded tombstone (masks the global active entry)
          ...buildSkillConfigs(["web-framework-react"], { scope: "global", excluded: true }),
          // Active project entry
          ...buildSkillConfigs(["web-framework-react"], { scope: "project" }),
        ],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, matrix, {
        isProjectConfig: true,
        globalConfig,
      });

      const skillsSection = extractNamedSection(source, "skills");

      // react should appear exactly twice: once excluded in global, once active in project
      const reactMatches = skillsSection.match(/'web-framework-react'/g);
      expect(reactMatches).toHaveLength(2);

      const { global: globalSection, project: projectSection } =
        extractScopeSections(skillsSection);
      expect(globalSection).toContain("excluded: true");

      expect(projectSection).toContain("scope: 'project'");
      expect(projectSection).not.toContain("excluded");
    });
  });

  describe("complex stack", () => {
    it("handles multiple agents with multiple categories each", () => {
      const config = buildProjectConfig({
        name: "complex-stack",
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-styling-tailwind"]),
          ...buildSkillConfigs(["api-framework-hono"]),
          ...buildSkillConfigs(["api-database-drizzle"]),
        ],
        agents: [...buildAgentConfigs(["web-developer"]), ...buildAgentConfigs(["api-developer"])],
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
            "web-styling": [sa("web-styling-tailwind", true)],
          },
          "api-developer": {
            "api-api": [sa("api-framework-hono", false)],
            "api-orm": [sa("api-database-drizzle", false)],
          },
        },
      });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("const stack: Partial<Record<ProjectAgentName, StackAgentConfig>>");
      expect(source).toContain("'web-developer'");
      expect(source).toContain("'api-developer'");
      expect(source).toContain("'web-framework'");
      expect(source).toContain("'web-styling'");
      expect(source).toContain("'api-api'");
      expect(source).toContain("'api-orm'");
      expect(source).toContain("preloaded: true");
      // Non-preloaded single skills should be bare strings inside arrays
      expect(source).toContain("'web-framework-react'");
      expect(source).toContain("'api-framework-hono'");
      expect(source).toContain("'api-database-drizzle'");
    });

    it("handles stack with multiple skills per non-exclusive category", () => {
      const config = buildProjectConfig({
        name: "multi-skill-category",
        skills: [
          ...buildSkillConfigs(["web-testing-vitest"]),
          ...buildSkillConfigs(["web-testing-playwright-e2e"]),
        ],
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-testing": [
              sa("web-testing-vitest", false),
              sa("web-testing-playwright-e2e", false),
            ],
          },
        },
      });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("'web-testing': [");
      expect(source).toContain("'web-testing-vitest'");
      expect(source).toContain("'web-testing-playwright-e2e'");
    });
  });

  describe("empty arrays for skills and agents", () => {
    it("uses inline empty arrays in export default", () => {
      const config = buildProjectConfig({
        name: "empty-arrays",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("skills: [],");
      expect(source).toContain("agents: [],");
    });

    it("does not extract named variables for empty arrays", () => {
      const config = buildProjectConfig({
        name: "no-extraction",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, matrix);
      expect(source).not.toContain("const skills: SkillConfig[]");
      expect(source).not.toContain("const agents: AgentScopeConfig[]");
    });
  });

  describe("syntactic validity", () => {
    /** Strips the TypeScript syntax so `new Function()` can parse the config as JavaScript. */
    function stripTsForEval(source: string): string {
      return source
        .replace(/import type \{[^}]+\} from '\.\/config-types'\n/, "")
        .replace(/ satisfies ProjectConfig/, "")
        .replace(/const (\w+): [^=]+=/g, "const $1 =")
        .replace("export default", "const __config =");
    }

    it("generates parseable JavaScript when type annotations are stripped", () => {
      const config = buildProjectConfig({
        name: "valid-js",
        skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
        agents: buildAgentConfigs(["web-developer", "api-developer"]),
        selectedDomains: ["web", "api"],
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", false)],
          },
        },
      });
      const source = stripTsForEval(generateConfigSource(config, matrix));

      expect(() => {
        new Function(source);
      }).not.toThrow();
    });

    it("generates valid output for minimal config", () => {
      const config = buildProjectConfig({ name: "minimal", skills: [], agents: [] });
      const source = stripTsForEval(generateConfigSource(config, matrix));

      expect(() => {
        new Function(source);
      }).not.toThrow();
    });

    it("generates valid output for complex config", () => {
      const config = buildProjectConfig({
        name: "complex-valid",
        description: "A complex project",
        author: "@tester",
        skills: [
          ...buildSkillConfigs(["web-framework-react"], { scope: "global" }),
          ...buildSkillConfigs(["api-framework-hono"], { scope: "project" }),
        ],
        agents: [
          ...buildAgentConfigs(["web-developer"], { scope: "global" }),
          ...buildAgentConfigs(["api-developer"], { scope: "project" }),
        ],
        selectedDomains: ["web", "api"],
        stack: {
          "web-developer": {
            "web-framework": [sa("web-framework-react", true)],
          },
          "api-developer": {
            "api-api": [sa("api-framework-hono", false)],
          },
        },
      });
      const source = stripTsForEval(generateConfigSource(config, matrix));

      expect(() => {
        new Function(source);
      }).not.toThrow();
    });
  });

  describe("satisfies type assertion", () => {
    it("always ends export default with satisfies ProjectConfig", () => {
      const config = buildProjectConfig();
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("} satisfies ProjectConfig");
    });

    it("contains satisfies for empty config", () => {
      const config = buildProjectConfig({ name: "empty", skills: [], agents: [] });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("} satisfies ProjectConfig");
    });
  });

  describe("scalar fields", () => {
    it("serializes description and author", () => {
      const config = buildProjectConfig({
        name: "with-meta",
        description: "A test project",
        author: "@tester",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("description: 'A test project'");
      expect(source).toContain("author: '@tester'");
    });

    it("serializes the marketplace ref and the marketplace name", () => {
      const config = buildProjectConfig({
        name: "with-source",
        marketplace: "/path/to/skills",
        marketplaceName: "custom-marketplace",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, matrix);
      expect(source).toContain("marketplace: '/path/to/skills'");
      expect(source).toContain("marketplaceName: 'custom-marketplace'");
    });
  });

  /** The same values owe the same bytes, however the in-memory object was assembled. */
  describe("field order follows the config's values, not the object's insertion order", () => {
    it("emits the same bytes for two configs that differ only in key insertion order", () => {
      const author = "@tester";
      const skillsSource = "/path/to/skills";
      const sourceFirst = generateConfigSource(
        buildProjectConfig({ name: "insertion-order", marketplace: skillsSource, author }),
        matrix,
      );
      const authorFirst = generateConfigSource(
        buildProjectConfig({ name: "insertion-order", author, marketplace: skillsSource }),
        matrix,
      );

      // Subject guard: both carry both scalars.
      expect(sourceFirst).toContain(`author: '${author}'`);
      expect(sourceFirst).toContain(`marketplace: '${skillsSource}'`);
      expect(authorFirst, "config.ts bytes must be decided by the config's values alone").toBe(
        sourceFirst,
      );
    });

    it("emits the inlined global and project scalars as one order, whichever half carried them", () => {
      const globalConfig = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-researcher"], { scope: "global" }),
        author: "@tester",
        marketplace: "/path/to/skills",
        marketplaceName: "agents-inc",
      });
      // The same values split two ways, which is a load/re-emit round trip.
      const inheritsMostScalars = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
        marketplace: "/path/to/skills",
      });
      const carriesEveryScalar = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
        author: "@tester",
        marketplace: "/path/to/skills",
        marketplaceName: "agents-inc",
      });

      const beforeRoundTrip = generateConfigSource(inheritsMostScalars, matrix, {
        isProjectConfig: true,
        globalConfig,
      });
      const afterRoundTrip = generateConfigSource(carriesEveryScalar, matrix, {
        isProjectConfig: true,
        globalConfig,
      });

      // Subject guard: the merged union really is all three scalars.
      expect(beforeRoundTrip).toContain("author: '@tester'");
      expect(beforeRoundTrip).toContain("marketplace: '/path/to/skills'");
      expect(beforeRoundTrip).toContain("marketplaceName: 'agents-inc'");
      expect(
        afterRoundTrip,
        "the inlined scalar union must be one ordered sequence, not a global block then a project block",
      ).toBe(beforeRoundTrip);
    });
  });

  /**
   * A compiled sub-agent lists dynamic skills in stack order, so key order must follow the roster.
   */
  describe("stack key order follows the roster, not the producer's insertion order", () => {
    /** Both sub-agents' curation, with every key in the order the roster declares it. */
    const IN_ROSTER_ORDER = {
      "api-developer": {
        "api-api": [sa("api-framework-hono", true)],
        "api-orm": [sa("api-database-drizzle", false)],
      },
      "web-developer": {
        "web-framework": [sa("web-framework-react", true)],
        "web-client-state": [sa("web-state-zustand", false)],
        "web-testing": [sa("web-testing-vitest", false)],
      },
    } satisfies NonNullable<ProjectConfig["stack"]>;

    /** The same curation, keyed in the order a shared payload's skill list produces. */
    const IN_PAYLOAD_ORDER = {
      "web-developer": {
        "web-framework": [sa("web-framework-react", true)],
        "web-testing": [sa("web-testing-vitest", false)],
        "web-client-state": [sa("web-state-zustand", false)],
      },
      "api-developer": {
        "api-orm": [sa("api-database-drizzle", false)],
        "api-api": [sa("api-framework-hono", true)],
      },
    } satisfies NonNullable<ProjectConfig["stack"]>;

    function configWithStack(stack: NonNullable<ProjectConfig["stack"]>): ProjectConfig {
      return buildProjectConfig({
        name: "stack-key-order",
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-state-zustand"]),
          ...buildSkillConfigs(["web-testing-vitest"]),
          ...buildSkillConfigs(["api-framework-hono"]),
          ...buildSkillConfigs(["api-database-drizzle"]),
        ],
        agents: [...buildAgentConfigs(["web-developer"]), ...buildAgentConfigs(["api-developer"])],
        stack,
      });
    }

    it("emits the same bytes for two stacks that differ only in key insertion order", () => {
      const fromRoster = generateConfigSource(configWithStack(IN_ROSTER_ORDER), matrix);
      const fromPayload = generateConfigSource(configWithStack(IN_PAYLOAD_ORDER), matrix);

      // Subject guard: both carry the whole curation.
      expect(fromRoster).toContain(
        "const stack: Partial<Record<ProjectAgentName, StackAgentConfig>>",
      );
      expect(fromRoster).toContain("'web-client-state'");
      expect(fromPayload, "config.ts bytes must be decided by the stack's content alone").toBe(
        fromRoster,
      );
    });

    it("emits each sub-agent in name order, and its categories in the matrix's declaration order", () => {
      const source = generateConfigSource(configWithStack(IN_PAYLOAD_ORDER), matrix);

      expect(source).toContain(`const stack: Partial<Record<ProjectAgentName, StackAgentConfig>> = {
  'api-developer': {
    'api-api': { id: 'api-framework-hono', preloaded: true },
    'api-orm': 'api-database-drizzle',
  },
  'web-developer': {
    'web-framework': { id: 'web-framework-react', preloaded: true },
    'web-client-state': 'web-state-zustand',
    'web-testing': ['web-testing-vitest'],
  },
}`);
    });
  });
});

describe("generateBlankGlobalConfigSource", () => {
  it("generates a config with name 'global'", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source).toContain("name: 'global'");
  });

  it("has empty skills, agents, and selectedDomains arrays", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source).toContain("skills: []");
    expect(source).toContain("agents: []");
    expect(source).toContain("selectedDomains: []");
  });

  it("contains import type from config-types", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source).toContain("import type { ProjectConfig } from './config-types'");
  });

  it("contains satisfies ProjectConfig", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source).toContain("satisfies ProjectConfig");
  });

  it("ends with a trailing newline", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source.endsWith("\n")).toBe(true);
  });

  it("generates parseable JavaScript when type annotations are stripped", () => {
    let source = generateBlankGlobalConfigSource();
    source = source.replace(/import type \{[^}]+\} from '\.\/config-types'\n/, "");
    source = source.replace(/ satisfies ProjectConfig/, "");
    source = source.replace("export default", "const __config =");

    expect(() => {
      new Function(source);
    }).not.toThrow();
  });
});

describe("generateBlankGlobalConfigTypesSource", () => {
  it("marks all union types as never", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export type SkillId = never");
    expect(source).toContain("export type AgentName = never");
    expect(source).toContain("export type Domain = never");
    expect(source).toContain("export type Category = never");
  });

  it("includes SelectedAgentName = never for blank global config", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export type SelectedAgentName = never");
  });

  it("includes ProjectAgentName = SelectedAgentName for blank global config", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export type ProjectAgentName = SelectedAgentName");
  });

  it("contains auto-generated header", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("AUTO-GENERATED by agents-inc");
    expect(source).toContain("DO NOT EDIT");
  });

  it("contains StackAgentConfig type", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export type StackAgentConfig");
  });

  it("contains ProjectConfig interface", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export interface ProjectConfig");
  });

  it("contains SkillConfig type", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export type SkillConfig");
  });

  it("contains AgentScopeConfig type", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export type AgentScopeConfig");
  });

  it("contains SkillAssignment type", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export type SkillAssignment");
  });
});
