import { SEED_VERSION } from "../../seed/seed-schema.js";

import type { SeedPayload, SeedSkill } from "../../seed/seed-schema.js";

/**
 * Diagnostics-only field on the wire — a payload carries the catalog version it was built
 * against so a skip can be explained, never to gate a decode. Any value works here.
 */
const TEST_MATRIX_VERSION = "1.0.0";

/**
 * One shared-configuration skill entry.
 *
 * `eject` rather than `plugin`: a test source is local and has no marketplace, so plugin mode
 * legitimately refuses it — that is its own error path, not this one.
 */
export function buildSeedSkill(overrides?: Partial<SeedSkill>): SeedSkill {
  return {
    install: "eject",
    scope: "project",
    assignments: {},
    ...overrides,
  };
}

/** A shared configuration as the web app builds it. Sparse by default — presence is selection. */
export function buildSeedPayload(overrides?: Partial<SeedPayload>): SeedPayload {
  return {
    v: SEED_VERSION,
    matrixVersion: TEST_MATRIX_VERSION,
    stackId: null,
    skills: {},
    agents: {},
    ...overrides,
  };
}
