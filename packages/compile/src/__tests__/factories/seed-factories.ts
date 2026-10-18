import { SEED_VERSION, type SeedPayload } from "@workspace/matrix"

import type { Stack } from "../../types"

/** `skills` and `agents` have no default: every spec here asserts on what they decode to. */
export function buildSeedPayload(
  fields: Pick<SeedPayload, "skills" | "agents"> & Partial<SeedPayload>
): SeedPayload {
  return { v: SEED_VERSION, matrixVersion: "1.0.0", stackId: null, ...fields }
}

export function buildStack(agents: Stack["agents"]): Stack {
  return { id: "web", name: "Web", description: "A web stack", agents }
}
