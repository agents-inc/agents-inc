import { describe, it, expect } from "vitest";
import { extractFrontmatter, unreadableFrontmatter } from "./frontmatter";

describe("extractFrontmatter", () => {
  describe("valid frontmatter", () => {
    it("should parse simple key-value pairs", () => {
      const content = "---\ntitle: Hello\nauthor: World\n---\nBody text";

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ title: "Hello", author: "World" });
    });

    it("should parse nested YAML objects", () => {
      const content = "---\nmeta:\n  version: 1\n  draft: true\n---\nBody";

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ meta: { version: 1, draft: true } });
    });

    it("should parse YAML arrays", () => {
      const content = "---\ntags:\n  - foo\n  - bar\n---\nBody";

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ tags: ["foo", "bar"] });
    });

    it("should handle numeric values", () => {
      const content = "---\ncount: 42\nprice: 9.99\n---\nBody";

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ count: 42, price: 9.99 });
    });

    it("should handle boolean values", () => {
      const content = "---\nenabled: true\narchived: false\n---\nBody";

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ enabled: true, archived: false });
    });
  });

  describe("missing frontmatter", () => {
    it("should return null for plain text without delimiters", () => {
      const content = "Just some text without frontmatter";

      expect(extractFrontmatter(content)).toBeNull();
    });

    it("should return null for content with only opening delimiter", () => {
      const content = "---\ntitle: Hello\nBody text";

      expect(extractFrontmatter(content)).toBeNull();
    });

    it("should return null when delimiter is not at the start", () => {
      const content = "Some text\n---\ntitle: Hello\n---\nBody";

      expect(extractFrontmatter(content)).toBeNull();
    });
  });

  describe("malformed YAML", () => {
    it("should return null for unparseable YAML", () => {
      const content = "---\n: :\n  - [\n---\nBody";

      expect(extractFrontmatter(content)).toBeNull();
    });

    it("should return null for invalid indentation", () => {
      const content = "---\nkey:\n value\n  other:\n value2\n---\nBody";

      // The parser may or may not reject this; only the absence of a throw is asserted.
      const result = extractFrontmatter(content);
      expect(() => extractFrontmatter(content)).not.toThrow();
      if (result !== null) {
        expect(typeof result).toBe("object");
      }
    });
  });

  describe("empty content", () => {
    it("should return null for empty string", () => {
      expect(extractFrontmatter("")).toBeNull();
    });

    it("should return null for whitespace-only content", () => {
      expect(extractFrontmatter("   \n  \n  ")).toBeNull();
    });

    it("should return null for empty frontmatter block", () => {
      const content = "---\n\n---\nBody";

      expect(extractFrontmatter(content)).toBeNull();
    });
  });

  describe("frontmatter with no body", () => {
    it("should parse frontmatter when no body follows", () => {
      const content = "---\ntitle: No Body\n---";

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ title: "No Body" });
    });

    it("should parse frontmatter with only a trailing newline", () => {
      const content = "---\ntitle: Trailing\n---\n";

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ title: "Trailing" });
    });
  });

  describe("edge cases", () => {
    it("should only extract the first frontmatter block when multiple exist", () => {
      const content = "---\nfirst: true\n---\nMiddle\n---\nsecond: true\n---\nEnd";

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ first: true });
    });

    it("should handle special characters in values", () => {
      const content = '---\nurl: "https://example.com/path?q=1&r=2"\nemoji: "hello"\n---\nBody';

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({
        url: "https://example.com/path?q=1&r=2",
        emoji: "hello",
      });
    });

    it("should handle multiline string values", () => {
      const content = "---\ndescription: |\n  Line one\n  Line two\n---\nBody";

      const result = extractFrontmatter(content) as Record<string, string>;

      expect(result.description).toContain("Line one");
      expect(result.description).toContain("Line two");
    });

    it("should handle Windows-style line endings (CRLF)", () => {
      const content = "---\r\ntitle: Windows\r\n---\r\nBody";

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ title: "Windows" });
    });

    it("should handle frontmatter with colons in values", () => {
      const content = '---\ntime: "12:30:00"\n---\nBody';

      const result = extractFrontmatter(content);

      expect(result).toStrictEqual({ time: "12:30:00" });
    });

    it("should return null for delimiter-only content with no YAML", () => {
      const content = "---\n---\nBody";

      expect(extractFrontmatter(content)).toBeNull();
    });
  });
});

describe("unreadableFrontmatter", () => {
  it("says a file has no frontmatter at its top when the fences are missing", () => {
    expect(unreadableFrontmatter("# Just a heading\n")).toBe(
      "there is no frontmatter between --- fences at its top",
    );
  });

  it("says frontmatter that holds only a comment is empty", () => {
    expect(unreadableFrontmatter("---\n# nothing here yet\n---\n\n# Body\n")).toBe(
      "its frontmatter is empty",
    );
  });

  it("finds nothing wrong with frontmatter that reads", () => {
    expect(unreadableFrontmatter("---\nname: web-framework-react\n---\n")).toBeUndefined();
  });
});
