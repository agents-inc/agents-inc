import path from "path";
import { partition } from "remeda";
import { glob, readFileOptional, remove } from "../../utils/fs";
import { isAgentName } from "../../utils/type-guards";
import { type AgentCodec, agentCodec } from "../installation/install-layout";
import type { AgentName } from "../../types";

/**
 * Claude's codec, the default every reader below falls back to. A caller holding an installation
 * of another host passes that host's — `agentCodec(providerInUse(dir))` — because a Codex role is a
 * `.toml` whose marker sits inside `developer_instructions`, and a reader that only knew `*.md`
 * found no compiled agent on Codex at all: `uninstall` left every role behind while saying it had
 * removed them (CLI-896, found on a real Codex run 2026-09-26).
 */
const CLAUDE_AGENTS = agentCodec("claude");

/** Compiled-agent basenames in a directory, split by whether this CLI compiled them. */
export type AgentProvenanceSplit = {
  /** Files carrying the provenance marker — provably written by this CLI. */
  marked: string[];
  /** Everything else in the directory, the user's own agents among them. */
  unmarked: string[];
};

/** Lists compiled-agent markdown filenames (e.g. "web-developer.md") in a directory. */
export async function listAgentMdFiles(agentsDir: string): Promise<string[]> {
  return listAgentFilesOf(agentsDir, CLAUDE_AGENTS);
}

/** Lists the compiled-agent files `codec`'s host keeps in a directory (`*.md`, `*.toml`). */
export async function listAgentFilesOf(agentsDir: string, codec: AgentCodec): Promise<string[]> {
  return glob(codec.listGlob, agentsDir);
}

/**
 * Splits the agent files in a directory by the provenance marker each compiled agent carries.
 *
 * This is the only thing that identifies this CLI's own output once the configuration naming
 * it is gone, so the split errs one way by construction: a file that cannot be read yields no
 * marker and lands in `unmarked`, because "cannot prove it is ours" and "is not ours" call for
 * the same answer — leave it alone.
 */
export async function splitAgentsByProvenance(
  agentsDir: string,
  codec: AgentCodec = CLAUDE_AGENTS,
): Promise<AgentProvenanceSplit> {
  const files = await listAgentFilesOf(agentsDir, codec);
  const classified = await Promise.all(
    files.map((file) => readAgentProvenance(agentsDir, file, codec)),
  );
  const [marked, unmarked] = partition(classified, (agent) => agent.compiledHere);

  return { marked: marked.map(agentName), unmarked: unmarked.map(agentName) };
}

type ClassifiedAgent = { name: string; compiledHere: boolean };

async function readAgentProvenance(
  agentsDir: string,
  file: string,
  codec: AgentCodec,
): Promise<ClassifiedAgent> {
  const content = await readFileOptional(path.join(agentsDir, file));
  return { name: path.basename(file, codec.extension), compiledHere: codec.hasMarker(content) };
}

function agentName(agent: ClassifiedAgent): string {
  return agent.name;
}

/** Lists compiled-agent names (filenames without the `.md` extension) in a directory. */
export async function listCompiledAgentNames(agentsDir: string): Promise<AgentName[]> {
  const files = await listAgentMdFiles(agentsDir);
  // Boundary cast: compiled .md filenames are agent names by convention; custom
  // agents from marketplace stacks may not be members of the AgentName union.
  return files.map((f) => path.basename(f, ".md") as AgentName);
}

/**
 * Removes stale CLI-compiled agent files from `agentsDir`: deletes any agent file (`codec`'s
 * extension) whose basename is a built-in CLI agent name (`isAgentName`) that is NOT in
 * `keep`. The built-in-name check protects hand-authored agents (whose basename
 * is not a built-in name) — it is never the removal criterion. Only call this
 * when `keep` is the COMPLETE set of agents that should live in `agentsDir`.
 */
export async function pruneStaleCompiledAgents(
  agentsDir: string,
  keep: ReadonlySet<AgentName>,
  codec: AgentCodec = CLAUDE_AGENTS,
): Promise<void> {
  // A non-built-in basename is a hand-authored agent — always preserved.
  const isStaleCompiledAgent = (file: string): boolean => {
    const name = path.basename(file, codec.extension);
    return isAgentName(name) && !keep.has(name);
  };

  const files = await listAgentFilesOf(agentsDir, codec);
  await Promise.all(
    files.filter(isStaleCompiledAgent).map((file) => remove(path.join(agentsDir, file))),
  );
}
