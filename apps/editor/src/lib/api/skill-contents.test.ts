import {
  BINARY_FILE_BYTES,
  EXTERNAL_SKILL,
  GITHUB_API_ORIGIN,
  GITHUB_RAW_ORIGIN,
  OVERSIZED_EXTERNAL_SKILL,
  binarySkillFileHandler,
  emptySkillTreeHandler,
  oversizedSkillHandler,
  skillTreeUnreachableHandler,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { MAX_EXTERNAL_SKILL_BYTES } from "@workspace/matrix"
import { HttpResponse, http } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { setReportingSink } from "@/lib/observability/report"

import {
  carryLimitRefusal,
  fetchSkillContents,
  isPastCarryLimit,
} from "./skill-contents"

const { repo, path, files } = EXTERNAL_SKILL

describe("fetchSkillContents", () => {
  it("brings back the whole directory rather than SKILL.md alone", async () => {
    const result = await fetchSkillContents(repo, path)

    expect(result.ok && Object.keys(result.files).sort()).toStrictEqual([
      "SKILL.md",
      "metadata.yaml",
      "reference/prompts.md",
    ])
  })

  it("keys files relative to the skill directory", async () => {
    const result = await fetchSkillContents(repo, path)

    expect(result.ok && result.files["SKILL.md"]).toBe(files["SKILL.md"])
    expect(result.ok && result.files["reference/prompts.md"]).toBe(
      files["reference/prompts.md"]
    )
  })

  it("takes only what is under the skill's own path", async () => {
    const result = await fetchSkillContents(repo, path)

    expect(result.ok && result.files["README.md"]).toBeUndefined()
  })

  it("refuses a directory past the cap without downloading it", async () => {
    configMockServer.use(oversizedSkillHandler)

    const result = await fetchSkillContents(
      OVERSIZED_EXTERNAL_SKILL.repo,
      OVERSIZED_EXTERNAL_SKILL.path
    )

    expect(result.ok).toBe(false)
    expect(!result.ok && result.kind).toBe("too-large")
  })

  it("names the size in the refusal, so the number is not a mystery", async () => {
    configMockServer.use(oversizedSkillHandler)

    const result = await fetchSkillContents(
      OVERSIZED_EXTERNAL_SKILL.repo,
      OVERSIZED_EXTERNAL_SKILL.path
    )

    expect(!result.ok && result.error).toMatch(/KB/)
  })

  it("refuses a file that is not UTF-8 text", async () => {
    configMockServer.use(binarySkillFileHandler)

    const result = await fetchSkillContents(repo, path)

    expect(!result.ok && result.kind).toBe("not-text")
    expect(BINARY_FILE_BYTES.length).toBeGreaterThan(0)
  })

  it("refuses a path holding no files", async () => {
    configMockServer.use(emptySkillTreeHandler)

    const result = await fetchSkillContents(repo, path)

    expect(!result.ok && result.kind).toBe("unreadable")
  })

  it("refuses a repository GitHub does not serve", async () => {
    const result = await fetchSkillContents("acme/nothing", "skills/nothing")

    expect(!result.ok && result.kind).toBe("unreadable")
  })

  it("separates an unreachable GitHub from a bad answer", async () => {
    configMockServer.use(skillTreeUnreachableHandler)

    const result = await fetchSkillContents(repo, path)

    expect(!result.ok && result.kind).toBe("unreachable")
    expect(!result.ok && result.error).toMatch(/try again/i)
  })
})

// The routes GitHub answers on, for a spec that needs an answer the shared
// handlers do not give.
const TREE_URL = `${GITHUB_API_ORIGIN}/repos/:owner/:repo/git/trees/:ref`
const RAW_URL = `${GITHUB_RAW_ORIGIN}/:owner/:repo/:ref/*`

const FORBIDDEN = 403
const NOT_FOUND = 404

const listingOnly = (
  entries: { path: string; type: string; size?: number }[]
) =>
  configMockServer.use(
    http.get(TREE_URL, () =>
      HttpResponse.json({ truncated: false, tree: entries })
    )
  )

describe("the size a directory may carry", () => {
  it("allows exactly the cap and refuses one byte past it", () => {
    expect(isPastCarryLimit(MAX_EXTERNAL_SKILL_BYTES)).toBe(false)
    expect(isPastCarryLimit(MAX_EXTERNAL_SKILL_BYTES + 1)).toBe(true)
  })

  it("says the size in KB beside the cap", () => {
    expect(carryLimitRefusal(3 * 1024)).toBe(
      "3 KB, past the 256 KB a shared link may carry"
    )
  })

  it("names the directory it refused", async () => {
    configMockServer.use(oversizedSkillHandler)

    const result = await fetchSkillContents(
      OVERSIZED_EXTERNAL_SKILL.repo,
      OVERSIZED_EXTERNAL_SKILL.path
    )

    expect(!result.ok && result.error).toBe(
      "anthropics/skills/skills/docx is 256 KB, past the 256 KB a shared link may carry"
    )
  })
})

describe("what fetchSkillContents says when it cannot bring a skill back", () => {
  const sink = { issue: vi.fn(), error: vi.fn() }

  beforeEach(() => {
    setReportingSink(sink)
  })

  it("names the repository GitHub could not be reached for", async () => {
    configMockServer.use(skillTreeUnreachableHandler)

    expect(await fetchSkillContents(repo, path)).toStrictEqual({
      ok: false,
      kind: "unreachable",
      error: "obra/superpowers is unreachable — try again",
    })
  })

  it("names the repository and the path GitHub does not serve", async () => {
    expect(
      await fetchSkillContents("acme/nothing", "skills/nothing")
    ).toStrictEqual({
      ok: false,
      kind: "unreadable",
      error: "acme/nothing holds no skills/nothing",
    })
  })

  // A refused listing is worth retrying, and worth knowing about.
  it("offers a retry when GitHub refuses the listing, and reports the status", async () => {
    configMockServer.use(
      http.get(TREE_URL, () => new HttpResponse(null, { status: FORBIDDEN }))
    )

    expect(await fetchSkillContents(repo, path)).toStrictEqual({
      ok: false,
      kind: "unreachable",
      error: "obra/superpowers could not be listed (403) — try again",
    })
    expect(sink.issue).toHaveBeenCalledWith("Skill tree listing failed", {
      status: FORBIDDEN,
    })
  })

  it("refuses a listing that is not a file tree, and reports it", async () => {
    configMockServer.use(http.get(TREE_URL, () => HttpResponse.json({})))

    expect(await fetchSkillContents(repo, path)).toStrictEqual({
      ok: false,
      kind: "unreadable",
      error: "obra/superpowers answered with no file tree",
    })
    expect(sink.issue.mock.calls).toStrictEqual([
      ["Skill tree listing was unreadable", undefined],
    ])
  })

  it("names the path a listing holds nothing under", async () => {
    configMockServer.use(emptySkillTreeHandler)

    expect(await fetchSkillContents(repo, path)).toStrictEqual({
      ok: false,
      kind: "unreadable",
      error: "obra/superpowers holds no skills/brainstorming",
    })
  })

  // A truncated listing may simply have stopped before the path.
  it("says the repository was too large to list when a truncated listing holds nothing under the path", async () => {
    configMockServer.use(
      http.get(TREE_URL, () => HttpResponse.json({ truncated: true, tree: [] }))
    )

    expect(await fetchSkillContents(repo, path)).toStrictEqual({
      ok: false,
      kind: "unreadable",
      error:
        "obra/superpowers is too large to list, so skills/brainstorming could not be found in it",
    })
  })

  it("names the file that is not text", async () => {
    configMockServer.use(binarySkillFileHandler)

    expect(await fetchSkillContents(repo, path)).toStrictEqual({
      ok: false,
      kind: "not-text",
      error:
        "SKILL.md is not text — a skill's files travel as text and this one cannot",
    })
  })

  it("names the file that could not be reached", async () => {
    configMockServer.use(http.get(RAW_URL, () => HttpResponse.error()))

    expect(await fetchSkillContents(repo, path)).toStrictEqual({
      ok: false,
      kind: "unreachable",
      error: "SKILL.md is unreachable — try again",
    })
  })

  // A 404 page is text, and must not be carried as the file.
  it("names the file GitHub would not serve, rather than carrying its error page", async () => {
    configMockServer.use(
      http.get(RAW_URL, () =>
        HttpResponse.text("404: Not Found", { status: NOT_FOUND })
      )
    )

    expect(await fetchSkillContents(repo, path)).toStrictEqual({
      ok: false,
      kind: "unreadable",
      error: "SKILL.md could not be read",
    })
  })

  it("refuses a directory with no SKILL.md, naming it", async () => {
    listingOnly([{ path: `${path}/metadata.yaml`, type: "blob", size: 10 }])

    expect(await fetchSkillContents(repo, path)).toStrictEqual({
      ok: false,
      kind: "unreadable",
      error: "obra/superpowers/skills/brainstorming has no SKILL.md",
    })
  })

  // A directory entry has no bytes to fetch.
  it("fetches the files under the path and not the directories", async () => {
    listingOnly([
      { path: `${path}/SKILL.md`, type: "blob", size: 10 },
      { path: `${path}/reference`, type: "tree" },
      { path: `${path}/reference/prompts.md`, type: "blob", size: 10 },
    ])

    const result = await fetchSkillContents(repo, path)

    expect(result.ok && Object.keys(result.files)).toStrictEqual([
      "SKILL.md",
      "reference/prompts.md",
    ])
  })
})
