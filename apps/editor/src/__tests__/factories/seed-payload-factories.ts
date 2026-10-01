import { seedPayload } from "@workspace/api-mocks/fixtures"

import type { SeedPayload } from "@workspace/matrix"

/**
 * A payload carrying NO skill: only these sub-agent entries.
 *
 * Bare sub-agents — pinned on, holding nothing — are what a preview suite
 * renders by hand beside the preview, because a sub-agent with no skill has an
 * `AgentConfig` small enough to write out without becoming a second copy of
 * `compileAgents`. So the empty `skills` is load-bearing rather than a default,
 * and it is why this is its own builder rather than an override at every call.
 *
 * Built on `seedPayload` from `@workspace/api-mocks`, the payload builder every
 * suite reads, so the envelope — version, matrix version, stack — is spelled
 * once and the result is parsed by the wire's own schema before a test sees it.
 */
export const bareAgentsPayload = (agents: SeedPayload["agents"]): SeedPayload =>
  seedPayload({ skills: {}, agents })
