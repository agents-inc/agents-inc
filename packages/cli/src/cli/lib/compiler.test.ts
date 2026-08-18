import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { chmod, mkdir, readFile as fsReadFile, stat, writeFile as fsWrite } from "fs/promises";
import type { AgentConfig, Skill, SkillId } from "../types";
import { DEFAULT_PLUGIN_NAME, STANDARD_FILES } from "../consts";
import { printOutputValidationResult } from "./output-validator";
import { createTempDir, cleanupTempDir } from "./__tests__/test-fs-utils";
import { createMockSkillEntry } from "./__tests__/factories/skill-factories";
import {
  createMockAgentConfig,
  createMockCompiledAgentData,
} from "./__tests__/factories/agent-factories";
import { createCompileContext } from "./__tests__/factories/plugin-factories";
import {
  WEB_DEV_NO_SKILLS,
  API_DEV_NO_SKILLS,
  WEB_DEV_WITH_REACT,
  WEB_DEV_WITH_PRELOADED_REACT,
  WEB_DEV_WITH_VITEST,
  TWO_AGENTS_SHARED_SKILL,
} from "./__tests__/mock-data/mock-agents.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fixture root: __tests__/fixtures/ colocated with test helpers
const FIXTURES_ROOT = path.resolve(__dirname, "__tests__/fixtures");

// Mock resolver — returns a fixture CLAUDE.md path based on projectRoot
vi.mock("./resolver", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./resolver")>()),
  resolveClaudeMd: vi
    .fn()
    .mockImplementation(async (projectRoot: string) =>
      path.join(projectRoot, "src/stacks/default/CLAUDE.md"),
    ),
}));

// Mock output-validator — compiler tests focus on compilation, not validation
vi.mock("./output-validator", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./output-validator")>()),
  validateCompiledAgent: vi.fn().mockReturnValue({ valid: true, errors: [], warnings: [] }),
  printOutputValidationResult: vi.fn(),
}));

// Mock logger (suppress output during tests)
vi.mock("../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/logger")>()),
  verbose: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
  setVerbose: vi.fn(),
}));

import {
  compileAgentForPlugin,
  compileAllAgents,
  compileAllSkills,
  copyClaudeMdToOutput,
  compileAllCommands,
  createLiquidEngine,
  removeCompiledOutputDirs,
  sanitizeLiquidSyntax,
  sanitizeCompiledAgentData,
  buildAgentTemplateContext,
} from "./compiler";
import {
  cliVersion,
  hasProvenanceMarker,
  stampProvenanceMarker,
} from "./agents/agent-provenance.js";
import { validateCompiledAgent } from "./output-validator";
import { warn } from "../utils/logger";
import type { CompiledAgentData } from "../types";
import { elementAt, firstElement } from "./__tests__/helpers/element-at.js";

/**
 * Copies fixture files into a temp directory matching the project layout
 * that the compiler expects. Uses real file I/O instead of mocking fs.
 */
