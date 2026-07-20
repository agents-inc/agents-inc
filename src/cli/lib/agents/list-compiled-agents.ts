import path from "path";
import { glob } from "../../utils/fs";
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
