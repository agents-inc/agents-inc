import { describe, it, expect, vi } from "vitest";

// Mock file system and logger (manual mocks from __mocks__ directories)
vi.mock("../../utils/fs");
vi.mock("../../utils/logger");

import {
  parseFrontmatter,
  loadAllAgents,
  loadMergedAgents,
  loadProjectAgents,
  loadSkillsByIds,
  loadPluginSkills,
} from "./loader";
import { readFile, glob, directoryExists } from "../../utils/fs";
import { warn } from "../../utils/logger";
import { renderSkillMd, renderAgentYaml } from "../__tests__/content-generators";
import type { SkillId } from "../../types";
import { EXPECTED_SKILLS } from "../__tests__/expected-values";

describe("parseFrontmatter", () => {
  it("should parse valid frontmatter with name and description", () => {
    const content = `---
name: ${"web-framework-react"}
description: React component patterns and hooks
---

# React Skill

Content here...`;

    const result = parseFrontmatter(content);

    expect(result).toStrictEqual({
      name: "web-framework-react",
      description: "React component patterns and hooks",
    });
  });

  it("should return null for content without frontmatter", () => {
    const content = `# Just a markdown file

No frontmatter here.`;

    const result = parseFrontmatter(content);

    expect(result).toBeNull();
  });

  it("should return null for invalid frontmatter (missing name)", () => {
    const content = `---
description: Missing name field
---

Content`;

    const result = parseFrontmatter(content);

    expect(result).toBeNull();
  });

  it("should return null for invalid frontmatter (missing description)", () => {
    const content = `---
name: skill-name
---

Content`;

    const result = parseFrontmatter(content);

    expect(result).toBeNull();
  });

  it("when frontmatter contains extra fields like version/author/tags, should parse name and description only", () => {
    const content = `---
name: ${"api-framework-hono"}
description: API patterns
version: 1
author: "@test"
tags:
  - api
  - api
---

Content`;

    const result = parseFrontmatter(content);

    // Extra fields are stripped by the schema (no .passthrough())
    expect(result).toStrictEqual({
      name: "api-framework-hono",
      description: "API patterns",
    });
  });

  it("should handle multiline description", () => {
    const content = `---
name: complex-skill
description: >
  This is a multiline
  description that spans
  multiple lines
---

Content`;

    const result = parseFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result?.name).toBe("complex-skill");
    expect(result?.description).toContain("multiline");
  });

  it("should handle frontmatter at the very start", () => {
    const content = `---
name: skill
description: desc
---`;

    const result = parseFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result?.name).toBe("skill");
  });

  it("should not parse frontmatter that is not at the start", () => {
    const content = `Some text before

---
name: skill
description: desc
---`;

    const result = parseFrontmatter(content);

    expect(result).toBeNull();
  });

  it("when frontmatter delimiters contain no fields, should return null", () => {
    const content = `---
---

Content`;

    const result = parseFrontmatter(content);

    expect(result).toBeNull();
  });

  it("should not handle frontmatter with Windows line endings (current limitation)", () => {
    const content = "---\r\nname: skill\r\ndescription: desc\r\n---\r\n\r\nContent";

    const result = parseFrontmatter(content);

    // The current regex expects \n only, not \r\n
    // This is a known limitation - SKILL.md files should use Unix line endings
    expect(result).toBeNull();
  });

  it("should return null for frontmatter with embedded --- in content", () => {
    // Only the first --- pair should be matched
    const content = `---
name: web-framework-react
description: React patterns
---

# Content

---
This line has triple dashes but is NOT frontmatter
---`;

    const result = parseFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result?.name).toBe("web-framework-react");
  });

  it("should warn with file path when frontmatter schema validation fails", () => {
    const content = `---
name: 123
description: Valid description
---

Content`;

    parseFrontmatter(content, "/path/to/skill.md");

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/path/to/skill.md"));
  });

  it("should warn with 'unknown file' when no file path provided and schema fails", () => {
    const content = `---
description: Missing name
---

Content`;

    parseFrontmatter(content);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unknown file"));
  });

  it("should handle frontmatter with only whitespace between delimiters", () => {
    const content = `---

---

Content`;

    const result = parseFrontmatter(content);

    // Whitespace-only YAML parses to null, which will fail schema validation
    expect(result).toBeNull();
  });

  it("should handle frontmatter with model field", () => {
    const content = `---
name: web-framework-react
description: React patterns
model: opus
---

Content`;

    const result = parseFrontmatter(content);

    expect(result).toStrictEqual({
      name: "web-framework-react",
      description: "React patterns",
      model: "opus",
    });
  });

  it("should handle frontmatter with special characters in description", () => {
    const content = `---
name: web-framework-react
description: "React patterns: hooks, components & JSX"
---

Content`;

    const result = parseFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result?.description).toContain("hooks");
    expect(result?.description).toContain("&");
  });

  it("should return null for content that is only triple-dash delimiters", () => {
    const content = `---
---`;

    const result = parseFrontmatter(content);

    expect(result).toBeNull();
  });

  it("should throw when frontmatter YAML uses tabs for indentation", () => {
    const content = "---\n\tname: skill\n\tdescription: desc\n---\n\nContent";

    // YAML spec forbids tabs for indentation — the parser throws
    expect(() => parseFrontmatter(content)).toThrow();
  });

  it("should return null when name is a non-string type (number)", () => {
    const content = `---
name: 42
description: A numeric name
---

Content`;

    const result = parseFrontmatter(content, "/test/skill.md");

    // Zod schema requires name to be a string; YAML parses bare 42 as number
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/test/skill.md"));
  });

  it("should return null when description is a non-string type (boolean)", () => {
    const content = `---
name: valid-skill
description: true
---

Content`;

    const result = parseFrontmatter(content, "/test/skill.md");

    // YAML parses bare `true` as boolean, Zod requires string
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("/test/skill.md"));
  });

  it("should return null when frontmatter contains invalid YAML syntax", () => {
    const content = `---
name: skill
description: [unclosed bracket
---

Content`;

    // The YAML parser should throw, and parseFrontmatter should return null or handle it
    // The YAML parser actually throws, which propagates up
    expect(() => parseFrontmatter(content)).toThrow();
  });

  it("should parse only the first frontmatter block when multiple exist", () => {
    const content = `---
name: first-skill
description: First block
---

Some content

---
name: second-skill
description: Second block
---

More content`;

    const result = parseFrontmatter(content);

    expect(result).not.toBeNull();
    expect(result?.name).toBe("first-skill");
    expect(result?.description).toBe("First block");
  });

  it("should handle frontmatter with deeply nested YAML that is otherwise valid", () => {
    const content = `---
name: nested-skill
description: Has nested extras
extra:
  nested:
    deep: value
---

Content`;

    const result = parseFrontmatter(content);

    // Extra fields are ignored by the schema (passthrough or stripped)
    expect(result).not.toBeNull();
    expect(result?.name).toBe("nested-skill");
  });
});

