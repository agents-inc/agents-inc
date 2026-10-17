import os from "os";
import path from "path";
import type { Liquid } from "liquidjs";
import { compileAgentForHost } from "../compiler.js";
import { resolveInstallPaths } from "../installation/install-base-dir.js";
import { agentCodec, hostCompilesAgent, providerInUse } from "../installation/install-layout.js";
import { writeFile, fileExists, readFile } from "../../utils/fs.js";
import { typedEntries } from "../../utils/typed-object.js";
import type { Provider } from "../../consts.js";
import type { AgentConfig, AgentName, SkillScope } from "../../types/index.js";

export type AgentWriteOutcome =
  | {
      name: AgentName;
      ok: true;
      scope: SkillScope;
      targetDir: string;
      /** False when the output matched the file on disk, so nothing was written. */
      rewritten: boolean;
    }
  | { name: AgentName; ok: false; error: unknown };

/** Skipping an identical write keeps the mtime, the only trace telling unchanged from rewritten. */
async function holdsExactly(filePath: string, content: string): Promise<boolean> {
  return (await fileExists(filePath)) && (await readFile(filePath)) === content;
}

/**
 * Routing for an agent the scope map does not name: the caller's `projectAgentsDir`. Deliberately
 * not the selection default, which would move unrouted agents into `~/.claude/agents`.
 */
const UNROUTED_AGENT_SCOPE: SkillScope = "project";

/**
 * Per-agent failures come back as outcomes; a directory appears only when an agent routes into it.
 */
export async function writeCompiledAgentsByScope(params: {
  resolvedAgents: Partial<Record<AgentName, AgentConfig>>;
  sourcePath: string;
  engine: Liquid;
  projectAgentsDir: string;
  /** The root whose folder says which host the PROJECT scope's sub-agents are written for. */
  projectDir: string;
  agentScopeMap?: Map<AgentName, SkillScope>;
}): Promise<AgentWriteOutcome[]> {
  const hosts: Record<SkillScope, AgentHost> = {
    // Each scope reads its own root: a Codex project under a Claude global is allowed.
    global: {
      provider: providerInUse(os.homedir()),
      agentsDir: resolveInstallPaths(os.homedir(), "global").agentsDir,
    },
    project: { provider: providerInUse(params.projectDir), agentsDir: params.projectAgentsDir },
  };

  const outcomes: AgentWriteOutcome[] = [];
  for (const [name, agent] of typedEntries<AgentName, AgentConfig>(params.resolvedAgents)) {
    const scope = params.agentScopeMap?.get(name) ?? UNROUTED_AGENT_SCOPE;
    const host = hosts[scope];

    // No outcome for a sub-agent this host does not carry: it was neither compiled nor failed.
    if (!hostCompilesAgent(host.provider, name)) continue;

    outcomes.push(await writeOneAgent({ ...params, name, agent, scope, host }));
  }
  return outcomes;
}

/** Returns the failure rather than throwing: the policy is the caller's. */
async function writeOneAgent(params: {
  name: AgentName;
  agent: AgentConfig;
  scope: SkillScope;
  host: AgentHost;
  sourcePath: string;
  engine: Liquid;
}): Promise<AgentWriteOutcome> {
  const { name, scope, host } = params;

  try {
    const output = await compileAgentForHost(
      host.provider,
      name,
      params.agent,
      params.sourcePath,
      params.engine,
    );
    const targetPath = path.join(host.agentsDir, fileNameFor(name, host.provider));
    const rewritten = !(await holdsExactly(targetPath, output));
    if (rewritten) await writeFile(targetPath, output);

    return { name, ok: true, scope, targetDir: host.agentsDir, rewritten };
  } catch (error) {
    return { name, ok: false, error };
  }
}

type AgentHost = { provider: Provider; agentsDir: string };

/** The extension comes from `agentCodec`, so a `.md` never lands where Codex reads `.toml`. */
function fileNameFor(name: AgentName, provider: Provider): string {
  return `${name}${agentCodec(provider).extension}`;
}
