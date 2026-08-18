import { parse as parseYaml } from "yaml"
import { z } from "zod"

import type { SkillIndex, SkillIndexEntry } from "@workspace/matrix/skill-index"

// The crawl behind the federated skill index: a small allowlist of EXTERNAL
// skills repositories, walked for skills so the editor's add-skills dialog has
// something to search that is not this project's own catalog.
//
// Nothing here touches KV, `Env` or Hono. This module runs in the scheduled
// GitHub Action (`.github/workflows/build-skill-index.yml`, via
// `scripts/build-skill-index.ts`), and the worker only ever reads what that
// Action published — see `skill-index.ts`. Keeping the two apart is the whole
// of SERVER-06: a Worker may issue 50 subrequests while handling one request,
// and a complete crawl costs more than that, so it happens somewhere with no
// such budget.
//
// Every result is install-proof. A skill reaches the index only if its SKILL.md
// was fetched and read — the same rule `agents-inc import skill` applies
// locally (`packages/cli/src/cli/commands/import/skill.ts`): a skill is a
// DIRECTORY whose SKILL.md exists and whose frontmatter parses. Offering a
// result the CLI would then refuse to import is the failure this guards
// against, so anything unproven is dropped rather than guessed at.

// Chosen 2026-08-08 by star count among repositories that actually carry
// SKILL.md files, verified against the live API on the same day. Star counts
// are recorded here as the state at selection; the index itself carries the
// live number, read on every build.
//
// `agents-inc/skills` is deliberately absent and must stay absent. The editor's
// grid already IS this project's catalog; the dialog this index feeds exists
// for what the catalog lacks, and indexing ourselves would file every one of
// our own skills under "external".
export const INDEXED_REPOS = [
  // 268,868 stars, 14 skills under skills/. MIT.
  "obra/superpowers",
  // 166,923 stars, 18 skills under skills/. Anthropic's own.
  "anthropics/skills",
  // 84,036 stars, 24 skills under skills/.
  "addyosmani/agent-skills",
] as const

const GITHUB_API = "https://api.github.com"
// A different host, serving public files, spending none of the API's rate
// budget — which is what makes reading every SKILL.md in a repository
// affordable however the crawl is authenticated.
const RAW_CONTENT = "https://raw.githubusercontent.com"

// api.github.com answers 403 to a request with no User-Agent.
const USER_AGENT = "agents-inc-skill-index"

const BASE_HEADERS = { "user-agent": USER_AGENT }

const API_HEADERS = { ...BASE_HEADERS, accept: "application/vnd.github+json" }

// Not the 50-subrequest ceiling this used to be — the Action has no such
// budget. What is left is ordinary courtesy to a host serving us a hundred
// files for free: a hundred simultaneous connections is the shape of an abuse
// signal, and the crawl is a background job with nothing waiting on it.
const CONCURRENT_READS = 6

const SKILL_FILE_SUFFIX = "/SKILL.md"

// Only what the tree call is for. GitHub sends far more.
//
// `size` is the reason this narrowing grew: it is GitHub's own byte count for a
// blob, arriving in the response the paths already arrive in, so weighing a
// skill costs no request at all. It is absent for a `tree` entry — a directory
// has no size — which is why the entry's TYPE is what tells a file from a
// directory rather than the presence of a number.
//
// `apps/editor/src/lib/api/skill-contents.ts` narrows this same endpoint the
// same way, and the two agreeing is load-bearing: what the index marks and what
// the editor then refuses have to be the same arithmetic over the same fields.
const treeSchema = z.object({
  truncated: z.boolean(),
  tree: z.array(
    z.object({
      path: z.string(),
      type: z.string(),
      size: z.number().optional(),
    })
  ),
})

const repoFactsSchema = z.object({
  stargazers_count: z.number(),
  default_branch: z.string(),
})

// Both optional, because a SKILL.md with no frontmatter at all is tolerated —
// but `name`, when it is there, has to be a usable one. An empty or absent
// value is what YAML gives for `name:` with nothing after it, and a skill
// cannot be addressed by that, so it fails here and the skill is excluded.
const frontmatterSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/
const FIRST_HEADING_PATTERN = /^#\s+(.+)$/m

