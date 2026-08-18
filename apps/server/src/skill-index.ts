import { skillIndexSchema } from "@workspace/matrix/skill-index"

import { messageOf } from "./log"

import type {
  SkillIndex,
  SkillIndexFreshness,
} from "@workspace/matrix/skill-index"

// The worker's half of the federated skill index: one KV read, and nothing
// else. The crawl that fills that key lives in `crawl.ts` and runs in
// `.github/workflows/build-skill-index.yml` on a daily schedule — this route
// has no upstream, no rate budget to spend and no way to be slow.
//
// That is the point of SERVER-06. The route used to crawl one allowlisted
// repository per request, because a complete crawl costs more subrequests than
// a Worker may issue while handling one request; the index therefore filled in
// over successive calls and the first caller after a cold cache saw a third of
// it. Moving the crawl to a runner with no such budget retires the constraint
// rather than working around it.

const MS_PER_SECOND = 1000
const DAY_SECONDS = 24 * 60 * 60

// The build is daily, so this is three consecutive misses. One missed run is
// weather — a GitHub outage, a runner that never started — and calling that
// stale would put a caveat on a list that is perfectly current. Three in a row
// is the pipeline being broken, which is exactly what nothing else would say:
// the stored index never expires, so a build that stops running leaves a
// complete, plausible, quietly ageing list behind it forever.
const STALE_AFTER_SECONDS = 3 * DAY_SECONDS

// The one key the scheduled build writes and this route reads. It cannot
// collide with a config id — those are 8 base64url characters, which have no
// room for a colon — and it cannot collide with the per-repository shards the
// old design wrote under `skill-index:v1:<owner>/<name>`, which carry a
// segment this key does not and expire on their own seven-day retention.
//
// `v2` because the entry gained `bytes` (EDITOR-46), which is required: what
// `v1` holds was written by a crawl that had no such field, so a worker still
// reading that key would refuse every request until the next daily build — and
// bumping is what this file has always said a shape change would do.
//
// Exported because the build script names the same key when it publishes, and
// a key that two files spell separately is a key they can disagree about.
export const SKILL_INDEX_KEY = "skill-index:v2"

export type SkillIndexOutcome =
  { served: true; index: SkillIndex } | { served: false }

/**
 * The published index, or nothing.
 *
 * Nothing has two causes and one answer. Either the scheduled build has never
 * succeeded — reachable exactly once in this worker's life, between a first
 * deploy and the first green run — or what is stored no longer satisfies the
 * contract. Neither is recoverable from here: this route cannot build an index,
 * and the next scheduled run overwrites whatever is there.
 */
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

/**
 * How long a caller may hold this index before it is worth asking again, and
 * zero once it has gone stale — at which point holding it helps nobody, since
 * the only thing that can replace it is a scheduled run that is not happening.
 *
 * `builtAt` has been through `skillIndexSchema` by the time anything calls
 * this, so it parses.
 */
export const secondsUntilStale = (builtAt: string) =>
  Math.max(0, Math.round(STALE_AFTER_SECONDS - ageInSeconds(builtAt)))

/**
 * Whether the list a caller is holding is the current picture. Derived from
 * the same number the cache lifetime is, so the header and the `max-age`
 * cannot disagree about it.
 */
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
