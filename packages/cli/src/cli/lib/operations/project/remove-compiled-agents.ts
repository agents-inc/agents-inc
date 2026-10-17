import path from "path";
import { pruneStaleCompiledAgents } from "../../agents/list-compiled-agents.js";
import type { AgentCodec } from "../../installation/install-layout.js";
import { getErrorMessage } from "../../../utils/errors.js";
import { remove, removeDirIfEmpty } from "../../../utils/fs.js";
import type { AgentName } from "../../../types/index.js";

const AGENT_FILE_EXTENSION = ".md";

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

/** Also removes `agentsDir` when nothing at all is left in it. */
export async function removeCompiledAgents(
  options: RemoveCompiledAgentsOptions,
): Promise<RemoveCompiledAgentsResult> {
  const outcomes = await Promise.all(
    options.agents.map((name) => removeCompiledAgentFile(options.agentsDir, name)),
  );
  await tidyEmptiedAgentsDir(options.agentsDir);

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
  await tidyEmptiedAgentsDir(options.agentsDir);
}

async function removeCompiledAgentFile(
  agentsDir: string,
  name: AgentName,
): Promise<RemovalOutcome> {
  try {
    await remove(path.join(agentsDir, `${name}${AGENT_FILE_EXTENSION}`));
    return { name, ok: true };
  } catch (error) {
    return { name, ok: false, error: getErrorMessage(error) };
  }
}

/** Filesystem emptiness, not roster emptiness; `.claude/` above it is uninstall's decision. */
async function tidyEmptiedAgentsDir(agentsDir: string): Promise<void> {
  await removeDirIfEmpty(agentsDir);
}
