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
 * passed no map at all or because this agent is not in the one it passed (a hand-authored agent
 * under `.claude/agents/` has no config row).
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
  /** The root whose folder says which host the PROJECT scope's sub-agents are written for. */
  projectDir: string;
  agentScopeMap?: Map<AgentName, SkillScope>;
}): Promise<AgentWriteOutcome[]> {
  const hosts: Record<SkillScope, AgentHost> = {
    // Each scope reads its OWN root, the way `resolveInstallPaths` reads one beside this: a
    // project on Codex under a global on Claude is an arrangement this product allows, and one
    // provider answered for both scopes is how a pass writes the wrong format into one of them.
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

    // Before the render, and it produces NO outcome: a sub-agent this host does not carry was
    // not compiled and did not fail, so counting it either way would make a deliberate omission
    // read as a result. The one line the user is owed is the command's, once per run.
    if (!hostCompilesAgent(host.provider, name)) continue;

    outcomes.push(await writeOneAgent({ ...params, name, agent, scope, host }));
  }
  return outcomes;
}

/**
 * One sub-agent rendered for its host and written where that host reads it.
 *
 * The failure is RETURNED rather than thrown, because the policy belongs to the caller: recompile
 * reports and continues, install hard-errors. A pass that stopped at the first bad sub-agent would
 * make that decision for both of them.
 */
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

/** Where one scope's compiled sub-agents go, and in whose format. */
type AgentHost = { provider: Provider; agentsDir: string };

/**
 * The file one compiled sub-agent is written to, extension included.
 *
 * The extension comes from {@link agentCodec} rather than from a literal here, because the defect
 * this whole funnel exists against is `web-developer.md` written into `<project>/.codex/agents/`
 * by a pass that then reports success: Codex ignores such a file, nothing recognises it as ours
 * again, and the run exits 0.
 */
function fileNameFor(name: AgentName, provider: Provider): string {
  return `${name}${agentCodec(provider).extension}`;
}
