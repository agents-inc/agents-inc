import { appendFileSync, writeFileSync } from "node:fs"

import { skillIndexSchema } from "@workspace/matrix/skill-index"

import { INDEXED_REPOS, crawlSkillIndex } from "../src/crawl"
import { messageOf } from "../src/log"
import { SKILL_INDEX_KEY } from "../src/skill-index"

import type { SkillIndex } from "@workspace/matrix/skill-index"

// Builds the federated skill index and writes it to a file. Publishing it is
// the workflow's job — `.github/workflows/build-skill-index.yml` hands the
// file to `wrangler kv key put` — so this script needs no Cloudflare
// credential and can be run against live GitHub by anyone, which is how it is
// verified:
//
//   bun run build:skill-index /tmp/skill-index.json
//
// Everything it does that is worth testing lives in `../src/crawl.ts` and is
// tested beside it. What is left here is argument handling, the schema gate
// and the counts it prints.

// A crawl that reached every repository and found nothing is not an empty
// catalog, it is a discovery rule that has stopped matching — and publishing it
// would replace a good index with a hole that lasts until someone notices.
const NOTHING_FOUND = 0

const usage = "Usage: bun run build:skill-index <output.json>"

const main = async () => {
  const destination = process.argv[2]
  if (destination === undefined) throw new Error(usage)

  // Parsed, not trusted. This is the same schema the worker validates against
  // before serving, so anything that fails here would have been a 503 at the
  // edge — better a red build than a published index the route refuses.
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

// So the workflow can publish under this key without spelling it out in YAML.
// The key is defined once, in the module the worker reads it from; a workflow
// that hardcoded it would be a second definition with nothing comparing them.
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
