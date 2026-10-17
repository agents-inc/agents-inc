import { buildSeedSkill } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { E2E_AGENT } from "./expected-values.js";

import type { SeedPayload, SeedSkill } from "@workspace/matrix/seed";

// Pinned rather than following `SEED_VERSION`; `satisfies` makes a bump a compile error here.
export const PINNED_WIRE_VERSION = 6 satisfies SeedPayload["v"];

// `eject`: the E2E source has no marketplace. `global`: a project skill assigned to a global sub-agent
// is refused by the decode. `lazy`: so specs name only the skill they want preloaded.
export function ejectedGlobalSkill(overrides: Partial<SeedSkill> = {}): SeedSkill {
  return buildSeedSkill({
    install: "eject",
    scope: "global",
    assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
    ...overrides,
  });
}
