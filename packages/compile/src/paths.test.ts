// The names an install writes on users' disks and the words it prints, stated rather than derived:
// the CLI reads every one of them from here, so a changed value moves files a user already has.

import { describe, expect, it } from "vitest"

import {
  CLAUDE_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_PLUGIN_NAME,
  DEFAULT_SOURCE,
  EJECT_SOURCE,
  GITHUB_PREFIX,
  GLOBAL_CONFIG_NAME,
  LOCAL_SKILLS_PATH,
  PLUGIN_MANIFEST_FILE,
  SKILLS_DIR_PATH,
  SOURCE_SRC_DIR,
  STANDARD_FILES,
} from "./paths"

describe("the folders an install reads and writes", () => {
  it("keeps Claude Code's own folder and its skills folder", () => {
    expect(CLAUDE_DIR).toBe(".claude")
    expect(LOCAL_SKILLS_PATH).toBe(".claude/skills")
  })

  it("reads a marketplace's skills from under its source root", () => {
    expect(SOURCE_SRC_DIR).toBe("src")
    expect(SKILLS_DIR_PATH).toBe("src/skills")
  })
})

describe("the names an install is known by", () => {
  it("registers under the published package's name", () => {
    expect(DEFAULT_PLUGIN_NAME).toBe("agents-inc")
  })

  it("reads the public marketplace when nothing names one", () => {
    expect(GITHUB_PREFIX).toBe("github:")
    expect(DEFAULT_SOURCE).toBe("github:agents-inc/skills")
  })

  it("tells users to run commands through npx", () => {
    expect(CLI_INVOKE_COMMAND).toBe("npx agents-inc")
  })

  it("records an ejected skill's origin and the global configuration's name", () => {
    expect(EJECT_SOURCE).toBe("eject")
    expect(GLOBAL_CONFIG_NAME).toBe("global")
  })
})

describe("the files a marketplace carries", () => {
  it("describes skills and agents in metadata.yaml and plugins in plugin.json", () => {
    expect(STANDARD_FILES.METADATA_YAML).toBe("metadata.yaml")
    expect(STANDARD_FILES.AGENT_METADATA_YAML).toBe("metadata.yaml")
    expect(PLUGIN_MANIFEST_FILE).toBe("plugin.json")
    expect(STANDARD_FILES.PLUGIN_JSON).toBe("plugin.json")
  })
})
