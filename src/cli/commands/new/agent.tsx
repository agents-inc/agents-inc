import React, { useState } from "react";

import { Args, Flags } from "@oclif/core";
import { TextInput } from "@inkjs/ui";
import { spawn } from "child_process";
import matter from "gray-matter";
import { render, Box, Text, useApp, useInput } from "ink";
import path from "path";

import { BaseCommand } from "../../base-command.js";
import { CLAUDE_DIR, CLI_COLORS, STANDARD_FILES } from "../../consts.js";
import { resolveSource } from "../../lib/configuration/index.js";
import {
  type ConfigTypesBackgroundData,
  loadConfigTypesDataInBackground,
  regenerateConfigTypes,
} from "../../lib/configuration/config-types-writer.js";
import { EXIT_CODES } from "../../lib/exit-codes.js";
import { assertDirOverwritable } from "../../lib/assert-dir-overwritable.js";
import { FEATURE_FLAGS } from "../../lib/feature-flags.js";
import { getAgentDefinitions } from "../../lib/agents/index.js";
import { getErrorMessage } from "../../utils/errors.js";
import { isClaudeCLIAvailable } from "../../utils/exec.js";
import { directoryExists, fileExists, readFile } from "../../utils/fs.js";

const SEPARATOR_WIDTH = 60;

type PurposeInputProps = {
  onSubmit: (purpose: string) => void;
  onCancel: () => void;
};

type PurposeOutcome = { status: "submitted"; purpose: string } | { status: "cancelled" };

const PurposeInput: React.FC<PurposeInputProps> = ({ onSubmit, onCancel }) => {
  const { exit } = useApp();
  const [error, setError] = useState<string | null>(null);

  useInput((_input, key) => {
    if (key.escape) {
      onCancel();
      exit();
    }
  });

  const handleSubmit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Purpose is required");
      return;
    }
    onSubmit(trimmed);
    exit();
  };

  return (
    <Box flexDirection="column">
      <Text bold>Create New Agent</Text>
      <Text>What should this agent do?</Text>
      <Text dimColor>e.g., Manages database migrations with rollback support</Text>
      <Text> </Text>
      <TextInput placeholder="Enter agent purpose..." onSubmit={handleSubmit} />
      {error && (
        <Box marginTop={1}>
          <Text color={CLI_COLORS.ERROR}>{error}</Text>
        </Box>
      )}
    </Box>
  );
};

export default class NewAgent extends BaseCommand {
  static summary = "Create a new custom agent using AI generation";
  static description =
    "Uses the agent-summoner meta-agent to scaffold a new agent with proper structure and documentation.";

  static examples = [
    {
      description: "Scaffold an agent (interactive prompt)",
      command: "<%= config.bin %> <%= command.id %> my-agent",
    },
    {
      description: "Scaffold with purpose provided up front",
      command: '<%= config.bin %> <%= command.id %> my-agent --purpose "Manage DB migrations"',
    },
    {
      description: "Overwrite an existing agent",
      command: "<%= config.bin %> <%= command.id %> my-agent --force",
    },
  ];

  static args = {
    name: Args.string({
      description: "Name of the agent to create",
      required: true,
    }),
  };

