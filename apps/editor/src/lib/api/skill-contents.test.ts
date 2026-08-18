import {
  BINARY_FILE_BYTES,
  EXTERNAL_SKILL,
  OVERSIZED_EXTERNAL_SKILL,
  binarySkillFileHandler,
  emptySkillTreeHandler,
  oversizedSkillHandler,
  skillTreeUnreachableHandler,
} from "@workspace/api-mocks"
import { configMockServer } from "@workspace/api-mocks/node"
import { describe, expect, it } from "vitest"

import { fetchSkillContents } from "./skill-contents"

// The seam that turns a search result into something installable. Until this
// existed the editor knew a skill's name and stars and nothing about what it
// held, which is why an added skill could only ever be a reference; the payload
// carries the bytes now, so this is where they come from.
//
// Two origins on purpose, and the split is the whole design. The tree listing
// is ONE call to api.github.com whatever the directory's depth — sixty an hour
// is what an unauthenticated browser gets, so a per-directory walk would spend
// that budget on one skill. Every file after it comes off raw.githubusercontent
// .com, which has no API limit at all.

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

  // Relative to the skill's own directory, because that is the directory the
  // CLI writes: a path carrying `skills/brainstorming/` would eject the skill
  // two levels deep inside itself.
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

  // The cap is a property of the payload rather than of the fetch, so it is
  // read off the tree's own sizes and refused BEFORE any bytes are downloaded.
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

  // The payload holds text, and a decoder that substitutes replacement
  // characters would write a corrupted file to someone's disk without either
  // end being told. Refusing is the only honest answer.
  it("refuses a file that is not UTF-8 text", async () => {
    configMockServer.use(binarySkillFileHandler)

    const result = await fetchSkillContents(repo, path)

    expect(!result.ok && result.kind).toBe("not-text")
    expect(BINARY_FILE_BYTES.length).toBeGreaterThan(0)
  })

  // A skill is a directory with a SKILL.md in it. A prefix matching nothing
  // means the index and the repository disagree, which no retry improves.
  it("refuses a path holding no files", async () => {
    configMockServer.use(emptySkillTreeHandler)

    const result = await fetchSkillContents(repo, path)

    expect(!result.ok && result.kind).toBe("unreadable")
  })

  it("refuses a repository GitHub does not serve", async () => {
    const result = await fetchSkillContents("acme/nothing", "skills/nothing")

    expect(!result.ok && result.kind).toBe("unreadable")
  })

  // The one failure retrying fixes, and the only one that says so.
  it("separates an unreachable GitHub from a bad answer", async () => {
    configMockServer.use(skillTreeUnreachableHandler)

    const result = await fetchSkillContents(repo, path)

    expect(!result.ok && result.kind).toBe("unreachable")
    expect(!result.ok && result.error).toMatch(/try again/i)
  })
})