async function createProjectFromFixtures(): Promise<string> {
  const tempDir = await createTempDir("compiler-test-");

  // Agent fixtures
  const WEB_DEV_FILES = [
    "identity.md",
    "playbook.md",
    "output.md",
    "critical-requirements.md",
    "critical-reminders.md",
  ] as const;
  const webDevDir = path.join(tempDir, "src/agents/web-developer");
  await mkdir(webDevDir, { recursive: true });
  for (const file of WEB_DEV_FILES) {
    const content = await fsReadFile(
      path.join(FIXTURES_ROOT, "agents/web-developer", file),
      "utf-8",
    );
    await fsWrite(path.join(webDevDir, file), content);
  }

  const apiDevDir = path.join(tempDir, "src/agents/api-developer");
  await mkdir(apiDevDir, { recursive: true });
  for (const file of ["identity.md", "playbook.md"] as const) {
    const content = await fsReadFile(
      path.join(FIXTURES_ROOT, "agents/api-developer", file),
      "utf-8",
    );
    await fsWrite(path.join(apiDevDir, file), content);
  }

  // Template
  const templatesDir = path.join(tempDir, "src/agents/_templates");
  await mkdir(templatesDir, { recursive: true });
  const templateContent = await fsReadFile(
    path.join(FIXTURES_ROOT, "agents/_templates/agent.liquid"),
    "utf-8",
  );
  await fsWrite(path.join(templatesDir, "agent.liquid"), templateContent);

  // Skills (folder-based)
  const reactSkillDir = path.join(tempDir, "skills/web-framework-react");
  await mkdir(reactSkillDir, { recursive: true });
  const skillContent = await fsReadFile(
    path.join(FIXTURES_ROOT, "skills/web-framework-react/SKILL.md"),
    "utf-8",
  );
  await fsWrite(path.join(reactSkillDir, STANDARD_FILES.SKILL_MD), skillContent);

  // Skills (single-file)
  const skillsDir = path.join(tempDir, "skills");
  const vitestContent = await fsReadFile(
    path.join(FIXTURES_ROOT, "skills/web-testing-vitest.md"),
    "utf-8",
  );
  await fsWrite(path.join(skillsDir, "web-testing-vitest.md"), vitestContent);

  // Commands
  const commandsDir = path.join(tempDir, "src/commands");
  await mkdir(commandsDir, { recursive: true });
  for (const file of ["deploy.md", "test.md"] as const) {
    const content = await fsReadFile(path.join(FIXTURES_ROOT, "commands", file), "utf-8");
    await fsWrite(path.join(commandsDir, file), content);
  }

  // CLAUDE.md for stack
  const stackDir = path.join(tempDir, "src/stacks/default");
  await mkdir(stackDir, { recursive: true });
  const claudeContent = await fsReadFile(
    path.join(FIXTURES_ROOT, "stacks/default/CLAUDE.md"),
    "utf-8",
  );
  await fsWrite(path.join(stackDir, "CLAUDE.md"), claudeContent);

  return tempDir;
}

function contextForProject(projectRoot: string) {
  return createCompileContext({
    projectRoot,
    outputDir: path.join(projectRoot, `.claude/plugins/${DEFAULT_PLUGIN_NAME}`),
  });
}

// Error-path / test-specific skill entries (not shared)

const MISSING_SKILL: Skill = {
  // Boundary cast: fictional skill ID for testing missing-skill error paths
  ...createMockSkillEntry("web-missing-skill" as SkillId),
  path: "skills/missing.md",
};

// Error-path / test-specific agent maps (not shared)

const WEB_DEV_NONEXISTENT_PATH: Record<string, AgentConfig> = {
  "web-developer": createMockAgentConfig("web-developer", [], {
    path: "nonexistent-agent",
  }),
};

const WEB_DEV_MISSING_SKILL: Record<string, AgentConfig> = {
  "web-developer": createMockAgentConfig("web-developer", [MISSING_SKILL]),
};

const WEB_DEV_LIQUID_INJECTION: Record<string, AgentConfig> = {
  "web-developer": createMockAgentConfig("web-developer", [], {
    name: '{{ "INJECTED" }}',
    title: "{% assign x = 1 %}Injected",
  }),
};

const COMPILED_OUTPUT = "---\nname: test\n---\n# Compiled output";
const STUB_OUTPUT = "---\nname: test\n---\n# output";

