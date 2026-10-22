import {
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
} from "@workspace/api-mocks/fixtures"
import { http, HttpResponse } from "msw"
import { afterEach, describe, expect, it, vi } from "vitest"

import { MAX_EXTERNAL_SKILL_BYTES } from "@workspace/matrix/seed"
import { skillIndexSchema } from "@workspace/matrix/skill-index"

import { upstreamMock } from "../vitest.setup"
import { INDEXED_REPOS, crawlSkillIndex } from "./crawl"

import type { SkillIndex } from "@workspace/matrix/skill-index"

// `githubNotFound` cannot come from api-mocks' root entry: its handlers clash
// with the Workers `Request` type here (TS2379).

const REPO_API = `${GITHUB_API_ORIGIN}/repos/`
const RAW = `${GITHUB_RAW_ORIGIN}/`

const REPO_FACTS_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:name`
const TREE_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:name/git/trees/:branch`
const RAW_URL = `${GITHUB_RAW_ORIGIN}/:owner/:name/:branch/*`

// Named so a re-ordered allowlist does not break the tests.
const [FIRST_REPO, SECOND_REPO, THIRD_REPO] = INDEXED_REPOS

const STARS = 268_868

const MORE_SKILLS_THAN_A_REQUEST_COULD_VERIFY = 60

const TOKEN = "ghs-not-a-real-token"

// Far apart so a sum comes out right one way only. Tree sizes, not file bytes.
const MANIFEST_BYTES = 1_024
const REFERENCE_BYTES = 30_000
const SIBLING_BYTES = 500_000
const README_BYTES = 12

const GAMMA_MANIFEST = "# Gamma Skill\n\nSome prose.\n"

/** GitHub's refusal, the same for missing and private repositories. */
const notFound = () =>
  HttpResponse.json({ message: "Not Found" }, { status: 404 })

type TreeEntry = { path: string; type: string; size?: number }

type FakeRepo = {
  stars: number
  defaultBranch: string
  tree: readonly TreeEntry[]
  /** GitHub's flag for a tree too large to list whole. */
  truncated: boolean
  /** Path → what raw.githubusercontent serves. A tree path absent here 404s. */
  files: Readonly<Record<string, string>>
}

type Call = {
  url: string
  authorization: string | null
  userAgent: string | null
  accept: string | null
}

type RepoParams = { owner: string; name: string }

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

const blob = (path: string, size: number): TreeEntry => ({
  path,
  type: "blob",
  size,
})

// GitHub reports no size for a directory.
const directory = (path: string): TreeEntry => ({ path, type: "tree" })

const fakeRepo = (
  files: Record<string, string>,
  tree?: readonly TreeEntry[]
): FakeRepo => ({
  stars: STARS,
  defaultBranch: "main",
  tree:
    tree ??
    Object.entries(files).map(([path, text]) => blob(path, text.length)),
  truncated: false,
  files,
})

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

const factsOf = (repo: FakeRepo) => ({
  stargazers_count: repo.stars,
  default_branch: repo.defaultBranch,
})

/**
 * The repository-relative path of a raw URL (msw parks `*` in `params[0]`).
 * Takes the url, not the request, to avoid the Workers `Request` (TS2379).
 */
const fileRequestedBy = (url: string) =>
  new URL(url).pathname.split("/").slice(4).join("/")

// GitHub holding exactly these repositories; anything else gets its own 404.
const serveGitHub = (repos: Record<string, FakeRepo>) => {
  const repoIn = (params: RepoParams) => repos[`${params.owner}/${params.name}`]

  upstreamMock.use(
    http.get<RepoParams>(REPO_FACTS_URL, ({ params }) => {
      const repo = repoIn(params)

      return repo === undefined ? notFound() : HttpResponse.json(factsOf(repo))
    }),
    http.get<RepoParams>(TREE_URL, ({ params }) => {
      const repo = repoIn(params)

      return repo === undefined
        ? notFound()
        : HttpResponse.json({ truncated: repo.truncated, tree: repo.tree })
    }),
    http.get<RepoParams>(RAW_URL, ({ params, request }) => {
      const text = repoIn(params)?.files[fileRequestedBy(request.url)]

      return text === undefined ? notFound() : HttpResponse.text(text)
    })
  )
}

