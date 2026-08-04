import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  validateCompiledAgent,
  printOutputValidationResult,
  checkXmlTagBalance,
  checkTemplateArtifacts,
  checkRequiredPatterns,
  validateFrontmatter,
} from "./output-validator";
import type { ValidationResult } from "../types";

function createValidAgentContent(overrides?: {
  name?: string;
  description?: string;
  tools?: string;
  includeRole?: boolean;
  includeCorePrinciples?: boolean;
  lineCount?: number;
}): string {
  const {
    name = "web-developer",
    description = "A web developer agent",
    tools = "Read, Write, Glob",
    includeRole = true,
    includeCorePrinciples = true,
    lineCount = 60,
  } = overrides ?? {};

  const lines: string[] = [];

  // Frontmatter
  lines.push("---");
  lines.push(`name: ${name}`);
  lines.push(`description: ${description}`);
  lines.push(`tools: ${tools}`);
  lines.push("---");
  lines.push("");

  // Role section
  if (includeRole) {
    lines.push("<role>");
    lines.push("You are a web developer specializing in React.");
    lines.push("</role>");
    lines.push("");
  }

  // Core Principles section
  if (includeCorePrinciples) {
    lines.push("<core_principles>");
    lines.push("## Core Principles");
    lines.push("");
    lines.push("1. Write clean code");
    lines.push("2. Test everything");
    lines.push("3. Follow conventions");
    lines.push("</core_principles>");
    lines.push("");
  }

  // Pad to desired line count
  while (lines.length < lineCount) {
    lines.push("Additional content line for testing purposes.");
  }

  return lines.join("\n");
}

