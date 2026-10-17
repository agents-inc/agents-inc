import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, afterEach } from "vitest";
import {
  agentsPath,
  createTempDir,
  cleanupTempDir,
  createLocalSkill,
  listFiles,
  readCompiledAgents,
  renderMetadataYaml,
  renderSkillMd,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  MINIMAL_PROJECT_AGENT_NAMES,
  ProjectBuilder,
  metadataFieldsFor,
} from "../fixtures/project-builder.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";
import type { SkillId, SkillAssignment } from "../../src/cli/types/index.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";

describe("compile command edge cases", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  describe("custom stack assignments in manually-edited config", () => {
    it("should compile agents with a custom category added to the stack", async () => {
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

      await createLocalSkill(projectDir, "web-custom-e2e-tool", {
        description: "A custom tool skill for edge case testing",
        metadata: renderMetadataYaml({
          category: "web-custom-tool",
          slug: "e2e-tool",
          contentHash: "hash-custom-tool",
        }),
      });

      await writeProjectConfig(projectDir, {
        name: "test-custom-stack",
        skills: [
          { id: E2E_SKILL.react.id, scope: "project", origin: "eject" },
          { id: "web-custom-e2e-tool", scope: "project", origin: "eject" },
        ],
        agents: [{ name: E2E_AGENT["web-developer"].name, scope: "project" }],
        selectedDomains: ["web"],
        stack: {
          // `web-custom-tool` is outside the Category union on purpose; `satisfies` cannot express
          // that.
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
      // Agents declared so the project is a detected installation; local skills come from disk.
      await writeProjectConfig(projectDir, {
        name: "e2e-broken-yaml",
        skills: [],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "project" },
          { name: E2E_AGENT["api-developer"].name, scope: "project" },
        ],
      });

      await createLocalSkill(projectDir, "web-testing-e2e-valid", {
        description: "Valid skill that should compile",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-testing-e2e-valid"),
          contentHash: "hash-valid",
        }),
      });

      const brokenSkillDir = path.join(skillsPath(projectDir), "web-testing-e2e-broken");
      await mkdir(brokenSkillDir, { recursive: true });

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

      // A valid metadata.yaml, so the skill is not skipped for a missing one instead.
      await writeFile(
        path.join(brokenSkillDir, FILES.METADATA_YAML),
        renderMetadataYaml({
          ...metadataFieldsFor("web-testing-e2e-broken"),
          contentHash: "hash-broken",
        }),
      );

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skill");
      expect(output).not.toContain("Discovered 1 local skills");

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
      // Agents declared so the project is a detected installation; local skills come from disk.
      await writeProjectConfig(projectDir, {
        name: "e2e-bad-metadata",
        skills: [],
        agents: [
          { name: E2E_AGENT["web-developer"].name, scope: "project" },
          { name: E2E_AGENT["api-developer"].name, scope: "project" },
        ],
      });

      await createLocalSkill(projectDir, "web-testing-e2e-good", {
        description: "Good skill",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-testing-e2e-good"),
          contentHash: "hash-good",
        }),
      });

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
      await writeFile(badMetadataPath, `{{{ this is not: valid: yaml: "at all`);

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // An unreadable metadata.yaml is a hard error, since config-types.ts regeneration would skip
      // the same skill.
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
              { id: "web-testing-e2e-exists", preloaded: true },
              { id: "web-testing-e2e-phantom", preloaded: true },
            ],
          },
        },
      });

      await createLocalSkill(projectDir, "web-testing-e2e-exists", {
        description: "This skill exists on disk",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-testing-e2e-exists"),
          contentHash: "hash-exists",
        }),
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      // Compile discovers skills from disk, so the phantom is skipped.
      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skill");
      expect(output).not.toContain("Discovered 1 local skills");

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

      await createLocalSkill(projectDir, "web-testing-e2e-orphan", {
        description: "Skill with no stack assignment",
        metadata: renderMetadataYaml({
          ...metadataFieldsFor("web-testing-e2e-orphan"),
          contentHash: "hash-orphan",
        }),
      });

      const { exitCode, output } = await CLI.run(["compile"], { dir: projectDir });

      expect(exitCode).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain("Discovered 1 local skill");
      expect(output).not.toContain("Discovered 1 local skills");

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

      const firstResult = await CLI.run(["compile"], { dir: projectDir });
      expect(firstResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      const firstContents = await readCompiledAgents(projectDir);

      const secondResult = await CLI.run(["compile"], { dir: projectDir });
      expect(secondResult.exitCode).toBe(EXIT_CODES.SUCCESS);
      const secondContents = await readCompiledAgents(projectDir);

      // Roster first, so two empty maps cannot satisfy the comparison.
      expect(Object.keys(firstContents).sort()).toStrictEqual(
        MINIMAL_PROJECT_AGENT_NAMES.map((name) => `${name}.md`).sort(),
      );
      expect(secondContents).toStrictEqual(firstContents);
    });
  });
});
