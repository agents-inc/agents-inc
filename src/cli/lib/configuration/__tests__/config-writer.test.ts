import os from "os";
import path from "path";
import { describe, it, expect } from "vitest";
import {
  generateConfigSource,
  generateBlankGlobalConfigSource,
  generateBlankGlobalConfigTypesSource,
  getGlobalConfigImportPath,
} from "../config-writer";
import { buildSkillConfigs } from "../../__tests__/helpers/wizard-simulation.js";
import {
  buildProjectConfig,
  buildAgentConfigs,
} from "../../__tests__/factories/config-factories.js";
import { CLAUDE_SRC_DIR } from "../../../consts";
import { EXPECTED_SKILLS } from "../../__tests__/expected-values";
import {
  extractNamedSection,
  extractScopeSections,
} from "../../__tests__/helpers/config-source-sections.js";

describe("generateConfigSource", () => {
  it("produces valid TypeScript with import type, export default, and named variables", () => {
    const config = buildProjectConfig();
    const source = generateConfigSource(config);
    expect(source).not.toContain("defineConfig");
    expect(source).toContain('from "./config-types"');
    expect(source).toContain("export default {");
    expect(source).toContain("satisfies ProjectConfig;");
    expect(source).toContain('"name": "test-project"');
    // Named variables below export default
    expect(source).toContain("const skills: SkillConfig[]");
    expect(source).toContain("const agents: AgentScopeConfig[]");
  });

  it("puts named variables before export default", () => {
    const config = buildProjectConfig();
    const source = generateConfigSource(config);
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
      description: undefined,
      author: undefined,
    });
    const source = generateConfigSource(config);
    expect(source).not.toContain("description");
    expect(source).not.toContain("author");
    expect(source).toContain('"name": "sparse-project"');
  });

  it("uses inline empty arrays for empty skills/agents", () => {
    const config = buildProjectConfig({
      name: "sparse-project",
      agents: [],
      skills: [],
    });
    const source = generateConfigSource(config);
    // Empty arrays should be inline, not extracted
    expect(source).toContain("skills: [],");
    expect(source).toContain("agents: [],");
    expect(source).not.toContain("const skills:");
    expect(source).not.toContain("const agents:");
  });

  it("compacts stack with bare strings in arrays for non-preloaded skills", () => {
    const config = buildProjectConfig({
      name: "stack-project",
      stack: {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      },
    });
    const source = generateConfigSource(config);
    // Non-preloaded single skill should be a bare string inside an array
    expect(source).toContain('"web-framework": [\n      "web-framework-react"\n    ]');
    // Stack should be extracted as named variable
    expect(source).toContain("const stack: Partial<Record<ProjectAgentName, StackAgentConfig>>");
  });

  it("preserves preloaded flag as object in stack", () => {
    const config = buildProjectConfig({
      name: "preloaded-project",
      agents: buildAgentConfigs(["api-developer"]),
      skills: buildSkillConfigs([...EXPECTED_SKILLS.API_DEFAULT]),
      stack: {
        "api-developer": {
          "api-api": [{ id: "api-framework-hono", preloaded: true }],
        },
      },
    });
    const source = generateConfigSource(config);
    expect(source).toContain('"preloaded": true');
    expect(source).toContain('"api-framework-hono"');
  });

  it("handles config without stack", () => {
    const config = buildProjectConfig({ name: "simple-project" });
    const source = generateConfigSource(config);
    expect(source).not.toContain("const stack:");
    expect(source).not.toContain("stack,");
  });

  it("only imports used types", () => {
    // Empty skills/agents, no stack, no domains: only ProjectConfig needed
    const config = buildProjectConfig({ name: "minimal", agents: [], skills: [] });
    const source = generateConfigSource(config);
    const importLine = source.split("\n")[0];
    expect(importLine).toBe('import type { ProjectConfig } from "./config-types";');
    expect(source).not.toContain("defineConfig");
    expect(source).not.toContain("@agents-inc/cli/config");
  });

  it("imports SkillConfig and AgentScopeConfig when skills and agents are present", () => {
    const config = buildProjectConfig();
    const source = generateConfigSource(config);
    expect(source).toContain("SkillConfig");
    expect(source).toContain("AgentScopeConfig");
  });

  it("imports ProjectAgentName, SelectedAgentName, and StackAgentConfig when stack is present", () => {
    const config = buildProjectConfig({
      stack: {
        "web-developer": {
          "web-framework": [{ id: "web-framework-react", preloaded: false }],
        },
      },
    });
    const source = generateConfigSource(config);
    expect(source).toContain("ProjectAgentName");
    expect(source).toContain("SelectedAgentName");
    expect(source).toContain("StackAgentConfig");
  });

  it("imports Domain when domains are present", () => {
    const config = buildProjectConfig({ domains: ["web"] });
    const source = generateConfigSource(config);
    expect(source).toContain("Domain");
    expect(source).toContain('const domains: Domain[] = ["web"]');
  });

  it("extracts domains as named variable", () => {
    const config = buildProjectConfig({ domains: ["web", "api"] });
    const source = generateConfigSource(config);
    expect(source).toContain("const domains: Domain[]");
    expect(source).toContain('"web"');
    expect(source).toContain('"api"');
    // In export default, domains should be a shorthand reference
    const exportBlock = source.slice(
      source.indexOf("export default"),
      source.indexOf("satisfies ProjectConfig;"),
    );
    expect(exportBlock).toContain("domains,");
  });

  describe("empty config", () => {
    it("handles config with no skills, no agents, no domains, no stack", () => {
      const config = buildProjectConfig({
        name: "empty-project",
        skills: [],
        agents: [],
        domains: undefined,
        stack: undefined,
      });
      const source = generateConfigSource(config);
      expect(source).toContain('"name": "empty-project"');
      expect(source).toContain("skills: [],");
      expect(source).toContain("agents: [],");
      expect(source).not.toContain("const stack:");
      expect(source).not.toContain("const domains:");
      expect(source).toContain("satisfies ProjectConfig;");
      // Only ProjectConfig type should be imported
      const importLine = source.split("\n")[0];
      expect(importLine).toBe('import type { ProjectConfig } from "./config-types";');
    });

    it("does not emit domains field when domains is undefined", () => {
      const config = buildProjectConfig({
        name: "test-empty",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config);
      expect(source).not.toContain("domains");
    });

    it("handles empty domains array", () => {
      const config = buildProjectConfig({
        name: "empty-domains",
        skills: [],
        agents: [],
        domains: [],
      });
      const source = generateConfigSource(config);
      // Empty domains array: inline empty in export default, no extracted variable
      expect(source).toContain("domains: [],");
      expect(source).not.toContain("const domains:");
    });
  });

  describe("global-scope items", () => {
    it("serializes skills with global scope", () => {
      const config = buildProjectConfig({
        name: "global-project",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
      });
      const source = generateConfigSource(config);
      expect(source).toContain('"scope":"global"');
      expect(source).toContain('"id":"web-framework-react"');
    });

    it("serializes agents with global scope", () => {
      const config = buildProjectConfig({
        name: "global-agents",
        skills: [],
        agents: buildAgentConfigs(["web-developer", "api-developer"], { scope: "global" }),
      });
      const source = generateConfigSource(config);
      // Each agent object should contain scope: "global"
      const agentSection = extractNamedSection(source, "agents");
      expect(agentSection).toContain('"scope":"global"');
      expect(agentSection).toContain('"name":"web-developer"');
      expect(agentSection).toContain('"name":"api-developer"');
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
      const source = generateConfigSource(config);
      // Both scopes should appear in the output
      const globalCount = (source.match(/"scope":"global"/g) || []).length;
      const projectCount = (source.match(/"scope":"project"/g) || []).length;
      expect(globalCount).toBe(2); // 1 skill + 1 agent
      expect(projectCount).toBe(2); // 1 skill + 1 agent
    });
  });

  describe("special characters in name", () => {
    it("escapes double quotes in project name", () => {
      const config = buildProjectConfig({
        name: 'my "quoted" project',
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config);
      // JSON.stringify escapes quotes
      expect(source).toContain('"name": "my \\"quoted\\" project"');
    });

    it("escapes backslashes in project name", () => {
      const config = buildProjectConfig({
        name: "my\\backslash\\project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config);
      // JSON.stringify escapes backslashes
      expect(source).toContain("my\\\\backslash\\\\project");
    });

    it("handles names with unicode characters", () => {
      const config = buildProjectConfig({
        name: "projet-francais",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config);
      expect(source).toContain('"name": "projet-francais"');
      expect(source).toContain("satisfies ProjectConfig;");
    });
  });

  describe("standalone generation (no global import)", () => {
    it("does not import from global config when isProjectConfig is not set", () => {
      const config = buildProjectConfig();
      const source = generateConfigSource(config);
      expect(source).not.toContain("globalConfig");
      expect(source).not.toContain("...globalConfig");
      expect(source).toContain('from "./config-types"');
    });

    it("does not import from global config when options is undefined", () => {
      const config = buildProjectConfig();
      const source = generateConfigSource(config, undefined);
      expect(source).not.toContain("globalConfig");
    });

    it("does not import from global config when isProjectConfig is false", () => {
      const config = buildProjectConfig();
      const source = generateConfigSource(config, { isProjectConfig: false });
      expect(source).not.toContain("globalConfig");
    });
  });

  describe("project config with global import (spread fallback)", () => {
    it("imports from global config when isProjectConfig is true without globalConfig", () => {
      const config = buildProjectConfig();
      const source = generateConfigSource(config, { isProjectConfig: true });
      expect(source).toContain("import globalConfig from");
      expect(source).toContain("...globalConfig,");
    });

    it("spreads global skills and agents into project arrays", () => {
      const config = buildProjectConfig({
        name: "project-with-global",
        skills: buildSkillConfigs(["web-framework-react"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(config, { isProjectConfig: true });
      expect(source).toContain("...globalConfig.skills,");
      expect(source).toContain("...globalConfig.agents,");
    });

    it("always declares skills and agents variables even when empty", () => {
      const config = buildProjectConfig({
        name: "project-empty",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, { isProjectConfig: true });
      expect(source).toContain("const skills: SkillConfig[]");
      expect(source).toContain("const agents: AgentScopeConfig[]");
      expect(source).toContain("...globalConfig.skills,");
      expect(source).toContain("...globalConfig.agents,");
    });

    it("spreads global domains when project has domains", () => {
      const config = buildProjectConfig({
        name: "project-domains",
        skills: [],
        agents: [],
        domains: ["web"],
      });
      const source = generateConfigSource(config, { isProjectConfig: true });
      expect(source).toContain("...(globalConfig.domains ?? []),");
      expect(source).toContain('"web"');
    });

    it("does not declare domains variable when project has no domains", () => {
      const config = buildProjectConfig({
        name: "project-no-domains",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, { isProjectConfig: true });
      expect(source).not.toContain("const domains:");
    });

    it("extracts selectedAgents as named constant when project has selectedAgents", () => {
      const config = buildProjectConfig({
        name: "project-agents",
        skills: [],
        agents: [],
        selectedAgents: ["web-developer"],
      });
      const source = generateConfigSource(config, { isProjectConfig: true });
      expect(source).toContain(
        'const selectedAgents: SelectedAgentName[] = [...(globalConfig.selectedAgents ?? []), "web-developer"]',
      );
      expect(source).toContain("  selectedAgents,");
    });

    it("uses default plugin name when config name is 'global'", () => {
      const config = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config, { isProjectConfig: true });
      expect(source).toContain('name: "agents-inc"');
    });
  });

  describe("project config with inlined global", () => {
    const globalConfig = buildProjectConfig({
      name: "global",
      skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
      agents: buildAgentConfigs(["web-reviewer"], { scope: "global" }),
      source: "/path/to/skills",
      marketplace: "agents-inc",
    });

    it("does not generate import globalConfig line when globalConfig is provided", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).not.toContain("import globalConfig");
      expect(source).not.toContain("...globalConfig");
    });

    it("inlines global skills with // global comment", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain("// global");
      expect(source).toContain('"web-framework-react"');
      expect(source).toContain('"scope":"global"');
    });

    it("inlines global agents with // global comment", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });
      const agentsSection = extractNamedSection(source, "agents");
      expect(agentsSection).toContain("// global");
      expect(agentsSection).toContain('"web-reviewer"');
    });

    it("adds // project comment only when project items exist", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain("// project");
      expect(source).toContain('"web-styling-tailwind"');
      expect(source).toContain('"web-developer"');
    });

    it("omits // project comment when no project skills exist", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, {
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
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain('"source": "/path/to/skills"');
      expect(source).toContain('"marketplace": "agents-inc"');
    });

    it("uses project name instead of global name", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain('name: "my-project"');
      expect(source).not.toContain('"name": "global"');
    });

    it("uses default plugin name when project name is 'global'", () => {
      const projectConfig = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain('name: "agents-inc"');
    });

    it("merges global and project selectedAgents as named constant", () => {
      const globalWithAgents = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-reviewer"], { scope: "global" }),
        selectedAgents: ["web-reviewer"],
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
        selectedAgents: ["web-developer"],
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig: globalWithAgents,
      });
      expect(source).toContain(
        'const selectedAgents: SelectedAgentName[] = ["web-reviewer", "web-developer"]',
      );
      expect(source).toContain("  selectedAgents,");
    });

    it("merges global and project domains", () => {
      const globalWithDomains = buildProjectConfig({
        name: "global",
        skills: [],
        agents: [],
        domains: ["web"],
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
        domains: ["api"],
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig: globalWithDomains,
      });
      expect(source).toContain('"web"');
      expect(source).toContain('"api"');
      expect(source).toContain("const domains: Domain[]");
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
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig: emptyGlobal,
      });
      expect(source).not.toContain("// global");
      expect(source).toContain("// project");
      expect(source).toContain('"web-framework-react"');
    });

    it("generates valid JavaScript when type annotations are stripped", () => {
      const projectConfig = buildProjectConfig({
        name: "valid-inlined",
        skills: buildSkillConfigs(["web-styling-tailwind"]),
        agents: buildAgentConfigs(["web-developer"]),
      });
      let source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });
      source = source
        .replace(/import type \{[^}]+\} from "\.\/config-types";\n/, "")
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
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });
      expect(source).toContain("} satisfies ProjectConfig;");
    });

    it("excludes global agent stack entries from inlined project config", () => {
      const globalWithStack = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs([...EXPECTED_SKILLS.API_DEFAULT]),
        agents: buildAgentConfigs(["api-developer"]),
        stack: {
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: false }],
          },
        },
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig: globalWithStack,
      });

      // Project agents should appear in stack
      expect(source).toContain('"api-developer"');
      expect(source).toContain('"api-framework-hono"');
      // Global agents' stack entries should NOT appear (they live in global config only)
      expect(source).not.toMatch(/"web-developer":\s*\{/);
    });

    it("omits stack when only global agents have stack entries", () => {
      const globalWithStack = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react"], { scope: "global" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(projectConfig, {
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
        source: "/global/skills",
        marketplace: "agents-inc",
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [],
        agents: [],
        source: "/project/skills",
        marketplace: "custom-marketplace",
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig: globalWithSource,
      });

      // Project values should appear (they take precedence)
      expect(source).toContain('"source": "/project/skills"');
      expect(source).toContain('"marketplace": "custom-marketplace"');

      // Global values should NOT appear (overridden by project)
      expect(source).not.toContain('"source": "/global/skills"');
      expect(source).not.toContain('"marketplace": "agents-inc"');

      // Each key should appear exactly once in the export default block
      const exportBlock = source.slice(source.indexOf("export default {"));
      const sourceMatches = exportBlock.match(/"source":/g);
      const marketplaceMatches = exportBlock.match(/"marketplace":/g);
      expect(sourceMatches).toHaveLength(1);
      expect(marketplaceMatches).toHaveLength(1);
    });

    it("preserves single-skill categories as one-element arrays in inlined stack", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs(["web-framework-react"]),
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig: buildProjectConfig({ name: "global", skills: [], agents: [] }),
      });

      const stackSection = extractNamedSection(source, "stack");
      // Single-skill category must remain an array, not a bare string
      expect(stackSection).toContain('"web-framework": [\n');
      expect(stackSection).toContain('"web-framework-react"');
      // Must NOT be a bare value like "web-framework": "web-framework-react"
      expect(stackSection).not.toMatch(/"web-framework":\s*"web-framework-react"/);
    });

    it("preserves multi-skill categories as multi-element arrays in inlined stack", () => {
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-framework-svelte"]),
        ],
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": [
              { id: "web-framework-react", preloaded: false },
              { id: "web-framework-svelte", preloaded: false },
            ],
          },
        },
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig: buildProjectConfig({ name: "global", skills: [], agents: [] }),
      });

      const stackSection = extractNamedSection(source, "stack");
      // Multi-skill category must be an array with both elements
      expect(stackSection).toContain('"web-framework": [\n');
      expect(stackSection).toContain('"web-framework-react"');
      expect(stackSection).toContain('"web-framework-svelte"');
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
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-styling": [{ id: "web-styling-tailwind", preloaded: true }],
          },
        },
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig: buildProjectConfig({ name: "global", skills: [], agents: [] }),
      });

      const stackSection = extractNamedSection(source, "stack");
      // Non-preloaded: bare string in array (no object wrapper)
      expect(stackSection).toContain('"web-framework": [\n');
      const frameworkArray = stackSection.slice(
        stackSection.indexOf('"web-framework": ['),
        stackSection.indexOf("]", stackSection.indexOf('"web-framework": [')) + 1,
      );
      expect(frameworkArray).toContain('"web-framework-react"');
      expect(frameworkArray).not.toContain('"preloaded"');
      expect(frameworkArray).not.toContain('"id"');
      // Preloaded: object with preloaded: true in array
      expect(stackSection).toContain('"web-styling": [\n');
      expect(stackSection).toContain('"preloaded": true');
      expect(stackSection).toContain('"id": "web-styling-tailwind"');
    });

    it("never leaks global agent stack entries into project config", () => {
      const globalWithStack = buildProjectConfig({
        name: "global",
        skills: buildSkillConfigs(["web-framework-react", "web-styling-tailwind"], {
          scope: "global",
        }),
        agents: buildAgentConfigs(["web-developer", "web-reviewer"], { scope: "global" }),
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-styling": [{ id: "web-styling-tailwind", preloaded: false }],
          },
          "web-reviewer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const projectConfig = buildProjectConfig({
        name: "my-project",
        skills: buildSkillConfigs([...EXPECTED_SKILLS.API_DEFAULT]),
        agents: buildAgentConfigs(["api-developer"]),
        stack: {
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: false }],
          },
        },
      });
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig: globalWithStack,
      });

      // Project agent stack entries must be present
      expect(source).toContain("const stack:");
      expect(source).toContain('"api-developer"');
      expect(source).toContain('"api-framework-hono"');

      // Extract stack section to check it doesn't contain global agent entries
      const stackSection = extractNamedSection(source, "stack");
      // Global agent stack entries must NOT be present in stack
      expect(stackSection).not.toMatch(/"web-developer":\s*\{/);
      expect(stackSection).not.toMatch(/"web-reviewer":\s*\{/);
      expect(stackSection).not.toContain('"web-framework-react"');
      expect(stackSection).not.toContain('"web-styling-tailwind"');
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
      const source = generateConfigSource(projectWithReact, {
        isProjectConfig: true,
        globalConfig: globalWithReact,
      });

      const skillsSection = extractNamedSection(source, "skills");

      // React should appear in both global and project sections
      const reactMatches = skillsSection.match(/"web-framework-react"/g);
      expect(reactMatches).toHaveLength(2);

      // Global entry appears in the global section
      const { global: globalSection, project: projectSection } =
        extractScopeSections(skillsSection);
      expect(globalSection).toContain('"web-framework-react"');
      expect(globalSection).toContain('"scope":"global"');
      // Project entry appears in the project section
      expect(projectSection).toContain('"web-framework-react"');
      expect(projectSection).toContain('"scope":"project"');
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
      const source = generateConfigSource(projectWithAgent, {
        isProjectConfig: true,
        globalConfig: globalWithAgent,
      });

      const agentsSection = extractNamedSection(source, "agents");

      // web-developer should appear in both global and project sections
      const agentMatches = agentsSection.match(/"web-developer"/g);
      expect(agentMatches).toHaveLength(2);

      // Global entry appears in the global section, project entry in the project section
      const { global: globalSection, project: projectSection } =
        extractScopeSections(agentsSection);
      expect(globalSection).toContain('"web-developer"');
      expect(globalSection).toContain('"scope":"global"');
      expect(projectSection).toContain('"web-developer"');
      expect(projectSection).toContain('"scope":"project"');
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
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });

      const skillsSection = extractNamedSection(source, "skills");

      // React should appear in both global and project sections
      const reactMatches = skillsSection.match(/"web-framework-react"/g);
      expect(reactMatches).toHaveLength(2);

      // Global entry in global section, project entry in project section
      const { global: globalSection, project: projectSection } =
        extractScopeSections(skillsSection);
      expect(globalSection).toContain('"web-framework-react"');
      expect(globalSection).toContain('"scope":"global"');
      expect(projectSection).toContain('"web-framework-react"');
      expect(projectSection).toContain('"scope":"project"');

      // Tailwind should still be present (no conflict)
      expect(skillsSection).toContain('"web-styling-tailwind"');
    });

    it("emits excluded tombstone in global section when same skill is active at project scope", () => {
      // Edge case: global has react active, project has react excluded (tombstone) AND react active
      // Expected: global section shows the excluded tombstone, project section shows the active entry
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
      const source = generateConfigSource(projectConfig, {
        isProjectConfig: true,
        globalConfig,
      });

      const skillsSection = extractNamedSection(source, "skills");

      // react should appear exactly twice: once excluded in global, once active in project
      const reactMatches = skillsSection.match(/"web-framework-react"/g);
      expect(reactMatches).toHaveLength(2);

      // Global section should contain the excluded tombstone
      const { global: globalSection, project: projectSection } =
        extractScopeSections(skillsSection);
      expect(globalSection).toContain('"excluded":true');

      // Project section should contain the active entry without excluded flag
      expect(projectSection).toContain('"scope":"project"');
      expect(projectSection).not.toContain('"excluded"');
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
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
            "web-styling": [{ id: "web-styling-tailwind", preloaded: true }],
          },
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: false }],
            "api-database": [{ id: "api-database-drizzle", preloaded: false }],
          },
        },
      });
      const source = generateConfigSource(config);
      // Stack should be extracted as named variable
      expect(source).toContain("const stack: Partial<Record<ProjectAgentName, StackAgentConfig>>");
      // Both agents should appear in stack
      expect(source).toContain('"web-developer"');
      expect(source).toContain('"api-developer"');
      // Categories should appear
      expect(source).toContain('"web-framework"');
      expect(source).toContain('"web-styling"');
      expect(source).toContain('"api-api"');
      expect(source).toContain('"api-database"');
      // Preloaded skill should retain object format
      expect(source).toContain('"preloaded": true');
      // Non-preloaded single skills should be bare strings inside arrays
      expect(source).toContain('"web-framework-react"');
      expect(source).toContain('"api-framework-hono"');
      expect(source).toContain('"api-database-drizzle"');
    });

    it("handles stack with multiple skills per category", () => {
      const config = buildProjectConfig({
        name: "multi-skill-category",
        skills: [
          ...buildSkillConfigs(["web-framework-react"]),
          ...buildSkillConfigs(["web-meta-framework-nextjs"]),
        ],
        agents: buildAgentConfigs(["web-developer"]),
        stack: {
          "web-developer": {
            "web-framework": [
              { id: "web-framework-react", preloaded: false },
              { id: "web-meta-framework-nextjs", preloaded: false },
            ],
          },
        },
      });
      const source = generateConfigSource(config);
      // Multiple skills should be an array of bare strings
      expect(source).toContain('"web-framework-react"');
      expect(source).toContain('"web-meta-framework-nextjs"');
    });
  });

  describe("empty arrays for skills and agents", () => {
    it("uses inline empty arrays in export default", () => {
      const config = buildProjectConfig({
        name: "empty-arrays",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config);
      expect(source).toContain("skills: [],");
      expect(source).toContain("agents: [],");
    });

    it("does not extract named variables for empty arrays", () => {
      const config = buildProjectConfig({
        name: "no-extraction",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config);
      expect(source).not.toContain("const skills: SkillConfig[]");
      expect(source).not.toContain("const agents: AgentScopeConfig[]");
    });
  });

  describe("syntactic validity", () => {
    /**
     * Strips TypeScript-specific syntax so the generated config can be
     * evaluated as plain JavaScript inside `new Function()`.
     * - Removes import type statements
     * - Removes `satisfies ProjectConfig`
     * - Strips type annotations from const declarations
     * - Replaces `export default` with a variable assignment
     */
    function stripTsForEval(source: string): string {
      return source
        .replace(/import type \{[^}]+\} from "\.\/config-types";\n/, "")
        .replace(/ satisfies ProjectConfig/, "")
        .replace(/const (\w+): [^=]+=/g, "const $1 =")
        .replace("export default", "const __config =");
    }

    it("generates parseable JavaScript when type annotations are stripped", () => {
      const config = buildProjectConfig({
        name: "valid-js",
        skills: buildSkillConfigs(["web-framework-react", "api-framework-hono"]),
        agents: buildAgentConfigs(["web-developer", "api-developer"]),
        domains: ["web", "api"],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: false }],
          },
        },
      });
      const source = stripTsForEval(generateConfigSource(config));

      // Should not throw when evaluated as JavaScript
      expect(() => {
        new Function(source);
      }).not.toThrow();
    });

    it("generates valid output for minimal config", () => {
      const config = buildProjectConfig({ name: "minimal", skills: [], agents: [] });
      const source = stripTsForEval(generateConfigSource(config));

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
        domains: ["web", "api"],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
          },
          "api-developer": {
            "api-api": [{ id: "api-framework-hono", preloaded: false }],
          },
        },
      });
      const source = stripTsForEval(generateConfigSource(config));

      expect(() => {
        new Function(source);
      }).not.toThrow();
    });
  });

  describe("satisfies type assertion", () => {
    it("always ends export default with satisfies ProjectConfig", () => {
      const config = buildProjectConfig();
      const source = generateConfigSource(config);
      expect(source).toContain("} satisfies ProjectConfig;");
    });

    it("contains satisfies for empty config", () => {
      const config = buildProjectConfig({ name: "empty", skills: [], agents: [] });
      const source = generateConfigSource(config);
      expect(source).toContain("} satisfies ProjectConfig;");
    });

    it("contains satisfies for project config mode", () => {
      const config = buildProjectConfig();
      const source = generateConfigSource(config, { isProjectConfig: true });
      expect(source).toContain("} satisfies ProjectConfig;");
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
      const source = generateConfigSource(config);
      expect(source).toContain('"description": "A test project"');
      expect(source).toContain('"author": "@tester"');
    });

    it("serializes source and marketplace fields", () => {
      const config = buildProjectConfig({
        name: "with-source",
        source: "/path/to/skills",
        marketplace: "custom-marketplace",
        skills: [],
        agents: [],
      });
      const source = generateConfigSource(config);
      expect(source).toContain('"source": "/path/to/skills"');
      expect(source).toContain('"marketplace": "custom-marketplace"');
    });
  });
});

