import { describe, expect, it } from "vitest";
import { normalizeGlobalConfig } from "./config-comparison.js";

const PROJECTS_LINE = '  "projects": ["/home/alice/app", "/tmp/xyz-123"],';
const SKILL_REACT = '  { "id": "web-framework-react", "scope": "global" },';
const SKILL_VITEST = '  { "id": "web-testing-vitest", "scope": "global" },';

describe("normalizeGlobalConfig", () => {
  it("removes the machine-specific projects-tracking line", () => {
    const withProjects = [SKILL_REACT, PROJECTS_LINE, SKILL_VITEST].join("\n");

    expect(normalizeGlobalConfig(withProjects)).not.toContain('"projects"');
  });

  it("treats configs that differ only in the projects line as equal", () => {
    const otherProjectsLine = '  "projects": ["/home/bob/other"],';
    const before = [SKILL_REACT, PROJECTS_LINE, SKILL_VITEST].join("\n");
    const after = [SKILL_REACT, otherProjectsLine, SKILL_VITEST].join("\n");

    expect(normalizeGlobalConfig(after)).toStrictEqual(normalizeGlobalConfig(before));
  });

  it("treats configs that differ only in line ordering as equal", () => {
    const ordered = [SKILL_REACT, SKILL_VITEST].join("\n");
    const reordered = [SKILL_VITEST, SKILL_REACT].join("\n");

    expect(normalizeGlobalConfig(reordered)).toStrictEqual(normalizeGlobalConfig(ordered));
  });

  it("does not mask a genuine entry addition", () => {
    const before = [SKILL_REACT].join("\n");
    const after = [SKILL_REACT, SKILL_VITEST].join("\n");

    expect(normalizeGlobalConfig(after)).not.toStrictEqual(normalizeGlobalConfig(before));
  });

  it("does not mask a genuine entry removal", () => {
    const before = [SKILL_REACT, SKILL_VITEST].join("\n");
    const after = [SKILL_REACT].join("\n");

    expect(normalizeGlobalConfig(after)).not.toStrictEqual(normalizeGlobalConfig(before));
  });
});
