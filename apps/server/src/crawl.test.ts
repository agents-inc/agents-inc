import { afterEach, describe, expect, it, vi } from "vitest"

import { skillIndexSchema } from "@workspace/matrix/skill-index"

import { INDEXED_REPOS, crawlSkillIndex } from "./crawl"

import type { SkillIndex } from "@workspace/matrix/skill-index"

// The crawl against a stand-in GitHub. Nothing here touches KV or the worker:
// this module is what the scheduled Action runs, and these are the tests that
// moved with it when the crawl left the request path.

const REPO_API = "https://api.github.com/repos/"
const RAW = "https://raw.githubusercontent.com/"

// Named rather than spelled out so the tests keep working when the allowlist
// is re-ordered — what they assert is the policy, not which repo won.
const [FIRST_REPO, SECOND_REPO, THIRD_REPO] = INDEXED_REPOS

const STARS = 268_868

// More skills than the old one-repository-per-request design could verify
// inside a Worker's 50-subrequest budget. Nothing bounds the crawl now.
const MORE_SKILLS_THAN_A_REQUEST_COULD_VERIFY = 60

const TOKEN = "ghs-not-a-real-token"

type FakeRepo = {
  stars: number
  defaultBranch: string
  /** Blob paths, exactly as the git tree API reports them. */
  tree: readonly string[]
  /** Path → what raw.githubusercontent serves. A tree path absent here 404s. */
  files: Readonly<Record<string, string>>
}

type Call = { url: string; authorization: string | null }

const skillMd = (name: string, description: string) =>
  [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    `# ${name}`,
    "",
  ].join("\n")

const fakeRepo = (
  files: Record<string, string>,
  tree?: readonly string[]
): FakeRepo => ({
  stars: STARS,
  defaultBranch: "main",
  tree: tree ?? Object.keys(files),
  files,
})

// One skill in each allowlisted repository, distinguishable by name. Enough to
// tell which repositories a crawl has reached.
const everyRepo = (): Record<string, FakeRepo> =>
  Object.fromEntries(
    INDEXED_REPOS.map((repo, position) => [
      repo,
      fakeRepo({
        [`skills/skill-${position}/SKILL.md`]: skillMd(
          `skill-${position}`,
          `From ${repo}`
        ),
      }),
    ])
  )

const repoIn = (repos: Record<string, FakeRepo>, rest: string) => {
  const [owner, name] = rest.split("/")
  if (owner === undefined || name === undefined) return undefined
  return repos[`${owner}/${name}`]
}

const notFound = () => new Response("Not Found", { status: 404 })

// `/repos/{owner}/{name}` answers the repository's facts; anything longer is
// the git tree call.
const answerApi = (repos: Record<string, FakeRepo>, rest: string): Response => {
  const repo = repoIn(repos, rest)
  if (repo === undefined) return notFound()

  if (rest.split("/").length === 2) {
    return Response.json({
      stargazers_count: repo.stars,
      default_branch: repo.defaultBranch,
    })
  }

  return Response.json({
    truncated: false,
    tree: repo.tree.map((path) => ({ path, type: "blob" })),
  })
}

// `{owner}/{name}/{branch}/{path...}`.
const answerRaw = (repos: Record<string, FakeRepo>, rest: string): Response => {
  const repo = repoIn(repos, rest)
  const body = repo?.files[rest.split("/").slice(3).join("/")]
  if (body === undefined) return notFound()
  return new Response(body)
}

const answer = (repos: Record<string, FakeRepo>, url: string): Response => {
  if (url.startsWith(REPO_API))
    return answerApi(repos, url.slice(REPO_API.length))
  if (url.startsWith(RAW)) return answerRaw(repos, url.slice(RAW.length))
  return new Response(`unexpected host: ${url}`, { status: 500 })
}

/** @returns every call the crawl made, in order. */
const stubGitHub = (repos: Record<string, FakeRepo>) => {
  const calls: Call[] = []
  vi.stubGlobal(
    "fetch",
    (url: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url, authorization: init?.headers?.authorization ?? null })
      return Promise.resolve(answer(repos, url))
    }
  )
  return calls
}

/** GitHub unreachable rather than answering an error — the harsher of the two. */
const stubGitHubUnreachable = () => {
  vi.stubGlobal("fetch", () =>
    Promise.reject(new Error("upstream unreachable"))
  )
}

// Parsed with the shared schema rather than asserted field by field: what the
// script publishes is what this returns, and the script publishes nothing that
// does not satisfy this schema.
const crawled = async (
  repos: readonly string[],
  token?: string
): Promise<SkillIndex> =>
  skillIndexSchema.parse(await crawlSkillIndex(repos, token))

