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

// The crawl against a stand-in GitHub. Nothing here touches KV or the worker:
// this module is what the scheduled Action runs, and these are the tests that
// moved with it when the crawl left the request path.
//
// GitHub is answered by msw rather than by a stubbed `fetch`, so what the crawl
// sends is matched as a URL by a router instead of by the string prefixes this
// file used to compare against — and `onUnhandledRequest: "error"` in
// `vitest.setup.ts` turns a request no case described into a failure rather
// than the invented `500` that used to stand in for one.
//
// The ESTATE stays here and is per-test on purpose. `@workspace/api-mocks`
// describes the two skills the editor's add-skills dialog stages, at one repo
// each; every case below turns on a repository shape of its own — sixty skills,
// a same-prefixed neighbour, a blob GitHub reported no size for — and answering
// them from a fixed pair would be asserting about a different question. What IS
// shared is the two origins.
//
// `githubNotFound` from that package's ROOT entry is the obvious third thing to
// take and cannot be taken yet: importing it pulls `handlers.ts` into this
// program, where `carriesMarketplaceToken` annotates its parameter with the
// ambient `Request` — the WORKERS `Request` under this tsconfig's
// `@cloudflare/vitest-pool-workers/types`, which msw's `StrictRequest` is not
// assignable to with `exactOptionalPropertyTypes` on (TS2379). `./fixtures` is
// msw-free by design and imports cleanly, which is why the origins arrive from
// there.

const REPO_API = `${GITHUB_API_ORIGIN}/repos/`
const RAW = `${GITHUB_RAW_ORIGIN}/`

const REPO_FACTS_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:name`
const TREE_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:name/git/trees/:branch`
const RAW_URL = `${GITHUB_RAW_ORIGIN}/:owner/:name/:branch/*`

// Named rather than spelled out so the tests keep working when the allowlist
// is re-ordered — what they assert is the policy, not which repo won.
const [FIRST_REPO, SECOND_REPO, THIRD_REPO] = INDEXED_REPOS

const STARS = 268_868

// More skills than the old one-repository-per-request design could verify
// inside a Worker's 50-subrequest budget. Nothing bounds the crawl now.
const MORE_SKILLS_THAN_A_REQUEST_COULD_VERIFY = 60

const TOKEN = "ghs-not-a-real-token"

// The sizes the stand-in git tree reports, far enough apart that a sum can only
// come out right one way. They are the tree's numbers rather than the files' —
// the crawl weighs a skill from the listing and never downloads it to check.
const MANIFEST_BYTES = 1_024
const REFERENCE_BYTES = 30_000
const SIBLING_BYTES = 500_000
const README_BYTES = 12

// A SKILL.md with no frontmatter, named so the weight the crawl reports for its
// directory can be checked against the one thing in it.
const GAMMA_MANIFEST = "# Gamma Skill\n\nSome prose.\n"

/**
 * GitHub's own refusal for a repository that is not there, and for one the
 * caller may not see — the same answer on purpose. The crawl reads only the
 * status; the body is GitHub's so that stays true if it ever reads more.
 */
const notFound = () =>
  HttpResponse.json({ message: "Not Found" }, { status: 404 })

/** One entry of the git tree, in the three fields the crawl reads. */
type TreeEntry = { path: string; type: string; size?: number }

