import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  check,
  NO_OWN_SOURCE,
  NO_PACKAGE_ROOT,
  NO_PROJECT_CONFIG,
  UNREADABLE_PROJECT_CONFIG,
  type WideningCast,
} from "./check-boundary-union-casts.js";
import { expectRefusal } from "./refusal-expectations.js";

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: "ES2022",
    module: "Preserve",
    moduleResolution: "bundler",
    noEmit: true,
  },
  include: ["src/**/*"],
});

const ORIGINAL_HOME = path.join("types", "generated");
const VENDORED_HOME = path.join("vendor", "generated");

/** Unions indexed out of tables, as generated: `SkillId` keeps its alias, `Category` loses it. */
const GENERATED_SOURCE = `export const CATEGORIES = ["web/framework", "web/styling"] as const;
export type Category = (typeof CATEGORIES)[number];
export const SKILL_MAP = {
  "web/framework": "web-framework-react",
  "web/styling": "web-styling-tailwind",
} as const;
export type SkillSlug = keyof typeof SKILL_MAP;
export type SkillId = (typeof SKILL_MAP)[SkillSlug];
`;

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await cleanupTempDir(tempDir);
  tempDir = undefined;
});

async function packageHolding(subject: string, home: string = ORIGINAL_HOME): Promise<string> {
  const root = await createTempDir();
  tempDir = root;

  await mkdir(path.join(root, "src", home), { recursive: true });
  await writeFile(path.join(root, "tsconfig.json"), TSCONFIG);
  await writeFile(path.join(root, "src", home, "source-types.ts"), GENERATED_SOURCE);
  await writeFile(path.join(root, "src", "subject.ts"), subject);

  return root;
}

function targets(found: WideningCast[]): string[] {
  return found.map((cast) => cast.target).sort();
}

describe("a cast that widens a boundary string into a generated union", () => {
  it("is refused", async () => {
    const root = await packageHolding(
      `import type { SkillId } from "./types/generated/source-types.js";
       export const idOf = (raw: string): SkillId => raw as SkillId;\n`,
    );

    expect(targets(check({ packageRoot: root }).widening)).toStrictEqual(["SkillId"]);
  });

  it("is allowed when the subject is a literal the compiler already knows", async () => {
    const root = await packageHolding(
      `import type { SkillId } from "./types/generated/source-types.js";
       export const id = "web-framework-react" as SkillId;\n`,
    );

    expect(check({ packageRoot: root }).widening).toStrictEqual([]);
  });

  it("is allowed when the union is not a generated one", async () => {
    const root = await packageHolding(
      `type Colour = "red" | "green";
       export const pick = (raw: string): Colour => raw as Colour;\n`,
    );

    expect(check({ packageRoot: root }).widening).toStrictEqual([]);
  });

  it("is refused when the union indexes a generated table by number", async () => {
    const root = await packageHolding(
      `import type { Category } from "./types/generated/source-types.js";
       export const categoryOf = (raw: string): Category => raw as Category;\n`,
    );

    expect(targets(check({ packageRoot: root }).widening)).toStrictEqual(["Category"]);
  });

  it("is refused when the declaration is the vendored copy of the generated file", async () => {
    const root = await packageHolding(
      `import type { SkillId } from "./vendor/generated/source-types.js";
       export const idOf = (raw: string): SkillId => raw as SkillId;\n`,
      VENDORED_HOME,
    );

    expect(targets(check({ packageRoot: root }).widening)).toStrictEqual(["SkillId"]);
  });

  it("names the file and line a reader has to go and change", async () => {
    const root = await packageHolding(
      `import type { SkillId } from "./types/generated/source-types.js";
       export const first = (raw: string): SkillId => raw as SkillId;\n`,
    );

    const [only] = check({ packageRoot: root }).widening;

    expect(only?.file).toBe(path.join("src", "subject.ts"));
    expect(only?.line).toBe(2);
  });
});

/** A directory where a config should be: on disk, and nothing TypeScript can read. */
const UNREADABLE_CONFIG = "tsconfig.unreadable.json";

describe("the checker refuses a subject it cannot judge", () => {
  it("refuses a package root that is not there", () => {
    expectRefusal(() => check({ packageRoot: "/nowhere/at/all" }), NO_PACKAGE_ROOT);
  });

  it("refuses a project config that is not there", async () => {
    const root = await packageHolding("export const nothing = 1;\n");

    expectRefusal(
      () => check({ packageRoot: root, projects: ["tsconfig.absent.json"] }),
      NO_PROJECT_CONFIG,
    );
  });

  it("refuses a project config TypeScript cannot read", async () => {
    const root = await packageHolding("export const nothing = 1;\n");
    await mkdir(path.join(root, UNREADABLE_CONFIG));

    expectRefusal(
      () => check({ packageRoot: root, projects: [UNREADABLE_CONFIG] }),
      UNREADABLE_PROJECT_CONFIG,
    );
  });

  it("refuses a project holding none of this package's source", async () => {
    const root = await createTempDir();
    tempDir = root;
    await writeFile(
      path.join(root, "tsconfig.json"),
      JSON.stringify({ compilerOptions: { noEmit: true }, include: ["nothing/**/*"], files: [] }),
    );

    expectRefusal(() => check({ packageRoot: root }), NO_OWN_SOURCE);
  });
});