type RepoFacts = { stars: number; defaultBranch: string }

type TreeEntry = z.infer<typeof treeSchema>["tree"][number]

/** A skill's directory and what everything in it weighs. */
type SkillDirectory = { path: string; bytes: number }

type Headers = Readonly<Record<string, string>>

/**
 * Every skill the given repositories are proven to hold, as one index.
 *
 * Throws rather than returning a partial index, and that is what makes the
 * published result safe to keep forever: a build that could not see everything
 * publishes nothing, so the last complete index stays where it is instead of
 * being replaced by a smaller one. A single unreadable SKILL.md is not that —
 * it is one skill dropping out, which is the install-proof rule working.
 *
 * @param token A GitHub token for `api.github.com`. Optional: without one the
 *   crawl runs on the unauthenticated allowance, which is enough for a handful
 *   of repositories and is what a local run uses.
 */
export const crawlSkillIndex = async (
  repos: readonly string[],
  token?: string
): Promise<SkillIndex> => {
  const crawled = await Promise.all(
    repos.map((repo) => crawlRepo(repo, apiHeaders(token)))
  )

  return { builtAt: new Date().toISOString(), skills: crawled.flat() }
}

// The token goes to the host that issued it and nowhere else. raw.githubusercontent
// serves public files, spends no rate budget and needs no credential, so
// sending one there would only widen where it can leak.
const apiHeaders = (token: string | undefined): Headers =>
  token === undefined
    ? API_HEADERS
    : { ...API_HEADERS, authorization: `Bearer ${token}` }

const warnAboutRepo = (repo: string, reason: string) =>
  console.error({ event: "skill_index_warning", repo, reason })

const crawlRepo = async (
  repo: string,
  headers: Headers
): Promise<SkillIndexEntry[]> => {
  const facts = await fetchRepoFacts(repo, headers)
  const directories = await fetchSkillDirectories(
    repo,
    facts.defaultBranch,
    headers
  )

  const skills = await readSkills(repo, facts, directories)

  // Every read failing is an outage, not a repository that turned out to be
  // empty — and publishing it as one would replace a good index with a hole.
  if (skills.length === 0 && directories.length > 0) {
    throw new Error(
      `${repo}: none of its ${directories.length} SKILL.md files could be read`
    )
  }

  return skills
}

const fetchRepoFacts = async (
  repo: string,
  headers: Headers
): Promise<RepoFacts> => {
  const facts = repoFactsSchema.parse(
    await fetchJson(`${GITHUB_API}/repos/${repo}`, headers)
  )
  // Read rather than assumed: a repository that renames its default branch
  // would otherwise start answering 404 for every file in it, silently.
  return {
    stars: facts.stargazers_count,
    defaultBranch: facts.default_branch,
  }
}

// One recursive call per repository, which is what makes layout irrelevant:
// nothing here assumes a `skills/` directory, and a repository that nests its
// skills anywhere is indexed the same way. It is also the only listing the
// index is built from, weights included — no skill costs a second request.
const fetchSkillDirectories = async (
  repo: string,
  branch: string,
  headers: Headers
): Promise<SkillDirectory[]> => {
  const tree = treeSchema.parse(
    await fetchJson(
      `${GITHUB_API}/repos/${repo}/git/trees/${branch}?recursive=1`,
      headers
    )
  )
  if (tree.truncated) {
    warnAboutRepo(
      repo,
      "the git tree came back truncated; some skills may be missing"
    )
  }
  return skillDirectoriesIn(tree.tree)
}

// A skill is a directory whose SKILL.md exists, so the file's parent is the
// skill. Requiring the leading slash is what excludes a repository-root
// SKILL.md, which describes the repository rather than a skill inside it.
//
// Blob-versus-directory is left to the fetch: a directory somehow named
// SKILL.md answers 404 on raw.githubusercontent and drops out with everything
// else that could not be read.
const skillDirectoriesIn = (entries: readonly TreeEntry[]): SkillDirectory[] =>
  entries
    .filter((entry) => entry.path.endsWith(SKILL_FILE_SUFFIX))
    .map((entry) => directoryHolding(entry.path))
    .map((path) => ({ path, bytes: bytesUnder(entries, path) }))

