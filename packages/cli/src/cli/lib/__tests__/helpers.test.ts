import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createMockSkill } from "./factories/skill-factories.js";
import { createMockMatrix } from "./factories/matrix-factories.js";
import { createMockAgent } from "./factories/agent-factories.js";
import { createTestDirs, cleanupTestDirs } from "./helpers/test-dir-setup.js";
import type { PluginTestDirs } from "./helpers/test-dir-setup.js";
import { writeTestSkill, writeTestAgent } from "./helpers/disk-writers.js";
import { fileExists, directoryExists } from "./test-fs-utils";
import type { SkillId } from "../../types";
import { initializeMatrix } from "../matrix/matrix-provider";
import { VITEST_MATRIX } from "./mock-data/mock-matrices";

describe("test helpers", () => {
  let testDirs: PluginTestDirs | null = null;

  beforeEach(() => {
    initializeMatrix(VITEST_MATRIX);
  });

  afterEach(async () => {
    if (testDirs) {
      await cleanupTestDirs(testDirs);
      testDirs = null;
    }
  });

  describe("createMockSkill", () => {
    it("creates a valid skill with defaults", () => {
      // Using normalized skill ID format — category resolved from canonical registry
      const skill = createMockSkill("web-framework-react");

      expect(skill.id).toBe("web-framework-react");
      expect(skill.category).toBe("web-framework");
      expect(skill.author).toBe("@test");
    });

    it("allows overrides", () => {
      const skill = createMockSkill("web-framework-react", {
        author: "@custom",
      });

      expect(skill.author).toBe("@custom");
    });

    it("throws for unknown skill without category override", () => {
      expect(() => createMockSkill("web-unknown-mystery" as SkillId)).toThrow(
        'createMockSkill: "web-unknown-mystery" not in canonical registry',
      );
    });

    it("accepts unknown skill with category override", () => {
      const skill = createMockSkill("web-unknown-mystery" as SkillId, {
        category: "web-framework",
      });

      expect(skill.id).toBe("web-unknown-mystery");
      expect(skill.category).toBe("web-framework");
    });
  });

  describe("createMockMatrix", () => {
    it("creates a valid matrix", () => {
      const skill = createMockSkill("web-framework-react");
      const matrix = createMockMatrix(skill);

      expect(matrix.version).toBe("1.0.0");
      expect(matrix.skills["web-framework-react"]).toBe(skill);
    });
  });

  describe("createMockAgent", () => {
    it("creates a valid agent definition", () => {
      const agent = createMockAgent("test-agent");

      expect(agent.title).toBe("test-agent");
      expect(agent.model).toBe("opus");
    });
  });

  describe("file system helpers", () => {
    it("createTestDirs creates required directories", async () => {
      testDirs = await createTestDirs();

      expect(await directoryExists(testDirs.skillsDir)).toBe(true);
      expect(await directoryExists(testDirs.agentsDir)).toBe(true);
    });

    it("writeTestSkill creates skill files", async () => {
      testDirs = await createTestDirs();
      const skillDir = await writeTestSkill(testDirs.skillsDir, "web-testing-vitest");

      expect(await fileExists(`${skillDir}/SKILL.md`)).toBe(true);
      expect(await fileExists(`${skillDir}/metadata.yaml`)).toBe(true);
    });

    it("writeTestAgent creates agent files", async () => {
      testDirs = await createTestDirs();
      const agentDir = await writeTestAgent(testDirs.agentsDir, "test-agent");

      expect(await fileExists(`${agentDir}/metadata.yaml`)).toBe(true);
    });
  });
});
