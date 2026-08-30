import { describe, it, expect } from "vitest";
import { extractNamedSection, extractScopeSections } from "./config-source-sections.js";

const CONFIG_SOURCE = `export default {
  name: 'test',
} satisfies ProjectConfig

const skills: SkillConfig[] = [
  // global
  { id: 'web-framework-react', scope: 'global', origin: 'eject' },
  // project
  { id: 'web-testing-vitest', scope: 'project', origin: 'eject' },
]

const agents: AgentScopeConfig[] = [{ name: 'web-dev', scope: 'project' }]

const stack: Stack = {
  web: { 'web-framework': 'web-framework-react' },
}
`;

const CONFIG_SOURCE_WITHOUT_STACK = `const skills: SkillConfig[] = [
  { id: 'web-framework-react', scope: 'global', origin: 'eject' },
]
`;

const CONFIG_SOURCE_WITH_UNTERMINATED_SKILLS = `const skills: SkillConfig[] = [
  { id: 'web-framework-react', scope: 'global', origin: 'eject' },

const agents: AgentScopeConfig[] = []
`;

const GLOBAL_ONLY_SECTION = `const skills: SkillConfig[] = [
  // global
  { id: 'web-framework-react', scope: 'global', origin: 'eject' },
]`;

const PROJECT_ONLY_SECTION = `const skills: SkillConfig[] = [
  // project
  { id: 'web-testing-vitest', scope: 'project', origin: 'eject' },
]`;

describe("extractNamedSection", () => {
  it("slices an array section from its declaration to its closing bracket", () => {
    const section = extractNamedSection(CONFIG_SOURCE, "agents");

    expect(section.startsWith("const agents: AgentScopeConfig[] = [")).toBe(true);
    expect(section.endsWith("]")).toBe(true);
    expect(section).toContain("{ name: 'web-dev', scope: 'project' }");
    expect(section).not.toContain("const stack");
  });

  it("slices the stack object section using its closing brace", () => {
    const section = extractNamedSection(CONFIG_SOURCE, "stack");

    expect(section.startsWith("const stack: Stack = {")).toBe(true);
    expect(section.endsWith("}")).toBe(true);
    expect(section).toContain("web-framework-react");
  });

  it("isolates the skills section without bleeding into agents", () => {
    const section = extractNamedSection(CONFIG_SOURCE, "skills");

    expect(section.startsWith("const skills: SkillConfig[] = [")).toBe(true);
    expect(section).not.toContain("const agents");
  });

  it("throws naming the declaration marker when the section is absent", () => {
    expect(() => extractNamedSection(CONFIG_SOURCE_WITHOUT_STACK, "stack")).toThrow(
      'Marker "const stack:" not found in config source.',
    );
  });

  it("throws naming the closing bracket when the section does not close", () => {
    expect(() => extractNamedSection(CONFIG_SOURCE_WITH_UNTERMINATED_SKILLS, "skills")).toThrow(
      'The "skills" section does not close with "]"',
    );
  });
});

describe("extractScopeSections", () => {
  it("splits a section into global and project halves at the scope markers", () => {
    const skillsSection = extractNamedSection(CONFIG_SOURCE, "skills");
    const { global, project } = extractScopeSections(skillsSection);

    expect(global).toContain("web-framework-react");
    expect(global).not.toContain("web-testing-vitest");
    expect(project).toContain("web-testing-vitest");
    expect(project).not.toContain("web-framework-react");
  });

  it("throws naming the global marker when the section has no global half", () => {
    expect(() => extractScopeSections(PROJECT_ONLY_SECTION)).toThrow(
      'Marker "// global" not found in the section.',
    );
  });

  it("throws naming the project marker when the section has no project half", () => {
    expect(() => extractScopeSections(GLOBAL_ONLY_SECTION)).toThrow(
      'Marker "// project" not found in the section.',
    );
  });
});