describe("loadAllAgents", () => {
  it("should warn and skip when metadata.yaml has invalid YAML", async () => {
    vi.mocked(glob).mockResolvedValue(["bad-agent/metadata.yaml"]);
    vi.mocked(readFile).mockResolvedValue("not: valid: yaml: [[[");

    const result = await loadAllAgents("/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid metadata.yaml"));
  });

  it("should warn and skip when metadata.yaml fails schema validation", async () => {
    // Valid YAML but missing required fields (no id, title, description, tools)
    vi.mocked(glob).mockResolvedValue(["incomplete/metadata.yaml"]);
    vi.mocked(readFile).mockResolvedValue("some_field: value\n");

    const result = await loadAllAgents("/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid metadata.yaml"));
  });

  it("should load valid agents and skip invalid ones", async () => {
    vi.mocked(glob).mockResolvedValue(["web-developer/metadata.yaml", "bad-agent/metadata.yaml"]);
    vi.mocked(readFile)
      .mockResolvedValueOnce(renderAgentYaml("web-developer"))
      .mockResolvedValueOnce("not valid yaml [[[");

    const result = await loadAllAgents("/project");

    expect(Object.keys(result)).toStrictEqual(["web-developer"]);
    expect(result["web-developer"]?.title).toBe("web-developer Agent");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid metadata.yaml"));
  });

  it("should return empty object when no metadata.yaml files exist", async () => {
    vi.mocked(glob).mockResolvedValue([]);

    const result = await loadAllAgents("/project");

    expect(result).toStrictEqual({});
  });

  it("loadMergedAgents merges CLI and source agents with source precedence", async () => {
    const SOURCE_ROOT = "/merged-source";
    vi.mocked(glob).mockImplementation(async (_pattern: string, dir?: string) =>
      dir?.startsWith(SOURCE_ROOT)
        ? ["web-developer/metadata.yaml"]
        : ["web-developer/metadata.yaml", "api-developer/metadata.yaml"],
    );
    vi.mocked(readFile).mockImplementation(async (filePath: string) => {
      if (filePath.includes("api-developer")) return renderAgentYaml("api-developer");
      if (filePath.startsWith(SOURCE_ROOT)) {
        return renderAgentYaml("web-developer", undefined, { title: "Source Override" });
      }
      return renderAgentYaml("web-developer");
    });

    const merged = await loadMergedAgents(SOURCE_ROOT);

    expect(Object.keys(merged).sort()).toStrictEqual(["api-developer", "web-developer"]);
    expect(merged["web-developer"]?.title).toBe("Source Override");
    expect(merged["api-developer"]?.title).toBe("api-developer Agent");
  });

  it("should warn and skip when metadata.yaml has valid YAML but wrong types", async () => {
    vi.mocked(glob).mockResolvedValue(["wrong-types/metadata.yaml"]);
    // tools should be an array, not a string
    vi.mocked(readFile).mockResolvedValue(
      `id: wrong-types
title: Wrong Types
description: Has wrong types
tools: not-an-array`,
    );

    const result = await loadAllAgents("/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid metadata.yaml"));
  });

  it("should warn and skip when readFile throws", async () => {
    vi.mocked(glob).mockResolvedValue(["unreadable/metadata.yaml"]);
    vi.mocked(readFile).mockRejectedValue(new Error("EACCES: permission denied"));

    const result = await loadAllAgents("/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid metadata.yaml"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EACCES"));
  });

  it("should warn and skip when metadata.yaml has empty content", async () => {
    vi.mocked(glob).mockResolvedValue(["empty/metadata.yaml"]);
    vi.mocked(readFile).mockResolvedValue("");

    const result = await loadAllAgents("/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid metadata.yaml"));
  });

  it("should include full path in warning message", async () => {
    vi.mocked(glob).mockResolvedValue(["deep/nested/dir/metadata.yaml"]);
    vi.mocked(readFile).mockResolvedValue("invalid yaml [[[");

    await loadAllAgents("/project");

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("/project/src/agents/deep/nested/dir/metadata.yaml"),
    );
  });
});

