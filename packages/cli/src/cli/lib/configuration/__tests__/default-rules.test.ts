import { describe, it, expect } from "vitest";
import { defaultRules } from "../default-rules";
import { typedKeys } from "../../../utils/typed-object";

describe("defaultRules", () => {
  it("has version and relationships", () => {
    expect(defaultRules.version).toBe("1.0.0");
    expect(typedKeys(defaultRules.relationships).sort()).toStrictEqual([
      "alternatives",
      "compatibleWith",
      "conflicts",
      "discourages",
      "recommends",
      "requires",
    ]);
  });

  it("has conflict rules", () => {
    expect(defaultRules.relationships.conflicts).toHaveLength(28);
    expect(
      defaultRules.relationships.conflicts.find((c) => c.skills.includes("react")),
    ).toStrictEqual({
      skills: ["react", "vue-composition-api", "angular-standalone", "solidjs", "svelte"],
      reason: "Base frameworks are mutually exclusive",
    });
  });

  it("has recommend rules as flat picks with skill and reason", () => {
    expect(defaultRules.relationships.recommends).toHaveLength(26);
    expect(defaultRules.relationships.recommends.find((r) => r.skill === "zustand")).toStrictEqual({
      skill: "zustand",
      reason: "Best-in-class React state management",
    });
  });

  it("has require rules", () => {
    expect(defaultRules.relationships.requires).toHaveLength(50);
    expect(defaultRules.relationships.requires.find((r) => r.skill === "zustand")).toStrictEqual({
      skill: "zustand",
      needs: ["react", "nextjs", "remix", "react-native"],
      needsAny: true,
      reason: "Skill teaches React/React Native patterns",
    });
  });

  it("has alternative groups", () => {
    expect(defaultRules.relationships.alternatives).toHaveLength(42);
    expect(
      defaultRules.relationships.alternatives.find((a) => a.purpose === "Base Framework"),
    ).toStrictEqual({
      purpose: "Base Framework",
      skills: ["react", "vue-composition-api", "angular-standalone", "solidjs", "svelte"],
    });
  });

  it("has discourage rules (currently empty — conflicts prevent co-selection)", () => {
    expect(defaultRules.relationships.discourages).toStrictEqual([]);
  });
});
