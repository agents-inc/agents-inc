import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import path from "path";
import { fileURLToPath } from "url";
import { mkdir, readFile as fsReadFile, writeFile as fsWrite } from "fs/promises";
import type { AgentConfig } from "../types";
import { createTempDir, cleanupTempDir } from "./__tests__/test-fs-utils";
import { createMockSkillEntry } from "./__tests__/factories/skill-factories";
import { createMockAgentConfig } from "./__tests__/factories/agent-factories";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIXTURES_ROOT = path.resolve(__dirname, "__tests__/fixtures");

vi.mock("../utils/logger", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/logger")>()),
  verbose: vi.fn(),
  warn: vi.fn(),
  log: vi.fn(),
  setVerbose: vi.fn(),
}));

import { compileAgentForHost, createLiquidEngine } from "./compiler";
import { hasProvenanceMarker, provenanceMarker } from "./agents/agent-provenance.js";
import { verbose, warn } from "../utils/logger";
import { CLAUDE_DIR, DIRS, EJECT_SOURCE, STANDARD_DIRS } from "../consts";
import { sourceFolderInUse } from "./installation/install-layout.js";
import type { PluginSkillRef, SkillId } from "../types";
import {
  parseCompiledAgentSections,
  type CompiledAgentDynamicEntry,
} from "./__tests__/helpers/compiled-agent-sections.js";