describe("compiler", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await createProjectFromFixtures();
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  describe("compileAllAgents", () => {
    describe("output directory and file writing", () => {
      it("when compiling agents, should create the agents output directory", async () => {
        const engine = { renderFile: vi.fn().mockResolvedValue(COMPILED_OUTPUT) };

        const ctx = contextForProject(projectDir);
        await compileAllAgents(WEB_DEV_WITH_PRELOADED_REACT, ctx, engine as never);

        const dirStat = await stat(path.join(ctx.outputDir, "agents"));
        expect(dirStat.isDirectory()).toBe(true);
      });

      // The render is what the template produced; the file is what the compiler wrote, and
      // between them sits the provenance stamp every compiled agent carries.
      it("when compiling agents, should write the stamped compiled agent to the output file", async () => {
        const engine = { renderFile: vi.fn().mockResolvedValue(COMPILED_OUTPUT) };

        const ctx = contextForProject(projectDir);
        await compileAllAgents(WEB_DEV_WITH_PRELOADED_REACT, ctx, engine as never);

        const outputPath = path.join(ctx.outputDir, "agents/web-developer.md");
        const content = await fsReadFile(outputPath, "utf-8");
        expect(content).toBe(stampProvenanceMarker(COMPILED_OUTPUT, await cliVersion()));
      });
    });

    describe("reading agent source files", () => {
      it("when compiling an agent, should pass agent data to template engine", async () => {
        const engine = { renderFile: vi.fn().mockResolvedValue(STUB_OUTPUT) };

        const ctx = contextForProject(projectDir);
        await compileAllAgents(API_DEV_NO_SKILLS, ctx, engine as never);

        expect(engine.renderFile).toHaveBeenCalledWith(
          "agent",
          expect.objectContaining({
            identity: expect.stringContaining("API Developer"),
            playbook: expect.stringContaining("Design the API"),
          }),
        );
      });

      it("when compiling an agent, should read optional output.md file", async () => {
        const engine = { renderFile: vi.fn().mockResolvedValue(STUB_OUTPUT) };

        const ctx = contextForProject(projectDir);
        await compileAllAgents(WEB_DEV_NO_SKILLS, ctx, engine as never);

        expect(engine.renderFile).toHaveBeenCalledWith(
          "agent",
          expect.objectContaining({
            output: expect.any(String),
          }),
        );
      });
    });

    describe("error handling", () => {
      it("when agent file read fails, should throw descriptive error with agent name", async () => {
        const engine = { renderFile: vi.fn() };

        await expect(
          compileAllAgents(
            WEB_DEV_NONEXISTENT_PATH,
            contextForProject(projectDir),
            engine as never,
          ),
        ).rejects.toThrow(/Failed to compile agent 'web-developer'/);
      });
    });

    describe("output validation", () => {
      it("when compilation has warnings, should call validateCompiledAgent", async () => {
        vi.mocked(validateCompiledAgent).mockReturnValue({
          valid: true,
          errors: [],
          warnings: ["Missing <role> section"],
        });

        const engine = { renderFile: vi.fn().mockResolvedValue(STUB_OUTPUT) };

        await compileAllAgents(WEB_DEV_NO_SKILLS, contextForProject(projectDir), engine as never);

        // Validation sees the bytes that were written, stamp included — not the raw render.
        expect(validateCompiledAgent).toHaveBeenCalledWith(
          stampProvenanceMarker(STUB_OUTPUT, await cliVersion()),
        );
      });

      it("when validation has warnings, should print validation result", async () => {
        vi.mocked(validateCompiledAgent).mockReturnValue({
          valid: true,
          errors: [],
          warnings: ["Missing <role> section"],
        });

        const engine = { renderFile: vi.fn().mockResolvedValue(STUB_OUTPUT) };

        await compileAllAgents(WEB_DEV_NO_SKILLS, contextForProject(projectDir), engine as never);

        expect(printOutputValidationResult).toHaveBeenCalledWith(
          "web-developer",
          expect.objectContaining({ warnings: ["Missing <role> section"] }),
        );
      });
    });
  });

  describe("compileAllSkills", () => {
    it("copies folder-based skills with SKILL.md", async () => {
      const ctx = contextForProject(projectDir);
      await compileAllSkills(WEB_DEV_WITH_REACT, ctx);

      const outputPath = path.join(ctx.outputDir, "skills/web-framework-react/SKILL.md");
      const content = await fsReadFile(outputPath, "utf-8");
      expect(content).toContain("React Framework");
    });

    it("copies single-file skills", async () => {
      const ctx = contextForProject(projectDir);
      await compileAllSkills(WEB_DEV_WITH_VITEST, ctx);

      const outputPath = path.join(ctx.outputDir, "skills/web-testing-vitest/SKILL.md");
      const content = await fsReadFile(outputPath, "utf-8");
      expect(content).toContain("Vitest Testing");
    });

    it("deduplicates skills across agents", async () => {
      const ctx = contextForProject(projectDir);
      await compileAllSkills(TWO_AGENTS_SHARED_SKILL, ctx);

      const outputPath = path.join(ctx.outputDir, "skills/web-framework-react/SKILL.md");
      const content = await fsReadFile(outputPath, "utf-8");
      expect(content).toContain("React Framework");
    });

    it("throws descriptive error when skill file is missing", async () => {
      await expect(
        compileAllSkills(WEB_DEV_MISSING_SKILL, contextForProject(projectDir)),
      ).rejects.toThrow(/Failed to compile skill 'web-missing-skill'/);
    });
  });

  describe("copyClaudeMdToOutput", () => {
    it("reads resolved CLAUDE.md and writes to output", async () => {
      const ctx = contextForProject(projectDir);
      await copyClaudeMdToOutput(ctx);

      const outputPath = path.join(ctx.outputDir, "../CLAUDE.md");
      const content = await fsReadFile(outputPath, "utf-8");
      expect(content).toContain("Project-level instructions for Claude");
    });
  });

  describe("compileAllCommands", () => {
    it("skips when commands directory does not exist", async () => {
      const emptyProject = await createTempDir("compiler-no-cmds-");

      const ctx = contextForProject(emptyProject);
      await compileAllCommands(ctx);

      await expect(stat(path.join(ctx.outputDir, "commands"))).rejects.toThrow();

      await cleanupTempDir(emptyProject);
    });

    it("copies command files to output directory", async () => {
      const ctx = contextForProject(projectDir);
      await compileAllCommands(ctx);

      const deployContent = await fsReadFile(
        path.join(ctx.outputDir, "commands/deploy.md"),
        "utf-8",
      );
      expect(deployContent).toContain("Deploy the application");

      const testContent = await fsReadFile(path.join(ctx.outputDir, "commands/test.md"), "utf-8");
      expect(testContent).toContain("Run the test suite");
    });

    it("skips when no command files found", async () => {
      const emptyProject = await createTempDir("compiler-empty-cmds-");
      await mkdir(path.join(emptyProject, "src/commands"), { recursive: true });

      const ctx = contextForProject(emptyProject);
      await compileAllCommands(ctx);

      await expect(stat(path.join(ctx.outputDir, "commands"))).rejects.toThrow();

      await cleanupTempDir(emptyProject);
    });

    it("throws descriptive error when command file read fails", async () => {
      const brokenProject = await createTempDir("compiler-bad-cmd-");
      const cmdDir = path.join(brokenProject, "src/commands");
      await mkdir(cmdDir, { recursive: true });
      await fsWrite(path.join(cmdDir, "deploy.md"), "content");
      await chmod(path.join(cmdDir, "deploy.md"), 0o000);

      await expect(compileAllCommands(contextForProject(brokenProject))).rejects.toThrow(
        /Failed to compile command 'deploy\.md'/,
      );

      await chmod(path.join(cmdDir, "deploy.md"), 0o644);
      await cleanupTempDir(brokenProject);
    });
  });

  describe("removeCompiledOutputDirs", () => {
    it("removes agents, skills, and commands directories", async () => {
      const outputDir = path.join(projectDir, "output-test");
      await mkdir(path.join(outputDir, "agents"), { recursive: true });
      await mkdir(path.join(outputDir, "skills"), { recursive: true });
      await mkdir(path.join(outputDir, "commands"), { recursive: true });

      await removeCompiledOutputDirs(outputDir);

      await expect(stat(path.join(outputDir, "agents"))).rejects.toThrow();
      await expect(stat(path.join(outputDir, "skills"))).rejects.toThrow();
      await expect(stat(path.join(outputDir, "commands"))).rejects.toThrow();
    });
  });

  describe("createLiquidEngine", () => {
    it("creates engine with default template root", async () => {
      const engine = await createLiquidEngine();

      expect(typeof engine.renderFile).toBe("function");
    });

    it("checks for local template overrides when projectDir provided", async () => {
      const engine = await createLiquidEngine(projectDir);

      expect(typeof engine.renderFile).toBe("function");
    });
  });

  describe("sanitizeLiquidSyntax", () => {
    it("returns clean strings unchanged", () => {
      expect(sanitizeLiquidSyntax("Web Developer", "test")).toBe("Web Developer");
    });

    it("strips {{ and }} delimiters from input", () => {
      const result = sanitizeLiquidSyntax('{{ include "../../../etc/passwd" }}', "agent.name");
      expect(result).toBe(' include "../../../etc/passwd" ');
      expect(result).not.toContain("{{");
      expect(result).not.toContain("}}");
    });

    it("strips {% and %} delimiters from input", () => {
      const result = sanitizeLiquidSyntax('{% assign x = "malicious" %}', "agent.name");
      expect(result).toBe(' assign x = "malicious" ');
      expect(result).not.toContain("{%");
      expect(result).not.toContain("%}");
    });

    it("strips mixed Liquid delimiters", () => {
      const result = sanitizeLiquidSyntax("{{ x }}{% if true %}evil{% endif %}", "agent.name");
      expect(result).not.toContain("{{");
      expect(result).not.toContain("}}");
      expect(result).not.toContain("{%");
      expect(result).not.toContain("%}");
    });

    it("warns when stripping Liquid syntax", () => {
      sanitizeLiquidSyntax("{{ malicious }}", "agent.name");
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Stripped Liquid template syntax from 'agent.name'"),
      );
    });

    it("does not warn for clean strings", () => {
      vi.mocked(warn).mockClear();
      sanitizeLiquidSyntax("Clean Agent Name", "agent.name");
      expect(warn).not.toHaveBeenCalled();
    });

    it("handles strings with only Liquid delimiters", () => {
      expect(sanitizeLiquidSyntax("{{}}", "test")).toBe("");
      expect(sanitizeLiquidSyntax("{%%}", "test")).toBe("");
    });

    it("handles nested/repeated delimiters", () => {
      const result = sanitizeLiquidSyntax("{{ {{ nested }} }}", "test");
      expect(result).not.toContain("{{");
      expect(result).not.toContain("}}");
    });
  });

  describe("sanitizeCompiledAgentData", () => {
    it("passes through clean data unchanged", () => {
      const data = createMockCompiledAgentData();
      const result = sanitizeCompiledAgentData(data);

      expect(result.agent.name).toBe("test-agent");
      expect(result.agent.title).toBe("Test Agent");
      expect(result.agent.description).toBe("A test agent");
      expect(result.identity).toBe("Test identity");
    });

    it("sanitizes Liquid syntax in agent.name", () => {
      const data = createMockCompiledAgentData({ name: '{{ forked_from.source | join: "|" }}' });
      const result = sanitizeCompiledAgentData(data);

      expect(result.agent.name).not.toContain("{{");
      expect(result.agent.name).not.toContain("}}");
    });

    it("sanitizes Liquid syntax in agent.title", () => {
      const data = createMockCompiledAgentData({ title: "{% include 'malicious' %}" });
      const result = sanitizeCompiledAgentData(data);

      expect(result.agent.title).not.toContain("{%");
      expect(result.agent.title).not.toContain("%}");
    });

    it("sanitizes Liquid syntax in agent.description", () => {
      const data = createMockCompiledAgentData({ description: "{{ evil }}" });
      const result = sanitizeCompiledAgentData(data);

      expect(result.agent.description).not.toContain("{{");
    });

    it("sanitizes Liquid syntax in agent.tools array", () => {
      const data = createMockCompiledAgentData({ tools: ["Read", "{{ malicious }}"] });
      const result = sanitizeCompiledAgentData(data);

      expect(result.agent.tools[0]).toBe("Read");
      expect(result.agent.tools[1]).not.toContain("{{");
    });

    it("preserves Liquid syntax in content fields (not re-evaluated by LiquidJS)", () => {
      const data = createMockCompiledAgentData();
      data.identity = "Use ${{ secrets.DB_PASSWORD }} in GitHub Actions";
      data.playbook = "Template structure: {{ identity }} and {% if condition %}";
      data.output = "{{ forked_from }} output example";
      data.criticalRequirementsTop = "Include {{ variable }} syntax";
      data.criticalReminders = "Use {% for item in list %} loops";

      const result = sanitizeCompiledAgentData(data);

      expect(result.identity).toBe("Use ${{ secrets.DB_PASSWORD }} in GitHub Actions");
      expect(result.playbook).toBe("Template structure: {{ identity }} and {% if condition %}");
      expect(result.output).toBe("{{ forked_from }} output example");
      expect(result.criticalRequirementsTop).toBe("Include {{ variable }} syntax");
      expect(result.criticalReminders).toBe("Use {% for item in list %} loops");
    });

    it("sanitizes Liquid syntax in skill metadata", () => {
      const skill = createMockSkillEntry("web-framework-react", true, {
        description: "{{ malicious }} skill",
        usage: "{% evil %} usage",
      });

      const data = createMockCompiledAgentData();
      data.skills = [skill];
      data.preloadedSkills = [skill];
      data.preloadedSkillIds = [skill.id];

      const result = sanitizeCompiledAgentData(data);

      expect(firstElement(result.skills).description).not.toContain("{{");
      expect(firstElement(result.skills).usage).not.toContain("{%");
    });

    it("leaves absent optional fields absent", () => {
      const data = createMockCompiledAgentData({});
      const result = sanitizeCompiledAgentData(data);

      expect(result.agent.model).toBeUndefined();
      expect(result.agent.permissionMode).toBeUndefined();
    });

    it("sanitizes optional string fields when present", () => {
      const data = createMockCompiledAgentData({
        model: "{{ inject }}" as NonNullable<AgentConfig["model"]>,
        permissionMode: "{% evil %}" as NonNullable<AgentConfig["permissionMode"]>,
      });
      const result = sanitizeCompiledAgentData(data);

      expect(String(result.agent.model)).not.toContain("{{");
      expect(String(result.agent.permissionMode)).not.toContain("{%");
    });
  });

  describe("compileAgentForPlugin", () => {
    it("stamps the compiled agent with the provenance marker", async () => {
      const engine = { renderFile: vi.fn().mockResolvedValue(STUB_OUTPUT) };

      const output = await compileAgentForPlugin(
        "web-developer",
        createMockAgentConfig("web-developer"),
        projectDir,
        engine as never,
      );

      expect(hasProvenanceMarker(output)).toBe(true);
      expect(output).toBe(stampProvenanceMarker(STUB_OUTPUT, await cliVersion()));
    });

    /**
     * A project-local template override may emit the marker itself. Compiling such an
     * agent must leave one marker, not two — the same fixed point a re-emit relies on.
     */
    it("does not stack a second marker when the render already carries one", async () => {
      const alreadyStamped = stampProvenanceMarker(STUB_OUTPUT, await cliVersion());
      const engine = { renderFile: vi.fn().mockResolvedValue(alreadyStamped) };

      const output = await compileAgentForPlugin(
        "web-developer",
        createMockAgentConfig("web-developer"),
        projectDir,
        engine as never,
      );

      expect(output).toBe(alreadyStamped);
    });
  });

  describe("template injection prevention (integration)", () => {
    it("when agent.name contains Liquid syntax, should not execute it", async () => {
      const engine = { renderFile: vi.fn().mockResolvedValue(STUB_OUTPUT) };

      const ctx = contextForProject(projectDir);
      await compileAllAgents(WEB_DEV_LIQUID_INJECTION, ctx, engine as never);

      const renderCall = elementAt(
        firstElement(engine.renderFile.mock.calls),
        1,
      ) as CompiledAgentData;
      expect(renderCall.agent.name).not.toContain("{{");
      expect(renderCall.agent.name).not.toContain("}}");
      expect(renderCall.agent.title).not.toContain("{%");
      expect(renderCall.agent.title).not.toContain("%}");
    });
  });

  describe("buildAgentTemplateContext", () => {
    const agentFiles = {
      identity: "Test identity content",
      playbook: "Test playbook content",
      output: "Test output content",
      criticalRequirementsTop: "Test requirements",
      criticalReminders: "Test reminders",
    };

    it("should build template context with all file content", () => {
      const agent = createMockAgentConfig("web-developer", []);

      const result = buildAgentTemplateContext("web-developer", agent, agentFiles);

      expect(result.agent).toBe(agent);
      expect(result.identity).toBe("Test identity content");
      expect(result.playbook).toBe("Test playbook content");
      expect(result.output).toBe("Test output content");
      expect(result.criticalRequirementsTop).toBe("Test requirements");
      expect(result.criticalReminders).toBe("Test reminders");
    });

    it("should include all skills from agent config", () => {
      const skills = [
        createMockSkillEntry("web-framework-react", true),
        createMockSkillEntry("web-testing-vitest", false),
      ];
      const agent = createMockAgentConfig("web-developer", skills);

      const result = buildAgentTemplateContext("web-developer", agent, agentFiles);

      expect(result.skills).toStrictEqual(skills);
      expect(result.skills).toHaveLength(2);
    });

    it("should separate preloaded from dynamic skills", () => {
      const preloadedSkill = createMockSkillEntry("web-framework-react", true);
      const dynamicSkill = createMockSkillEntry("web-testing-vitest", false);
      const agent = createMockAgentConfig("web-developer", [preloadedSkill, dynamicSkill]);

      const result = buildAgentTemplateContext("web-developer", agent, agentFiles);

      expect(result.preloadedSkills).toStrictEqual([preloadedSkill]);
      expect(result.dynamicSkills).toStrictEqual([dynamicSkill]);
    });

    it("should extract preloaded skill IDs", () => {
      const preloaded1 = createMockSkillEntry("web-framework-react", true);
      const preloaded2 = createMockSkillEntry("web-testing-vitest", true);
      const dynamic = createMockSkillEntry("web-state-zustand", false);
      const agent = createMockAgentConfig("web-developer", [preloaded1, preloaded2, dynamic]);

      const result = buildAgentTemplateContext("web-developer", agent, agentFiles);

      expect(result.preloadedSkillIds).toStrictEqual(["web-framework-react", "web-testing-vitest"]);
    });

    it("should handle agent with no skills", () => {
      const agent = createMockAgentConfig("web-developer", []);

      const result = buildAgentTemplateContext("web-developer", agent, agentFiles);

      expect(result.skills).toStrictEqual([]);
      expect(result.preloadedSkills).toStrictEqual([]);
      expect(result.dynamicSkills).toStrictEqual([]);
      expect(result.preloadedSkillIds).toStrictEqual([]);
    });

    it("should handle agent with only preloaded skills", () => {
      const skills = [
        createMockSkillEntry("web-framework-react", true),
        createMockSkillEntry("web-testing-vitest", true),
      ];
      const agent = createMockAgentConfig("web-developer", skills);

      const result = buildAgentTemplateContext("web-developer", agent, agentFiles);

      expect(result.preloadedSkills).toHaveLength(2);
      expect(result.dynamicSkills).toHaveLength(0);
      expect(result.preloadedSkillIds).toHaveLength(2);
    });

    it("should handle agent with only dynamic skills", () => {
      const skills = [
        createMockSkillEntry("web-framework-react", false),
        createMockSkillEntry("web-testing-vitest", false),
      ];
      const agent = createMockAgentConfig("web-developer", skills);

      const result = buildAgentTemplateContext("web-developer", agent, agentFiles);

      expect(result.preloadedSkills).toHaveLength(0);
      expect(result.dynamicSkills).toHaveLength(2);
      expect(result.preloadedSkillIds).toHaveLength(0);
    });
  });
});
