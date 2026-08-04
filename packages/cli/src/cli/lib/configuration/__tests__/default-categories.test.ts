import { describe, it, expect } from "vitest";
import { defaultCategories } from "../default-categories";
import type { Category } from "../../../types";
import { CATEGORIES } from "../../../types/matrix";
import { typedKeys } from "../../../utils/typed-object";

const EXPECTED_CATEGORY_COUNT = 89;

describe("defaultCategories", () => {
  it("has the expected number of categories", () => {
    const keys = typedKeys(defaultCategories);
    expect(keys).toHaveLength(EXPECTED_CATEGORY_COUNT);
  });

  it("defines every generated category", () => {
    const keys = typedKeys(defaultCategories);
    expect([...keys].sort()).toStrictEqual([...CATEGORIES].sort());
  });

  it("includes web-framework with correct fields", () => {
    expect(defaultCategories["web-framework"]).toStrictEqual({
      id: "web-framework",
      displayName: "Framework",
      description: "UI framework (React, Vue, Angular, SolidJS)",
      domain: "web",
      exclusive: true,
      required: true,
      order: 1,
    });
  });

  it("includes desktop-framework with correct fields", () => {
    expect(defaultCategories["desktop-framework"]).toStrictEqual({
      id: "desktop-framework",
      displayName: "Desktop Framework",
      description: "Desktop application framework (Tauri, Electron)",
      domain: "desktop",
      exclusive: true,
      required: true,
      order: 1,
    });
  });

  it("includes api-api with correct fields", () => {
    expect(defaultCategories["api-api"]).toStrictEqual({
      id: "api-api",
      displayName: "API Framework",
      description: "Backend framework (Hono, Express, Fastify)",
      domain: "api",
      exclusive: true,
      required: true,
      order: 1,
    });
  });

  it("includes cli-framework with correct fields", () => {
    expect(defaultCategories["cli-framework"]).toStrictEqual({
      id: "cli-framework",
      displayName: "CLI Framework",
      description: "CLI application framework (Commander, oclif)",
      domain: "cli",
      exclusive: true,
      required: true,
      order: 1,
    });
  });

  it("includes meta-reviewing", () => {
    expect(defaultCategories["meta-reviewing"]).toStrictEqual({
      id: "meta-reviewing",
      displayName: "Code Review",
      description: "Code review patterns and methodology",
      domain: "meta",
      exclusive: false,
      required: false,
      order: 1,
    });
  });

  it("all categories have required fields", () => {
    for (const [key, cat] of Object.entries(defaultCategories)) {
      expect(cat!.id, `${key} missing id`).toBe(key as Category);
      expect(cat!.displayName, `${key} missing displayName`).not.toBe("");
      expect(cat!.description, `${key} missing description`).not.toBe("");
      expect(cat!.domain, `${key} missing domain`).not.toBe("");
      expect(typeof cat!.exclusive, `${key} exclusive not boolean`).toBe("boolean");
      expect(typeof cat!.required, `${key} required not boolean`).toBe("boolean");
      expect(typeof cat!.order, `${key} order not number`).toBe("number");
    }
  });
});
