import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { mkdir, readFile as fsReadFile, writeFile as fsWrite } from "fs/promises";
import type { AgentConfig } from "../types";
import { createTempDir, cleanupTempDir } from "./__tests__/test-fs-utils";
import { createMockSkillEntry } from "./__tests__/factories/skill-factories";
import {
  createMockAgentConfig,
  createMockCompiledAgentData,
} from "./__tests__/factories/agent-factories";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fixture root: __tests__/fixtures/ colocated with test helpers
const FIXTURES_ROOT = path.resolve(__dirname, "__tests__/fixtures");

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
  createLiquidEngine,
  sanitizeLiquidSyntax,
  sanitizeCompiledAgentData,
  buildAgentTemplateContext,
} from "./compiler";
import { hasProvenanceMarker, stampProvenanceMarker } from "./agents/agent-provenance.js";
import { warn } from "../utils/logger";
import { CLAUDE_SRC_DIR, DIRS, EJECT_SOURCE, STANDARD_DIRS } from "../consts";
import type { CompiledAgentData, PluginSkillRef, SkillId } from "../types";
import { elementAt, firstElement } from "./__tests__/helpers/element-at.js";
import {
  parseCompiledAgentSections,
  type CompiledAgentDynamicEntry,
} from "./__tests__/helpers/compiled-agent-sections.js";

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

  return tempDir;
}

/**
 * Puts the fixture template where a project's own override lives — the first root
 * {@link createLiquidEngine} resolves `agent` from, and where `eject templates` writes.
 *
 * Called by the one spec whose subject is the override, and nowhere else: a project built
 * with this in place renders every agent through the fixture, and the shipped-template
 * assertions below would then be describing the fixture instead.
 */
async function installProjectTemplateOverride(projectDir: string): Promise<void> {
  const templatesDir = path.join(
    projectDir,
    CLAUDE_SRC_DIR,
    STANDARD_DIRS.AGENTS,
    path.basename(DIRS.templates),
  );
  await mkdir(templatesDir, { recursive: true });
  const templateContent = await fsReadFile(
    path.join(FIXTURES_ROOT, "agents/_templates/agent.liquid"),
    "utf-8",
  );
  await fsWrite(path.join(templatesDir, "agent.liquid"), templateContent);
}

/** The line only the fixture template emits, and therefore the one that says which rendered. */
const PROJECT_TEMPLATE_MARKER = "Rendered by the project's own agent template.";

/**
 * A frontmatter key the SHIPPED template emits unconditionally and the fixture template emits
 * never — how an override that REPLACED the shipped template is told from one whose output was
 * merely added to.
 */
const SHIPPED_TEMPLATE_KEY = "permissionMode:";

/** A sub-agent whose own metadata carries Liquid syntax, so the sanitiser has something to strip. */
const WEB_DEV_LIQUID_INJECTION: AgentConfig = createMockAgentConfig("web-developer", [], {
  name: '{{ "INJECTED" }}',
  title: "{% assign x = 1 %}Injected",
});

/**
 * A sub-agent carrying BOTH optional permission fields, so a template that never reads one
 * has something to lose. A fixture leaving either unset would satisfy the emission assertions
 * from the template's own defaults and prove nothing about the lookup.
 */
const WEB_DEV_TUNED_PERMISSIONS: AgentConfig = createMockAgentConfig("web-developer", [], {
  permissionMode: "plan",
  disallowedTools: ["Bash", "WebFetch"],
});

/** A marketplace name — anything but {@link EJECT_SOURCE} is what earns a skill its `pluginRef`. */
const MARKETPLACE_ORIGIN = "agents-inc";

/**
 * Four skills that interleave the two loads and sit in no alphabetical order, so a template
 * that sorted them, grouped them by load or swapped a neighbouring pair shows up in the
 * membership rather than only in a count. The pair below differ in `source` alone: one
 * renders every skill as a plugin ref, the other renders every skill as a bare id.
 */
const WEB_DEV_PLUGIN_SKILLS: AgentConfig = createMockAgentConfig("web-developer", [
  createMockSkillEntry("web-testing-vitest", false, { source: MARKETPLACE_ORIGIN }),
  createMockSkillEntry("web-framework-react", true, { source: MARKETPLACE_ORIGIN }),
  createMockSkillEntry("web-state-zustand", false, { source: MARKETPLACE_ORIGIN }),
  createMockSkillEntry("web-styling-tailwind", true, { source: MARKETPLACE_ORIGIN }),
]);

const WEB_DEV_EJECTED_SKILLS: AgentConfig = createMockAgentConfig("web-developer", [
  createMockSkillEntry("web-testing-vitest", false, { source: EJECT_SOURCE }),
  createMockSkillEntry("web-framework-react", true, { source: EJECT_SOURCE }),
  createMockSkillEntry("web-state-zustand", false, { source: EJECT_SOURCE }),
  createMockSkillEntry("web-styling-tailwind", true, { source: EJECT_SOURCE }),
]);

