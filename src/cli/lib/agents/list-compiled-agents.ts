import path from "path";
import { glob, remove } from "../../utils/fs";
import { isAgentName } from "../../utils/type-guards";
import type { AgentName } from "../../types";

/** Lists compiled-agent markdown filenames (e.g. "web-developer.md") in a directory. */
export async function listAgentMdFiles(agentsDir: string): Promise<string[]> {
  return glob("*.md", agentsDir);
}

/** Lists compiled-agent names (filenames without the `.md` extension) in a directory. */
export async function listCompiledAgentNames(agentsDir: string): Promise<AgentName[]> {
  const files = await listAgentMdFiles(agentsDir);
  // Boundary cast: compiled .md filenames are agent names by convention; custom
  // agents from marketplace stacks may not be members of the AgentName union.
  return files.map((f) => path.basename(f, ".md") as AgentName);
}

/**
 * Removes stale CLI-compiled agent files from `agentsDir`: deletes any `.md`
 * whose basename is a built-in CLI agent name (`isAgentName`) that is NOT in
 * `keep`. The built-in-name check protects hand-authored agents (whose basename
 * is not a built-in name) — it is never the removal criterion. Only call this
 * when `keep` is the COMPLETE set of agents that should live in `agentsDir`.
 */
export async function pruneStaleCompiledAgents(
  agentsDir: string,
  keep: ReadonlySet<AgentName>,
): Promise<void> {
  // A non-built-in basename is a hand-authored agent — always preserved.
  const isStaleCompiledAgent = (file: string): boolean => {
    const name = path.basename(file, ".md");
    return isAgentName(name) && !keep.has(name);
  };

  const files = await listAgentMdFiles(agentsDir);
  await Promise.all(
    files.filter(isStaleCompiledAgent).map((file) => remove(path.join(agentsDir, file))),
  );
}