describe("output-validator", () => {
  describe("validateCompiledAgent", () => {
    it("should return valid for well-formed compiled agent content", () => {
      const content = createValidAgentContent();

      const result = validateCompiledAgent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it("should return valid with all required sections present", () => {
      const content = createValidAgentContent({
        name: "api-developer",
        description: "Backend developer agent",
        tools: "Read, Write, Bash",
      });

      const result = validateCompiledAgent(content);

      expect(result.valid).toBe(true);
      expect(result.errors).toStrictEqual([]);
    });

    it("should return invalid for empty string", () => {
      const result = validateCompiledAgent("");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Compiled output is empty");
      expect(result.warnings).toHaveLength(0);
    });

    it("should return invalid for whitespace-only string", () => {
      const result = validateCompiledAgent("   \n\n   ");

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Compiled output is empty");
    });

    it("should report error when frontmatter is missing", () => {
      const content = "# No frontmatter\n" + "Some content\n".repeat(60);

      const result = validateCompiledAgent(content);

      // Missing frontmatter should produce warnings/errors
      expect(result.warnings).toContain("Missing YAML frontmatter at start of file");
    });

    it("should report error when frontmatter name field is missing", () => {
      const content = [
        "---",
        "description: A developer agent",
        "tools: Read, Write",
        "---",
        "",
        "<role>Developer role</role>",
        "<core_principles>",
        "Core Principles here",
        "</core_principles>",
        ...Array.from({ length: 50 }, () => "Content line"),
      ].join("\n");

      const result = validateCompiledAgent(content);

      expect(result.errors).toContain("Frontmatter missing required field: name");
    });

    it("should report warning when frontmatter description field is missing", () => {
      const content = [
        "---",
        "name: web-developer",
        "tools: Read, Write",
        "---",
        "",
        "<role>Developer role</role>",
        "<core_principles>",
        "Core Principles here",
        "</core_principles>",
        ...Array.from({ length: 50 }, () => "Content line"),
      ].join("\n");

      const result = validateCompiledAgent(content);

      expect(result.warnings).toContain("Frontmatter missing field: description");
    });

    it("should report warning when frontmatter tools field is missing", () => {
      const content = [
        "---",
        "name: web-developer",
        "description: A developer agent",
        "---",
        "",
        "<role>Developer role</role>",
        "<core_principles>",
        "Core Principles here",
        "</core_principles>",
        ...Array.from({ length: 50 }, () => "Content line"),
      ].join("\n");

      const result = validateCompiledAgent(content);

      expect(result.warnings).toContain("Frontmatter missing field: tools");
    });

    it("should report error when frontmatter YAML is malformed", () => {
      const content = [
        "---",
        "name: [unclosed bracket",
        "---",
        "",
        "<role>Developer role</role>",
        "<core_principles>",
        "Core Principles here",
        "</core_principles>",
        ...Array.from({ length: 50 }, () => "Content line"),
      ].join("\n");

      const result = validateCompiledAgent(content);

      expect(result.errors).toContain("Failed to parse YAML frontmatter");
    });

    it("should report error for unclosed XML tags", () => {
      const content = createValidAgentContent();
      // Add an unclosed tag
      const contentWithUnclosed = content + "\n<custom_section>\nSome content\n";

      const result = validateCompiledAgent(contentWithUnclosed);

      expect(result.errors).toStrictEqual(
        expect.arrayContaining([expect.stringContaining("Unclosed XML tag: <custom_section>")]),
      );
    });

    it("should report error for extra closing tags", () => {
      const content = createValidAgentContent();
      const contentWithExtra = content + "\n</orphan_tag>\n";

      const result = validateCompiledAgent(contentWithExtra);

      expect(result.errors).toStrictEqual(
        expect.arrayContaining([expect.stringContaining("Extra closing tag: </orphan_tag>")]),
      );
    });

    it("should ignore XML tags inside backticks (code blocks)", () => {
      const content = createValidAgentContent();
      // Tags within backticks should be ignored
      const contentWithCodeTag = content + "\nUse `<custom_tag>` in your code.\n";

      const result = validateCompiledAgent(contentWithCodeTag);

      // Should NOT report unclosed tag for <custom_tag> since it's in backticks
      const customTagErrors = result.errors.filter((e) => e.includes("custom_tag"));
      expect(customTagErrors).toHaveLength(0);
    });

    it("should handle balanced XML tags without errors", () => {
      const content = createValidAgentContent();
      const contentWithBalancedTags = content + "\n<test_section>\nContent\n</test_section>\n";

      const result = validateCompiledAgent(contentWithBalancedTags);

      const testTagErrors = result.errors.filter((e) => e.includes("test_section"));
      expect(testTagErrors).toHaveLength(0);
    });

    it("should warn about unprocessed {{ }} template variables", () => {
      const content = createValidAgentContent();
      const contentWithTemplate = content + "\nHello {{ user_name }}!\n";

      const result = validateCompiledAgent(contentWithTemplate);

      expect(result.warnings).toStrictEqual(
        expect.arrayContaining([
          expect.stringContaining("Template artifacts found: 1 unprocessed {{ }} tags"),
        ]),
      );
    });

    it("should warn about unprocessed {% %} template control blocks", () => {
      const content = createValidAgentContent();
      const contentWithControl = content + "\n{% if condition %}\nContent\n{% endif %}\n";

      const result = validateCompiledAgent(contentWithControl);

      expect(result.warnings).toStrictEqual(
        expect.arrayContaining([
          expect.stringContaining("Template artifacts found: 2 unprocessed {% %} tags"),
        ]),
      );
    });

    it("should not warn when no template artifacts are present", () => {
      const content = createValidAgentContent();

      const result = validateCompiledAgent(content);

      const templateWarnings = result.warnings.filter((w) => w.includes("Template artifacts"));
      expect(templateWarnings).toHaveLength(0);
    });

    it("should warn when <role> section is missing", () => {
      const content = createValidAgentContent({ includeRole: false });

      const result = validateCompiledAgent(content);

      expect(result.warnings).toContain("Missing <role> section");
    });

    it("should warn when Core Principles section is missing", () => {
      const content = createValidAgentContent({ includeCorePrinciples: false });

      const result = validateCompiledAgent(content);

      expect(result.warnings).toContain("Missing Core Principles section");
    });

    it("should accept core_principles as alternative to Core Principles", () => {
      // The check allows either "Core Principles" or "core_principles"
      const content = [
        "---",
        "name: web-developer",
        "description: A developer agent",
        "tools: Read, Write",
        "---",
        "",
        "<role>Developer role</role>",
        "",
        "<core_principles>",
        "Principles content here",
        "</core_principles>",
        ...Array.from({ length: 50 }, () => "Content line"),
      ].join("\n");

      const result = validateCompiledAgent(content);

      const principleWarnings = result.warnings.filter((w) => w.includes("Core Principles"));
      expect(principleWarnings).toHaveLength(0);
    });

    it("should warn when output is suspiciously short (under 50 lines)", () => {
      const content = createValidAgentContent({ lineCount: 30 });

      const result = validateCompiledAgent(content);

      expect(result.warnings).toStrictEqual(
        expect.arrayContaining([
          expect.stringMatching(/Suspiciously short output: only \d+ lines/),
        ]),
      );
    });

    it("should not warn about length for content with 50+ lines", () => {
      const content = createValidAgentContent({ lineCount: 60 });

      const result = validateCompiledAgent(content);

      const lengthWarnings = result.warnings.filter((w) => w.includes("Suspiciously short"));
      expect(lengthWarnings).toHaveLength(0);
    });

    it("should be valid when only warnings are present (no errors)", () => {
      // Missing description and tools produce warnings, not errors
      const content = [
        "---",
        "name: web-developer",
        "---",
        "",
        "<role>Developer role</role>",
        "",
        "<core_principles>",
        "Core Principles here",
        "</core_principles>",
        ...Array.from({ length: 50 }, () => "Content line"),
      ].join("\n");

      const result = validateCompiledAgent(content);

      // Warnings present, but no errors
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it("should be invalid when errors are present (e.g. missing name)", () => {
      const content = [
        "---",
        "description: A developer agent",
        "tools: Read, Write",
        "---",
        "",
        "<role>Developer role</role>",
        "<core_principles>",
        "Core Principles here",
        "</core_principles>",
        ...Array.from({ length: 50 }, () => "Content line"),
      ].join("\n");

      const result = validateCompiledAgent(content);

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    it("should collect multiple errors and warnings together", () => {
      // Missing name (error) + missing role (warning) + template artifact (warning) + short (warning)
      const content = [
        "---",
        "description: A developer agent",
        "---",
        "",
        "{{ unprocessed_var }}",
        "Some short content",
      ].join("\n");

      const result = validateCompiledAgent(content);

      expect(result.valid).toBe(false);
      // Should have error for missing name
      expect(result.errors).toContain("Frontmatter missing required field: name");
      // Should have warnings for missing role, missing core principles, short output, template artifacts, missing tools
      expect(result.warnings.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("checkXmlTagBalance", () => {
    it("should return empty array for content with no XML tags", () => {
      const errors = checkXmlTagBalance("Plain text with no tags.");
      expect(errors).toStrictEqual([]);
    });

    it("should return empty array for balanced tags", () => {
      const errors = checkXmlTagBalance("<role>content</role>");
      expect(errors).toStrictEqual([]);
    });

    it("should detect multiple unclosed tags of different names", () => {
      const errors = checkXmlTagBalance("<role>text\n<section>more text");
      expect(errors).toHaveLength(2);
      expect(errors).toStrictEqual(
        expect.arrayContaining([
          expect.stringContaining("Unclosed XML tag: <role>"),
          expect.stringContaining("Unclosed XML tag: <section>"),
        ]),
      );
    });

    it("should detect multiple extra closing tags", () => {
      const errors = checkXmlTagBalance("</role>\n</section>");
      expect(errors).toHaveLength(2);
      expect(errors).toStrictEqual(
        expect.arrayContaining([
          expect.stringContaining("Extra closing tag: </role>"),
          expect.stringContaining("Extra closing tag: </section>"),
        ]),
      );
    });

    it("should report count of unclosed tags when same tag opened multiple times", () => {
      const errors = checkXmlTagBalance("<item>\n<item>\n<item>");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("3 unclosed");
    });

    it("should handle tags with hyphens and underscores in names", () => {
      const errors = checkXmlTagBalance("<my-tag>content</my-tag>\n<my_tag>content</my_tag>");
      expect(errors).toStrictEqual([]);
    });

    it("should be case-insensitive when matching tags", () => {
      const errors = checkXmlTagBalance("<Role>content</ROLE>");
      expect(errors).toStrictEqual([]);
    });

    it("should skip tags preceded by a backtick within 10 characters", () => {
      const errors = checkXmlTagBalance("use the `<tag>` syntax");
      expect(errors).toStrictEqual([]);
    });

    it("should skip tags followed by a backtick within 10 characters", () => {
      const errors = checkXmlTagBalance("use <tag>` in code");
      expect(errors).toStrictEqual([]);
    });

    it("should count tags that are far from backticks", () => {
      // The backtick is more than 10 characters away, so it should NOT be skipped
      const errors = checkXmlTagBalance("some long padding text <role> more content");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Unclosed XML tag: <role>");
    });

    it("should return empty array for empty string", () => {
      const errors = checkXmlTagBalance("");
      expect(errors).toStrictEqual([]);
    });

    it("should handle mixed balanced and unbalanced tags", () => {
      const errors = checkXmlTagBalance("<a>text</a>\n<b>unclosed");
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain("Unclosed XML tag: <b>");
    });
  });

  describe("checkTemplateArtifacts", () => {
    it("should return empty array when no template artifacts exist", () => {
      const warnings = checkTemplateArtifacts("Clean content with no templates.");
      expect(warnings).toStrictEqual([]);
    });

    it("should count multiple {{ }} tags accurately", () => {
      const warnings = checkTemplateArtifacts("{{ a }} and {{ b }} and {{ c }}");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("3 unprocessed {{ }} tags");
    });

    it("should count multiple {% %} tags accurately", () => {
      const warnings = checkTemplateArtifacts("{% if x %}{% endif %}{% for y %}{% endfor %}");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("4 unprocessed {% %} tags");
    });

    it("should report both {{ }} and {% %} warnings when both present", () => {
      const warnings = checkTemplateArtifacts("{{ var }} and {% if cond %}{% endif %}");
      expect(warnings).toHaveLength(2);
      expect(warnings[0]).toContain("1 unprocessed {{ }} tags");
      expect(warnings[1]).toContain("2 unprocessed {% %} tags");
    });

    it("should return empty array for empty string", () => {
      const warnings = checkTemplateArtifacts("");
      expect(warnings).toStrictEqual([]);
    });

    it("should detect {{ }} with content inside", () => {
      const warnings = checkTemplateArtifacts("Hello {{ user.name | capitalize }}!");
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain("1 unprocessed {{ }} tags");
    });
  });

  describe("checkRequiredPatterns", () => {
    it("should return empty array when all patterns are present and content is long enough", () => {
      const lines = [
        "---",
        "name: test",
        "---",
        "<role>content</role>",
        "Core Principles here",
        ...Array.from({ length: 50 }, () => "line"),
      ];
      const warnings = checkRequiredPatterns(lines.join("\n"));
      expect(warnings).toStrictEqual([]);
    });

    it("should warn when content does not start with ---", () => {
      const warnings = checkRequiredPatterns("no frontmatter\n<role>test</role>\nCore Principles");
      expect(warnings).toContain("Missing YAML frontmatter at start of file");
    });

    it("should warn when <role> section is missing", () => {
      const lines = [
        "---",
        "name: test",
        "---",
        "Core Principles",
        ...Array.from({ length: 50 }, () => "line"),
      ];
      const warnings = checkRequiredPatterns(lines.join("\n"));
      expect(warnings).toContain("Missing <role> section");
    });

    it("should warn when neither Core Principles nor core_principles is present", () => {
      const lines = [
        "---",
        "name: test",
        "---",
        "<role>test</role>",
        ...Array.from({ length: 50 }, () => "line"),
      ];
      const warnings = checkRequiredPatterns(lines.join("\n"));
      expect(warnings).toContain("Missing Core Principles section");
    });

    it("should accept core_principles as alternative", () => {
      const lines = [
        "---",
        "name: test",
        "---",
        "<role>test</role>",
        "core_principles",
        ...Array.from({ length: 50 }, () => "line"),
      ];
      const warnings = checkRequiredPatterns(lines.join("\n"));
      const principleWarnings = warnings.filter((w) => w.includes("Core Principles"));
      expect(principleWarnings).toHaveLength(0);
    });

    it("should warn at exactly 49 lines (below threshold)", () => {
      // Build exactly 49 lines: 3 header lines + 46 filler = 49
      const lines = [
        "---",
        "<role>test</role>",
        "Core Principles",
        ...Array.from({ length: 46 }, () => "line"),
      ];
      const content = lines.join("\n");
      expect(content.trim().split("\n")).toHaveLength(49);
      const warnings = checkRequiredPatterns(content);
      expect(warnings).toStrictEqual(
        expect.arrayContaining([expect.stringMatching(/Suspiciously short output/)]),
      );
    });

    it("should not warn at exactly 50 lines", () => {
      // Build exactly 50 lines: 4 header lines + 46 filler = 50
      const lines = [
        "---",
        "<role>test</role>",
        "Core Principles",
        "extra",
        ...Array.from({ length: 46 }, () => "line"),
      ];
      const content = lines.join("\n");
      expect(content.trim().split("\n")).toHaveLength(50);
      const warnings = checkRequiredPatterns(content);
      const shortWarnings = warnings.filter((w) => w.includes("Suspiciously short"));
      expect(shortWarnings).toHaveLength(0);
    });

    it("should return empty array for empty string (multiple warnings)", () => {
      const warnings = checkRequiredPatterns("");
      // Empty string triggers: missing frontmatter, missing role, missing core principles, short output
      expect(warnings).toContain("Missing YAML frontmatter at start of file");
      expect(warnings).toContain("Missing <role> section");
      expect(warnings).toContain("Missing Core Principles section");
      expect(warnings).toStrictEqual(
        expect.arrayContaining([expect.stringMatching(/Suspiciously short/)]),
      );
    });

    it("should include line count in short output warning", () => {
      const warnings = checkRequiredPatterns("---\nonly two lines");
      const shortWarning = warnings.find((w) => w.includes("Suspiciously short"));
      expect(shortWarning).toContain("only 2 lines");
    });
  });

  describe("validateFrontmatter", () => {
    it("should return no errors and no warnings when all fields are present and valid", () => {
      const content = [
        "---",
        "name: web-developer",
        "description: A web developer agent",
        "tools: Read, Write, Glob",
        "---",
        "body content",
      ].join("\n");

      const result = validateFrontmatter(content);

      expect(result.errors).toStrictEqual([]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should return parse error when frontmatter is absent", () => {
      const result = validateFrontmatter("No frontmatter here");

      expect(result.errors).toContain("Failed to parse YAML frontmatter");
      expect(result.warnings).toStrictEqual([]);
    });

    it("should return parse error when frontmatter YAML is malformed", () => {
      const content = "---\nname: [unclosed\n---\nbody";

      const result = validateFrontmatter(content);

      expect(result.errors).toContain("Failed to parse YAML frontmatter");
    });

    it("should return error when name is a non-string type", () => {
      const content = "---\nname: 123\ndescription: test\ntools: Read\n---\nbody";

      const result = validateFrontmatter(content);

      // name is present but is a number, not a string
      expect(result.errors).toContain("Frontmatter missing required field: name");
    });

    it("should return warning when description is a non-string type", () => {
      const content = "---\nname: web-dev\ndescription: true\ntools: Read\n---\nbody";

      const result = validateFrontmatter(content);

      expect(result.warnings).toContain("Frontmatter missing field: description");
    });

    it("should return warning when tools is a non-string type", () => {
      const content =
        "---\nname: web-dev\ndescription: test\ntools:\n  - Read\n  - Write\n---\nbody";

      const result = validateFrontmatter(content);

      expect(result.warnings).toContain("Frontmatter missing field: tools");
    });

    it("should not fail on extra unknown fields in frontmatter", () => {
      const content =
        "---\nname: web-dev\ndescription: test\ntools: Read\nextra: value\ncustom: 42\n---\nbody";

      const result = validateFrontmatter(content);

      expect(result.errors).toStrictEqual([]);
      expect(result.warnings).toStrictEqual([]);
    });

    it("should return error and warnings when all fields are missing from valid YAML", () => {
      const content = "---\nsome_other_field: value\n---\nbody";

      const result = validateFrontmatter(content);

      expect(result.errors).toContain("Frontmatter missing required field: name");
      expect(result.warnings).toContain("Frontmatter missing field: description");
      expect(result.warnings).toContain("Frontmatter missing field: tools");
    });

    it("should return parse error for empty frontmatter block", () => {
      const content = "---\n---\nbody";

      const result = validateFrontmatter(content);

      // extractFrontmatter returns null for empty frontmatter (match[1] is empty)
      expect(result.errors).toContain("Failed to parse YAML frontmatter");
    });

    it("should early return on parse failure without adding field warnings", () => {
      const content = "no frontmatter";

      const result = validateFrontmatter(content);

      // Should only have the parse error, no field-level warnings
      expect(result.errors).toStrictEqual(["Failed to parse YAML frontmatter"]);
      expect(result.warnings).toStrictEqual([]);
    });
  });

  describe("printOutputValidationResult", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it("should print nothing when there are no errors and no warnings", () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: [],
      };

      printOutputValidationResult("web-developer", result);

      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it("should print errors with agent name", () => {
      const result: ValidationResult = {
        valid: false,
        errors: ["Frontmatter missing required field: name", "Unclosed XML tag: <role>"],
        warnings: [],
      };

      printOutputValidationResult("web-developer", result);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Validation errors for web-developer"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Frontmatter missing required field: name"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Unclosed XML tag: <role>"));
    });

    it("should print warnings with agent name", () => {
      const result: ValidationResult = {
        valid: true,
        errors: [],
        warnings: ["Missing <role> section", "Missing Core Principles section"],
      };

      printOutputValidationResult("api-developer", result);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Validation warnings for api-developer"),
      );
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Missing <role> section"));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Missing Core Principles section"),
      );
    });

    it("should print both errors and warnings when both are present", () => {
      const result: ValidationResult = {
        valid: false,
        errors: ["Frontmatter missing required field: name"],
        warnings: ["Missing <role> section"],
      };

      printOutputValidationResult("cli-developer", result);

      const calls = consoleSpy.mock.calls.flat().join("\n");
      expect(calls).toContain("Validation errors for cli-developer");
      expect(calls).toContain("Validation warnings for cli-developer");
      expect(calls).toContain("Frontmatter missing required field: name");
      expect(calls).toContain("Missing <role> section");
    });

    it("should format each error and warning with a dash prefix", () => {
      const result: ValidationResult = {
        valid: false,
        errors: ["Error one"],
        warnings: ["Warning one"],
      };

      printOutputValidationResult("web-developer", result);

      expect(consoleSpy).toHaveBeenCalledWith("      - Error one");
      expect(consoleSpy).toHaveBeenCalledWith("      - Warning one");
    });
  });
});
