import os from "os";
import path from "path";
import type { Liquid } from "liquidjs";
import { compileAgentForPlugin } from "../compiler.js";
import { resolveInstallPaths } from "../installation/install-base-dir.js";
import { writeFile, fileExists, readFile } from "../../utils/fs.js";
import { typedEntries } from "../../utils/typed-object.js";
import type { AgentConfig, AgentName, SkillScope } from "../../types/index.js";

export type AgentWriteOutcome =
  | {
      name: AgentName;
      ok: true;
      scope: SkillScope;
      targetDir: string;
      /**
       * Whether this pass actually wrote the file. False means the compiled output
       * matched what was already on disk, so nothing was written — which is what
       * lets a recompile summary tell a real one from a no-op instead of counting
       * the roster it walked.
       */
      rewritten: boolean;
    }
  | { name: AgentName; ok: false; error: unknown };

/**
 * Whether the target already holds exactly this content, making a write a no-op.
 *
 * Skipping that write is what gives "unchanged" a meaning a caller can check: an
 * agent reported unchanged keeps its mtime, and an mtime is the only trace a
 * rewrite-with-identical-bytes leaves anywhere.
 */
async function holdsExactly(filePath: string, content: string): Promise<boolean> {
  return (await fileExists(filePath)) && (await readFile(filePath)) === content;
}

/**
 * Where an agent goes when `agentScopeMap` has nothing to say about it — either because the caller
 * passed no map at all (`agents-inc update` recompiles that way) or because this agent is not in
 * the one it passed (a hand-authored agent under `.claude/agents/` has no config row).
 *
 * This is a ROUTING answer, not a selection default: `"project"` here means "the directory the
 * caller named in `projectAgentsDir`", which for an unrouted write is the only defensible target.
 * It is deliberately NOT `DEFAULT_SELECTION_OPTIONS.scope` from `@workspace/matrix` — that constant
 * says what an untouched *pick* installs as, and adopting it here would relocate the agents of every
 * caller that never asked for global routing into the user's `~/.claude/agents`.
 */
const UNROUTED_AGENT_SCOPE: SkillScope = "project";

/**
 * Compiles each resolved agent and writes it to its scope's agents directory:
 * global agents to `~/.claude/agents/`, project agents to `projectAgentsDir`.
 * Per-agent failures are collected as outcomes — callers own the policy
 * (recompile reports and continues; install hard-errors).
 *
 * Neither directory is created up front. `writeFile` makes a target's parent on
 * the way past, so a directory appears exactly when an agent routes into it —
 * which is what keeps a wholly project-scoped pass from leaving an empty
 * `~/.claude/agents/` behind in a home that has no global install.
 */
export async function writeCompiledAgentsByScope(params: {
  resolvedAgents: Partial<Record<AgentName, AgentConfig>>;
  sourcePath: string;
  engine: Liquid;
  projectAgentsDir: string;
  agentScopeMap?: Map<AgentName, SkillScope>;
}): Promise<AgentWriteOutcome[]> {
  const globalAgentsDir = resolveInstallPaths(os.homedir(), "global").agentsDir;

  const outcomes: AgentWriteOutcome[] = [];
  for (const [name, agent] of typedEntries<AgentName, AgentConfig>(params.resolvedAgents)) {
    try {
      const output = await compileAgentForPlugin(name, agent, params.sourcePath, params.engine);
      const scope = params.agentScopeMap?.get(name) ?? UNROUTED_AGENT_SCOPE;
      const targetDir = scope === "global" ? globalAgentsDir : params.projectAgentsDir;
      const targetPath = path.join(targetDir, `${name}.md`);
      const rewritten = !(await holdsExactly(targetPath, output));
      if (rewritten) await writeFile(targetPath, output);
      outcomes.push({ name, ok: true, scope, targetDir, rewritten });
    } catch (error) {
      outcomes.push({ name, ok: false, error });
    }
  }
  return outcomes;
}
