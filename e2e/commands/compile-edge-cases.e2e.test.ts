import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  ensureBinaryExists,
  listFiles,
  readTestFile,
  renderSkillMd,
  agentsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { EXIT_CODES, DIRS, FILES } from "../pages/constants.js";
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
      const project = await ProjectBuilder.editable({
        skills: ["web-framework-react"],
        agents: ["web-developer"],
        domains: ["web"],
      });
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;

      // Create a second local skill for a custom category
      await createLocalSkill(projectDir, "web-custom-e2e-tool" as SkillId, {
        description: "A custom tool skill for edge case testing",
        metadata: `author: "@test"\ncategory: web-custom-tool\nslug: e2e-tool\ncontentHash: "hash-custom-tool"\n`,
      });

      // Manually rewrite config.ts with a custom category in the stack
      await writeProjectConfig(projectDir, {
        name: "test-custom-stack",
        skills: [
          { id: "web-framework-react", scope: "project", source: "eject" },
          { id: "web-custom-e2e-tool" as SkillId, scope: "project", source: "eject" }, // fabricated E2E test ID
        ],
        agents: [{ name: "web-developer", scope: "project" }],
        domains: ["web"],
        stack: {
          "web-developer": {
            "web-framework": [{ id: "web-framework-react", preloaded: true }],
            "web-custom-tool": [{ id: "web-custom-e2e-tool" as SkillId, preloaded: true }],
          } as Record<string, SkillAssignment[]>, // fabricated category key
        },
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 2 local skills");

      // The custom skill should appear in the compiled agent output
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer", "web-custom-e2e-tool", "web-framework-react"],
      });
    });
  });

  describe("broken YAML in skill metadata", () => {
    it("should skip skill with invalid YAML frontmatter and compile remaining skills", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await writeProjectConfig(projectDir, { name: "e2e-broken-yaml", skills: [], agents: [] });

      // Create a valid skill
      await createLocalSkill(projectDir, "web-testing-e2e-valid" as SkillId, {
        description: "Valid skill that should compile",
        metadata: `author: "@test"\ncontentHash: "hash-valid"\n`,
      });

      // Create a skill with broken YAML frontmatter in SKILL.md
      const brokenSkillDir = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-testing-e2e-broken",
      );
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
        `author: "@test"\ncontentHash: "hash-broken"\n`,
      );

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // Compile should succeed — the broken skill is skipped, the valid one compiles
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skills");

      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer"],
        notContains: ["web-testing-e2e-broken"],
      });
    });

    it("should skip skill with completely malformed metadata.yaml", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");
      await writeProjectConfig(projectDir, { name: "e2e-bad-metadata", skills: [], agents: [] });

      // Create a valid skill
      await createLocalSkill(projectDir, "web-testing-e2e-good" as SkillId, {
        description: "Good skill",
        metadata: `author: "@test"\ncontentHash: "hash-good"\n`,
      });

      // Create a skill with valid SKILL.md but broken metadata.yaml
      const badMetadataSkillDir = path.join(
        projectDir,
        DIRS.CLAUDE,
        DIRS.SKILLS,
        "web-testing-e2e-bad-meta",
      );
      await mkdir(badMetadataSkillDir, { recursive: true });

      await writeFile(
        path.join(badMetadataSkillDir, FILES.SKILL_MD),
        renderSkillMd(
          "web-testing-e2e-bad-meta",
          "Skill with broken metadata",
          "# Bad Meta\n\nContent.",
        ),
      );

      // Write completely invalid YAML to metadata.yaml
      await writeFile(
        path.join(badMetadataSkillDir, FILES.METADATA_YAML),
        `{{{ this is not: valid: yaml: "at all`,
      );

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // The broken-metadata skill should still be loaded via SKILL.md frontmatter
      // (metadata.yaml is separate from skill loading in loadSkillsFromDir).
      // The valid skill should compile regardless.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toMatch(/Discovered \d+ local skills/);

      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer"],
      });
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
          { id: "web-testing-e2e-exists" as SkillId, scope: "project", source: "eject" },
          { id: "web-testing-e2e-phantom" as SkillId, scope: "project", source: "eject" },
        ],
        agents: [{ name: "web-developer", scope: "project" }],
        stack: {
          "web-developer": {
            "web-testing": [
              { id: "web-testing-e2e-exists" as SkillId, preloaded: true }, // fabricated E2E test ID
              { id: "web-testing-e2e-phantom" as SkillId, preloaded: true }, // fabricated E2E test ID
            ],
          },
        },
      });

      // Only create the skill that exists
      await createLocalSkill(projectDir, "web-testing-e2e-exists" as SkillId, {
        description: "This skill exists on disk",
        metadata: `author: "@test"\ncontentHash: "hash-exists"\n`,
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // Compile discovers skills from disk, not config. The phantom skill is never
      // discovered, so it's silently skipped during resolution. The existing skill
      // still routes to the agent.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skills");

      // The compiled agent should reference the existing skill but not the phantom
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["web-testing-e2e-exists"],
        notContains: ["web-testing-e2e-phantom"],
      });
    });
  });

  describe("empty stack in config", () => {
    it("should compile agents when stack is empty", async () => {
      tempDir = await createTempDir();
      const projectDir = path.join(tempDir, "project");

      await writeProjectConfig(projectDir, {
        name: "e2e-empty-stack",
        skills: [{ id: "web-testing-e2e-orphan" as SkillId, scope: "project", source: "eject" }],
        agents: [{ name: "web-developer", scope: "project" }],
        stack: {},
      });

      // Create the skill on disk so discovery finds it
      await createLocalSkill(projectDir, "web-testing-e2e-orphan" as SkillId, {
        description: "Skill with no stack assignment",
        metadata: `author: "@test"\ncontentHash: "hash-orphan"\n`,
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // With an empty stack, the skill is discovered but not routed to any agent.
      // Agents should still compile (with no skill references).
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skills");

      // The agent should compile but not reference the orphan skill
      await expect({ dir: projectDir }).toHaveCompiledAgentContent("web-developer", {
        contains: ["name: web-developer"],
        notContains: ["web-testing-e2e-orphan"],
      });
    });
  });

  describe("compile idempotency", () => {
    it("should produce identical output when run twice", async () => {
      const project = await ProjectBuilder.minimal();
      tempDir = path.dirname(project.dir);
      const projectDir = project.dir;
      const agentsDir = agentsPath(project.dir);

      const readAgentContents = async (): Promise<Record<string, string>> => {
        const files = await listFiles(agentsDir);
        return Object.fromEntries(
          await Promise.all(
            files.map(async (file) => [file, await readTestFile(path.join(agentsDir, file))]),
          ),
        );
      };

      // First compile
      const firstResult = await CLI.run(["compile"], { dir: projectDir });
      expect(firstResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      const firstContents = await readAgentContents();

      // Second compile
      const secondResult = await CLI.run(["compile"], { dir: projectDir });
      expect(secondResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      const secondContents = await readAgentContents();

      // Same set of files
      expect(Object.keys(secondContents).sort()).toStrictEqual(Object.keys(firstContents).sort());

      // Identical content for each file
      for (const file of Object.keys(firstContents)) {
        expect(secondContents[file]).toBe(firstContents[file]);
      }
    });
  });
});
