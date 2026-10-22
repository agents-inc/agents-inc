import path from "path";
import { pruneStaleCompiledAgents } from "../../agents/list-compiled-agents.js";
import { type AgentCodec, agentCodec } from "../../installation/install-layout.js";
import { getErrorMessage } from "../../../utils/errors.js";
import { remove, removeDirIfEmpty } from "../../../utils/fs.js";
import type { AgentName } from "../../../types/index.js";

export type RemoveCompiledAgentsOptions = {
  agentsDir: string;
  agents: readonly AgentName[];
};

export type PruneCompiledAgentsOptions = {
  agentsDir: string;
  /** The COMPLETE set of agents that belong in `agentsDir`; every other compiled agent is stale. */
  keep: ReadonlySet<AgentName>;
  codec?: AgentCodec;
};

export type RemoveCompiledAgentsResult = {
  /** An absent file counts as removed. */
  removed: AgentName[];
  failed: Array<{ name: AgentName; error: string }>;
};

type RemovalOutcome = { name: AgentName; ok: true } | { name: AgentName; ok: false; error: string };

/**
 * Also removes `agentsDir` when nothing at all is left in it; the `.claude/` above is uninstall's.
 */
export async function removeCompiledAgents(
  options: RemoveCompiledAgentsOptions,
): Promise<RemoveCompiledAgentsResult> {
  const outcomes = await Promise.all(
    options.agents.map((name) => removeCompiledAgentFile(options.agentsDir, name)),
  );
  await removeDirIfEmpty(options.agentsDir);

  return {
    removed: outcomes.flatMap((outcome) => (outcome.ok ? [outcome.name] : [])),
    failed: outcomes.flatMap((outcome) =>
      outcome.ok ? [] : [{ name: outcome.name, error: outcome.error }],
    ),
  };
}

/** Hand-authored agents survive; the directory goes only when nothing at all remains. */
export async function pruneCompiledAgents(options: PruneCompiledAgentsOptions): Promise<void> {
  await pruneStaleCompiledAgents(options.agentsDir, options.keep, options.codec);
  await removeDirIfEmpty(options.agentsDir);
}

async function removeCompiledAgentFile(
  agentsDir: string,
  name: AgentName,
): Promise<RemovalOutcome> {
  try {
    await remove(path.join(agentsDir, `${name}${agentCodec("claude").extension}`));
    return { name, ok: true };
  } catch (error) {
    return { name, ok: false, error: getErrorMessage(error) };
  }
}