const PLUGIN_PRELOADED_REFS = [
  "web-framework-react:web-framework-react",
  "web-styling-tailwind:web-styling-tailwind",
] as const satisfies readonly PluginSkillRef[];

/**
 * The heading is the BARE id in plugin mode too — only the `Invoke:` line carries the ref.
 * An expectation written in the ref form on both fields reads one of the two lines and
 * describes the other wrongly.
 */
const PLUGIN_DYNAMIC_ENTRIES = [
  { id: "web-testing-vitest", invokeRef: "web-testing-vitest:web-testing-vitest" },
  { id: "web-state-zustand", invokeRef: "web-state-zustand:web-state-zustand" },
] as const satisfies readonly CompiledAgentDynamicEntry[];

const EJECTED_PRELOADED_REFS = [
  "web-framework-react",
  "web-styling-tailwind",
] as const satisfies readonly SkillId[];

const EJECTED_DYNAMIC_ENTRIES = [
  { id: "web-testing-vitest", invokeRef: "web-testing-vitest" },
  { id: "web-state-zustand", invokeRef: "web-state-zustand" },
] as const satisfies readonly CompiledAgentDynamicEntry[];

/**
 * Every section the shipped template opens at the top level, in the order it opens them —
 * the fixture agent's `identity.md`, `playbook.md` and `output.md` contribute the headings
 * and carry no tags of their own, so this list is the template's own structure.
 */
/**
 * The order is a cache decision before it is an editorial one, and the last entry is the whole
 * of it. A compiled agent IS a sub-agent's system prompt, so the file's leading bytes are the
 * cacheable prefix of every invocation. The skill list is the one block that moves without the
 * agent's role moving — it is rewritten whenever a user edits their stack — and while it sat
 * mid-body, every such edit invalidated the playbook and the output format beneath it.
 *
 * `<skill_activation_protocol>` is absent from this roster rather than retired: it renders
 * NESTED inside the trailing `<system-reminder>`, and `topLevelSectionsIn` reports only the
 * blocks a body opens at depth zero.
 */
const SHIPPED_TEMPLATE_SECTIONS = [
  "# web-developer agent",
  "<role>",
  "<operating_principles>",
  "<critical_requirements>",
  "## Workflow",
  "<critical_reminders>",
  "## Examples",
  "## Output Format",
  "<system-reminder>",
] as const;

const STUB_OUTPUT = "---\nname: test\n---\n# output";