describe("generateBlankGlobalConfigSource", () => {
  it("generates a config with name 'global'", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source).toContain('"name": "global"');
  });

  it("has empty skills, agents, and domains arrays", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source).toContain('"skills": []');
    expect(source).toContain('"agents": []');
    expect(source).toContain('"domains": []');
  });

  it("contains import type from config-types", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source).toContain('import type { ProjectConfig } from "./config-types"');
  });

  it("contains satisfies ProjectConfig", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source).toContain("satisfies ProjectConfig;");
  });

  it("ends with a trailing newline", () => {
    const source = generateBlankGlobalConfigSource();
    expect(source.endsWith("\n")).toBe(true);
  });

  it("generates parseable JavaScript when type annotations are stripped", () => {
    let source = generateBlankGlobalConfigSource();
    source = source.replace(/import type \{[^}]+\} from "\.\/config-types";\n/, "");
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
    expect(source).toContain("export type SkillId = never;");
    expect(source).toContain("export type AgentName = never;");
    expect(source).toContain("export type Domain = never;");
    expect(source).toContain("export type Category = never;");
  });

  it("includes SelectedAgentName = never for blank global config", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export type SelectedAgentName = never;");
  });

  it("includes ProjectAgentName = SelectedAgentName for blank global config", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("export type ProjectAgentName = SelectedAgentName;");
  });

  it("contains auto-generated header", () => {
    const source = generateBlankGlobalConfigTypesSource();
    expect(source).toContain("AUTO-GENERATED by agentsinc");
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

describe("getGlobalConfigImportPath", () => {
  it("returns a path under the home directory", () => {
    const importPath = getGlobalConfigImportPath();
    expect(importPath.startsWith(os.homedir())).toBe(true);
  });

  it("includes the claude-src directory", () => {
    const importPath = getGlobalConfigImportPath();
    expect(importPath).toContain(CLAUDE_SRC_DIR);
  });

  it("returns an absolute path", () => {
    const importPath = getGlobalConfigImportPath();
    expect(path.isAbsolute(importPath)).toBe(true);
  });
});
