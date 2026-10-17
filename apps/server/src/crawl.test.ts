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

// The crawl against a stand-in GitHub served by msw. Each case builds its own
// estate. `githubNotFound` cannot come from api-mocks' root entry: its handlers
// clash with the Workers `Request` type here (TS2379).

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
  /** Path → what raw.githubusercontent serves. A tree path absent here 404s. */
  files: Readonly<Record<string, string>>
}

type Call = { url: string; authorization: string | null }

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
        : HttpResponse.json({ truncated: false, tree: repo.tree })
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
})

describe("the allowlist", () => {
  // The editor's grid already is this project's catalog.
  it("never carries this project's own catalog", () => {
    expect(
      INDEXED_REPOS.filter((repo) => repo.startsWith("agents-inc/"))
    ).toStrictEqual([])
  })
})
