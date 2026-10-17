import { DEFAULT_SELECTION_OPTIONS } from "@workspace/matrix";
import { SEED_VERSION } from "@workspace/matrix/seed";

import { renderSkillMd } from "../content-generators.js";

import type { SeedExternalSkill, SeedPayload, SeedSkill } from "@workspace/matrix/seed";

/** Diagnostics-only on the wire, never gates a decode; any value works. */
const TEST_MATRIX_VERSION = "1.0.0";

/**
 * `eject`: a test source has no marketplace, so plugin mode refuses it. `scope` reads the shared
 * default so it matches `seedAgentScope` for an agent with no entry; a project skill never reaches
 * a global sub-agent.
 */
export function buildSeedSkill(overrides?: Partial<SeedSkill>): SeedSkill {
  return {
    install: "eject",
    scope: DEFAULT_SELECTION_OPTIONS.scope,
    assignments: {},
    ...overrides,
  };
}

/** The upstream `SKILL.md` name, not the id minted at intake (`external-<category>-<name>`). */
export const UPSTREAM_SKILL_NAME = "brainstorming";

/** `categoryId` is real: a category no catalogue declares is a different path. */
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

/** Sparse by default: presence is selection. */
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