describe("crawlSkillIndex", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("indexes only the directories that hold a SKILL.md", async () => {
    stubGitHub({
      [FIRST_REPO]: fakeRepo(
        {
          "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things"),
          // Readable, so its absence from the index can only be the path
          // filter: a repository-root SKILL.md describes the repository, and
          // a skill is a directory in every consumer of this index.
          "SKILL.md": skillMd("the-repo-itself", "Not a skill"),
        },
        [
          "README.md",
          "SKILL.md",
          "skills/alpha/SKILL.md",
          "skills/alpha/reference.md",
          "skills/beta/README.md",
        ]
      ),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills).toStrictEqual([
      {
        name: "alpha",
        description: "Does alpha things",
        repo: FIRST_REPO,
        path: "skills/alpha",
        stars: STARS,
      },
    ])
  })

  it("excludes a skill whose SKILL.md cannot be fetched", async () => {
    stubGitHub({
      [FIRST_REPO]: fakeRepo(
        { "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things") },
        ["skills/alpha/SKILL.md", "skills/vanished/SKILL.md"]
      ),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.path)).toStrictEqual([
      "skills/alpha",
    ])
  })

  it("excludes a skill whose frontmatter does not parse", async () => {
    stubGitHub({
      [FIRST_REPO]: fakeRepo({
        "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things"),
        // YAML forbids tabs for indentation, so this block exists and cannot
        // be read — which is the case install-proof is about.
        "skills/broken/SKILL.md":
          "---\nname: broken\n\tdescription: tabs\n---\n\n# broken\n",
      }),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.name)).toStrictEqual(["alpha"])
  })

  it("falls back to the directory name and first heading without frontmatter", async () => {
    stubGitHub({
      [FIRST_REPO]: fakeRepo({
        "skills/gamma/SKILL.md": "# Gamma Skill\n\nSome prose.\n",
      }),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills).toStrictEqual([
      {
        name: "gamma",
        description: "Gamma Skill",
        repo: FIRST_REPO,
        path: "skills/gamma",
        stars: STARS,
      },
    ])
  })

  // What replaced the incremental fill. The Action has no subrequest budget to
  // stay inside, so one pass produces the whole index rather than a third of it.
  it("crawls every allowlisted repository in one pass", async () => {
    stubGitHub(everyRepo())

    const index = await crawled(INDEXED_REPOS)

    expect(index.skills.map((skill) => skill.repo)).toStrictEqual([
      FIRST_REPO,
      SECOND_REPO,
      THIRD_REPO,
    ])
  })

  // The old design refused a repository holding more than 40 skills, because
  // one Worker request could not verify them. Nothing refuses one now.
  it("indexes a repository holding more skills than one worker request could verify", async () => {
    const enormous = Object.fromEntries(
      Array.from(
        { length: MORE_SKILLS_THAN_A_REQUEST_COULD_VERIFY },
        (_, position) => [
          `skills/skill-${position}/SKILL.md`,
          skillMd(`skill-${position}`, "One of very many"),
        ]
      )
    )
    stubGitHub({ [FIRST_REPO]: fakeRepo(enormous) })

    const index = await crawled([FIRST_REPO])

    expect(index.skills).toHaveLength(MORE_SKILLS_THAN_A_REQUEST_COULD_VERIFY)
  })

  // All or nothing, and that is what makes the stored index safe to keep
  // forever: a run that could not see everything publishes nothing, so the
  // last complete index stays in KV rather than being replaced by a smaller one.
  it("fails rather than returning a partial index when a repository is unreachable", async () => {
    stubGitHubUnreachable()

    await expect(crawlSkillIndex(INDEXED_REPOS)).rejects.toThrow()
  })

  it("fails when a repository's skills could not be read at all", async () => {
    stubGitHub({
      [FIRST_REPO]: fakeRepo({}, [
        "skills/alpha/SKILL.md",
        "skills/beta/SKILL.md",
      ]),
    })

    await expect(crawlSkillIndex([FIRST_REPO])).rejects.toThrow()
  })

  it("stamps the index with the moment it was built", async () => {
    stubGitHub(everyRepo())
    const before = Date.now()

    const index = await crawled(INDEXED_REPOS)

    expect(Date.parse(index.builtAt)).toBeGreaterThanOrEqual(before)
  })

  // 5000 requests an hour instead of 60, which is the whole reason the crawl
  // moved somewhere it can hold a token. raw.githubusercontent is a different
  // host serving public files and spends no API budget at all, so it is sent
  // no credential — a token travels to exactly the host that issued it.
  it("authenticates to the API and sends no token to raw content", async () => {
    const calls = stubGitHub(everyRepo())

    await crawled(INDEXED_REPOS, TOKEN)

    const api = calls.filter((call) => call.url.startsWith(REPO_API))
    const raw = calls.filter((call) => call.url.startsWith(RAW))
    expect(api).not.toStrictEqual([])
    expect(raw).not.toStrictEqual([])
    expect(api.map((call) => call.authorization)).toStrictEqual(
      api.map(() => `Bearer ${TOKEN}`)
    )
    expect(raw.map((call) => call.authorization)).toStrictEqual(
      raw.map(() => null)
    )
  })

  it("crawls unauthenticated when no token is offered", async () => {
    const calls = stubGitHub(everyRepo())

    await crawled(INDEXED_REPOS)

    expect(calls.map((call) => call.authorization)).toStrictEqual(
      calls.map(() => null)
    )
  })
})

describe("the allowlist", () => {
  // The dialog this index feeds exists for what the editor's own grid lacks,
  // and the grid already IS this project's catalog. Indexing our own skills
  // would put every one of them in the "external" half of the UI.
  it("never carries this project's own catalog", () => {
    expect(
      INDEXED_REPOS.filter((repo) => repo.startsWith("agents-inc/"))
    ).toStrictEqual([])
  })
})
