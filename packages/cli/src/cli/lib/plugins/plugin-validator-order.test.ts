import path from "path";
import { mkdir, writeFile } from "fs/promises";
import type fg from "fast-glob";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A `**` scan lists each directory as its read finishes, so no real tree answers a chosen order on
// demand. The real scan runs, and answers in reverse path order: one order a run can produce.
vi.mock("fast-glob", async (importOriginal) => {
  const { default: scan } = await importOriginal<{ default: typeof fg }>();
  return {
    default: async (patterns: string | string[], options: fg.Options) =>
      (await scan(patterns, options)).toSorted().toReversed(),
  };
});

import { validatePlugin } from "./plugin-validator";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../consts";

const AGENTS_DIR = "agents";

const NO_FRONTMATTER = "Missing or invalid YAML frontmatter";

describe("the order validatePlugin names a plugin's files in", () => {
  let pluginDir: string;

  beforeEach(async () => {
    pluginDir = await createTempDir("plugin-validator-order-");
    await mkdir(path.join(pluginDir, PLUGIN_MANIFEST_DIR), { recursive: true });
    await writeFile(
      path.join(pluginDir, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE),
      JSON.stringify({
        name: "test-plugin",
        description: "Test",
        skills: `./${STANDARD_DIRS.SKILLS}/`,
        agents: `./${AGENTS_DIR}/`,
      }),
    );
    await writeFile(path.join(pluginDir, STANDARD_FILES.README_MD), "# Test");
  });

  afterEach(async () => {
    await cleanupTempDir(pluginDir);
  });

  async function writeSkillWithoutFrontmatter(skillDir: string): Promise<void> {
    await mkdir(path.join(pluginDir, STANDARD_DIRS.SKILLS, skillDir), { recursive: true });
    await writeFile(
      path.join(pluginDir, STANDARD_DIRS.SKILLS, skillDir, STANDARD_FILES.SKILL_MD),
      `# ${skillDir}\n`,
    );
  }

  async function writeAgentWithoutFrontmatter(agentFile: string): Promise<void> {
    await mkdir(path.join(pluginDir, AGENTS_DIR), { recursive: true });
    await writeFile(path.join(pluginDir, AGENTS_DIR, agentFile), `# ${agentFile}\n`);
  }

  it("lists its skills' errors in path order, whatever order the scan found them in", async () => {
    await writeSkillWithoutFrontmatter("bad-skill");
    await writeSkillWithoutFrontmatter("worse-skill");
    await writeSkillWithoutFrontmatter("awful-skill");
    await writeAgentWithoutFrontmatter("only-agent.md");

    const result = await validatePlugin(pluginDir);

    expect(result).toStrictEqual({
      valid: false,
      errors: [
        `${path.join(STANDARD_DIRS.SKILLS, "awful-skill", STANDARD_FILES.SKILL_MD)}: ${NO_FRONTMATTER}`,
        `${path.join(STANDARD_DIRS.SKILLS, "bad-skill", STANDARD_FILES.SKILL_MD)}: ${NO_FRONTMATTER}`,
        `${path.join(STANDARD_DIRS.SKILLS, "worse-skill", STANDARD_FILES.SKILL_MD)}: ${NO_FRONTMATTER}`,
        `${path.join(AGENTS_DIR, "only-agent.md")}: ${NO_FRONTMATTER}`,
      ],
      warnings: [],
    });
  });

  it("lists its agents' errors in path order, whatever order the scan found them in", async () => {
    await writeSkillWithoutFrontmatter("only-skill");
    await writeAgentWithoutFrontmatter("bad-agent.md");
    await writeAgentWithoutFrontmatter("worse-agent.md");
    await writeAgentWithoutFrontmatter("awful-agent.md");

    const result = await validatePlugin(pluginDir);

    expect(result).toStrictEqual({
      valid: false,
      errors: [
        `${path.join(STANDARD_DIRS.SKILLS, "only-skill", STANDARD_FILES.SKILL_MD)}: ${NO_FRONTMATTER}`,
        `${path.join(AGENTS_DIR, "awful-agent.md")}: ${NO_FRONTMATTER}`,
        `${path.join(AGENTS_DIR, "bad-agent.md")}: ${NO_FRONTMATTER}`,
        `${path.join(AGENTS_DIR, "worse-agent.md")}: ${NO_FRONTMATTER}`,
      ],
      warnings: [],
    });
  });
});
