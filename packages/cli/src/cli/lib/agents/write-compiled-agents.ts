import path from "path";
import type { Liquid } from "liquidjs";
import { compileAgentForHost } from "../compiler.js";
import {
  agentCodec,
  agentsDir,
  hostCompilesAgent,
  inheritedGlobalProvider,
  providerInUse,
} from "../installation/install-layout.js";
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
      file: CompiledFileChange;
    }
  | { name: AgentName; ok: false; error: unknown };

/** "unchanged" writes nothing: the kept mtime is the only trace telling it from "rewritten". */
type CompiledFileChange = "created" | "rewritten" | "unchanged";

async function changeTo(filePath: string, content: string): Promise<CompiledFileChange> {
  if (!(await fileExists(filePath))) return "created";
  return (await readFile(filePath)) === content ? "unchanged" : "rewritten";
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
  /** The installation at `projectDir`, where it holds two; the default is the one in use. */
  provider?: Provider;
  agentScopeMap?: Map<AgentName, SkillScope>;
}): Promise<AgentWriteOutcome[]> {
  const own = params.provider ?? providerInUse(params.projectDir);
  const inherited = inheritedGlobalProvider(params.projectDir, own);
  const hosts: Record<SkillScope, AgentHost> = {
    global: { provider: inherited, agentsDir: agentsDir(inherited, "global", params.projectDir) },
    project: { provider: own, agentsDir: params.projectAgentsDir },
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
    const file = await changeTo(targetPath, output);
    if (file !== "unchanged") await writeFile(targetPath, output);

    return { name, ok: true, scope, targetDir: host.agentsDir, file };
  } catch (error) {
    return { name, ok: false, error };
  }
}

type AgentHost = { provider: Provider; agentsDir: string };

/** The extension comes from `agentCodec`, so a `.md` never lands where Codex reads `.toml`. */
function fileNameFor(name: AgentName, provider: Provider): string {
  return `${name}${agentCodec(provider).extension}`;
}
