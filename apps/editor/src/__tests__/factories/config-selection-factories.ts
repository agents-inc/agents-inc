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
 * THE CONFIGURATION THIS BROWSER HOLDS, BUILT FOR A TEST.
 *
 * One builder per shape `persistedConfigSchema` stores, each answering that
 * shape at rest and taking what a test is about as an override — so a call
 * site names the values its assertions depend on and nothing else. Written once
 * here because the suites each carried their own copy, and a copy is free to
 * drift from the schema and from the others.
 *
 * Every builder answers a FRESH value, so no two tests hold one object:
 * `importConfig` copies only the top level of what it is handed and keeps the
 * nested maps by reference, and a value shared by identity is one write away
 * from changing another test's input.
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

/**
 * A selected skill at the fresh-pick defaults — `DEFAULT_SKILL_OPTIONS`, the
 * matrix's one spelling of plugin and global — reaching no sub-agent until the
 * test gives it assignments.
 */
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
 * What the config slot holds for a state THIS release saved: the persist
 * middleware's envelope, stamped with the current version.
 *
 * The version is bound rather than written out because a blob at any other one
 * is discarded by `migrateConfig` before `merge` reads it — so a stale literal
 * would not fail, it would hand every reader an empty store. `unknown` rather
 * than `PersistedConfig` because a suite asking how the reader treats a blob it
 * cannot parse has to be able to write one.
 */
export const savedConfigBlob = (state: unknown): string =>
  JSON.stringify({ state, version: PERSIST_VERSION })
