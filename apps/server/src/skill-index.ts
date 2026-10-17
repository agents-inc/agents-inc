import { skillIndexSchema } from "@workspace/matrix/skill-index"

import { messageOf } from "./log"

import type {
  SkillIndex,
  SkillIndexFreshness,
} from "@workspace/matrix/skill-index"

// One KV read; the crawl that fills the key runs in a scheduled GitHub Action.

const MS_PER_SECOND = 1000
const DAY_SECONDS = 24 * 60 * 60

// Three missed daily builds: one miss is weather, three is a broken pipeline.
const STALE_AFTER_SECONDS = 3 * DAY_SECONDS

// Bump the version on any shape change. The build script publishes to it.
export const SKILL_INDEX_KEY = "skill-index:v2"

export type SkillIndexOutcome =
  { served: true; index: SkillIndex } | { served: false }

// Nothing when no build has succeeded or the stored index fails the contract.
export const readSkillIndex = async (
  store: KVNamespace
): Promise<SkillIndexOutcome> => {
  let stored: string | null
  try {
    stored = await store.get(SKILL_INDEX_KEY)
  } catch (error) {
    logIndexFailure(`could not read the published index: ${messageOf(error)}`)
    return { served: false }
  }
  if (stored === null) return { served: false }

  const parsed = skillIndexSchema.safeParse(parseJson(stored))
  if (!parsed.success) {
    logIndexFailure("the published index no longer matches the contract")
    return { served: false }
  }

  return { served: true, index: parsed.data }
}

// Zero once stale: only a scheduled run can replace it.
export const secondsUntilStale = (builtAt: string) =>
  Math.max(0, Math.round(STALE_AFTER_SECONDS - ageInSeconds(builtAt)))

// Same number as the cache lifetime, so header and `max-age` agree.
export const freshnessOf = (builtAt: string): SkillIndexFreshness =>
  secondsUntilStale(builtAt) > 0 ? "fresh" : "stale"

const ageInSeconds = (builtAt: string) =>
  (Date.now() - Date.parse(builtAt)) / MS_PER_SECOND

const logIndexFailure = (reason: string) =>
  console.error({ event: "skill_index_failure", reason })

const parseJson = (raw: string): unknown => {
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
