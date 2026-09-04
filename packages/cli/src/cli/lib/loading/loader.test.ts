import { describe, it, expect, vi } from "vitest";
import path from "path";
import { pick } from "remeda";

// Mock file system and logger (manual mocks from __mocks__ directories)
vi.mock("../../utils/fs");
vi.mock("../../utils/logger");

import {
  parseFrontmatter,
  readSkillMetadata,
  loadAllAgents,
  loadMergedAgents,
  loadProjectAgents,
  loadPluginSkills,
  loadSkillsFromDir,
} from "./loader";
import { readFile, glob, directoryExists, fileExists } from "../../utils/fs";
import { warn } from "../../utils/logger";
import { DIRS, LOCAL_PSEUDO_CATEGORY } from "../../consts";
import { renderSkillMd, renderAgentYaml } from "../__tests__/content-generators";
import { EXPECTED_SKILLS } from "../__tests__/expected-values";
import { entryAt } from "../__tests__/helpers/element-at.js";
import { typedKeys } from "../../utils/typed-object.js";
import type { AgentDefinition } from "../../types";

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

  it("should handle frontmatter with Windows line endings", () => {
    const content = "---\r\nname: skill\r\ndescription: desc\r\n---\r\n\r\nContent";

    const result = parseFrontmatter(content);

    // Delegates to extractFrontmatter, whose regex tolerates \r\n line endings
    expect(result).toStrictEqual({ name: "skill", description: "desc" });
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

  it("should return null when frontmatter YAML uses tabs for indentation", () => {
    const content = "---\n\tname: skill\n\tdescription: desc\n---\n\nContent";

    // YAML spec forbids tabs for indentation; extractFrontmatter catches the
    // parser error and returns null rather than propagating the throw
    const result = parseFrontmatter(content);

    expect(result).toBeNull();
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

    // extractFrontmatter catches the YAML parser error and returns null
    const result = parseFrontmatter(content);

    expect(result).toBeNull();
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

  /**
   * The loader builds its `AgentDefinition` from an explicit field list, so a key `metadata.yaml`
   * declares and this list omits is dropped here — before the resolver, before the template, and
   * without a warning, because the schema accepted it.
   *
   * Five fields were being dropped that way and every one is read downstream: `agent.liquid`
   * renders `effort`, `disallowedTools`, `permissionMode`, `isolation` and `hooks`. `effort` is the
   * one that shows the shape of the bug best — `resolveAgents` reads `agentConfig.effort ??
   * definition.effort`, and `definition.effort` could never be anything but `undefined`, so the
   * fallback half of a documented two-source setting had no reachable value.
   *
   * A roster rather than a field-by-field check: the subject is which declared fields survive the
   * read, and a per-key assertion cannot see the next one to be dropped. Bound to
   * {@link LOADED_OPTIONAL_FIELDS} rather than written twice, because the roster had already been
   * outgrown by its own fixture: `experimental` was added to the metadata this test writes with no
   * matching line in the assertion or in the sibling's filter, so deleting the loader's
   * `experimental` spread left all 56 specs in this file green. Binding both tests to one constant
   * makes that a compile error instead of a silent gap — add a key here and it is written into the
   * metadata and checked by both assertions in the same edit. `resolver.test.ts` binds its own
   * pair the same way, one layer down.
   */
  const LOADED_OPTIONAL_FIELDS = {
    model: "opus",
    effort: "xhigh",
    disallowedTools: ["Bash", "WebFetch"],
    permissionMode: "plan",
    isolation: "worktree",
    hooks: { SubagentStop: [{ hooks: [{ type: "command", command: "echo gate" }] }] },
    experimental: { cacheTtl: "1h" },
  } as const satisfies Partial<AgentDefinition>;

  it("carries every optional field metadata.yaml declares", async () => {
    vi.mocked(glob).mockResolvedValue(["tuned/metadata.yaml"]);
    vi.mocked(readFile).mockResolvedValue(
      renderAgentYaml("web-developer", "A tuned agent", LOADED_OPTIONAL_FIELDS),
    );

    const loaded = await loadAllAgents("/project");

    expect(pick(entryAt(loaded, "web-developer"), typedKeys(LOADED_OPTIONAL_FIELDS))).toStrictEqual(
      LOADED_OPTIONAL_FIELDS,
    );
  });

  /**
   * The refusal that belongs at this boundary rather than two layers downstream.
   *
   * `agent.liquid` emits `hooks: {{ agent.hooks | json }}` from whatever this loader returned, and
   * a compiled agent's frontmatter is read back through `agentFrontmatterValidationSchema` by
   * `doctor` and by `compileAgentPlugin`. The loader used to take a looser hooks contract than
   * that reader: a definition written with its actions one level flat was stripped to `{}` here
   * with no error, the template emitted the empty definition, and the refusal then arrived against
   * a compiled `.md` the user never wrote — with the command they did write already gone.
   *
   * The path is asserted alongside the field, because naming the file is the whole reason the
   * refusal belongs here: this is the last boundary that still knows which `metadata.yaml` the
   * value came from. The permitted case is the roster above, which declares a well-formed hooks
   * block and must keep loading it.
   */
  it("refuses a hooks block declaring no actions, naming the file and the field", async () => {
    const HOOK_EVENT = "SubagentStop";
    const AGENT_DIR = "gated";
    vi.mocked(glob).mockResolvedValue([`${AGENT_DIR}/metadata.yaml`]);
    vi.mocked(readFile).mockResolvedValue(
      renderAgentYaml("web-developer", "A gated agent", {
        hooks: { [HOOK_EVENT]: [{ type: "command", command: "echo gate" }] },
      }),
    );

    const loaded = await loadAllAgents("/project");

    expect(
      loaded,
      "a hooks block the frontmatter reader refuses was loaded anyway, with the actions silently emptied",
    ).toStrictEqual({});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(
        `Skipping invalid metadata.yaml at '${path.join("/project", DIRS.agents, AGENT_DIR, "metadata.yaml")}': hooks.${HOOK_EVENT}.0.hooks`,
      ),
    );
  });

  it("leaves an optional field off entirely when metadata.yaml declares none", async () => {
    vi.mocked(glob).mockResolvedValue(["plain/metadata.yaml"]);
    vi.mocked(readFile).mockResolvedValue(renderAgentYaml("web-developer"));

    const loaded = await loadAllAgents("/project");

    expect(
      typedKeys(LOADED_OPTIONAL_FIELDS).filter((key) => key in entryAt(loaded, "web-developer")),
      "an absent field must stay absent — an explicit undefined renders as an empty frontmatter key",
    ).toStrictEqual([]);
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

  it("should skip a SKILL.md it cannot read and keep loading the rest", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue(["good-skill/SKILL.md", "unreadable-skill/SKILL.md"]);
    vi.mocked(readFile)
      .mockResolvedValueOnce(renderSkillMd("good-skill", "Good skill"))
      .mockRejectedValueOnce(new Error("EACCES: permission denied"));

    const result = await loadPluginSkills("/path/to/plugin");

    expect(Object.keys(result)).toStrictEqual(["good-skill"]);
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

const METADATA_PATH = "/project/.claude/skills/web-framework-react/metadata.yaml";

/** A metadata.yaml carrying the fields every reader of one goes looking for. */
const USABLE_METADATA = [
  "displayName: React",
  "slug: react",
  "domain: web",
  "category: web-framework",
].join("\n");

/** Unparseable: a flow-mapping opener followed by nested compact mappings. */
const UNPARSEABLE_METADATA = `{{{ this is not: valid: yaml: "at all`;

/**
 * A metadata.yaml describing its skill in every field, wearing the placeholder
 * category no domain claims — the one shape a reader can find nothing wrong with
 * and still have nowhere to put.
 */
const PLACEHOLDER_CATEGORY_METADATA = [
  "displayName: React",
  "slug: react",
  "domain: web",
  `category: ${LOCAL_PSEUDO_CATEGORY}`,
].join("\n");

describe("readSkillMetadata", () => {
  it("returns the fields of a metadata.yaml that describes its skill", async () => {
    vi.mocked(readFile).mockResolvedValue(USABLE_METADATA);

    const result = await readSkillMetadata(METADATA_PATH);

    expect(result).toStrictEqual({
      usable: true,
      metadata: {
        displayName: "React",
        slug: "react",
        domain: "web",
        category: "web-framework",
      },
    });
  });

  it("refuses unparseable YAML, carrying the parser's own reason", async () => {
    vi.mocked(readFile).mockResolvedValue(UNPARSEABLE_METADATA);

    const result = await readSkillMetadata(METADATA_PATH);

    expect(result.usable).toBe(false);
    expect(result.usable === false && result.reason).toContain("Nested mappings are not allowed");
  });

  it("refuses a file that parses but holds no fields", async () => {
    vi.mocked(readFile).mockResolvedValue("");

    const result = await readSkillMetadata(METADATA_PATH);

    expect(result).toStrictEqual({
      usable: false,
      reason: "expected metadata fields, found an empty file",
    });
  });

  it("refuses a list where a mapping of fields belongs", async () => {
    vi.mocked(readFile).mockResolvedValue("- displayName: React\n- slug: react");

    const result = await readSkillMetadata(METADATA_PATH);

    expect(result).toStrictEqual({
      usable: false,
      reason: "expected metadata fields, found a list",
    });
  });

  it("refuses a scalar where a mapping of fields belongs", async () => {
    vi.mocked(readFile).mockResolvedValue("just a plain string");

    const result = await readSkillMetadata(METADATA_PATH);

    expect(result).toStrictEqual({
      usable: false,
      reason: "expected metadata fields, found a string",
    });
  });

  it("refuses a file it cannot read at all, carrying the read error", async () => {
    vi.mocked(readFile).mockRejectedValue(new Error("EACCES: permission denied"));

    const result = await readSkillMetadata(METADATA_PATH);

    expect(result).toStrictEqual({
      usable: false,
      reason: "EACCES: permission denied",
    });
  });

  it("refuses a file that parses without the fields a skill is described by, naming them", async () => {
    vi.mocked(readFile).mockResolvedValue("displayName: React\nslug: react");

    const result = await readSkillMetadata(METADATA_PATH);

    expect(result).toStrictEqual({
      usable: false,
      reason: "missing required fields: category, domain",
    });
  });

  it("names one absent field in the singular", async () => {
    vi.mocked(readFile).mockResolvedValue("displayName: React\nslug: react\ndomain: web");

    const result = await readSkillMetadata(METADATA_PATH);

    expect(result).toStrictEqual({
      usable: false,
      reason: "missing required field: category",
    });
  });

  it("says what is wrong with a field that is present but malformed", async () => {
    vi.mocked(readFile).mockResolvedValue(
      ["displayName: React", "slug: 42", "domain: web", "category: web-framework"].join("\n"),
    );

    const result = await readSkillMetadata(METADATA_PATH);

    expect(result.usable).toBe(false);
    expect(result.usable === false && result.reason).toBe(
      "slug: Invalid input: expected string, received number",
    );
  });
});

describe("loadSkillsFromDir with requireMetadata", () => {
  it("reports the skill directory whose metadata.yaml describes no skill instead of loading it", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue(["web-framework-react/SKILL.md"]);
    vi.mocked(fileExists).mockResolvedValue(true);
    // The metadata.yaml is read before the SKILL.md, and refusing it means the
    // SKILL.md is never reached — the skill is not loaded from its frontmatter.
    vi.mocked(readFile).mockResolvedValue(UNPARSEABLE_METADATA);

    const result = await loadSkillsFromDir("/project/.claude/skills", {
      pathPrefix: ".claude/skills",
      requireMetadata: true,
    });

    expect(result.skills).toStrictEqual({});
    expect(result.unusableMetadata).toHaveLength(1);
    expect(result.unusableMetadata[0]?.skillDirName).toBe("web-framework-react");
    expect(result.unusableMetadata[0]?.metadataPath).toContain("metadata.yaml");
  });

  it("loads the skill and reports nothing when its metadata.yaml describes it", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue(["web-framework-react/SKILL.md"]);
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(readFile)
      .mockResolvedValueOnce(USABLE_METADATA)
      .mockResolvedValueOnce(renderSkillMd("web-framework-react", "React patterns"));

    const result = await loadSkillsFromDir("/project/.claude/skills", {
      pathPrefix: ".claude/skills",
      requireMetadata: true,
    });

    expect(result.unusableMetadata).toStrictEqual([]);
    expect(result.skills["web-framework-react"]).toStrictEqual({
      id: "web-framework-react",
      description: "React patterns",
      path: ".claude/skills/web-framework-react/",
    });
  });

  it("skips the skill whose metadata.yaml names the placeholder category", async () => {
    vi.mocked(directoryExists).mockResolvedValue(true);
    vi.mocked(glob).mockResolvedValue(["web-framework-react/SKILL.md"]);
    vi.mocked(fileExists).mockResolvedValue(true);
    vi.mocked(readFile)
      .mockResolvedValueOnce(PLACEHOLDER_CATEGORY_METADATA)
      .mockResolvedValueOnce(renderSkillMd("web-framework-react", "React patterns"));

    const result = await loadSkillsFromDir("/project/.claude/skills", {
      pathPrefix: ".claude/skills",
      requireMetadata: true,
    });

    expect(
      result.skills,
      "local-skill discovery refuses this file, so counting the skill here prints a discovery total beside a refusal about the same skill",
    ).toStrictEqual({});
    expect(
      result.unusableMetadata,
      "the file describes its skill in every field — the skill is the thing with nowhere to go, so nothing here is repairable",
    ).toStrictEqual([]);
  });
});