describe("loadProjectAgents", () => {
  it("should return empty object when project agents directory does not exist", async () => {
    vi.mocked(directoryExists).mockResolvedValue(false);

    const result = await loadProjectAgents("/project");

    expect(result).toStrictEqual({});
  });

  it("should warn and skip when project metadata.yaml parsing fails", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue(["broken/metadata.yaml"]);
    vi.mocked(readFile).mockResolvedValue("invalid: yaml: [[[");

    const result = await loadProjectAgents("/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid metadata.yaml"));
  });

  it("should warn and skip when project metadata.yaml fails schema validation", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue(["incomplete/metadata.yaml"]);
    vi.mocked(readFile).mockResolvedValue("some_field: value\n");

    const result = await loadProjectAgents("/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid metadata.yaml"));
  });

  it("should load valid project agents and skip invalid ones", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue(["api-developer/metadata.yaml", "broken/metadata.yaml"]);
    vi.mocked(readFile)
      .mockResolvedValueOnce(renderAgentYaml("api-developer"))
      .mockResolvedValueOnce("totally invalid");

    const result = await loadProjectAgents("/project");

    expect(Object.keys(result)).toStrictEqual(["api-developer"]);
    expect(result["api-developer"]?.title).toBe("api-developer Agent");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping invalid metadata.yaml"));
  });
});