describe("compiler", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await createProjectFromFixtures();
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  /**
   * What the compile reads off disk before it renders anything. The template is handed the
   * agent's own `identity.md` and `playbook.md`, plus an `output.md` that is optional and
   * resolved from the agent's directory first — so a spec that only counted the call could not
   * tell a populated context from an empty one.
   */
  describe("reading agent source files", () => {
    it("when compiling an agent, should pass agent data to template engine", async () => {
      const engine = { renderFile: vi.fn().mockResolvedValue(STUB_OUTPUT) };

      await compileAgentForPlugin(
        "api-developer",
        createMockAgentConfig("api-developer"),
        projectDir,
        engine as never,
      );

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

      await compileAgentForPlugin(
        "web-developer",
        createMockAgentConfig("web-developer"),
        projectDir,
        engine as never,
      );

      expect(engine.renderFile).toHaveBeenCalledWith(
        "agent",
        expect.objectContaining({ output: expect.any(String) }),
      );
    });

    it("when the agent directory is absent, should reject naming the path it could not read", async () => {
      const engine = { renderFile: vi.fn() };

      await expect(
        compileAgentForPlugin(
          "web-developer",
          createMockAgentConfig("web-developer", [], { path: "nonexistent-agent" }),
          projectDir,
          engine as never,
        ),
      ).rejects.toThrow(/nonexistent-agent/);
    });
  });

  describe("createLiquidEngine", () => {
    it("creates engine with default template root", async () => {
      const engine = await createLiquidEngine();

      expect(typeof engine.renderFile).toBe("function");
    });

    /**
     * A project's own `agent.liquid` shadowing the shipped one is the whole of what the root
     * hierarchy is for, and what `eject templates` sells — and the pair is what makes either
     * half a claim. An engine renders whatever is in front of it, so "the marker arrived"
     * says nothing on its own about which template the compile chose.
     */
    it("renders a project's own agent template in place of the shipped one", async () => {
      await installProjectTemplateOverride(projectDir);
      const engine = await createLiquidEngine(projectDir);

      const compiled = await compileAgentForPlugin(
        "web-developer",
        createMockAgentConfig("web-developer"),
        projectDir,
        engine,
      );

      expect(compiled, "the project's own template is the one that rendered").toContain(
        PROJECT_TEMPLATE_MARKER,
      );
      expect(
        compiled,
        "an override replaces the shipped template rather than adding to it, so the frontmatter it does not write is not written",
      ).not.toContain(SHIPPED_TEMPLATE_KEY);
    });

    it("renders the shipped template when the project has no override", async () => {
      const engine = await createLiquidEngine(projectDir);

      const compiled = await compileAgentForPlugin(
        "web-developer",
        createMockAgentConfig("web-developer"),
        projectDir,
        engine,
      );

      expect(compiled, "a project with no template of its own gets the shipped one").toContain(
        SHIPPED_TEMPLATE_KEY,
      );
      expect(compiled, "nothing rendered the fixture template here").not.toContain(
        PROJECT_TEMPLATE_MARKER,
      );
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
      expect(output).toBe(stampProvenanceMarker(STUB_OUTPUT));
    });

    /**
     * A project-local template override may emit the marker itself. Compiling such an
     * agent must leave one marker, not two — the same fixed point a re-emit relies on.
     */
    it("does not stack a second marker when the render already carries one", async () => {
      const alreadyStamped = stampProvenanceMarker(STUB_OUTPUT);
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

  /**
   * The SHIPPED template rendered by a REAL engine, asserting the VALUE of each optional
   * frontmatter field rather than the presence of its key, and the MEMBERSHIP of each skill
   * list rather than its length.
   *
   * Presence is not a test of the first two. `permissionMode` is emitted unconditionally
   * behind a `default:` filter, so its key survives a lookup that resolves to nothing and a
   * `toHaveProperty("permissionMode")` stays green while the agent's own setting is discarded.
   * `disallowedTools` is the same failure with the opposite tell — the whole line vanishes — so
   * the third case below is the control that says an absent field is what suppressed it.
   *
   * Length is not a test of the skill lists either: a count cannot see a swap, and the order
   * of a sub-agent's skills IS the order its config declared them in, so a template that
   * sorted or regrouped them would leave every count intact.
   *
   * `createLiquidEngine()` is called with no `projectDir` deliberately: a project-local
   * `_templates/` override would shadow the shipped template and the assertions would describe
   * the fixture instead.
   */
  describe("shipped agent template", () => {
    it("emits the permissionMode the agent carries, not the template default", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForPlugin(
        "web-developer",
        WEB_DEV_TUNED_PERMISSIONS,
        projectDir,
        engine,
      );

      expect(output).toContain("permissionMode: plan");
    });

    it("emits disallowedTools when the agent carries them", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForPlugin(
        "web-developer",
        WEB_DEV_TUNED_PERMISSIONS,
        projectDir,
        engine,
      );

      expect(output).toContain("disallowedTools: Bash, WebFetch");
    });

    it("falls back to the default permissionMode and omits disallowedTools when neither is set", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForPlugin(
        "web-developer",
        createMockAgentConfig("web-developer"),
        projectDir,
        engine,
      );

      expect(output).toContain("permissionMode: default");
      expect(output).not.toContain("disallowedTools:");
    });

    it("preloads exactly the skills the agent marks preloaded, in declaration order", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForPlugin(
        "web-developer",
        WEB_DEV_PLUGIN_SKILLS,
        projectDir,
        engine,
      );

      expect(parseCompiledAgentSections(output).preloadedRefs).toStrictEqual([
        ...PLUGIN_PRELOADED_REFS,
      ]);
    });

    it("activates exactly the skills the agent leaves dynamic, in declaration order", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForPlugin(
        "web-developer",
        WEB_DEV_PLUGIN_SKILLS,
        projectDir,
        engine,
      );

      expect(parseCompiledAgentSections(output).dynamicEntries).toStrictEqual([
        ...PLUGIN_DYNAMIC_ENTRIES,
      ]);
    });

    it("renders an ejected skill as its bare id on both sides", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForPlugin(
        "web-developer",
        WEB_DEV_EJECTED_SKILLS,
        projectDir,
        engine,
      );
      const { preloadedRefs, dynamicEntries } = parseCompiledAgentSections(output);

      expect(preloadedRefs).toStrictEqual([...EJECTED_PRELOADED_REFS]);
      expect(dynamicEntries).toStrictEqual([...EJECTED_DYNAMIC_ENTRIES]);
    });

    it("opens its own sections in order around the agent's prose", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForPlugin(
        "web-developer",
        WEB_DEV_PLUGIN_SKILLS,
        projectDir,
        engine,
      );

      expect(parseCompiledAgentSections(output).sectionOrder).toStrictEqual([
        ...SHIPPED_TEMPLATE_SECTIONS,
      ]);
    });
  });

  describe("template injection prevention (integration)", () => {
    it("when agent.name contains Liquid syntax, should not execute it", async () => {
      const engine = { renderFile: vi.fn().mockResolvedValue(STUB_OUTPUT) };

      await compileAgentForPlugin(
        "web-developer",
        WEB_DEV_LIQUID_INJECTION,
        projectDir,
        engine as never,
      );

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

      // Not `toBe`: the context's definition is DERIVED from the agent's now,
      // because every compiled sub-agent is granted the Skill tool its
      // frontmatter allowlist would otherwise withhold.
      expect(result.agent).toStrictEqual({ ...agent, tools: ["Read", "Write", "Skill"] });
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
