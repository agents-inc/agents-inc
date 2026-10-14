import { buildSeedSkill } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { E2E_AGENT } from "./expected-values.js";

import type { SeedPayload, SeedSkill } from "@workspace/matrix/seed";

/**
 * The wire version `--from`, `share` and `edit --ui` specs pin their payloads to, instead of
 * following `SEED_VERSION`, so they fail while the CLI is on any other. `satisfies` makes a bump
 * a compile error here.
 */
export const PINNED_WIRE_VERSION = 6 satisfies SeedPayload["v"];

/**
 * One skill row as the `--from` and `share` specs send it, lazily assigned to web-developer.
 *
 * - `eject`, because the E2E source is local and has no marketplace. Plugin mode legitimately
 *   refuses that, which is its own (correct) error rather than anything these specs control.
 * - `global`, because no payload built with it pins its sub-agent, so each one rests at the shared
 *   selection default. A project-scoped skill assigned to a sub-agent resting there is a pair the
 *   config model cannot express, and the decode refuses it outright.
 * - `lazy`, so a spec about the preload split names `"preloaded"` for the skill it wants in the
 *   compiled agent's frontmatter, and every other skill stays out of it.
 */
export function ejectedGlobalSkill(overrides: Partial<SeedSkill> = {}): SeedSkill {
  return buildSeedSkill({
    install: "eject",
    scope: "global",
    assignments: { [E2E_AGENT["web-developer"].name]: "lazy" },
    ...overrides,
  });
}
