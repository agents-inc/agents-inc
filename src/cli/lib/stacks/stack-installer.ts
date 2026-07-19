import os from "os";
import path from "path";

import { compileStackPlugin } from "./stack-plugin-compiler";
import { claudePluginInstall, isClaudeCLIAvailable } from "../../utils/exec";
import { buildMarketplacePluginRef } from "../plugins";
import { remove, ensureDir } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import type { CompiledStackPlugin } from "./stack-plugin-compiler";
import type { AgentName, SkillId } from "../../types";

export type StackInstallOptions = {
  stackId: string;
  projectDir: string;
  sourcePath: string;
  agentSourcePath: string;
  marketplace?: string;
};

export type StackInstallResult = {
  pluginName: string;
  stackName: string;
  agents: AgentName[];
  skills: SkillId[];
  pluginPath: string;
  fromMarketplace: boolean;
};

export async function compileStackToTemp(options: {
  stackId: string;
  projectRoot: string;
  agentSourcePath?: string;
}): Promise<{ result: CompiledStackPlugin; cleanup: () => Promise<void> }> {
  const tempDir = path.join(os.tmpdir(), `cc-stack-${Date.now()}`);
  await ensureDir(tempDir);

  const result = await compileStackPlugin({
    stackId: options.stackId,
    outputDir: tempDir,
    projectRoot: options.projectRoot,
    agentSourcePath: options.agentSourcePath,
  });

  return {
    result,
    cleanup: async () => {
      await remove(tempDir);
    },
  };
}

export async function installStackAsPlugin(
  options: StackInstallOptions,
): Promise<StackInstallResult> {
  const { stackId, projectDir, sourcePath, agentSourcePath, marketplace } = options;

  const claudeAvailable = await isClaudeCLIAvailable();
  if (!claudeAvailable) {
    throw new Error(
      "Claude CLI not found. Please install Claude Code first: https://claude.ai/code",
    );
  }

  if (marketplace) {
    const pluginRef = buildMarketplacePluginRef(stackId, marketplace);
    verbose(`Installing from marketplace: ${pluginRef}`);

    await claudePluginInstall(pluginRef, "project", projectDir);

    return {
      pluginName: stackId,
      stackName: stackId,
      agents: [],
      skills: [],
      pluginPath: pluginRef,
      fromMarketplace: true,
    };
  }

  verbose(`Compiling stack locally: ${stackId}`);
  const { result, cleanup } = await compileStackToTemp({
    stackId,
    projectRoot: sourcePath,
    agentSourcePath,
  });

  try {
    await claudePluginInstall(result.pluginPath, "project", projectDir);

    return {
      pluginName: `stack-${stackId}`,
      stackName: result.stackName,
      agents: result.agents,
      skills: result.skillPlugins,
      pluginPath: result.pluginPath,
      fromMarketplace: false,
    };
  } finally {
    await cleanup();
  }
}
