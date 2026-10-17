import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  cleanupTempDir,
  renderAgentYaml,
  sourceFolderIn,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import "../matchers/setup.js";
import { EXIT_CODES, FILES } from "../pages/constants.js";
import type { AgentName } from "../../src/cli/types/index.js";
import { CLI } from "../fixtures/cli.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";

// Fabricated and never written to disk; a string, not cast into `SkillId`.
const E2E_COMPILE_SKILL = "web-testing-e2e-compile";

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
  const agentDir = path.join(sourceFolderIn(projectDir), "agents", agentName);
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

      await createCustomAgent(projectDir, "my-custom-agent", {
        identityContent: "E2E-CUSTOM-AGENT-INTRO",
        playbookContent: "E2E-CUSTOM-AGENT-WORKFLOW",
        description: "A custom E2E test agent",
        domain: "web",
      });

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "e2e-custom-agent-test",
          skills: buildSkillConfigs([E2E_COMPILE_SKILL], { scope: "project", origin: "eject" }),
          // Cast: a custom agent name is outside the `AgentName` union.
          agents: buildAgentConfigs(["web-developer", "my-custom-agent" as AgentName], {
            scope: "project",
          }),
        }),
      );

      const { exitCode } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

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

      await createCustomAgent(projectDir, "web-developer", {
        identityContent: "E2E-OVERRIDE-INTRO",
        playbookContent: "E2E-OVERRIDE-WORKFLOW",
        description: "Custom override of web-developer",
        domain: "web",
      });

      const { exitCode } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["E2E-OVERRIDE-INTRO", "E2E-OVERRIDE-WORKFLOW"],
      });
    });

    it("should compile custom agent alongside built-in agents without cross-contamination", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await createCustomAgent(projectDir, "my-custom-agent", {
        identityContent: "E2E-CUSTOM-ONLY-CONTENT",
        playbookContent: "E2E-CUSTOM-ONLY-WORKFLOW",
        description: "A custom agent for coexistence test",
        domain: "web",
      });

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "e2e-coexistence-test",
          skills: buildSkillConfigs([E2E_COMPILE_SKILL], { scope: "project", origin: "eject" }),
          // Cast: a custom agent name is outside the `AgentName` union.
          agents: buildAgentConfigs(["web-developer", "my-custom-agent" as AgentName], {
            scope: "project",
          }),
        }),
      );

      const { exitCode } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);

      await expect({ dir: projectDir }).toHaveCompiledAgent("web-developer");
      await expect({ dir: projectDir }).toHaveCompiledAgent("my-custom-agent");

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

      await createCustomAgent(projectDir, "incomplete-agent", {
        identityContent: "E2E-INCOMPLETE-AGENT-INTRO",
        // No playbookContent: playbook.md is not created.
        description: "An agent with missing playbook.md",
        domain: "web",
      });

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "e2e-missing-workflow-test",
          skills: buildSkillConfigs([E2E_COMPILE_SKILL], { scope: "project", origin: "eject" }),
          // Cast: a custom agent name is outside the `AgentName` union.
          agents: buildAgentConfigs(["incomplete-agent" as AgentName], { scope: "project" }),
        }),
      );

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // The missing playbook fails only that agent; compile reports it and still succeeds.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toMatch(/failed|error|playbook/i);
    });

    it("should report useful error when custom agent has empty metadata.yaml", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      await createCustomAgent(projectDir, "broken-agent", {
        metadataYaml: "",
        identityContent: "Some intro",
        playbookContent: "Some workflow",
      });

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "e2e-empty-metadata-test",
          skills: buildSkillConfigs([E2E_COMPILE_SKILL], { scope: "project", origin: "eject" }),
          // Cast: a custom agent name is outside the `AgentName` union.
          agents: buildAgentConfigs(["broken-agent" as AgentName], { scope: "project" }),
        }),
      );

      const { output } = await CLI.run(["compile"], { dir: projectDir });

      // The agent with invalid metadata.yaml is skipped with a warning.
      expect(output).toMatch(/invalid|skip|not found/i);
    });
  });
});
