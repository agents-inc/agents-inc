import {
  DEFAULT_SKILL_OPTIONS,
  PERSIST_VERSION,
} from "@/stores/persisted-schema"

import type {
  Assignment,
  LoadState,
  PersistedConfig,
  SkillEntry,
} from "@/stores/persisted-schema"

/**
 * Builders for each shape `persistedConfigSchema` stores. Each returns a fresh
 * value: `importConfig` keeps nested maps by reference, so a shared object
 * would leak between tests.
 */

/** A row that installs: the sub-agent carries the skill, `lazy` unless the test says otherwise. */
export const liveAssignment = (load: LoadState = "lazy"): Assignment => ({
  load,
  enabled: true,
})

/** A row the roster switched off — kept, drawn recessed, and installing nothing. */
export const offAssignment = (load: LoadState = "lazy"): Assignment => ({
  load,
  enabled: false,
})

/** A selected skill at the fresh-pick defaults, reaching no sub-agent. */
export const skillEntry = (
  overrides: Partial<SkillEntry> = {}
): SkillEntry => ({
  ...DEFAULT_SKILL_OPTIONS,
  assignments: {},
  ...overrides,
})

/**
 * A configuration holding nothing: no stack, no skill, no remembered setup, and
 * no decision about any sub-agent.
 */
export const persistedConfig = (
  overrides: Partial<PersistedConfig> = {}
): PersistedConfig => ({
  stackId: null,
  skills: {},
  remembered: {},
  agents: {},
  ...overrides,
})

/**
 * The persisted envelope at the current version; any other version is discarded
 * before `merge`.
 */
export const savedConfigBlob = (state: unknown): string =>
  JSON.stringify({ state, version: PERSIST_VERSION })
