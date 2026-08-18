import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  cleanupTempDir,
  ensureBinaryExists,
  renderAgentYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import "../matchers/setup.js";
import { DIRS, EXIT_CODES, FILES } from "../pages/constants.js";
import type { SkillId, AgentName } from "../../src/cli/types/index.js";
import { CLI } from "../fixtures/cli.js";

const E2E_COMPILE_SKILL = "web-testing-e2e-compile" as SkillId;

/**
 * Writes a custom agent structure under .claude-src/agents/<agentName>/
 * with metadata.yaml, identity.md, and optionally playbook.md.
 */
async function createCustomAgent(
  projectDir: string,
  agentName: string,
  options: {
    identityContent: string;
    playbookContent?: string;
    metadataYaml?: string;
    description?: string;
    tools?: string[];
    domain?: string;
  },
): Promise<string> {
  const agentDir = path.join(projectDir, DIRS.CLAUDE_SRC, "agents", agentName);
  await mkdir(agentDir, { recursive: true });

  const metadataYaml =
    options.metadataYaml ??
    renderAgentYaml(agentName, options.description, {
      title: `${agentName} Agent`,
      tools: options.tools ?? ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
    }) + (options.domain ? `\ndomain: ${options.domain}` : "");

  await writeFile(path.join(agentDir, FILES.METADATA_YAML), metadataYaml);
  await writeFile(path.join(agentDir, FILES.IDENTITY_MD), options.identityContent);

  if (options.playbookContent !== undefined) {
    await writeFile(path.join(agentDir, FILES.PLAYBOOK_MD), options.playbookContent);
  }

  return agentDir;
}

describe("custom sub-agents", () => {
  let tempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined;
    }
  });

  describe("custom agent compilation", () => {
    it("should compile a custom agent to the output directory", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Create a custom agent structure
      await createCustomAgent(projectDir, "my-custom-agent", {
        identityContent: "E2E-CUSTOM-AGENT-INTRO",
        playbookContent: "E2E-CUSTOM-AGENT-WORKFLOW",
        description: "A custom E2E test agent",
        domain: "web",
      });

      // Update config to reference the custom agent
      await writeProjectConfig(projectDir, {
        name: "e2e-custom-agent-test",
        skills: [{ id: E2E_COMPILE_SKILL, scope: "project", origin: "eject" }],
        agents: [
          { name: "web-developer", scope: "project" },
          { name: "my-custom-agent" as AgentName, scope: "project" }, // fabricated E2E test ID
        ],
      });

      const { exitCode } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Verify the custom agent was compiled with valid frontmatter and custom content
      await expect({ dir: projectDir }).toHaveCompiledAgent("my-custom-agent");
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("my-custom-agent", {
        contains: ["E2E-CUSTOM-AGENT-INTRO", "E2E-CUSTOM-AGENT-WORKFLOW"],
      });
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("my-custom-agent", {
        name: "my-custom-agent",
      });
    });

    it("should override a built-in agent with a custom agent of the same name", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Create a custom agent that overrides the built-in web-developer
      await createCustomAgent(projectDir, "web-developer", {
        identityContent: "E2E-OVERRIDE-INTRO",
        playbookContent: "E2E-OVERRIDE-WORKFLOW",
        description: "Custom override of web-developer",
        domain: "web",
      });

      const { exitCode } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Should contain the custom override content, not the built-in intro
      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["E2E-OVERRIDE-INTRO", "E2E-OVERRIDE-WORKFLOW"],
      });
    });

    it("should compile custom agent alongside built-in agents without cross-contamination", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Create a custom agent
      await createCustomAgent(projectDir, "my-custom-agent", {
        identityContent: "E2E-CUSTOM-ONLY-CONTENT",
        playbookContent: "E2E-CUSTOM-ONLY-WORKFLOW",
        description: "A custom agent for coexistence test",
        domain: "web",
      });

      // Config includes both built-in and custom agents
      await writeProjectConfig(projectDir, {
        name: "e2e-coexistence-test",
        skills: [{ id: E2E_COMPILE_SKILL, scope: "project", origin: "eject" }],
        agents: [
          { name: "web-developer", scope: "project" },
          { name: "my-custom-agent" as AgentName, scope: "project" }, // fabricated E2E test ID
        ],
      });

      const { exitCode } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      // Both agent files should exist with valid frontmatter
      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      await expect({ dir: projectDir }).toHaveCompiledAgent("my-custom-agent");

      // Custom agent content should only appear in the custom agent file (no cross-contamination)
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("my-custom-agent", {
        contains: ["E2E-CUSTOM-ONLY-CONTENT", "name: my-custom-agent"],
      });
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer"],
        notContains: ["E2E-CUSTOM-ONLY-CONTENT"],
      });
      await expect({ dir: projectDir }).toHaveAgentFrontmatter("my-custom-agent", {
        name: "my-custom-agent",
      });
    });
  });

  describe("edge cases", () => {
    it("should fail gracefully when custom agent is missing playbook.md", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Create a custom agent without playbook.md
      await createCustomAgent(projectDir, "incomplete-agent", {
        identityContent: "E2E-INCOMPLETE-AGENT-INTRO",
        // playbook.md intentionally omitted (undefined means skip creation)
        description: "An agent with missing playbook.md",
        domain: "web",
      });

      await writeProjectConfig(projectDir, {
        name: "e2e-missing-workflow-test",
        skills: [{ id: E2E_COMPILE_SKILL, scope: "project", origin: "eject" }],
        agents: [{ name: "incomplete-agent" as AgentName, scope: "project" }], // fabricated E2E test ID
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // "Gracefully" is the contract: readAgentFiles() calls readFile() (not
      // readFileOptional) for playbook.md, so the missing file fails THAT agent —
      // recompileAgents records it in `failed` and compile.ts reports it without
      // aborting the run. One broken custom agent must not sink the whole compile.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toMatch(/failed|error|playbook/i);
    });

    it("should report useful error when custom agent has empty metadata.yaml", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      const agentDir = path.join(projectDir, DIRS.CLAUDE_SRC, "agents", "broken-agent");
      await mkdir(agentDir, { recursive: true });

      // Write an empty metadata.yaml (missing required fields)
      await writeFile(path.join(agentDir, FILES.METADATA_YAML), "");
      await writeFile(path.join(agentDir, FILES.IDENTITY_MD), "Some intro");
      await writeFile(path.join(agentDir, FILES.PLAYBOOK_MD), "Some workflow");

      await writeProjectConfig(projectDir, {
        name: "e2e-empty-metadata-test",
        skills: [{ id: E2E_COMPILE_SKILL, scope: "project", origin: "eject" }],
        agents: [{ name: "broken-agent" as AgentName, scope: "project" }], // fabricated E2E test ID
      });

      const { output } = await CLI.run(["compile"], { dir: projectDir });

      // loadProjectAgents warns about invalid metadata.yaml and skips the agent.
      // The compile should either warn about the skipped agent or report it's not found.
      expect(output).toMatch(/invalid|skip|not found/i);
    });
  });
});
