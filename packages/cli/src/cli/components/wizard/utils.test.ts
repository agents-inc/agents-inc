import { describe, it, expect, beforeEach } from "vitest";
import { initializeMatrix } from "../../lib/matrix/matrix-provider";
import { createMockMatrix } from "../../lib/__tests__/factories/matrix-factories";
import { createMockResolvedStack } from "../../lib/__tests__/factories/stack-factories";
import { SKILLS } from "../../lib/__tests__/test-fixtures";
import type { Domain } from "../../types";
import { getDomainDisplayName, orderDomains, getStackName } from "./utils";

describe("getDomainDisplayName", () => {
  it("should return display name for known domains", () => {
    expect(getDomainDisplayName("web")).toBe("Web");
    expect(getDomainDisplayName("api")).toBe("API");
    expect(getDomainDisplayName("cli")).toBe("CLI");
    expect(getDomainDisplayName("mobile")).toBe("Mobile");
    expect(getDomainDisplayName("shared")).toBe("Shared");
  });

  it("should capitalize first letter for unknown domains", () => {
    expect(getDomainDisplayName("custom")).toBe("Custom");
    expect(getDomainDisplayName("acme")).toBe("Acme");
  });
});

describe("orderDomains", () => {
  it("should order built-in domains per BUILT_IN_DOMAIN_ORDER", () => {
    const result = orderDomains(["shared", "web", "cli", "api", "mobile"]);
    expect(result).toStrictEqual(["web", "api", "mobile", "cli", "shared"]);
  });

  it("should place custom domains first (alphabetically), then built-in", () => {
    const result = orderDomains(["web", "zebra" as Domain, "acme" as Domain, "api"]);
    expect(result).toStrictEqual(["acme", "zebra", "web", "api"]);
  });

  it("should handle empty array", () => {
    expect(orderDomains([])).toStrictEqual([]);
  });

  it("should handle single domain", () => {
    expect(orderDomains(["api"])).toStrictEqual(["api"]);
  });
});

describe("getStackName", () => {
  beforeEach(() => {
    initializeMatrix(
      createMockMatrix(SKILLS.react, {
        suggestedStacks: [createMockResolvedStack("nextjs-fullstack", "Next.js Full-Stack")],
      }),
    );
  });

  it("should return stack name for a valid stack ID", () => {
    expect(getStackName("nextjs-fullstack")).toBe("Next.js Full-Stack");
  });

  it("should throw for a stack ID the matrix does not hold", () => {
    expect(() => getStackName("nonexistent")).toThrow("Stack not found: nonexistent");
  });

  it("should return undefined for null input", () => {
    expect(getStackName(null)).toBeUndefined();
  });
});
