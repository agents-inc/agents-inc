import { appendFileSync, writeFileSync } from "node:fs"

import { skillIndexSchema } from "@workspace/matrix/skill-index"

import { INDEXED_REPOS, crawlSkillIndex } from "../src/crawl"
import { messageOf } from "../src/log"
import { SKILL_INDEX_KEY } from "../src/skill-index"

import type { SkillIndex } from "@workspace/matrix/skill-index"

// Needs no Cloudflare credential: the workflow publishes the file it writes.

// Finding nothing means the discovery rule stopped matching, not an empty catalog.
const NOTHING_FOUND = 0

const usage = "Usage: bun run build:skill-index <output.json>"

const main = async () => {
  const destination = process.argv[2]
  if (destination === undefined) throw new Error(usage)

  // The worker's own schema: failing here beats a 503 at the edge.
  const index = skillIndexSchema.parse(
    await crawlSkillIndex(INDEXED_REPOS, process.env.GITHUB_TOKEN)
  )

  if (index.skills.length === NOTHING_FOUND) {
    throw new Error(
      "the crawl reached every repository and found no skills at all"
    )
  }

  writeFileSync(destination, JSON.stringify(index))

  console.log(summarize(index))
  console.log(
    `Written to ${destination}, to be published under ${SKILL_INDEX_KEY}`
  )
  announceKeyToActions()
}

const skillsFrom = (index: SkillIndex, repo: string) =>
  index.skills.filter((skill) => skill.repo === repo)

const summarize = (index: SkillIndex) =>
  [
    `Built at ${index.builtAt}`,
    ...INDEXED_REPOS.map(
      (repo) => `  ${repo}: ${String(skillsFrom(index, repo).length)}`
    ),
    `  total: ${String(index.skills.length)}`,
  ].join("\n")

// Lets the workflow publish under this key without restating it.
const announceKeyToActions = () => {
  const output = process.env.GITHUB_OUTPUT
  if (output === undefined) return
  appendFileSync(output, `key=${SKILL_INDEX_KEY}\n`)
}

try {
  await main()
} catch (error) {
  console.error(`The skill index was not built: ${messageOf(error)}`)
  process.exit(1)
}
