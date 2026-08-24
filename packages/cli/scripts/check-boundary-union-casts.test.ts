import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  check,
  NO_OWN_SOURCE,
  NO_PACKAGE_ROOT,
  NO_PROJECT_CONFIG,
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

/** A generated union, at the path the rule scopes by. */
const GENERATED = "src/types/generated/source-types.ts";
const GENERATED_SOURCE = `export type SkillId = "web-framework-react" | "web-styling-tailwind";\n`;

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) await cleanupTempDir(tempDir);
  tempDir = undefined;
});

async function packageHolding(subject: string): Promise<string> {
  const root = await createTempDir();
  tempDir = root;

  await mkdir(path.join(root, "src", "types", "generated"), { recursive: true });
  await writeFile(path.join(root, "tsconfig.json"), TSCONFIG);
  await writeFile(path.join(root, GENERATED), GENERATED_SOURCE);
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

  // The discriminating case, and the reason the source predicate reads `TypeFlags.String` rather
  // than "is assignable". A literal the compiler already knows is a member is not a widening at
  // all — a rule that condemned it would condemn every legitimate narrowing in the tree, and the
  // two tests above and below would pass just as well against a checker that refused everything.
  it("is allowed when the subject is a literal the compiler already knows", async () => {
    const root = await packageHolding(
      `import type { SkillId } from "./types/generated/source-types.js";
       export const id = "web-framework-react" as SkillId;\n`,
    );

    expect(check({ packageRoot: root }).widening).toStrictEqual([]);
  });

  // Scoped by where the union is DECLARED, so a cast into somebody else's union is not our rule's
  // business — the ban is about this package's generated unions specifically.
  it("is allowed when the union is not a generated one", async () => {
    const root = await packageHolding(
      `type Colour = "red" | "green";
       export const pick = (raw: string): Colour => raw as Colour;\n`,
    );

    expect(check({ packageRoot: root }).widening).toStrictEqual([]);
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

/**
 * Today's population, declared so the gate can open without demanding twelve repairs first.
 *
 * Introduced the way a large lint rule is, not as a gate that opens red: a gate arriving with a
 * dozen violations gets deleted the first time it is inconvenient, which this repository has on
 * record. The roster is what exists on the day it landed; the assertion refuses the THIRTEENTH.
 *
 * Keyed by file rather than by line, because a line number rots on the next edit to the file while
 * the claim — "this module still contains one" — does not. Repairing one means deleting its entry
 * here in the same change, which is the only way this list shrinks.
 *
 * Each of these is a `string` the type system did not narrow being asserted into `SkillId`. They
 * are not equivalent: `path.basename(relPath) as SkillId` is the shape `packages/cli/CLAUDE.md`
 * bans outright, while a value just read out of parsed JSON is a boundary the rule permits — and
 * the permitted ones belong in `PARSE_BOUNDARIES` by directory, never behind an on-site comment.
 */
const DECLARED_BACKLOG: readonly string[] = [
  path.join("src", "cli", "lib", "__tests__", "commands", "eject.test.ts"),
  path.join("src", "cli", "lib", "__tests__", "factories", "skill-factories.ts"),
  path.join("src", "cli", "lib", "__tests__", "mock-data", "mock-matrices.ts"),
  path.join("src", "cli", "lib", "__tests__", "mock-data", "mock-skills.ts"),
  path.join("src", "cli", "lib", "configuration", "config-merger.test.ts"),
  path.join("src", "cli", "lib", "matrix", "matrix-resolver.ts"),
  path.join("src", "cli", "lib", "matrix", "skill-resolution.integration.test.ts"),
  path.join("src", "cli", "lib", "seed", "seed-to-wizard.ts"),
  path.join("src", "cli", "lib", "skills", "skill-copier.test.ts"),
  path.join("src", "cli", "lib", "stacks", "stacks-loader.ts"),
];

describe("this repository", () => {
  it(
    "adds no new module casting a boundary string into a generated union",
    { timeout: 120_000 },
    () => {
      const { widening } = check({ packageRoot: path.resolve(import.meta.dirname, "..") });
      const modules = [...new Set(widening.map((cast) => cast.file))].sort();

      expect(
        modules,
        "a module here is asserting a `string` into a generated union — narrow it through a guard, " +
          "or if it is a real parse boundary add its DIRECTORY to PARSE_BOUNDARIES. Repairing one " +
          "means deleting its entry from DECLARED_BACKLOG in the same change.",
      ).toStrictEqual(DECLARED_BACKLOG);
    },
  );
});