const directoryHolding = (manifestPath: string) =>
  manifestPath.slice(0, -SKILL_FILE_SUFFIX.length)

// Everything under the skill's own directory and nothing beside it. The
// separator is what keeps `skills/docx` from also weighing `skills/docx-legacy`
// — a skill refused for a neighbour's weight would be a refusal nobody could
// act on.
//
// A blob GitHub reported no size for counts as nothing, and so does a directory
// whose blobs report none at all: the entry is published weighing zero, reads
// as addable, and the consumer's own listing at install time remains the
// backstop. Zero rather than a third "unknown" state, because that is the
// number `skill-contents.ts` computes from the same response — a producer and
// its backstop disagreeing about a weight would be worse than either.
const bytesUnder = (entries: readonly TreeEntry[], directory: string) =>
  entries
    .filter((entry) => isBlobUnder(entry, directory))
    .reduce((total, entry) => total + (entry.size ?? 0), 0)

const isBlobUnder = (entry: TreeEntry, directory: string) =>
  entry.type === "blob" && entry.path.startsWith(`${directory}/`)

const readSkills = async (
  repo: string,
  facts: RepoFacts,
  directories: readonly SkillDirectory[]
): Promise<SkillIndexEntry[]> => {
  const entries: SkillIndexEntry[] = []
  for (let start = 0; start < directories.length; start += CONCURRENT_READS) {
    const wave = directories.slice(start, start + CONCURRENT_READS)
    const read = await Promise.all(
      wave.map((directory) => readSkill(repo, facts, directory))
    )
    entries.push(...read.filter((entry) => entry !== null))
  }
  return entries
}

const readSkill = async (
  repo: string,
  facts: RepoFacts,
  directory: SkillDirectory
): Promise<SkillIndexEntry | null> => {
  const url = `${RAW_CONTENT}/${repo}/${facts.defaultBranch}/${directory.path}${SKILL_FILE_SUFFIX}`

  let content: string
  try {
    const response = await fetch(url, { headers: BASE_HEADERS })
    if (!response.ok) return null
    content = await response.text()
  } catch {
    // One skill this crawl could not reach. The repository's other skills are
    // unaffected, and a repository nothing could be read from fails as a whole
    // back in `crawlRepo`.
    return null
  }

  const described = describeSkill(content, directory.path)
  if (described === null) return null

  return {
    ...described,
    repo,
    path: directory.path,
    stars: facts.stars,
    bytes: directory.bytes,
  }
}

type SkillDescription = { name: string; description: string }

// Missing frontmatter is tolerated — plenty of real SKILL.md files carry none —
// and falls back to what the file itself says: its directory name, and its
// first heading. Frontmatter that is PRESENT and unreadable is a different
// thing and excludes the skill, because that is the case where the file makes
// a claim about itself that cannot be honoured.
const describeSkill = (
  content: string,
  directory: string
): SkillDescription | null => {
  const fallback = {
    name: directory.slice(directory.lastIndexOf("/") + 1),
    description: FIRST_HEADING_PATTERN.exec(content)?.[1]?.trim() ?? "",
  }

  const block = FRONTMATTER_PATTERN.exec(content)?.[1]
  if (block === undefined) return fallback

  const frontmatter = parseFrontmatter(block)
  if (frontmatter === null) return null

  return {
    name: frontmatter.name ?? fallback.name,
    description: frontmatter.description ?? fallback.description,
  }
}

const parseFrontmatter = (block: string) => {
  let parsed: unknown
  try {
    parsed = parseYaml(block)
  } catch {
    return null
  }

  const result = frontmatterSchema.safeParse(parsed)
  return result.success ? result.data : null
}

const fetchJson = async (url: string, headers: Headers): Promise<unknown> => {
  const response = await fetch(url, { headers })
  if (!response.ok)
    throw new Error(`${url} answered ${String(response.status)}`)
  return response.json()
}
