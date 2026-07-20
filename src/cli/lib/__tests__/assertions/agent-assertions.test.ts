import { describe, it, expect } from "vitest";
import { parseCompiledAgent } from "./agent-assertions.js";

const HAPPY_PATH_AGENT = `---
name: web-dev
skills:
  - web-framework-react
  - web-testing-vitest
---
# web-dev

Body content here.

skill: "web-state-zustand"
`;

const MISSING_FRONTMATTER_AGENT = `# web-dev

Just a body with no frontmatter block.
`;

const HYPHENATED_KEYS_AGENT = `---
name: api-dev
allowed-tools: read-file
model-name: opus
skills:
  - api-framework-hono
---
Body content.
`;

describe("parseCompiledAgent", () => {
  it("parses frontmatter, body, and preloaded/dynamic skills on the happy path", () => {
    const result = parseCompiledAgent(HAPPY_PATH_AGENT);

    expect(result.frontmatter.name).toBe("web-dev");
    expect(result.preloadedSkillIds).toStrictEqual(["web-framework-react", "web-testing-vitest"]);
    expect(result.dynamicSkillIds).toStrictEqual(["web-state-zustand"]);
    expect(result.body).toContain("Body content here.");
    expect(result.raw).toBe(HAPPY_PATH_AGENT);
  });

  it("degrades to empty frontmatter and passes body through when no frontmatter block exists", () => {
    const result = parseCompiledAgent(MISSING_FRONTMATTER_AGENT);

    expect(result.frontmatter).toStrictEqual({});
    expect(result.preloadedSkillIds).toStrictEqual([]);
    expect(result.dynamicSkillIds).toStrictEqual([]);
    expect(result.body).toBe(MISSING_FRONTMATTER_AGENT);
  });

  it("preserves hyphenated frontmatter keys", () => {
    const result = parseCompiledAgent(HYPHENATED_KEYS_AGENT);

    expect(result.frontmatter.name).toBe("api-dev");
    expect(result.frontmatter["allowed-tools"]).toBe("read-file");
    expect(result.frontmatter["model-name"]).toBe("opus");
    expect(result.preloadedSkillIds).toStrictEqual(["api-framework-hono"]);
  });
});