/**
 * GitHub unreachable. Stubs the global `fetch`: msw's `HttpResponse.error()`
 * leaks an unhandled rejection in this pool, and a throwing resolver is a 500,
 * not an unreachable host.
 */
const serveGitHubUnreachable = () => {
  vi.stubGlobal("fetch", () =>
    Promise.reject(new Error("upstream unreachable"))
  )
}

/**
 * @returns every call the crawl made, in order, refused or answered.
 */
const recordCalls = () => {
  const calls: Call[] = []

  upstreamMock.events.on("request:start", ({ request }) => {
    calls.push({
      url: request.url,
      authorization: request.headers.get("authorization"),
      userAgent: request.headers.get("user-agent"),
      accept: request.headers.get("accept"),
    })
  })

  return calls
}

const crawled = async (
  repos: readonly string[],
  token?: string
): Promise<SkillIndex> =>
  skillIndexSchema.parse(await crawlSkillIndex(repos, token))

describe("crawlSkillIndex", () => {
  // `clearMocks` does not restore stubbed globals.
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("indexes only the directories that hold a SKILL.md", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo(
        {
          "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things"),
          // Readable, so its absence can only be the root-path filter.
          "SKILL.md": skillMd("the-repo-itself", "Not a skill"),
        },
        [
          blob("README.md", README_BYTES),
          blob("SKILL.md", MANIFEST_BYTES),
          blob("skills/alpha/SKILL.md", MANIFEST_BYTES),
          blob("skills/alpha/reference.md", REFERENCE_BYTES),
          blob("skills/beta/README.md", README_BYTES),
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
        bytes: MANIFEST_BYTES + REFERENCE_BYTES,
      },
    ])
  })

  it("excludes a skill whose SKILL.md cannot be fetched", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo(
        { "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things") },
        [
          blob("skills/alpha/SKILL.md", MANIFEST_BYTES),
          blob("skills/vanished/SKILL.md", MANIFEST_BYTES),
        ]
      ),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.path)).toStrictEqual([
      "skills/alpha",
    ])
  })

  it("excludes a skill whose frontmatter does not parse", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({
        "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things"),
        // YAML forbids tab indentation, so this frontmatter cannot be read.
        "skills/broken/SKILL.md":
          "---\nname: broken\n\tdescription: tabs\n---\n\n# broken\n",
      }),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.name)).toStrictEqual(["alpha"])
  })

  it("falls back to the directory name and first heading without frontmatter", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({ "skills/gamma/SKILL.md": GAMMA_MANIFEST }),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills).toStrictEqual([
      {
        name: "gamma",
        description: "Gamma Skill",
        repo: FIRST_REPO,
        path: "skills/gamma",
        stars: STARS,
        bytes: GAMMA_MANIFEST.length,
      },
    ])
  })

  // Summed from the tree the crawl already fetched; no extra request.
  it("weighs the whole skill directory rather than its SKILL.md alone", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo(
        { "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things") },
        [
          blob("skills/alpha/SKILL.md", MANIFEST_BYTES),
          directory("skills/alpha/reference"),
          blob("skills/alpha/reference/api.md", REFERENCE_BYTES),
        ]
      ),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.bytes)).toStrictEqual([
      MANIFEST_BYTES + REFERENCE_BYTES,
    ])
  })

  // The separator keeps `skills/alpha` from weighing `skills/alpha-legacy`.
  it("weighs a skill without its neighbours, however alike their paths", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo(
        {
          "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things"),
          "skills/alpha-legacy/SKILL.md": skillMd(
            "alpha-legacy",
            "The old one"
          ),
        },
        [
          blob("README.md", README_BYTES),
          blob("skills/alpha/SKILL.md", MANIFEST_BYTES),
          blob("skills/alpha-legacy/SKILL.md", MANIFEST_BYTES),
          blob("skills/alpha-legacy/schema.xml", SIBLING_BYTES),
        ]
      ),
    })

    const index = await crawled([FIRST_REPO])

    expect(
      Object.fromEntries(index.skills.map((skill) => [skill.name, skill.bytes]))
    ).toStrictEqual({
      alpha: MANIFEST_BYTES,
      "alpha-legacy": MANIFEST_BYTES + SIBLING_BYTES,
    })
  })

  // Zero and still indexed, matching the editor's own listing.
  it("weighs a directory GitHub reports no sizes for as nothing", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo(
        { "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things") },
        [{ path: "skills/alpha/SKILL.md", type: "blob" }]
      ),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.bytes)).toStrictEqual([0])
  })

  // Oversized skills stay indexed so the dialog can say why it refuses them.
  it("indexes a skill far past the per-skill cap rather than dropping it", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo(
        { "skills/docx/SKILL.md": skillMd("docx", "Word documents") },
        [
          blob("skills/docx/SKILL.md", MANIFEST_BYTES),
          blob("skills/docx/schema.xml", SIBLING_BYTES),
        ]
      ),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.name)).toStrictEqual(["docx"])
    expect(index.skills[0]?.bytes).toBeGreaterThan(MAX_EXTERNAL_SKILL_BYTES)
  })

  it("crawls every allowlisted repository in one pass", async () => {
    serveGitHub(everyRepo())

    const index = await crawled(INDEXED_REPOS)

    expect(index.skills.map((skill) => skill.repo)).toStrictEqual([
      FIRST_REPO,
      SECOND_REPO,
      THIRD_REPO,
    ])
  })

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
    serveGitHub({ [FIRST_REPO]: fakeRepo(enormous) })

    const index = await crawled([FIRST_REPO])

    expect(index.skills).toHaveLength(MORE_SKILLS_THAN_A_REQUEST_COULD_VERIFY)
  })

  // All or nothing, so the last complete index is never replaced by a smaller one.
  it("fails rather than returning a partial index when a repository is unreachable", async () => {
    serveGitHubUnreachable()

    await expect(crawlSkillIndex(INDEXED_REPOS)).rejects.toThrow()
  })

  it("fails when a repository's skills could not be read at all", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({}, [
        blob("skills/alpha/SKILL.md", MANIFEST_BYTES),
        blob("skills/beta/SKILL.md", MANIFEST_BYTES),
      ]),
    })

    await expect(crawlSkillIndex([FIRST_REPO])).rejects.toThrow()
  })

  it("stamps the index with the moment it was built", async () => {
    serveGitHub(everyRepo())
    const before = Date.now()

    const index = await crawled(INDEXED_REPOS)

    expect(Date.parse(index.builtAt)).toBeGreaterThanOrEqual(before)
  })

  // The token goes to the API only, never to raw.githubusercontent.
  it("authenticates to the API and sends no token to raw content", async () => {
    const calls = recordCalls()
    serveGitHub(everyRepo())

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
    const calls = recordCalls()
    serveGitHub(everyRepo())

    await crawled(INDEXED_REPOS)

    expect(calls.map((call) => call.authorization)).toStrictEqual(
      calls.map(() => null)
    )
  })

  // `clearMocks` does not restore a spy either.
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // api.github.com refuses a call with no User-Agent.
  it("names itself on every call, and asks the API for its own media type", async () => {
    const calls = recordCalls()
    serveGitHub(everyRepo())

    await crawled(INDEXED_REPOS)

    const api = calls.filter((call) => call.url.startsWith(REPO_API))
    expect(api).not.toStrictEqual([])
    expect(calls.map((call) => call.userAgent)).toStrictEqual(
      calls.map(() => "agents-inc-skill-index")
    )
    expect(api.map((call) => call.accept)).toStrictEqual(
      api.map(() => "application/vnd.github+json")
    )
  })

  it("reads nothing from raw content but the SKILL.md files the tree lists", async () => {
    const calls = recordCalls()
    serveGitHub({
      [FIRST_REPO]: fakeRepo(
        { "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things") },
        [
          blob("README.md", README_BYTES),
          blob("skills/alpha/SKILL.md", MANIFEST_BYTES),
          blob("skills/alpha/reference.md", REFERENCE_BYTES),
        ]
      ),
    })

    await crawled([FIRST_REPO])

    expect(
      calls.filter((call) => call.url.startsWith(RAW)).map((call) => call.url)
    ).toStrictEqual([`${RAW}${FIRST_REPO}/main/skills/alpha/SKILL.md`])
  })

  // Two horizontal rules in the body are not frontmatter.
  it("reads frontmatter only at the very top of the file", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({
        "skills/delta/SKILL.md": "# Delta\n\n---\nname: not-delta\n---\n",
      }),
    })

    const index = await crawled([FIRST_REPO])

    expect(
      index.skills.map((skill) => [skill.name, skill.description])
    ).toStrictEqual([["delta", "Delta"]])
  })

  it("takes the first line that starts with a heading marker, not one holding a #", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({
        "skills/epsilon/SKILL.md": "Write C# code.\n\n# Epsilon Skill\n",
      }),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.description)).toStrictEqual([
      "Epsilon Skill",
    ])
  })

  it.each(["#\n\nSome prose.\n", "#   \n\nSome prose.\n"])(
    "takes no description from a heading with no text, nor the line after it: %j",
    async (manifest) => {
      serveGitHub({
        [FIRST_REPO]: fakeRepo({ "skills/theta/SKILL.md": manifest }),
      })

      const index = await crawled([FIRST_REPO])

      expect(index.skills.map((skill) => skill.description)).toStrictEqual([""])
    }
  )

  it("takes a heading's text however many spaces follow the marker", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({ "skills/kappa/SKILL.md": "#   Kappa Skill\n" }),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.description)).toStrictEqual([
      "Kappa Skill",
    ])
  })

  it("passes a heading with no text over for the first one that has some", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({
        "skills/iota/SKILL.md": "#\nSome prose.\n\n#\tIota Skill\n",
      }),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.description)).toStrictEqual([
      "Iota Skill",
    ])
  })

  it("trims the heading it falls back to", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({ "skills/zeta/SKILL.md": "# Zeta Skill   \n" }),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.description)).toStrictEqual([
      "Zeta Skill",
    ])
  })

  it("leaves the description empty when there is neither frontmatter nor a heading", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({ "skills/eta/SKILL.md": "Just prose.\n" }),
    })

    const index = await crawled([FIRST_REPO])

    expect(
      index.skills.map((skill) => [skill.name, skill.description])
    ).toStrictEqual([["eta", ""]])
  })

  // The crawl runs in a scheduled Action; its log is where this surfaces.
  it("warns, and still indexes what it got, when GitHub truncates the tree", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    serveGitHub({
      [FIRST_REPO]: {
        ...fakeRepo({
          "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things"),
        }),
        truncated: true,
      },
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills.map((skill) => skill.name)).toStrictEqual(["alpha"])
    expect(logged).toHaveBeenCalledWith({
      event: "skill_index_warning",
      repo: FIRST_REPO,
      reason: "the git tree came back truncated; some skills may be missing",
    })
  })

  // The control for the warning above.
  it("warns of nothing when the tree comes back whole", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    serveGitHub(everyRepo())

    await crawled(INDEXED_REPOS)

    expect(logged).not.toHaveBeenCalled()
  })

  // Only reads that all fail are an outage; a repository may hold no skills.
  it("indexes nothing, without failing, from a repository holding no skills", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({ "README.md": "# Nothing to see\n" }),
    })

    const index = await crawled([FIRST_REPO])

    expect(index.skills).toStrictEqual([])
  })

  it("names the repository and how many files it could not read", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo({}, [
        blob("skills/alpha/SKILL.md", MANIFEST_BYTES),
        blob("skills/beta/SKILL.md", MANIFEST_BYTES),
      ]),
    })

    await expect(crawlSkillIndex([FIRST_REPO])).rejects.toThrow(
      `${FIRST_REPO}: none of its 2 SKILL.md files could be read`
    )
  })

  it("names the address and status when GitHub refuses a request", async () => {
    serveGitHub({})

    await expect(crawlSkillIndex([FIRST_REPO])).rejects.toThrow(
      `${REPO_API}${FIRST_REPO} answered 404`
    )
  })
})

describe("the allowlist", () => {
  // The editor's grid already is this project's catalog.
  it("never carries this project's own catalog", () => {
    expect(
      INDEXED_REPOS.filter((repo) => repo.startsWith("agents-inc/"))
    ).toStrictEqual([])
  })
})
