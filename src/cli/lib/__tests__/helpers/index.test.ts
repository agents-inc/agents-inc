import { describe, it, expect } from "vitest";
import { parseTestFrontmatter } from "./index.js";

const VALID_FRONTMATTER = `---
name: react
author: "@test"
---
Body content.
`;

const NO_LEADING_DELIMITER = `name: react
author: "@test"
`;

const NO_CLOSING_DELIMITER = `---
name: react
author: "@test"
`;

const UNPARSEABLE_YAML = `---
a: b: c
---
`;

describe("parseTestFrontmatter", () => {
  it("returns the parsed key-value pairs for valid frontmatter", () => {
    expect(parseTestFrontmatter(VALID_FRONTMATTER)).toStrictEqual({
      name: "react",
      author: "@test",
    });
  });

  it("returns null when content does not start with a frontmatter delimiter", () => {
    expect(parseTestFrontmatter(NO_LEADING_DELIMITER)).toBeNull();
  });

  it("returns null when the closing delimiter is missing", () => {
    expect(parseTestFrontmatter(NO_CLOSING_DELIMITER)).toBeNull();
  });

  it("returns null when the frontmatter body is not parseable YAML", () => {
    expect(parseTestFrontmatter(UNPARSEABLE_YAML)).toBeNull();
  });
});