  static flags = {
    ...BaseCommand.baseFlags,
    purpose: Flags.string({
      char: "p",
      description: "Purpose/description of the agent",
      required: false,
    }),
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing agent",
      default: false,
    }),
  };

  async run(): Promise<void> {
    if (!FEATURE_FLAGS.NEW_AGENT_COMMAND) {
      this.error("The `new agent` command is currently disabled while being improved.", {
        exit: EXIT_CODES.ERROR,
      });
    }

    const { args, flags } = await this.parse(NewAgent);
    const projectDir = process.cwd();

    const configTypesReady = loadConfigTypesDataInBackground(flags.source, projectDir);
    await this.ensureClaudeCliAvailable();

    const purpose = flags.purpose ?? (await this.promptForPurpose());
    const outputDir = path.join(projectDir, CLAUDE_DIR, "agents", "_custom");

    await this.checkExistingDir(path.join(outputDir, args.name), flags.force);
    this.logAgentPlan(args.name, purpose, outputDir);
    await this.generateAgent(args.name, purpose, outputDir, flags, projectDir);
    await this.updateConfigTypes(projectDir, configTypesReady, args.name);

    this.log("");
    this.log("─".repeat(SEPARATOR_WIDTH));
    this.logSuccess("Agent creation complete!");
  }

  private async checkExistingDir(agentDir: string, force: boolean): Promise<void> {
    const result = await assertDirOverwritable(agentDir);
    if (result.ok) return;
    if (!force) {
      this.error(`Agent directory already exists: ${agentDir}\nUse --force to overwrite.`, {
        exit: EXIT_CODES.ERROR,
      });
    }
    this.warn(`Overwriting existing agent at ${agentDir}`);
  }

  private async ensureClaudeCliAvailable(): Promise<void> {
    const cliAvailable = await isClaudeCLIAvailable();
    if (!cliAvailable) {
      this.error(
        "Claude CLI not found. Please install it first:\n" +
          "  npm install -g @anthropic-ai/claude-code",
        { exit: EXIT_CODES.ERROR },
      );
    }
  }

  private async promptForPurpose(): Promise<string> {
    const outcome = await new Promise<PurposeOutcome>((resolve) => {
      const { waitUntilExit } = render(
        <PurposeInput
          onSubmit={(value) => resolve({ status: "submitted", purpose: value })}
          onCancel={() => resolve({ status: "cancelled" })}
        />,
      );
      // App exit without a callback (or a render failure) counts as a cancel;
      // resolve is first-wins, so a prior submit is unaffected.
      waitUntilExit().then(
        () => resolve({ status: "cancelled" }),
        () => resolve({ status: "cancelled" }),
      );
    });

    if (outcome.status === "cancelled") {
      this.log("Cancelled");
      this.exit(EXIT_CODES.CANCELLED);
      throw new Error("unreachable");
    }

    return outcome.purpose;
  }

  private logAgentPlan(name: string, purpose: string, outputDir: string): void {
    this.log("");
    this.log(`Agent name: ${name}`);
    this.log(`Purpose: ${purpose}`);
    this.log(`Output: ${outputDir}`);
    this.log("");
  }

  private async generateAgent(
    name: string,
    purpose: string,
    outputDir: string,
    flags: { source: string | undefined },
    projectDir: string,
  ): Promise<void> {
    this.log("Fetching agent-summoner from source...");

    try {
      const sourceConfig = await resolveSource(flags.source, projectDir);
      const agentDef = await loadMetaAgent({
        projectDir,
        source: sourceConfig.source,
      });
      this.log("Meta-agent loaded");
      this.log("");

      const agentPrompt = buildAgentPrompt(name, purpose, outputDir);

      this.log("Invoking agent-summoner to create your agent...");
      this.log("─".repeat(SEPARATOR_WIDTH));
      this.log("");

      await invokeMetaAgent({
        agentDef,
        prompt: agentPrompt,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  private async updateConfigTypes(
    projectDir: string,
    configTypesReady: Promise<ConfigTypesBackgroundData>,
    agentName: string,
  ): Promise<void> {
    try {
      await regenerateConfigTypes(projectDir, configTypesReady, {
        extraAgentNames: [agentName],
      });
    } catch (error) {
      this.warn(`Could not update ${STANDARD_FILES.CONFIG_TYPES_TS}: ${getErrorMessage(error)}`);
    }
  }
}

const META_AGENT_NAME = "agent-summoner";

type NewAgentInput = {
  description: string;
  prompt: string;
  model?: string;
  tools?: string[];
};

type LoadMetaAgentOptions = {
  projectDir: string;
  source: string;
};

type InvokeMetaAgentOptions = {
  agentDef: NewAgentInput;
  prompt: string;
};

function parseCompiledAgent(content: string): NewAgentInput {
  const { data: frontmatter, content: body } = matter(content);
  const tools =
    typeof frontmatter.tools === "string"
      ? frontmatter.tools.split(",").map((t: string) => t.trim())
      : frontmatter.tools;

  return {
    description: frontmatter.description || "Creates new agents",
    prompt: body.trim(),
    model: frontmatter.model,
    tools,
  };
}

async function loadMetaAgent(options: LoadMetaAgentOptions): Promise<NewAgentInput> {
  const { projectDir, source } = options;
  const compiledFileName = `${META_AGENT_NAME}.md`;

  const localAgentPath = path.join(projectDir, CLAUDE_DIR, "agents", compiledFileName);
  if (await fileExists(localAgentPath)) {
    return parseCompiledAgent(await readFile(localAgentPath));
  }

  try {
    const agentPaths = await getAgentDefinitions(source, { projectDir });
    const remoteAgentPath = path.join(
      agentPaths.sourcePath,
      CLAUDE_DIR,
      "agents",
      compiledFileName,
    );
    if (await fileExists(remoteAgentPath)) {
      return parseCompiledAgent(await readFile(remoteAgentPath));
    }
  } catch {
    // Source does not contain agents — fall through to error
  }

  throw new Error(
    `Agent '${META_AGENT_NAME}' not found.\n\n` + `Run 'compile' first to generate agents.`,
  );
}

export function buildAgentPrompt(agentName: string, purpose: string, outputDir: string): string {
  return `Create a new Claude Code agent named "${agentName}" in the directory "${outputDir}".

Agent Purpose: ${purpose}

Requirements:
1. Create the agent directory structure at ${outputDir}/${agentName}/
2. Create metadata.yaml with appropriate configuration
3. Create identity.md with the agent's role and context
4. Create playbook.md with the agent's operational process
5. Optionally create output.md if output format guidance would help
6. Optionally create critical-requirements.md for important rules
7. Include \`custom: true\` in the metadata.yaml configuration

Follow the existing agent patterns in the codebase. Keep the agent focused and practical.`;
}

async function invokeMetaAgent(options: InvokeMetaAgentOptions): Promise<void> {
  const { agentDef, prompt } = options;

  const agentsJson = JSON.stringify({
    [META_AGENT_NAME]: {
      description: agentDef.description,
      prompt: agentDef.prompt,
      model: agentDef.model,
      tools: agentDef.tools,
    },
  });

  const args = ["--agents", agentsJson, "--agent", META_AGENT_NAME, "--prompt", prompt];

  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      stdio: "inherit",
    });

    child.on("error", (error) => {
      reject(new Error(`Failed to spawn claude CLI: ${error.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Claude CLI exited with code ${code}`));
      }
    });
  });
}
