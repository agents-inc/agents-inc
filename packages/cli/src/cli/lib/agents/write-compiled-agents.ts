import os from "os";
import path from "path";
import type { Liquid } from "liquidjs";
import { compileAgentForPlugin } from "../compiler.js";
import { resolveInstallPaths } from "../installation/install-base-dir.js";
import { writeFile, ensureDir } from "../../utils/fs.js";
import { typedEntries } from "../../utils/typed-object.js";
import type { AgentConfig, AgentName, SkillScope } from "../../types/index.js";

export type AgentWriteOutcome =
  | { name: AgentName; ok: true; scope: SkillScope; targetDir: string }
  | { name: AgentName; ok: false; error: unknown };

/**
 * Compiles each resolved agent and writes it to its scope's agents directory:
 * global agents to `~/.claude/agents/`, project agents to `projectAgentsDir`.
 * Per-agent failures are collected as outcomes — callers own the policy
 * (recompile reports and continues; install hard-errors).
 */
export async function writeCompiledAgentsByScope(params: {
  resolvedAgents: Record<AgentName, AgentConfig>;
  sourcePath: string;
  engine: Liquid;
  projectAgentsDir: string;
  agentScopeMap?: Map<AgentName, SkillScope>;
}): Promise<AgentWriteOutcome[]> {
  const globalAgentsDir = resolveInstallPaths(os.homedir(), "global").agentsDir;

  // Ensure both directories exist before writing agents.
  // ensureDir is idempotent (mkdir -p), so calling it when dirs already exist is safe.
  await ensureDir(globalAgentsDir);

  const outcomes: AgentWriteOutcome[] = [];
  for (const [name, agent] of typedEntries<AgentName, AgentConfig>(params.resolvedAgents)) {
    try {
      const output = await compileAgentForPlugin(name, agent, params.sourcePath, params.engine);
      const scope = params.agentScopeMap?.get(name) ?? "project";
      const targetDir = scope === "global" ? globalAgentsDir : params.projectAgentsDir;
      await writeFile(path.join(targetDir, `${name}.md`), output);
      outcomes.push({ name, ok: true, scope, targetDir });
    } catch (error) {
      outcomes.push({ name, ok: false, error });
    }
  }
  return outcomes;
}