type FakeRepo = {
  stars: number
  defaultBranch: string
  /** The git tree, exactly as the API reports it. */
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

// A file, weighed the way the crawl weighs one: the tree's own reported size,
// never the bytes raw.githubusercontent goes on to serve.
const blob = (path: string, size: number): TreeEntry => ({
  path,
  type: "blob",
  size,
})

// A directory. GitHub reports no size for one, which is why the entry's TYPE is
// what tells a file from a directory rather than the presence of a number.
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

/** The repository facts endpoint's answer, in the two fields the crawl reads. */
const factsOf = (repo: FakeRepo) => ({
  stargazers_count: repo.stars,
  default_branch: repo.defaultBranch,
})

/**
 * The file a raw.githubusercontent URL is asking for, relative to the
 * repository root: `/{owner}/{name}/{branch}/{path...}` minus the first three
 * segments. Read off the URL because msw parks a `*` match in `params[0]`,
 * where it is addressed by position rather than by name.
 *
 * Takes the url and not the request. The ambient `Request` under this
 * tsconfig is the WORKERS one, and msw hands its resolvers a
 * `StrictRequest<DefaultBodyType>`, which is not assignable to it with
 * `exactOptionalPropertyTypes` on (TS2379).
 */
const fileRequestedBy = (url: string) =>
  new URL(url).pathname.split("/").slice(4).join("/")

/**
 * GitHub holding exactly these repositories and nothing else — the three
 * endpoints the crawl reads, over the origins `@workspace/api-mocks` names.
 *
 * A repository the estate does not carry is refused with GitHub's own body
 * rather than a shape invented here, which is the same 404 an unauthenticated
 * caller gets for a repository that exists and is not theirs.
 */
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
 * GitHub unreachable rather than answering an error — the harsher of the two,
 * and the one case in this file msw cannot express.
 *
 * `HttpResponse.error()` is what msw offers for it, and in THIS pool every one
 * of them leaks an unhandled rejection out of `@mswjs/interceptors` that fails
 * the run whether or not the caller catches the fetch. Reproduced on msw 2.15.0
 * with a single error response awaited inside `expect(...).rejects`: the
 * assertion passes and the file still reports `Errors 1`, one per error
 * response issued. A resolver that THROWS is not the same thing — msw turns
 * that into a 500, which is a repository answering rather than a repository
 * that cannot be reached, and this test is about the difference.
 *
 * So the global goes back for this one case, which is what `vitest.config.ts`
 * describes and what the rest of the file no longer needs.
 */
const serveGitHubUnreachable = () => {
  vi.stubGlobal("fetch", () =>
    Promise.reject(new Error("upstream unreachable"))
  )
}

/**
 * @returns every call the crawl made, in order.
 *
 * Read off msw's own lifecycle rather than out of a resolver, so a request an
 * estate refuses is recorded exactly like one it answers — the token assertions
 * below are about what was SENT, and a recorder that only saw the successes
 * would be blind to the case that matters.
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

// Parsed with the shared schema rather than asserted field by field: what the
// script publishes is what this returns, and the script publishes nothing that
// does not satisfy this schema.
const crawled = async (
  repos: readonly string[],
  token?: string
): Promise<SkillIndex> =>
  skillIndexSchema.parse(await crawlSkillIndex(repos, token))

describe("crawlSkillIndex", () => {
  // For `serveGitHubUnreachable` alone. `clearMocks: true` from the shared
  // config clears mock CALLS and not stubbed globals, so without this the rest
  // of the file would run against a `fetch` msw is no longer patching.
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("indexes only the directories that hold a SKILL.md", async () => {
    serveGitHub({
      [FIRST_REPO]: fakeRepo(
        {
          "skills/alpha/SKILL.md": skillMd("alpha", "Does alpha things"),
          // Readable, so its absence from the index can only be the path
          // filter: a repository-root SKILL.md describes the repository, and
          // a skill is a directory in every consumer of this index.
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

  // The weight is why the size came into the contract at all. The editor's own
  // listing already reads these numbers off the same endpoint — see
  // `apps/editor/src/lib/api/skill-contents.ts` — but only at confirm, so a
  // skill nothing could ever carry was refused at the end of the funnel. The
  // tree the crawl already fetched holds the answer, and summing it costs no
  // request at all.
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

  // The separator is the whole of it: without it `skills/alpha` would also
  // swallow `skills/alpha-legacy`, and a skill would be refused for the weight
  // of a neighbour that merely starts the same way.
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

  // Zero, and indexed anyway. GitHub reports a size for every blob, so this is
  // the case that should not arise — and if it ever does, the honest answer is
  // the same number the editor's own listing computes from the same response,
  // which still refuses the skill at confirm. A producer and its backstop
  // disagreeing about a weight would be worse than either.
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

  // The index carries what the repositories hold, cap or no cap. Dropping an
  // oversized skill here would leave the dialog unable to say why it is not
  // offering one — which is the same silence, moved.
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

  // What replaced the incremental fill. The Action has no subrequest budget to
  // stay inside, so one pass produces the whole index rather than a third of it.
  it("crawls every allowlisted repository in one pass", async () => {
    serveGitHub(everyRepo())

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
    serveGitHub({ [FIRST_REPO]: fakeRepo(enormous) })

    const index = await crawled([FIRST_REPO])

    expect(index.skills).toHaveLength(MORE_SKILLS_THAN_A_REQUEST_COULD_VERIFY)
  })

  // All or nothing, and that is what makes the stored index safe to keep
  // forever: a run that could not see everything publishes nothing, so the
  // last complete index stays in KV rather than being replaced by a smaller one.
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

  // 5000 requests an hour instead of 60, which is the whole reason the crawl
  // moved somewhere it can hold a token. raw.githubusercontent is a different
  // host serving public files and spends no API budget at all, so it is sent
  // no credential — a token travels to exactly the host that issued it.
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
  // The dialog this index feeds exists for what the editor's own grid lacks,
  // and the grid already IS this project's catalog. Indexing our own skills
  // would put every one of them in the "external" half of the UI.
  it("never carries this project's own catalog", () => {
    expect(
      INDEXED_REPOS.filter((repo) => repo.startsWith("agents-inc/"))
    ).toStrictEqual([])
  })
})
