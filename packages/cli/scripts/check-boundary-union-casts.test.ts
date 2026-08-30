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

/** The two homes one vendoring produced, each package-relative under `src`. */
const ORIGINAL_HOME = path.join("types", "generated");
const VENDORED_HOME = path.join("vendor", "generated");

/**
 * The generated file's REAL shape — every union an index into a table, never a hand-written one.
 *
 * `"a" | "b"` is what this fixture used to say, and that is precisely why predicate 3 passed its own
 * tests while judging one union in six: a plain alias keeps its `aliasSymbol` and an indexed one may
 * not, so the fixture exercised the only shape that worked. Both index forms are here because they
 * differ — `SkillId` indexes by a union key and keeps its alias, `Category` indexes a `readonly`
 * tuple by `number` and loses it.
 */
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

  // The shape the predicate could not see, and the reason it is asked of the type NODE now. Every
  // union but `SkillId` indexes a `readonly` tuple by `number`, which resolves to the member union
  // with no `aliasSymbol` on it — so a predicate that asked the resolved type where it was declared
  // got no answer and read that as "somebody else's union". Delete the `declaringFilesOf` call and
  // this test goes red while every other one in the file stays green.
  it("is refused when the union indexes a generated table by number", async () => {
    const root = await packageHolding(
      `import type { Category } from "./types/generated/source-types.js";
       export const categoryOf = (raw: string): Category => raw as Category;\n`,
    );

    expect(targets(check({ packageRoot: root }).widening)).toStrictEqual(["Category"]);
  });

  // The vendored copy is the declaration every workspace but `packages/cli` resolves to, and it is
  // the same union under a different directory — so it is the same ban.
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
 * record. The roster is what exists on the day it landed; the assertion refuses the next one.
 *
 * Keyed by file rather than by line, because a line number rots on the next edit to the file while
 * the claim — "this module still contains one" — does not. Repairing one means deleting its entry
 * here in the same change, which is the only way this list shrinks. A row does NOT leave by
 * emigration: `seed-to-wizard.ts` moved to `@workspace/compile` and its row moved with it, into
 * {@link COMPILE_BACKLOG} below rather than out of the file.
 *
 * Each of these is a `string` the type system did not narrow being asserted into a generated union.
 * They are not equivalent: `path.basename(relPath) as SkillId` is the shape `packages/cli/CLAUDE.md`
 * bans outright, while a value just read out of parsed JSON is a boundary the rule permits — and
 * the permitted ones belong in `PARSE_BOUNDARIES` by directory, never behind an on-site comment.
 *
 * Four modules here — `category-factories.ts`, `list-compiled-agents.ts`, `default-categories.test.ts`
 * and `matrix-provider.ts` — are not new debt. They were always offending and the gate could not
 * see them, because predicate 3 asked the resolved type for its `aliasSymbol` and every union but
 * `SkillId` answers with nothing. They became visible the day that predicate started asking the
 * type NODE instead.
 */
const CLI_BACKLOG: readonly string[] = [
  path.join("src", "cli", "lib", "__tests__", "commands", "eject.test.ts"),
  path.join("src", "cli", "lib", "__tests__", "factories", "category-factories.ts"),
  path.join("src", "cli", "lib", "__tests__", "factories", "skill-factories.ts"),
  path.join("src", "cli", "lib", "__tests__", "mock-data", "mock-matrices.ts"),
  path.join("src", "cli", "lib", "__tests__", "mock-data", "mock-skills.ts"),
  path.join("src", "cli", "lib", "agents", "list-compiled-agents.ts"),
  path.join("src", "cli", "lib", "configuration", "__tests__", "default-categories.test.ts"),
  path.join("src", "cli", "lib", "configuration", "config-merger.test.ts"),
  path.join("src", "cli", "lib", "matrix", "matrix-provider.ts"),
  path.join("src", "cli", "lib", "matrix", "matrix-resolver.ts"),
  path.join("src", "cli", "lib", "matrix", "skill-resolution.integration.test.ts"),
  path.join("src", "cli", "lib", "skills", "skill-copier.test.ts"),
  path.join("src", "cli", "lib", "stacks", "stacks-loader.ts"),
];

/**
 * The same population in `@workspace/compile`, which is where the config and seed decoders now live.
 *
 * Held here rather than in that package because the rule is one rule and a second copy of it would
 * drift. `seed-to-config.ts` is `seed-to-wizard.ts` after the extraction, so its row is the one
 * deleted from {@link CLI_BACKLOG} rather than a new admission — a gate keyed on a module's path
 * goes quiet when the module moves, and this is that gate declining to.
 *
 * `seed-to-config.ts` decoding an editor-authored payload is arguably the parse boundary the rule
 * permits. It is a backlog row and not a `PARSE_BOUNDARIES` directory because that exemption is
 * scoped to a directory whose whole job is reading unvalidated bytes, and this module does that
 * among other work — the call is the owner's to make, and a row is what keeps it visible until
 * they make it.
 */
const COMPILE_BACKLOG: readonly string[] = [
  path.join("src", "config-types-source.ts"),
  path.join("src", "seed-to-config.ts"),
  path.join("src", "selection.ts"),
];

const REPAIR =
  "a module here is asserting a `string` into a generated union — narrow it through a guard, " +
  "or if it is a real parse boundary add its DIRECTORY to PARSE_BOUNDARIES. Repairing one " +
  "means deleting its entry from the backlog in the same change.";

describe("this repository", () => {
  it(
    "adds no new module in packages/cli casting a boundary string into a generated union",
    { timeout: 120_000 },
    () => {
      const { widening } = check({ packageRoot: path.resolve(import.meta.dirname, "..") });

      expect([...new Set(widening.map((cast) => cast.file))].sort(), REPAIR).toStrictEqual(
        CLI_BACKLOG,
      );
    },
  );

  it(
    "adds no new module in packages/compile casting a boundary string into a generated union",
    { timeout: 120_000 },
    () => {
      const { widening } = check({
        packageRoot: path.resolve(import.meta.dirname, "..", "..", "compile"),
      });

      expect([...new Set(widening.map((cast) => cast.file))].sort(), REPAIR).toStrictEqual(
        COMPILE_BACKLOG,
      );
    },
  );
});
