import { describe, it, expect, vi } from "vitest";
import { checkMatrixHealth } from "./matrix-health-check";
import { createMockSkill } from "../__tests__/factories/skill-factories.js";
import { createMockMatrix } from "../__tests__/factories/matrix-factories.js";
import { createMockCategory } from "../__tests__/factories/category-factories.js";
import {
  EMPTY_MATRIX,
  HEALTH_HEALTHY_MATRIX,
  HEALTH_SINGLE_SKILL_MATRIX,
  HEALTH_MISSING_DOMAIN_MATRIX,
  HEALTH_MULTIPLE_MISSING_DOMAINS_MATRIX,
  HEALTH_UNKNOWN_CATEGORY_MATRIX,
  HEALTH_ORPHAN_SKILL_WITH_MISSING_DOMAIN_MATRIX,
  HEALTH_UNRESOLVED_CONFLICTS_WITH_MATRIX,
  HEALTH_UNRESOLVED_REQUIRES_MATRIX,
  HEALTH_MULTIPLE_UNRESOLVED_REFS_MATRIX,
  HEALTH_ALL_REFS_RESOLVED_MATRIX,
  HEALTH_PARTIAL_UNRESOLVED_REQUIRES_MATRIX,
  HEALTH_AUDIT_UNIVERSAL_IN_EXCLUSIVE_MATRIX,
  HEALTH_AUDIT_UNIVERSAL_IN_OPEN_MATRIX,
  HEALTH_AUDIT_UNIVERSAL_WITH_REQUIRES_MATRIX,
  HEALTH_AUDIT_CONSTRAINED_IN_EXCLUSIVE_MATRIX,
  HEALTH_AUDIT_APPLIED_DISPOSITION_MATRIX,
  CUSTOM_SKILL_MATRIX,
  LOCAL_SKILL_MATRIX,
} from "../__tests__/mock-data/mock-matrices";
import type { Category, SkillId } from "../../types";

vi.mock("../../utils/logger");

import { warn } from "../../utils/logger";
import { firstElement } from "../__tests__/helpers/element-at.js";

