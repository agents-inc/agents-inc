import { describe, it, expect, beforeEach } from "vitest";
import { matrix, initializeMatrix, getSkillById } from "./matrix-provider";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";
import { SKILLS } from "../__tests__/test-fixtures";
import { createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import type { SkillId } from "../../types";

describe("matrix-provider", () => {
  beforeEach(() => {
    initializeMatrix(BUILT_IN_MATRIX);
  });

  describe("matrix export", () => {
    it("should start as BUILT_IN_MATRIX", () => {
      expect(matrix).toBe(BUILT_IN_MATRIX);
    });
  });

  describe("initializeMatrix", () => {
    it("should replace the matrix with the provided value", () => {
      const custom = createMockMatrix(SKILLS.react);
      initializeMatrix(custom);
      expect(matrix).toBe(custom);
    });

    it("should make updated matrix visible to other imports via live binding", () => {
      const custom = createMockMatrix(SKILLS.react, SKILLS.hono);
      initializeMatrix(custom);
      expect(matrix.skills["web-framework-react"]).toBe(custom.skills["web-framework-react"]);
      expect(matrix.skills["api-framework-hono"]).toBe(custom.skills["api-framework-hono"]);
    });
  });

  describe("getSkillById", () => {
    it("should return the skill for a valid ID", () => {
      const custom = createMockMatrix(SKILLS.react);
      initializeMatrix(custom);

      const skill = getSkillById("web-framework-react");
      expect(skill).toBe(custom.skills["web-framework-react"]);
    });

    it("should throw for a nonexistent skill ID", () => {
      initializeMatrix(createMockMatrix(SKILLS.react));
      expect(() => getSkillById("web-framework-nonexistent" as SkillId)).toThrow(
        "Skill not found: web-framework-nonexistent",
      );
    });
  });
});
