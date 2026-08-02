import type { AgentDefinition, AgentName, MergedSkillsMatrix } from "../../types";
import { tierNeedsDeps, tierRegeneratesTypes, type ConsequenceTier } from "./classify.js";

/** The matrix and agent definitions propagation and type generation read. */
export type LoadedGateDeps = {
  matrix: MergedSkillsMatrix;
  agents: Record<AgentName, AgentDefinition>;
};

/**
 * What a gate entry needs to carry out a write's consequences.
 *
 * The lazy form exists so a caller that cannot cheaply produce the matrix — an
 * offline uninstall, a deregistration — hands over loaders instead. Whether they
 * run is decided by classification: a registration-only or no-op write has no
 * consequences to carry out, so nothing is loaded and the write stays offline.
 */
export type GateDeps =
  | LoadedGateDeps
  | {
      loadMatrix: () => Promise<MergedSkillsMatrix>;
      loadAgents: () => Promise<Record<AgentName, AgentDefinition>>;
    };

function isLoaded(deps: GateDeps): deps is LoadedGateDeps {
  return "matrix" in deps;
}

/**
 * Resolves `deps` only when `tier` has consequences that read them. Returns null
 * otherwise, and the lazy loaders are never called.
 */
export async function resolveGateDeps(
  deps: GateDeps,
  tier: ConsequenceTier,
): Promise<LoadedGateDeps | null> {
  if (!tierNeedsDeps(tier)) return null;
  if (isLoaded(deps)) return deps;

  // Agent definitions are read only where the types half is regenerated, so a
  // config-half-only tier never pays for loading them.
  const [matrix, agents] = await Promise.all([
    deps.loadMatrix(),
    tierRegeneratesTypes(tier) ? deps.loadAgents() : NO_AGENTS,
  ]);
  return { matrix, agents };
}

/** Agent definitions a tier that regenerates no types never reads. */
const NO_AGENTS = Promise.resolve({} as Record<AgentName, AgentDefinition>);