describe("matrix-health-check", () => {
  describe("healthy matrix", () => {
    it("returns no issues for a valid matrix", () => {
      const issues = checkMatrixHealth(HEALTH_HEALTHY_MATRIX);

      expect(issues).toStrictEqual([]);
    });

    it("does not warn when matrix is structurally valid", () => {
      checkMatrixHealth(HEALTH_SINGLE_SKILL_MATRIX);

      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("category domains", () => {
    it("detects category missing domain field", () => {
      const issues = checkMatrixHealth(HEALTH_MISSING_DOMAIN_MATRIX);

      const domainIssues = issues.filter((i) => i.finding === "category-missing-domain");
      expect(domainIssues).toHaveLength(1);
      expect(firstElement(domainIssues).severity).toBe("warning");
      expect(firstElement(domainIssues).details).toContain("framework");
      expect(firstElement(domainIssues).details).toContain("no domain");
    });

    it("does not flag categories with valid domain", () => {
      const issues = checkMatrixHealth(HEALTH_SINGLE_SKILL_MATRIX);
      const domainIssues = issues.filter((i) => i.finding === "category-missing-domain");

      expect(domainIssues).toHaveLength(0);
    });

    it("detects multiple categories missing domains", () => {
      const issues = checkMatrixHealth(HEALTH_MULTIPLE_MISSING_DOMAINS_MATRIX);
      const domainIssues = issues.filter((i) => i.finding === "category-missing-domain");

      expect(domainIssues).toHaveLength(2);
    });
  });

  describe("skill categories", () => {
    it("detects skill referencing unknown category", () => {
      const issues = checkMatrixHealth(HEALTH_UNKNOWN_CATEGORY_MATRIX);
      const categoryIssues = issues.filter((i) => i.finding === "skill-unknown-category");

      expect(categoryIssues).toHaveLength(1);
      expect(firstElement(categoryIssues).severity).toBe("warning");
      expect(firstElement(categoryIssues).details).toContain("web-framework-react");
      expect(firstElement(categoryIssues).details).toContain("nonexistent-category");
    });

    it("does not flag skill with valid category", () => {
      const issues = checkMatrixHealth(HEALTH_SINGLE_SKILL_MATRIX);
      const categoryIssues = issues.filter((i) => i.finding === "skill-unknown-category");

      expect(categoryIssues).toHaveLength(0);
    });

    it("does not produce warning for auto-synthesized categories", () => {
      // Boundary cast: custom category not in built-in Category union
      const autoSynthesizedCategory = createMockCategory("web-custom", "Web Custom", {
        order: 999,
      });
      // Boundary cast: fictional skill ID for testing auto-synthesized categories
      const skillInSynthesizedCategory = createMockSkill("web-custom-tool" as SkillId, {
        category: "web-custom" as Category,
      });
      const matrixWithSynthesized = createMockMatrix(skillInSynthesizedCategory, {
        categories: {
          // Boundary cast: custom category key
          ["web-custom" as Category]: autoSynthesizedCategory,
        } satisfies Partial<Record<Category, import("../../types").CategoryDefinition>>,
      });

      const issues = checkMatrixHealth(matrixWithSynthesized);
      const categoryIssues = issues.filter((i) => i.finding === "skill-unknown-category");

      expect(categoryIssues).toHaveLength(0);
    });
  });

  describe("logging", () => {
    it("warns for each issue found", () => {
      const issues = checkMatrixHealth(HEALTH_ORPHAN_SKILL_WITH_MISSING_DOMAIN_MATRIX);

      expect(issues).toHaveLength(2);
      expect(warn).toHaveBeenCalledTimes(issues.length);
      for (const issue of issues) {
        expect(warn).toHaveBeenCalledWith(`[matrix] ${issue.details}`);
      }
    });
  });

  describe("skill relation refs", () => {
    it("detects unresolved conflictsWith reference", () => {
      const issues = checkMatrixHealth(HEALTH_UNRESOLVED_CONFLICTS_WITH_MATRIX);
      const refIssues = issues.filter((i) => i.finding === "skill-unresolved-relation-ref");

      expect(refIssues).toHaveLength(1);
      expect(firstElement(refIssues).severity).toBe("warning");
      expect(firstElement(refIssues).details).toContain("web-framework-react");
      expect(firstElement(refIssues).details).toContain("web-framework-ghost");
      expect(firstElement(refIssues).details).toContain("conflictsWith");
    });

    it("detects unresolved requires reference", () => {
      const issues = checkMatrixHealth(HEALTH_UNRESOLVED_REQUIRES_MATRIX);
      const refIssues = issues.filter((i) => i.finding === "skill-unresolved-relation-ref");

      expect(refIssues).toHaveLength(1);
      expect(firstElement(refIssues).details).toContain("web-testing-cypress-e2e");
      expect(firstElement(refIssues).details).toContain("web-framework-missing");
      expect(firstElement(refIssues).details).toContain("requires");
    });

    it("detects multiple unresolved references across fields", () => {
      const issues = checkMatrixHealth(HEALTH_MULTIPLE_UNRESOLVED_REFS_MATRIX);
      const refIssues = issues.filter((i) => i.finding === "skill-unresolved-relation-ref");

      expect(refIssues).toHaveLength(2);
    });

    it("does not flag references that resolve to existing skills", () => {
      const issues = checkMatrixHealth(HEALTH_ALL_REFS_RESOLVED_MATRIX);
      const refIssues = issues.filter((i) => i.finding === "skill-unresolved-relation-ref");

      expect(refIssues).toHaveLength(0);
    });

    it("does not flag skills with empty relation arrays", () => {
      const issues = checkMatrixHealth(HEALTH_SINGLE_SKILL_MATRIX);
      const refIssues = issues.filter((i) => i.finding === "skill-unresolved-relation-ref");

      expect(refIssues).toHaveLength(0);
    });

    it("detects unresolved refs in requires with multiple skillIds", () => {
      const issues = checkMatrixHealth(HEALTH_PARTIAL_UNRESOLVED_REQUIRES_MATRIX);
      const refIssues = issues.filter((i) => i.finding === "skill-unresolved-relation-ref");

      expect(refIssues).toHaveLength(1);
      expect(firstElement(refIssues).details).toContain("web-framework-missing");
      expect(firstElement(refIssues).details).not.toContain("web-framework-react");
    });
  });

  describe("audit verdict contradictions", () => {
    it("errors when a universal verdict sits in an exclusive category", () => {
      const issues = checkMatrixHealth(HEALTH_AUDIT_UNIVERSAL_IN_EXCLUSIVE_MATRIX);
      const auditIssues = issues.filter((i) => i.finding === "audit-verdict-contradiction");

      expect(auditIssues).toHaveLength(1);
      expect(firstElement(auditIssues).severity).toBe("error");
      expect(firstElement(auditIssues).details).toContain("web-styling-tailwind");
      expect(firstElement(auditIssues).details).toContain("web-styling");
    });

    it("errors when a universal verdict carries a requires rule", () => {
      const issues = checkMatrixHealth(HEALTH_AUDIT_UNIVERSAL_WITH_REQUIRES_MATRIX);
      const auditIssues = issues.filter((i) => i.finding === "audit-verdict-contradiction");

      expect(auditIssues).toHaveLength(1);
      expect(firstElement(auditIssues).severity).toBe("error");
      expect(firstElement(auditIssues).details).toContain("web-styling-tailwind");
      expect(firstElement(auditIssues).details).toContain("requires");
    });

    it("does not flag a universal verdict in an open category with no requires", () => {
      const issues = checkMatrixHealth(HEALTH_AUDIT_UNIVERSAL_IN_OPEN_MATRIX);
      const auditIssues = issues.filter((i) => i.finding === "audit-verdict-contradiction");

      expect(auditIssues).toStrictEqual([]);
    });

    it("does not flag a constrained verdict in an exclusive category", () => {
      const issues = checkMatrixHealth(HEALTH_AUDIT_CONSTRAINED_IN_EXCLUSIVE_MATRIX);
      const auditIssues = issues.filter((i) => i.finding === "audit-verdict-contradiction");

      expect(auditIssues).toStrictEqual([]);
    });

    it("does not flag a row whose backing disposition has since landed", () => {
      const issues = checkMatrixHealth(HEALTH_AUDIT_APPLIED_DISPOSITION_MATRIX);
      const auditIssues = issues.filter((i) => i.finding === "audit-verdict-contradiction");

      expect(auditIssues).toStrictEqual([]);
    });
  });

  describe("unaudited skills", () => {
    it("flags a source-provided skill with no audit manifest entry", () => {
      const issues = checkMatrixHealth(CUSTOM_SKILL_MATRIX);
      const unauditedIssues = issues.filter((i) => i.finding === "skill-unaudited");

      expect(unauditedIssues).toHaveLength(1);
      expect(firstElement(unauditedIssues).severity).toBe("warning");
      expect(firstElement(unauditedIssues).details).toContain("web-framework-arbitrary");
    });

    it("does not flag built-in skills, which the manifest covers exhaustively", () => {
      const issues = checkMatrixHealth(HEALTH_HEALTHY_MATRIX);
      const unauditedIssues = issues.filter((i) => i.finding === "skill-unaudited");

      expect(unauditedIssues).toStrictEqual([]);
    });

    it("does not flag local skills, which are user-authored rather than source-provided", () => {
      const issues = checkMatrixHealth(LOCAL_SKILL_MATRIX);
      const unauditedIssues = issues.filter((i) => i.finding === "skill-unaudited");

      expect(unauditedIssues).toStrictEqual([]);
    });
  });

  describe("empty matrix", () => {
    it("returns no issues for empty matrix", () => {
      const issues = checkMatrixHealth(EMPTY_MATRIX);

      expect(issues).toStrictEqual([]);
    });

    it("returns no issues for matrix with skills but no structural problems", () => {
      const issues = checkMatrixHealth(HEALTH_SINGLE_SKILL_MATRIX);

      expect(issues).toStrictEqual([]);
    });
  });
});
