import path from "path";
import { partition } from "remeda";
import { glob, readFileOptional, remove } from "../../utils/fs";
import { isAgentName } from "../../utils/type-guards";
import { type AgentCodec, agentCodec } from "../installation/install-layout";
import type { AgentName } from "../../types";

/**
 * The default codec; a caller on another host passes that host's
 * (`agentCodec(providerInUse(dir))`).
 */
const CLAUDE_AGENTS = agentCodec("claude");

export type AgentProvenanceSplit = {
  marked: string[];
  unmarked: string[];
};

export async function listAgentMdFiles(agentsDir: string): Promise<string[]> {
  return listAgentFilesOf(agentsDir, CLAUDE_AGENTS);
}

export async function listAgentFilesOf(agentsDir: string, codec: AgentCodec): Promise<string[]> {
  return glob(codec.listGlob, agentsDir);
}

/** An unreadable file lands in `unmarked`: "cannot prove it is ours" means leave it alone. */
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

export async function listCompiledAgentNames(agentsDir: string): Promise<AgentName[]> {
  const files = await listAgentMdFiles(agentsDir);
  // Boundary cast: custom marketplace agents may fall outside the AgentName union.
  return files.map((f) => path.basename(f, ".md") as AgentName);
}

/**
 * Deletes built-in-named agent files not in `keep`, which must be the complete set for `agentsDir`.
 */
export async function pruneStaleCompiledAgents(
  agentsDir: string,
  keep: ReadonlySet<AgentName>,
  codec: AgentCodec = CLAUDE_AGENTS,
): Promise<void> {
  const isStaleCompiledAgent = (file: string): boolean => {
    const name = path.basename(file, codec.extension);
    return isAgentName(name) && !keep.has(name);
  };

  const files = await listAgentFilesOf(agentsDir, codec);
  await Promise.all(
    files.filter(isStaleCompiledAgent).map((file) => remove(path.join(agentsDir, file))),
  );
}
