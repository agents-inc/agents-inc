import { SEED_VERSION } from "@workspace/matrix/seed";

import { renderSkillMd } from "../content-generators.js";

import type { SeedExternalSkill, SeedPayload, SeedSkill } from "@workspace/matrix/seed";

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

/**
 * The name the repository this skill was taken from calls it, which is NOT the id the payload
 * keys it by: an added skill's id is minted at intake (`external-<category>-<name>`) so it is
 * unique on the installing machine and legal as a directory name, while its `SKILL.md` still
 * carries whatever the upstream author wrote. Spelled here because the difference is the subject
 * of more than one spec.
 */
export const UPSTREAM_SKILL_NAME = "brainstorming";

/**
 * One skill added from outside the catalogue, with its whole directory inline.
 *
 * `categoryId` is a real category rather than an invented one: it is the placement the user
 * CONFIRMED against the catalogue the payload names, and a category no catalogue declares is a
 * different (also specified) path.
 */
export function buildSeedExternalSkill(overrides?: Partial<SeedExternalSkill>): SeedExternalSkill {
  return {
    displayName: "Brainstorming",
    description: "Structured brainstorming for hard problems",
    categoryId: "web-framework",
    repo: "obra/superpowers",
    path: "skills/brainstorming",
    files: {
      "SKILL.md": renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
    },
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
