import type { AgentDefinition, AgentName, MergedSkillsMatrix } from "../../types";
import { tierNeedsDeps, tierRegeneratesTypes, type ConsequenceTier } from "./classify.js";

export type LoadedGateDeps = {
  matrix: MergedSkillsMatrix;
  agents: Partial<Record<AgentName, AgentDefinition>>;
};

/** Lazy, so a caller that cannot cheaply load the matrix stays offline when nothing reads it. */
export type GateDeps =
  | LoadedGateDeps
  | {
      loadMatrix: () => Promise<MergedSkillsMatrix>;
      loadAgents: () => Promise<Partial<Record<AgentName, AgentDefinition>>>;
    };

function isLoaded(deps: GateDeps): deps is LoadedGateDeps {
  return "matrix" in deps;
}

/** Null when `tier` has no consequences that read `deps`; the lazy loaders then never run. */
export async function resolveGateDeps(
  deps: GateDeps,
  tier: ConsequenceTier,
): Promise<LoadedGateDeps | null> {
  if (!tierNeedsDeps(tier)) return null;
  if (isLoaded(deps)) return deps;

  // Agent definitions are read only where the types half is regenerated.
  const [matrix, agents] = await Promise.all([
    deps.loadMatrix(),
    tierRegeneratesTypes(tier) ? deps.loadAgents() : NO_AGENTS,
  ]);
  return { matrix, agents };
}

const NO_AGENTS: Promise<Partial<Record<AgentName, AgentDefinition>>> = Promise.resolve({});
