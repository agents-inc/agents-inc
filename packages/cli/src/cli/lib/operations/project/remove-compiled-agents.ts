import path from "path";
import { pruneStaleCompiledAgents } from "../../agents/list-compiled-agents.js";
import { getErrorMessage } from "../../../utils/errors.js";
import { remove, removeDirIfEmpty } from "../../../utils/fs.js";
import type { AgentName } from "../../../types/index.js";

const AGENT_FILE_EXTENSION = ".md";

export type RemoveCompiledAgentsOptions = {
  /** The scope's `.claude/agents/` directory holding the compiled files. */
  agentsDir: string;
  agents: readonly AgentName[];
};

export type PruneCompiledAgentsOptions = {
  agentsDir: string;
  /**
   * The COMPLETE set of agents that belong in `agentsDir` — every other
   * CLI-compiled agent there is stale. Only an authoritative pass can say this.
   */
  keep: ReadonlySet<AgentName>;
};

export type RemoveCompiledAgentsResult = {
  /** Agents whose compiled file this call disposed of; an absent file counts. */
  removed: AgentName[];
  /** Agents whose file survived an error, for the caller to report. */
  failed: Array<{ name: AgentName; error: string }>;
};

type RemovalOutcome = { name: AgentName; ok: true } | { name: AgentName; ok: false; error: string };

/**
 * Deletes the named agents' compiled `.md` files from `agentsDir`, then takes the
 * directory itself when nothing at all is left in it — the shape `deleteLocalSkill`
 * models for skills.
 *
 * A scope's `.claude/agents/` is an artefact of what it holds, so the removal that
 * empties it owns the tidy and no caller has to remember. An agent with no file on
 * disk is nothing to do rather than an error.
 */
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

/**
 * Deletes every CLI-compiled agent in `agentsDir` outside `keep`, then takes the
 * directory on the same terms as `removeCompiledAgents`.
 *
 * Hand-authored agents are preserved by `pruneStaleCompiledAgents`'s `isAgentName`
 * predicate, so a directory this leaves empty is one nothing at all remains in.
 */
export async function pruneCompiledAgents(options: PruneCompiledAgentsOptions): Promise<void> {
  await pruneStaleCompiledAgents(options.agentsDir, options.keep);
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

/**
 * Emptiness is FILESYSTEM emptiness, never roster emptiness: a hand-authored agent
 * or any user-owned file keeps the directory alive whatever a config says. The
 * agents directory only — `.claude/` above it is uninstall's decision, not a
 * removal path's.
 */
async function tidyEmptiedAgentsDir(agentsDir: string): Promise<void> {
  await removeDirIfEmpty(agentsDir);
}
