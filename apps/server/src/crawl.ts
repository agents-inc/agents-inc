import { parse as parseYaml } from "yaml"
import { z } from "zod"

import type { SkillIndex, SkillIndexEntry } from "@workspace/matrix/skill-index"

// Crawls an allowlist of external skills repositories for the editor's
// add-skills dialog. Runs in a scheduled GitHub Action (a Worker's subrequest
// budget is too small); the worker only reads what it published. A skill is
// indexed only if its SKILL.md was fetched and its frontmatter parses.
// `agents-inc/skills` must stay absent: the editor's grid is already that catalog.
export const INDEXED_REPOS = [
  "obra/superpowers",
  "anthropics/skills",
  "addyosmani/agent-skills",
] as const

const GITHUB_API = "https://api.github.com"
// Serves public files without spending the API's rate budget.
const RAW_CONTENT = "https://raw.githubusercontent.com"

// api.github.com answers 403 to a request with no User-Agent.
const USER_AGENT = "agents-inc-skill-index"

const BASE_HEADERS = { "user-agent": USER_AGENT }

const API_HEADERS = { ...BASE_HEADERS, accept: "application/vnd.github+json" }

// Courtesy to the host; the crawl has nothing waiting on it.
const CONCURRENT_READS = 6

const SKILL_FILE_SUFFIX = "/SKILL.md"

// `size` is absent for directories, so `type` tells file from directory.
// apps/editor's skill-contents.ts narrows this endpoint the same way; keep them
// in step.
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

// A bare `name:` parses empty, which cannot address a skill.
const frontmatterSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
})

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---/
// Spaces or tabs only after the marker: `\s` would carry an empty heading onto the next line.
const FIRST_HEADING_PATTERN = /^#[ \t]+(\S.*)$/m

type RepoFacts = { stars: number; defaultBranch: string }

type TreeEntry = z.infer<typeof treeSchema>["tree"][number]

type SkillDirectory = { path: string; bytes: number }

type Headers = Readonly<Record<string, string>>

/**
 * Throws rather than returning a partial index, so the last complete index is
 * never replaced by a smaller one.
 *
 * @param token Optional; without one the crawl uses the unauthenticated allowance.
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

// The token goes only to the API; raw content needs no credential.
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

  // Every read failing is an outage, not an empty repository.
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
  // A renamed default branch would otherwise 404 every file.
  return {
    stars: facts.stargazers_count,
    defaultBranch: facts.default_branch,
  }
}

// One recursive call per repository, so layout is irrelevant.
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

// The leading slash excludes a repository-root SKILL.md.
const skillDirectoriesIn = (entries: readonly TreeEntry[]): SkillDirectory[] =>
  entries
    .filter((entry) => entry.path.endsWith(SKILL_FILE_SUFFIX))
    .map((entry) => directoryHolding(entry.path))
    .map((path) => ({ path, bytes: bytesUnder(entries, path) }))

const directoryHolding = (manifestPath: string) =>
  manifestPath.slice(0, -SKILL_FILE_SUFFIX.length)

// The trailing separator keeps `skills/docx` from weighing `skills/docx-legacy`.
// A missing size counts as zero, matching skill-contents.ts.
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
    // A repository nothing could be read from fails in `crawlRepo`.
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

// Missing frontmatter falls back to the directory name and first heading;
// present but unreadable frontmatter excludes the skill.
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
