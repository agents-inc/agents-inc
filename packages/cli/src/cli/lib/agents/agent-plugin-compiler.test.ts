import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import { mkdir, writeFile, readFile, stat } from "fs/promises";
import { compileAllAgentPlugins, printAgentCompilationSummary } from "./agent-plugin-compiler";
import { PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../../consts";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import { renderAgentMd } from "../__tests__/content-generators";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { readInstallTree } from "../__tests__/helpers/golden-tree.js";
import { silenceConsole } from "../__tests__/helpers/silence-console.js";
import { setVerbose } from "../../utils/logger";

describe("agent-plugin-compiler", () => {
  let tempDir: string;
  let agentsDir: string;
  let outputDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("agent-compiler-test-");
    agentsDir = path.join(tempDir, "agents");
    outputDir = path.join(tempDir, "output");
    await mkdir(agentsDir, { recursive: true });
    await mkdir(outputDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("one agent's plugin", () => {
    const consoleSpies = silenceConsole(["log", "warn"]);

    async function compileOnly(fileName: string, content: string) {
      const agentPath = path.join(agentsDir, fileName);
      await writeFile(agentPath, content);
      return compileAllAgentPlugins(agentsDir, outputDir);
    }

    it("compiles an agent into a plugin named agent-<name>, at 1.0.0", async () => {
      const [result] = await compileOnly(
        "web-developer.md",
        renderAgentMd("web-developer", "Expert frontend developer"),
      );

      expect(result?.agentName).toBe("web-developer");
      expect(result?.manifest.name).toBe("agent-web-developer");
      expect(result?.manifest.version).toBe("1.0.0");
      expect((await stat(path.join(outputDir, "agent-web-developer"))).isDirectory()).toBe(true);
    });

    it("writes the manifest and the agent's markdown inside the plugin", async () => {
      await compileOnly(
        "cli-developer.md",
        renderAgentMd("cli-developer", "CLI development agent"),
      );
      const pluginDir = path.join(outputDir, "agent-cli-developer");

      expect(
        (await stat(path.join(pluginDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE))).isFile(),
      ).toBe(true);
      expect((await stat(path.join(pluginDir, "agents", "cli-developer.md"))).isFile()).toBe(true);
    });

    it("writes a plugin.json naming the agents path and the agent's description", async () => {
      await compileOnly(
        "api-developer.md",
        renderAgentMd("api-developer", "Backend API developer"),
      );

      const manifest = JSON.parse(
        await readFile(
          path.join(outputDir, "agent-api-developer", PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE),
          "utf-8",
        ),
      );

      expect(manifest.name).toBe("agent-api-developer");
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.agents).toBe("./agents/");
      expect(manifest.description).toBe("Backend API developer");
    });

    it("names the plugin from the frontmatter, not the file name", async () => {
      const [result] = await compileOnly(
        "my-agent.md",
        renderAgentMd("custom-agent", "A custom agent for testing"),
      );

      expect(result?.agentName).toBe("custom-agent");
      expect(result?.manifest.description).toBe("A custom agent for testing");
    });

    it("copies the agent's markdown into agents/ as written", async () => {
      const body = "# Web Developer\n\nYou are an expert frontend developer.";
      await compileOnly(
        "web-dev.md",
        renderAgentMd("web-dev", "Frontend developer agent", { body }),
      );

      const content = await readFile(
        path.join(outputDir, "agent-web-dev", "agents", "web-dev.md"),
        "utf-8",
      );

      expect(content).toContain("name: web-dev");
      expect(content).toContain("description: Frontend developer agent");
      expect(content).toContain("# Web Developer");
      expect(content).toContain("You are an expert frontend developer.");
    });

    it("skips an agent whose frontmatter lacks a required field, saying why", async () => {
      const results = await compileOnly("incomplete.md", "---\nname: incomplete\n---\n\n# Agent");

      expect(results).toStrictEqual([]);
      expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining("Agent 'incomplete.md' has invalid or missing YAML frontmatter"),
      );
    });

    it("bumps the version when the agent's content changes, and only then", async () => {
      const [first] = await compileOnly(
        "versioned.md",
        renderAgentMd("versioned", "Versioned agent", { body: "# Version 1" }),
      );
      const [unchanged] = await compileAllAgentPlugins(agentsDir, outputDir);
      const [changed] = await compileOnly(
        "versioned.md",
        renderAgentMd("versioned", "Versioned agent", { body: "# Version 2 - updated" }),
      );

      expect(first?.manifest.version).toBe("1.0.0");
      expect(unchanged?.manifest.version).toBe("1.0.0");
      expect(changed?.manifest.version).toBe("2.0.0");
    });
  });

  describe("rebuilding an agent plugin over its earlier build", () => {
    const consoleSpies = silenceConsole(["log", "warn"]);

    async function writeWebDeveloper(): Promise<string> {
      const agentPath = path.join(agentsDir, "web-developer.md");
      await writeFile(agentPath, renderAgentMd("web-developer", "Expert frontend developer"));
      return agentPath;
    }

    async function compileWebDeveloper() {
      return firstElement(await compileAllAgentPlugins(agentsDir, outputDir));
    }

    it.each([
      [
        "a file this build does not",
        (pluginPath: string) => path.join(pluginPath, "agents", "stale-orphan.md"),
      ],
      [
        "an agent file whose bytes this build does not reproduce",
        (pluginPath: string) => path.join(pluginPath, "agents", "web-developer.md"),
      ],
    ])(
      "takes a new version when its earlier build shipped %s, though the source is unchanged",
      async (_, earlierBuildFile) => {
        await writeWebDeveloper();
        const first = await compileWebDeveloper();
        const firstTree = await readInstallTree(first.pluginPath);
        await writeFile(earlierBuildFile(first.pluginPath), "# Left by an earlier build");

        const second = await compileWebDeveloper();

        expect(second.manifest.version).toBe("2.0.0");
        expect(await readInstallTree(second.pluginPath)).toStrictEqual({
          files: {
            ...firstTree.files,
            ".claude-plugin/plugin.json": firstTree.files[".claude-plugin/plugin.json"]?.replace(
              '"version": "1.0.0"',
              '"version": "2.0.0"',
            ),
          },
          emptyDirectories: [],
        });
      },
    );

    it("keeps the version it bumped to when the next rebuild ships the same files", async () => {
      await writeWebDeveloper();
      const first = await compileWebDeveloper();
      await writeFile(path.join(first.pluginPath, "agents", "stale-orphan.md"), "# Stale");
      const bumped = await compileWebDeveloper();
      const bumpedTree = await readInstallTree(bumped.pluginPath);

      const rebuilt = await compileWebDeveloper();

      expect(rebuilt.manifest.version).toBe("2.0.0");
      expect(await readInstallTree(rebuilt.pluginPath)).toStrictEqual(bumpedTree);
    });

    it("refuses, on every build, a folder holding files but no plugin manifest, and writes nothing", async () => {
      const agentPath = await writeWebDeveloper();
      const pluginDir = path.join(outputDir, "agent-web-developer");
      await mkdir(pluginDir, { recursive: true });
      await writeFile(path.join(pluginDir, "notes.md"), "# Not written by a build");
      const refusal = `  Warning: Failed to compile agent from 'web-developer.md': Agent 'web-developer.md' would be built into ${pluginDir}, which holds no ${path.join(PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE)} and is not empty, so no earlier build made it and a rebuild would delete what it holds. Move its contents out, or build into another output directory. File: ${agentPath}`;

      expect(await compileAllAgentPlugins(agentsDir, outputDir)).toStrictEqual([]);
      expect(await compileAllAgentPlugins(agentsDir, outputDir)).toStrictEqual([]);

      expect(consoleSpies.warn).toHaveBeenCalledTimes(2);
      expect(consoleSpies.warn).toHaveBeenNthCalledWith(1, refusal);
      expect(consoleSpies.warn).toHaveBeenNthCalledWith(2, refusal);
      expect(await readInstallTree(outputDir)).toStrictEqual({
        files: { "agent-web-developer/notes.md": "# Not written by a build" },
        emptyDirectories: [],
      });
    });

    it("builds into an empty folder no earlier build made", async () => {
      await writeWebDeveloper();
      await mkdir(path.join(outputDir, "agent-web-developer"));

      const { manifest } = await compileWebDeveloper();

      expect(manifest.version).toBe("1.0.0");
      expect(consoleSpies.warn).not.toHaveBeenCalled();
    });

    it("refuses to build a plugin into the folder holding its own source, and writes nothing", async () => {
      await writeWebDeveloper();
      const { pluginPath } = await compileWebDeveloper();
      const sourceInsidePlugin = path.join(pluginPath, "agents");
      const outputBefore = await readInstallTree(outputDir);

      expect(await compileAllAgentPlugins(sourceInsidePlugin, outputDir)).toStrictEqual([]);

      expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
        `  Warning: Failed to compile agent from 'web-developer.md': Agent 'web-developer.md' would be built into ${pluginPath}, which holds its own source, so building it would overwrite that source. Build into an output directory outside the agents directory. File: ${path.join(sourceInsidePlugin, "web-developer.md")}`,
      );
      expect(await readInstallTree(outputDir)).toStrictEqual(outputBefore);
    });
  });

  describe("compileAllAgentPlugins", () => {
    it("should compile all agent .md files from directory", async () => {
      await writeFile(
        path.join(agentsDir, "web-developer.md"),
        renderAgentMd("web-developer", "Frontend developer"),
      );
      await writeFile(
        path.join(agentsDir, "api-developer.md"),
        renderAgentMd("api-developer", "Backend developer"),
      );
      await writeFile(
        path.join(agentsDir, "cli-developer.md"),
        renderAgentMd("cli-developer", "CLI developer"),
      );

      const results = await compileAllAgentPlugins(agentsDir, outputDir);

      expect(results).toHaveLength(3);
      const agentNames = results.map((r) => r.agentName).sort();
      expect(agentNames).toStrictEqual(["api-developer", "cli-developer", "web-developer"]);
    });

    it("should handle empty agents directory", async () => {
      const results = await compileAllAgentPlugins(agentsDir, outputDir);
      expect(results).toStrictEqual([]);
    });

    it("should warn and skip agents with missing frontmatter", async () => {
      await writeFile(
        path.join(agentsDir, "good-agent.md"),
        renderAgentMd("good-agent", "A good agent"),
      );
      await writeFile(path.join(agentsDir, "bad-agent.md"), "# No frontmatter here");

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const results = await compileAllAgentPlugins(agentsDir, outputDir);

      expect(results).toHaveLength(1);
      expect(firstElement(results).agentName).toBe("good-agent");

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("Warning:"));

      vi.restoreAllMocks();
    });

    it("should create plugin directories for each agent", async () => {
      await writeFile(path.join(agentsDir, "alpha.md"), renderAgentMd("alpha", "Alpha agent"));
      await writeFile(path.join(agentsDir, "beta.md"), renderAgentMd("beta", "Beta agent"));

      const results = await compileAllAgentPlugins(agentsDir, outputDir);

      for (const result of results) {
        const stats = await stat(result.pluginPath);
        expect(stats.isDirectory()).toBe(true);

        const manifestPath = path.join(
          result.pluginPath,
          PLUGIN_MANIFEST_DIR,
          PLUGIN_MANIFEST_FILE,
        );
        const manifestStats = await stat(manifestPath);
        expect(manifestStats.isFile()).toBe(true);
      }
    });

    it("should log success messages for compiled agents", async () => {
      await writeFile(
        path.join(agentsDir, "web-developer.md"),
        renderAgentMd("web-developer", "Frontend developer"),
      );

      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await compileAllAgentPlugins(agentsDir, outputDir);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("[OK]"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("agent-web-developer"));

      vi.restoreAllMocks();
    });
  });

  describe("printAgentCompilationSummary", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should print count of compiled agent plugins", () => {
      const results = [
        {
          pluginPath: "/out/agent-web-developer",
          manifest: {
            name: "agent-web-developer",
            version: "1.0.0",
            category: "meta-reviewing" as const,
          },
          agentName: "web-developer",
        },
        {
          pluginPath: "/out/agent-api-developer",
          manifest: {
            name: "agent-api-developer",
            version: "2.0.0",
            category: "meta-reviewing" as const,
          },
          agentName: "api-developer",
        },
      ];

      printAgentCompilationSummary(results);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Compiled 2 agent plugins"));
    });

    it("should print each agent name with version", () => {
      const results = [
        {
          pluginPath: "/out/agent-web-developer",
          manifest: {
            name: "agent-web-developer",
            version: "1.0.0",
            category: "meta-reviewing" as const,
          },
          agentName: "web-developer",
        },
      ];

      printAgentCompilationSummary(results);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("agent-web-developer"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("v1.0.0"));
    });

    it("should handle empty results array", () => {
      printAgentCompilationSummary([]);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Compiled 0 agent plugins"));
    });
  });

  describe("what an agent plugin compile says and where it writes", () => {
    const consoleSpies = silenceConsole(["log", "warn"]);

    afterEach(() => setVerbose(false));

    it("writes the plugin into agent-<name>, saying each step", async () => {
      const agentPath = path.join(agentsDir, "web-developer.md");
      await writeFile(agentPath, renderAgentMd("web-developer", "Expert frontend developer"));
      setVerbose(true);

      const [result] = await compileAllAgentPlugins(agentsDir, outputDir);

      expect(result?.pluginPath).toBe(path.join(outputDir, "agent-web-developer"));
      expect(consoleSpies.log).toHaveBeenCalledWith(
        `  Compiling agent plugin: web-developer from ${agentPath}`,
      );
      expect(consoleSpies.log).toHaveBeenCalledWith(
        "    Wrote plugin.json for web-developer (v1.0.0)",
      );
      expect(consoleSpies.log).toHaveBeenCalledWith(
        "    Copied agent web-developer.md -> agents/web-developer.md",
      );
    });

    it("warns about each agent it could not compile, naming its file", async () => {
      await writeFile(path.join(agentsDir, "bad-agent.md"), "# No frontmatter here");

      await compileAllAgentPlugins(agentsDir, outputDir);

      expect(consoleSpies.warn).toHaveBeenCalledExactlyOnceWith(
        `  Warning: Failed to compile agent from 'bad-agent.md': Agent 'bad-agent.md' has invalid or missing YAML frontmatter: no YAML frontmatter block. File: ${path.join(agentsDir, "bad-agent.md")}`,
      );
    });
  });
});
