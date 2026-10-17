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