async function createProjectFromFixtures(): Promise<string> {
  const tempDir = await createTempDir("compiler-test-");

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

/** Only for the override spec: with it in place every agent renders through the fixture. */
async function installProjectTemplateOverride(projectDir: string): Promise<void> {
  await writeProjectTemplate(
    projectDir,
    await fsReadFile(path.join(FIXTURES_ROOT, "agents/_templates/agent.liquid"), "utf-8"),
  );
}

async function writeProjectTemplate(projectDir: string, content: string): Promise<void> {
  const templatesDir = path.join(
    sourceFolderInUse(projectDir, "claude").dir,
    STANDARD_DIRS.AGENTS,
    path.basename(DIRS.templates),
  );
  await mkdir(templatesDir, { recursive: true });
  await fsWrite(path.join(templatesDir, "agent.liquid"), content);
}

/** The line only the fixture template emits, and therefore the one that says which rendered. */
const PROJECT_TEMPLATE_MARKER = "Rendered by the project's own agent template.";

/** The shipped template always emits this and the fixture never: replacement, not addition. */
const SHIPPED_TEMPLATE_KEY = "permissionMode:";

/** A sub-agent whose own metadata carries Liquid syntax, so the sanitiser has something to strip. */
const WEB_DEV_LIQUID_INJECTION: AgentConfig = createMockAgentConfig("web-developer", [], {
  name: '{{ "INJECTED" }}',
  title: "{% assign x = 1 %}Injected",
});

/**
 * Both optional permission fields set, so template defaults cannot satisfy the emission assertions.
 */
const WEB_DEV_TUNED_PERMISSIONS: AgentConfig = createMockAgentConfig("web-developer", [], {
  permissionMode: "plan",
  disallowedTools: ["Bash", "WebFetch"],
});

/** Any origin but eject earns a skill its `pluginRef`. */
const MARKETPLACE_ORIGIN = "agents-inc";

/** Interleaved loads, unsorted, so sorting, grouping or a swap shows in the membership. */
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

/** The heading is the bare id in plugin mode too; only the `Invoke:` line carries the ref. */
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
 * The template's top-level sections in order. The skill list comes last because it changes with the
 * stack, and everything before it is the cacheable prompt prefix. `<skill_activation_protocol>`
 * renders nested inside `<system-reminder>`, so it is not listed.
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

/** api-developer carries no critical files and no output.md, so only these sections open. */
const SECTIONS_WITHOUT_CRITICAL_OR_OUTPUT = [
  "# api-developer agent",
  "<role>",
  "<operating_principles>",
  "## Workflow",
  "<system-reminder>",
] as const;

/** Prose an author may write that looks like Liquid; the compile must not evaluate it. */
const PROSE_WITH_LIQUID_SYNTAX =
  "Use ${{ secrets.DB_PASSWORD }} in GitHub Actions, and {% if ready %} in your own templates.";

async function fixtureText(agent: string, file: string): Promise<string> {
  return fsReadFile(path.join(FIXTURES_ROOT, "agents", agent, file), "utf-8");
}

/** A project template that stamps the marker itself, as an override is free to. */
const TEMPLATE_THAT_STAMPS = [
  "---",
  "name: {{ agent.name }}",
  "---",
  provenanceMarker(),
  "",
  "# {{ agent.title }}",
  "",
].join("\n");

/** What that template renders for web-developer: one marker, where the template put it. */
const RENDERED_BY_THE_STAMPING_TEMPLATE = [
  "---",
  "name: web-developer",
  "---",
  provenanceMarker(),
  "",
  "# web-developer agent",
  "",
].join("\n");

describe("compiler", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await createProjectFromFixtures();
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  describe("reading agent source files", () => {
    it("compiles the agent's identity and playbook into its output", async () => {
      const output = await compileAgentForHost(
        "claude",
        "api-developer",
        createMockAgentConfig("api-developer"),
        projectDir,
        await createLiquidEngine(),
      );

      expect(output).toContain(await fixtureText("api-developer", "identity.md"));
      expect(output).toContain(await fixtureText("api-developer", "playbook.md"));
    });

    it("compiles the agent's own output.md into its output", async () => {
      const output = await compileAgentForHost(
        "claude",
        "web-developer",
        createMockAgentConfig("web-developer"),
        projectDir,
        await createLiquidEngine(),
      );

      expect(output).toContain(await fixtureText("web-developer", "output.md"));
    });

    it("when the agent directory is absent, should reject naming the path it could not read", async () => {
      await expect(
        compileAgentForHost(
          "claude",
          "web-developer",
          createMockAgentConfig("web-developer", [], { path: "nonexistent-agent" }),
          projectDir,
          await createLiquidEngine(),
        ),
      ).rejects.toThrow(/nonexistent-agent/);
    });

    it("keeps Liquid-looking text in an agent's prose as written", async () => {
      await fsWrite(
        path.join(projectDir, "src/agents/api-developer/identity.md"),
        PROSE_WITH_LIQUID_SYNTAX,
      );

      const output = await compileAgentForHost(
        "claude",
        "api-developer",
        createMockAgentConfig("api-developer"),
        projectDir,
        await createLiquidEngine(),
      );

      expect(output).toContain(PROSE_WITH_LIQUID_SYNTAX);
    });
  });

  describe("what an agent's files put in its output", () => {
    const CATEGORY_OUTPUT = "## Output\n\nThe category's own output section.";

    /** An agent nested under a category folder that carries the category's output.md. */
    async function categorisedAgent(ownOutput?: string): Promise<AgentConfig> {
      const agentDir = path.join(projectDir, "src/agents/developer/api-developer");
      await mkdir(agentDir, { recursive: true });
      for (const file of ["identity.md", "playbook.md"] as const) {
        await fsWrite(
          path.join(agentDir, file),
          await fsReadFile(path.join(FIXTURES_ROOT, "agents/api-developer", file), "utf-8"),
        );
      }
      if (ownOutput !== undefined) await fsWrite(path.join(agentDir, "output.md"), ownOutput);
      await fsWrite(path.join(projectDir, "src/agents/developer/output.md"), CATEGORY_OUTPUT);
      return createMockAgentConfig("api-developer", [], { path: "developer/api-developer" });
    }

    it("opens no critical or output section for an agent whose files hold none", async () => {
      const output = await compileAgentForHost(
        "claude",
        "api-developer",
        createMockAgentConfig("api-developer"),
        projectDir,
        await createLiquidEngine(),
      );

      expect(parseCompiledAgentSections(output).sectionOrder).toStrictEqual([
        ...SECTIONS_WITHOUT_CRITICAL_OR_OUTPUT,
      ]);
      expect(verbose).toHaveBeenCalledWith("Compiling agent: api-developer (claude)");
    });

    it.each([
      ["has no output.md", undefined],
      ["has an empty output.md", ""],
    ])("compiles the category's output when the agent %s", async (_case, ownOutput) => {
      const output = await compileAgentForHost(
        "claude",
        "api-developer",
        await categorisedAgent(ownOutput),
        projectDir,
        await createLiquidEngine(),
      );

      expect(output).toContain(CATEGORY_OUTPUT);
    });
  });

  describe("which templates an engine reads, and what it says", () => {
    beforeEach(() => {
      vi.mocked(verbose).mockClear();
    });

    it("says it uses the source folder's templates when the project has them", async () => {
      await installProjectTemplateOverride(projectDir);

      await createLiquidEngine(projectDir);

      expect(verbose).toHaveBeenCalledExactlyOnceWith(
        `Using local templates from: ${path.join(sourceFolderInUse(projectDir, "claude").dir, "agents", "_templates")}`,
      );
    });

    it("says it uses the legacy templates folder when the project has one", async () => {
      const legacyDir = path.join(projectDir, CLAUDE_DIR, "templates");
      await mkdir(legacyDir, { recursive: true });

      await createLiquidEngine(projectDir);

      expect(verbose).toHaveBeenCalledExactlyOnceWith(`Using legacy templates from: ${legacyDir}`);
    });

    it("says nothing about templates for a project with neither folder", async () => {
      await createLiquidEngine(projectDir);

      expect(verbose).not.toHaveBeenCalled();
    });

    it("refuses a template that names a filter Liquid does not have", async () => {
      const engine = await createLiquidEngine();

      await expect(engine.parseAndRender("{{ 'x' | no_such_filter }}")).rejects.toThrow(
        /undefined filter: no_such_filter/,
      );
    });
  });

  describe("createLiquidEngine", () => {
    /** An engine renders whatever it is given, so the marker alone cannot say which won. */
    it("renders a project's own agent template in place of the shipped one", async () => {
      await installProjectTemplateOverride(projectDir);
      const engine = await createLiquidEngine(projectDir);

      const compiled = await compileAgentForHost(
        "claude",
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

      const compiled = await compileAgentForHost(
        "claude",
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

  describe("compileAgentForHost", () => {
    it("stamps the compiled agent with the provenance marker, once", async () => {
      const output = await compileAgentForHost(
        "claude",
        "web-developer",
        createMockAgentConfig("web-developer"),
        projectDir,
        await createLiquidEngine(),
      );

      expect(hasProvenanceMarker(output)).toBe(true);
      expect(output.indexOf(provenanceMarker())).toBe(output.lastIndexOf(provenanceMarker()));
    });

    /** A project template may emit the marker itself; the compile must leave exactly one. */
    it("does not stack a second marker when the render already carries one", async () => {
      await writeProjectTemplate(projectDir, TEMPLATE_THAT_STAMPS);

      const output = await compileAgentForHost(
        "claude",
        "web-developer",
        createMockAgentConfig("web-developer"),
        projectDir,
        await createLiquidEngine(projectDir),
      );

      expect(output).toBe(RENDERED_BY_THE_STAMPING_TEMPLATE);
    });
  });

  /**
   * A real engine and the shipped template: asserts each optional field's value (a key survives a
   * lookup that resolved nothing) and each skill list's members (a count cannot see a swap).
   */
  describe("shipped agent template", () => {
    it("emits the permissionMode the agent carries, not the template default", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForHost(
        "claude",
        "web-developer",
        WEB_DEV_TUNED_PERMISSIONS,
        projectDir,
        engine,
      );

      expect(output).toContain("permissionMode: plan");
    });

    it("emits disallowedTools when the agent carries them", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForHost(
        "claude",
        "web-developer",
        WEB_DEV_TUNED_PERMISSIONS,
        projectDir,
        engine,
      );

      expect(output).toContain("disallowedTools: Bash, WebFetch");
    });

    it("falls back to the default permissionMode and omits disallowedTools when neither is set", async () => {
      const engine = await createLiquidEngine();

      const output = await compileAgentForHost(
        "claude",
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

      const output = await compileAgentForHost(
        "claude",
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

      const output = await compileAgentForHost(
        "claude",
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

      const output = await compileAgentForHost(
        "claude",
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

      const output = await compileAgentForHost(
        "claude",
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
    it("writes Liquid syntax in an agent's name and title as text, and says it stripped it", async () => {
      const output = await compileAgentForHost(
        "claude",
        "web-developer",
        WEB_DEV_LIQUID_INJECTION,
        projectDir,
        await createLiquidEngine(),
      );

      expect(output).not.toContain(WEB_DEV_LIQUID_INJECTION.name);
      expect(output).not.toContain(WEB_DEV_LIQUID_INJECTION.title);
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Stripped Liquid template syntax from 'agent.name'"),
      );
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining("Stripped Liquid template syntax from 'agent.title'"),
      );
    });
  });
});
