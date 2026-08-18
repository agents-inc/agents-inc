import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  agentsPath,
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  ensureBinaryExists,
  listFiles,
  readCompiledAgents,
  renderMetadataYaml,
  renderSkillMd,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { MINIMAL_PROJECT_AGENT_NAMES, ProjectBuilder } from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import type { SkillId, SkillAssignment } from "../../src/cli/types/index.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";

describe("compile command edge cases", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("custom stack assignments in manually-edited config", () => {
    it("should compile agents with a custom category added to the stack", async () => {
      // Built by hand rather than from `ProjectBuilder.editable()`: the builder's
      // config was overwritten two statements later by the `writeProjectConfig`
      // below — the hand-written config with a category outside the union IS this
      // spec's subject — so the builder call read as setup while contributing only
      // the react skill directory, which is one `createLocalSkill` here.
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      await createLocalSkill(projectDir, E2E_SKILL.react.id, {
        description: "Test skill for E2E",
        metadata: renderMetadataYaml({
          category: "web-framework",
          slug: "react",
          contentHash: "hash-react",
        }),
      });

      // Create a second local skill for a custom category
      await createLocalSkill(projectDir, "web-custom-e2e-tool", {
        description: "A custom tool skill for edge case testing",
        metadata: renderMetadataYaml({
          category: "web-custom-tool",
          slug: "e2e-tool",
          contentHash: "hash-custom-tool",
        }),
      });

      // Manually rewrite config.ts with a custom category in the stack
      await writeProjectConfig(projectDir, {
        name: "test-custom-stack",
        skills: [
          { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
          { id: "web-custom-e2e-tool", scope: "project", origin: "eject" }, // fabricated E2E test ID
        ],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        selectedDomains: ["web"],
        stack: {
          // `web-custom-tool` is fabricated on purpose — it is not in the Category
          // union, and a config carrying such a key is what this spec drives the
          // compiler with. `satisfies` cannot express a key outside a closed set,
          // which is exactly the thing under test.
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- deliberately invalid error-path data
          [E2E_AGENT["web-developer"].name]: {
            "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
            "web-custom-tool": [{ id: "web-custom-e2e-tool" as SkillId, preloaded: true }],
          } as Record<string, SkillAssignment[]>,
        },
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 2 local skills");

      // The custom skill should appear in the compiled agent output
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer", "web-custom-e2e-tool", E2E_SKILL.react.id],
        },
      );
    });
  });

  describe("broken YAML in skill metadata", () => {
    it("should skip skill with invalid YAML frontmatter and compile remaining skills", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      // Declare the agents so the project is a detected installation; the local
      // skills under test are discovered from disk independently of the config.
      await writeProjectConfig(projectDir, {
        name: "e2e-broken-yaml",
        skills: [],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "project" },
          { name: E2E_AGENT["api-developer"].name, scope: "project" },
        ],
      });

      // Create a valid skill
      await createLocalSkill(projectDir, "web-testing-e2e-valid", {
        description: "Valid skill that should compile",
        metadata: renderMetadataYaml({ contentHash: "hash-valid" }),
      });

      // Create a skill with broken YAML frontmatter in SKILL.md
      const brokenSkillDir = path.join(skillsPath(projectDir), "web-testing-e2e-broken");
      await mkdir(brokenSkillDir, { recursive: true });

      // Write SKILL.md with invalid YAML frontmatter (unbalanced quotes)
      await writeFile(
        path.join(brokenSkillDir, FILES.SKILL_MD),
        `---
name: "web-testing-e2e-broken
description: "This YAML is broken because the name quote is not closed
---

# Broken Skill
This skill has invalid YAML frontmatter.
`,
      );

      // Still provide a valid metadata.yaml so the skill directory is not skipped
      // for the missing-metadata reason
      await writeFile(
        path.join(brokenSkillDir, FILES.METADATA_YAML),
        renderMetadataYaml({ contentHash: "hash-broken" }),
      );

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // Compile should succeed — the broken skill is skipped, the valid one compiles
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skills");

      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer"],
          notContains: ["web-testing-e2e-broken"],
        },
      );
    });

    it("should hard-error naming the skill whose metadata.yaml cannot be read", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      // Declare the agents so the project is a detected installation; the local
      // skills under test are discovered from disk independently of the config.
      await writeProjectConfig(projectDir, {
        name: "e2e-bad-metadata",
        skills: [],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "project" },
          { name: E2E_AGENT["api-developer"].name, scope: "project" },
        ],
      });

      // Create a valid skill
      await createLocalSkill(projectDir, "web-testing-e2e-good", {
        description: "Good skill",
        metadata: renderMetadataYaml({ contentHash: "hash-good" }),
      });

      // Create a skill with valid SKILL.md but broken metadata.yaml
      const badMetadataSkillDir = path.join(skillsPath(projectDir), "web-testing-e2e-bad-meta");
      await mkdir(badMetadataSkillDir, { recursive: true });

      await writeFile(
        path.join(badMetadataSkillDir, FILES.SKILL_MD),
        renderSkillMd(
          "web-testing-e2e-bad-meta",
          "Skill with broken metadata",
          "# Bad Meta\n\nContent.",
        ),
      );

      const badMetadataPath = path.join(badMetadataSkillDir, FILES.METADATA_YAML);
      // Write completely invalid YAML to metadata.yaml
      await writeFile(badMetadataPath, `{{{ this is not: valid: yaml: "at all`);

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // A metadata.yaml that cannot be read is a hard error: the same file is
      // skipped when config-types.ts is regenerated, so loading the skill here
      // would compile agents around a skill the generated types never carry.
      expect(exitCode, `compile must refuse an unreadable metadata.yaml:\n${output}`).toBe(
        EXIT_CODES.ERROR,
      );
      expect(output, "the offending skill must be named").toContain("web-testing-e2e-bad-meta");
      expect(output, "the offending file must be named").toContain(badMetadataPath);
      expect(output, "the refusal must say what is wrong with the file").toContain(
        STEP_TEXT.COMPILE_METADATA_UNUSABLE,
      );
      expect(output, "a refused compile must not claim completion").not.toContain(
        STEP_TEXT.COMPILE_COMPLETE,
      );

      // The refusal precedes compilation: the valid sibling skill does not get
      // agents written for it either.
      expect(
        await listFiles(agentsPath(projectDir)),
        "a refused compile must write no agents at all",
      ).toStrictEqual([]);
    });
  });

  describe("skill referenced in config but missing on disk", () => {
    it("should compile successfully when a config-referenced skill is missing from disk", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      // Config references two skills, but we only create one on disk
      await writeProjectConfig(projectDir, {
        name: "e2e-missing-skill",
        skills: [
          { id: "web-testing-e2e-exists", scope: "project", origin: "eject" },
          { id: "web-testing-e2e-phantom", scope: "project", origin: "eject" },
        ],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        stack: {
          [E2E_AGENT["web-developer"].name]: {
            "web-testing": [
              { id: "web-testing-e2e-exists", preloaded: true }, // fabricated E2E test ID
              { id: "web-testing-e2e-phantom", preloaded: true }, // fabricated E2E test ID
            ],
          },
        },
      });

      // Only create the skill that exists
      await createLocalSkill(projectDir, "web-testing-e2e-exists", {
        description: "This skill exists on disk",
        metadata: renderMetadataYaml({ contentHash: "hash-exists" }),
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // Compile discovers skills from disk, not config. The phantom skill is never
      // discovered, so it's silently skipped during resolution. The existing skill
      // still routes to the agent.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skills");

      // The compiled agent should reference the existing skill but not the phantom
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["web-testing-e2e-exists"],
          notContains: ["web-testing-e2e-phantom"],
        },
      );
    });
  });

  describe("empty stack in config", () => {
    it("should compile agents when stack is empty", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      await writeProjectConfig(projectDir, {
        name: "e2e-empty-stack",
        skills: [{ id: "web-testing-e2e-orphan", scope: "project", origin: "eject" }],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        stack: {},
      });

      // Create the skill on disk so discovery finds it
      await createLocalSkill(projectDir, "web-testing-e2e-orphan", {
        description: "Skill with no stack assignment",
        metadata: renderMetadataYaml({ contentHash: "hash-orphan" }),
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // With an empty stack, the skill is discovered but not routed to any agent.
      // Agents should still compile (with no skill references).
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skills");

      // The agent should compile but not reference the orphan skill
      await expect({ dir: projectDir }).toHaveCompiledAgentContent(
        E2E_AGENT["web-developer"].name,
        {
          contains: ["name: web-developer"],
          notContains: ["web-testing-e2e-orphan"],
        },
      );
    });
  });

  describe("compile idempotency", () => {
    it("should produce identical output when run twice", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // First compile
      const firstResult = await CLI.run(["compile"], { dir: projectDir });
      expect(firstResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      const firstContents = await readCompiledAgents(projectDir);

      // Second compile
      const secondResult = await CLI.run(["compile"], { dir: projectDir });
      expect(secondResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      const secondContents = await readCompiledAgents(projectDir);

      // The roster is asserted first, so a compile that wrote nothing at all
      // cannot satisfy the byte comparison with two empty maps.
      expect(Object.keys(firstContents).sort()).toStrictEqual(
        MINIMAL_PROJECT_AGENT_NAMES.map((name) => `${name}.md`).sort(),
      );
      // One comparison over the whole map: roster AND bytes, so an agent that
      // appeared, vanished or was rewritten all read as the same failure.
      expect(secondContents).toStrictEqual(firstContents);
    });
  });
});
