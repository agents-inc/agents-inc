import { DEFAULT_SELECTION_OPTIONS } from "@workspace/matrix";
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
 *
 * `scope` is READ from the shared selection default rather than written out, so it cannot drift
 * from what `seedAgentScope` answers for a sub-agent carrying no `agents` entry. That is what
 * makes the pair coherent whatever the default becomes: a skill and a sub-agent both resting
 * there are writable by definition. Written out as `project` it was not — a project skill never
 * reaches a global sub-agent — so "assign a skill and say nothing else" composed a payload
 * `configToSeedPayload` refuses to mint, `seedToWizardResult` throws on and the installer filters
 * away. Building that pair now takes an explicit `scope: "project"`, which is what the specs
 * pinning the refusal already say.
 */
export function buildSeedSkill(overrides?: Partial<SeedSkill>): SeedSkill {
  return {
    install: "eject",
    scope: DEFAULT_SELECTION_OPTIONS.scope,
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