describe("loadSkillsByIds", () => {
  it("should warn for unknown skill references", async () => {
    // buildIdToDirectoryPathMap returns empty -- no SKILL.md files found
    vi.mocked(glob).mockResolvedValue([]);

    const result = await loadSkillsByIds([{ id: "nonexistent-skill" as SkillId }], "/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Unknown skill reference 'nonexistent-skill'"),
    );
  });

  it("should warn when skill not found in directory map after expansion", async () => {
    // buildIdToDirectoryPathMap: skill "my-skill" maps to "my-skill" directory
    vi.mocked(glob).mockResolvedValue(["my-skill/SKILL.md"]);
    vi.mocked(readFile)
      // First call: buildIdToDirectoryPathMap reads the SKILL.md
      .mockResolvedValueOnce(renderSkillMd("my-skill", "A skill"))
      // Second call: loadSkillsByIds reads the SKILL.md again, but this time readFile throws
      .mockRejectedValueOnce(new Error("ENOENT"));

    const result = await loadSkillsByIds([{ id: "my-skill" as SkillId }], "/project");

    // The skill should be skipped due to the readFile error
    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Could not load skill 'my-skill'"));
  });

  it("should warn and skip skill with invalid frontmatter", async () => {
    // buildIdToDirectoryPathMap: SKILL.md found with valid frontmatter
    vi.mocked(glob).mockResolvedValue(["bad-skill/SKILL.md"]);
    // Second call: loadSkillsByIds reads SKILL.md — this time invalid frontmatter
    vi
      .mocked(readFile)
      // First call: buildIdToDirectoryPathMap reads SKILL.md — valid frontmatter
      .mockResolvedValueOnce(renderSkillMd("bad-skill", "A skill")).mockResolvedValueOnce(`---
description: missing name field
---

Content`);

    const result = await loadSkillsByIds([{ id: "bad-skill" as SkillId }], "/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Skipping 'bad-skill': missing or invalid frontmatter"),
    );
  });

  it("should warn and skip skill when readFile throws", async () => {
    // buildIdToDirectoryPathMap: SKILL.md found
    vi.mocked(glob).mockResolvedValue(["error-skill/SKILL.md"]);
    vi.mocked(readFile)
      // First call: buildIdToDirectoryPathMap reads SKILL.md -- valid
      .mockResolvedValueOnce(renderSkillMd("error-skill", "A skill"))
      // Second call: loadSkillsByIds reads SKILL.md -- throws (permission error, etc.)
      .mockRejectedValueOnce(new Error("EACCES: permission denied"));

    const result = await loadSkillsByIds([{ id: "error-skill" as SkillId }], "/project");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Could not load skill 'error-skill'"),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("EACCES: permission denied"));
  });

  it("should load valid skills and skip ones with errors", async () => {
    vi.mocked(glob).mockResolvedValue(["good-skill/SKILL.md", "bad-skill/SKILL.md"]);
    vi.mocked(readFile)
      // buildIdToDirectoryPathMap: reads both SKILL.md files
      .mockResolvedValueOnce(renderSkillMd("good-skill", "Good skill"))
      .mockResolvedValueOnce(renderSkillMd("bad-skill", "Bad skill"))
      // loadSkillsByIds: reads them again
      .mockResolvedValueOnce(renderSkillMd("good-skill", "Good skill"))
      .mockRejectedValueOnce(new Error("Disk failure"));

    const result = await loadSkillsByIds(
      [{ id: "good-skill" as SkillId }, { id: "bad-skill" as SkillId }],
      "/project",
    );

    // Verify loaded skill has correct shape
    expect(result["good-skill" as SkillId]).toStrictEqual({
      id: "good-skill",
      description: "Good skill",
      path: "src/skills/good-skill/",
    });
    // Failed skill should not be present
    expect(result["bad-skill" as SkillId]).toBeUndefined();
    expect(Object.keys(result)).toStrictEqual(["good-skill"]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Could not load skill 'bad-skill'"));
  });
});

describe("loadPluginSkills", () => {
  it("should return empty object when skills directory does not exist", async () => {
    vi.mocked(directoryExists).mockResolvedValue(false);

    const result = await loadPluginSkills("/path/to/plugin");

    expect(result).toStrictEqual({});
  });

  it("should load skills from plugin skills directory", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue(["web-framework-react/SKILL.md"]);
    vi.mocked(readFile).mockResolvedValue(renderSkillMd("web-framework-react", "React patterns"));

    const result = await loadPluginSkills("/path/to/plugin");

    expect(result["web-framework-react"]).toStrictEqual({
      id: "web-framework-react",
      description: "React patterns",
      path: "skills/web-framework-react/",
    });
  });

  it("should warn and skip skills with invalid frontmatter", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue(["bad-skill/SKILL.md"]);
    vi.mocked(readFile).mockResolvedValue("# No frontmatter here");

    const result = await loadPluginSkills("/path/to/plugin");

    expect(result).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Skipping"));
  });

  it("should load multiple skills from plugin", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue([
      "web-framework-react/SKILL.md",
      "web-state-zustand/SKILL.md",
    ]);
    vi.mocked(readFile)
      .mockResolvedValueOnce(renderSkillMd("web-framework-react", "React patterns"))
      .mockResolvedValueOnce(renderSkillMd("web-state-zustand", "Zustand state"));

    const result = await loadPluginSkills("/path/to/plugin");

    expect(Object.keys(result)).toStrictEqual(EXPECTED_SKILLS.WEB_DEFAULT);
  });

  it("should return empty object when no SKILL.md files found", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue([]);

    const result = await loadPluginSkills("/path/to/plugin");

    expect(result).toStrictEqual({});
  });
});
