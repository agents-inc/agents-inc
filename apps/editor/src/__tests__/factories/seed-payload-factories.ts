import { seedPayload } from "@workspace/api-mocks/fixtures"

import type { SeedPayload } from "@workspace/matrix"

/** A payload carrying no skill, only these sub-agent entries. */
export const bareAgentsPayload = (agents: SeedPayload["agents"]): SeedPayload =>
  seedPayload({ skills: {}, agents })
