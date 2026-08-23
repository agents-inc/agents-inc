/**
 * Contract for `scripts/check-symbol-citations.ts` — the walk that every `@link` citation in this
 * package's TypeScript resolves to a symbol.
 *
 * Two halves, like every check beside it. The first drives it against fixture packages, because the
 * forms that decide the answer cannot all be present in this repository at once — the second half
 * is the assertion that none of them is.
 *
 * **Each non-resolving form gets its own case, and the reason is that they fail differently.** A
 * name that is simply absent is what any instrument would look for. A bare module path parses to no
 * NAME at all, so there is nothing for a name-based instrument to report on — which is exactly how
 * one survived a repair pass that fixed nine of its siblings. And a name declared in a module this
 * file does not import resolves for a reader who greps and for nobody else.
 *
 * Nothing here spells a citation inside a string that this package's own walk then reads: the
 * fixture sources are built from {@link CITATION}, which assembles the opener at runtime. Written
 * out, every fixture in this file would be a citation in this file, and the real-tree half below
 * would report its own test data.
 */
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import {
  check,
  type Citation,
  DEFAULT_PROJECT,
  NO_MANIFEST,
  NO_OWN_SOURCE,
  NO_PACKAGE_ROOT,
  NO_PROJECT_AFTER_FLAG,
  NO_PROJECT_CONFIG,
  NO_TSC_INVOCATION,
  NO_TYPECHECK_SCRIPT,
  PROJECTS,
  typecheckedProjects,
} from "./check-symbol-citations.js";
import { expectRefusal } from "./refusal-expectations.js";

/**
 * The citation opener, assembled rather than written.
 *
 * A test file is source, so a citation written out here is a citation this package's own walk finds
 * — and the real-tree half at the bottom would then report every fixture above it as a defect.
 * Building the opener from its parts is what keeps the fixtures out of the population they are
 * testing, and it is why no line in this file can be copied into a docblock as-is.
 */
function CITATION(entity: string): string {
  return `{${"@"}link ${entity}}`;
}

const BASE_CONFIG = "tsconfig.base.json";
const SIBLING_PROJECT = "tsconfig.sibling.json";
const SUBJECT = "src/subject.ts";
const SIBLING = "src/sibling.ts";

const DECLARED = "aDeclaredSymbol";
const NEVER_DECLARED = "aSymbolNothingDeclares";
const IN_THE_SIBLING = "aSymbolTheSiblingDeclares";

/**
 * A base and a child that inherits its `include` and nothing else, so a chain that is not resolved
 * yields a program with no files rather than a smaller one.
 *
 * That is the shape the whole check rests on: `tsconfig.scripts.json` and `e2e/tsconfig.json` both
 * take their strictness from a base two levels up, and a program built from the child alone would
 * answer about a different language.
 */
const BASE_TSCONFIG = JSON.stringify({
  compilerOptions: {
    strict: true,
    target: "ES2022",
    module: "Preserve",
    moduleResolution: "bundler",
    noEmit: true,
  },
  include: ["src/**/*"],
});

const CHILD_TSCONFIG = JSON.stringify({ extends: `./${BASE_CONFIG}` });

/** A module whose only export is the name the sibling-module cases cite. */
const SIBLING_SOURCE = `export const ${IN_THE_SIBLING} = 1;\n`;

/** A declaration with a docblock above it, which is the only place a citation can live. */
function subjectSource(docblock: string[], declaration = `export const ${DECLARED} = 1;`): string {
  return ["/**", ...docblock.map((line) => ` * ${line}`), " */", declaration, ""].join("\n");
}

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixturePackage(files: Record<string, string>): Promise<string> {
  const root = await createTempDir("symbol-citations-");
  roots.push(root);

  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(root, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  return root;
}

/** A package holding one subject module, with the base/child chain every case is judged through. */
async function writeSubjectPackage(
  subject: string,
  extra: Record<string, string> = {},
): Promise<string> {
  return writeFixturePackage({
    [BASE_CONFIG]: BASE_TSCONFIG,
    [DEFAULT_PROJECT]: CHILD_TSCONFIG,
    [SUBJECT]: subject,
    ...extra,
  });
}

const ONLY_THE_DEFAULT = [DEFAULT_PROJECT];

describe("a citation the compiler can resolve", () => {
  it("passes when it names a symbol the file itself declares", async () => {
    const packageRoot = await writeSubjectPackage(
      subjectSource([`Cites ${CITATION(DECLARED)} beside it.`]),
    );

    expect(check({ packageRoot, projects: ONLY_THE_DEFAULT })).toStrictEqual({
      clean: true,
      examined: 1,
      citing: ["src"],
      unresolved: [],
    });
  });

  it("passes when it names a symbol the file imports, which is the repair for the case below", async () => {
    const packageRoot = await writeSubjectPackage(
      [
        `import { ${IN_THE_SIBLING} } from "./sibling.js";`,
        "",
        subjectSource(
          [`Cites ${CITATION(IN_THE_SIBLING)}.`],
          `export const b = ${IN_THE_SIBLING};`,
        ),
      ].join("\n"),
      { [SIBLING]: SIBLING_SOURCE },
    );

    expect(check({ packageRoot, projects: ONLY_THE_DEFAULT }).unresolved).toStrictEqual([]);
  });

  it("resolves through an extends chain, so a child config is judged under the base's language", async () => {
    const packageRoot = await writeSubjectPackage(subjectSource([`Cites ${CITATION(DECLARED)}.`]));

    expect(
      check({ packageRoot, projects: ONLY_THE_DEFAULT }).examined,
      "the child config names no include of its own, so an unresolved extends builds a program with no files and reports a clean tree",
    ).toBe(1);
  });
});

describe("a citation that resolves to nothing", () => {
  it("reports a name nothing declares, with the file, the line and the words as written", async () => {
    const packageRoot = await writeSubjectPackage(
      subjectSource(["A first line of prose.", `Cites ${CITATION(NEVER_DECLARED)}.`]),
    );

    expect(check({ packageRoot, projects: ONLY_THE_DEFAULT }).unresolved).toStrictEqual([
      { file: SUBJECT, line: 3, cited: NEVER_DECLARED },
    ]);
  });

  it("reports a bare module path, which parses to no name and so is invisible to a name scan", async () => {
    const packageRoot = await writeSubjectPackage(
      subjectSource([`Cites ${CITATION("./sibling.ts")}.`]),
      { [SIBLING]: SIBLING_SOURCE },
    );

    expect(
      check({ packageRoot, projects: ONLY_THE_DEFAULT }).unresolved,
      "a module path is not an entity name, so an instrument that resolves names has nothing to look up and reports nothing",
    ).toStrictEqual([{ file: SUBJECT, line: 2, cited: "./sibling.ts" }]);
  });

  it("reports a name another module declares and this one does not import", async () => {
    const packageRoot = await writeSubjectPackage(
      subjectSource([`Cites ${CITATION(IN_THE_SIBLING)}.`]),
      { [SIBLING]: SIBLING_SOURCE },
    );

    expect(
      check({ packageRoot, projects: ONLY_THE_DEFAULT }).unresolved,
      "the name is declared and exported somewhere in the package, so a grep confirms it and the jump it promises still lands nowhere",
    ).toStrictEqual([{ file: SUBJECT, line: 2, cited: IN_THE_SIBLING }]);
  });

  it("judges a citation written inside backticks, because the JSDoc parser does not read backticks", async () => {
    const packageRoot = await writeSubjectPackage(
      subjectSource([`Prose about \`${CITATION(NEVER_DECLARED)}\`.`]),
    );

    expect(
      check({ packageRoot, projects: ONLY_THE_DEFAULT }).unresolved,
      "backticking a citation is what an author reaches for to make it prose, and it changes nothing about what the compiler is asked to resolve",
    ).toStrictEqual([{ file: SUBJECT, line: 2, cited: NEVER_DECLARED }]);
  });

  it("judges every citation rather than stopping at the first that fails", async () => {
    const packageRoot = await writeSubjectPackage(
      subjectSource([
        `Cites ${CITATION(NEVER_DECLARED)}.`,
        `And ${CITATION("aSecondSymbolNothingDeclares")}.`,
      ]),
    );

    const { examined, unresolved } = check({ packageRoot, projects: ONLY_THE_DEFAULT });

    expect(examined).toBe(2);
    expect(unresolved.map((citation: Citation) => citation.line)).toStrictEqual([2, 3]);
  });
});

describe("what the walk does not reach", () => {
  it("does not see a citation in a line comment, and still counts the block comment above it", async () => {
    const packageRoot = await writeSubjectPackage(
      [
        subjectSource([`Cites ${CITATION(DECLARED)}.`]),
        `// A line comment citing ${CITATION(NEVER_DECLARED)}.`,
        `export const c = ${DECLARED};`,
        "",
      ].join("\n"),
    );

    expect(
      check({ packageRoot, projects: ONLY_THE_DEFAULT }),
      "TypeScript parses JSDoc out of block comments alone, so this is a limit of the instrument rather than a verdict on the line",
    ).toStrictEqual({ clean: true, examined: 1, citing: ["src"], unresolved: [] });
  });

  it("judges a file two projects both hold exactly once", async () => {
    const packageRoot = await writeFixturePackage({
      [BASE_CONFIG]: BASE_TSCONFIG,
      [DEFAULT_PROJECT]: CHILD_TSCONFIG,
      [SIBLING_PROJECT]: CHILD_TSCONFIG,
      [SUBJECT]: subjectSource([`Cites ${CITATION(NEVER_DECLARED)}.`]),
    });

    expect(
      check({ packageRoot, projects: [DEFAULT_PROJECT, SIBLING_PROJECT] }),
      "the e2e project includes ../src, so every file of the product is held twice and would be reported twice for one repair",
    ).toStrictEqual({
      clean: false,
      examined: 1,
      citing: ["src"],
      unresolved: [{ file: SUBJECT, line: 2, cited: NEVER_DECLARED }],
    });
  });
});

describe("a run that would judge nothing", () => {
  it("throws when the package root does not exist", async () => {
    const packageRoot = await writeSubjectPackage(subjectSource(["Nothing cited."]));

    expectRefusal(
      () => check({ packageRoot: path.join(packageRoot, "absent"), projects: ONLY_THE_DEFAULT }),
      NO_PACKAGE_ROOT,
    );
  });

  it("throws when a project names a config that is not on disk", async () => {
    const packageRoot = await writeSubjectPackage(subjectSource(["Nothing cited."]));

    expectRefusal(
      () => check({ packageRoot, projects: ["tsconfig.absent.json"] }),
      NO_PROJECT_CONFIG,
    );
  });

  it("throws when a project holds no source of this package, rather than reading it as clean", async () => {
    const packageRoot = await writeFixturePackage({
      [BASE_CONFIG]: BASE_TSCONFIG,
      [DEFAULT_PROJECT]: JSON.stringify({ extends: `./${BASE_CONFIG}`, include: ["absent/**/*"] }),
      [SUBJECT]: subjectSource([`Cites ${CITATION(NEVER_DECLARED)}.`]),
    });

    expectRefusal(
      () => check({ packageRoot, projects: ONLY_THE_DEFAULT }),
      NO_OWN_SOURCE,
      "an include that has stopped matching reports a clean tree, and every citation under it goes unread",
    );
  });

  it("names the project in the refusal, so the config to repair is the one it prints", async () => {
    const packageRoot = await writeSubjectPackage(subjectSource(["Nothing cited."]));

    expect(() => check({ packageRoot, projects: ["tsconfig.absent.json"] })).toThrow(
      "tsconfig.absent.json",
    );
  });
});

describe("the roster read out of the manifest", () => {
  async function writePackageWithScript(typecheck: unknown): Promise<string> {
    return writeFixturePackage({
      "package.json": JSON.stringify({ name: "fixture", scripts: { typecheck } }),
    });
  }

  it("reads a bare tsc as the default project, which is how this package spells its first one", async () => {
    const packageRoot = await writePackageWithScript(
      "tsc --noEmit && tsc -p tsconfig.scripts.json --noEmit && echo done",
    );

    expect(
      typecheckedProjects({ packageRoot }),
      "treating a missing -p as no project drops src/ from the roster while reading every other command correctly",
    ).toStrictEqual([DEFAULT_PROJECT, "tsconfig.scripts.json"]);
  });

  it("throws when the manifest is not there", async () => {
    const packageRoot = await writeFixturePackage({ [SUBJECT]: SIBLING_SOURCE });

    expectRefusal(() => typecheckedProjects({ packageRoot }), NO_MANIFEST);
  });

  it("throws when the manifest declares no typecheck script", async () => {
    const packageRoot = await writeFixturePackage({
      "package.json": JSON.stringify({ name: "fixture", scripts: { build: "tsup" } }),
    });

    expectRefusal(() => typecheckedProjects({ packageRoot }), NO_TYPECHECK_SCRIPT);
  });

  it("throws when the typecheck script runs no tsc at all", async () => {
    const packageRoot = await writePackageWithScript("echo 'nothing to check'");

    expectRefusal(
      () => typecheckedProjects({ packageRoot }),
      NO_TSC_INVOCATION,
      "a roster read off a script that checks nothing is an empty roster that reports a clean tree",
    );
  });

  it("throws on a -p followed by nothing, rather than dropping that project from the roster", async () => {
    const packageRoot = await writePackageWithScript("tsc --noEmit && tsc -p");

    expectRefusal(
      () => typecheckedProjects({ packageRoot }),
      NO_PROJECT_AFTER_FLAG,
      "skipping the malformed command is how a roster narrows unnoticed, and a narrower roster reports a cleaner tree",
    );
  });
});

/**
 * Every tree of this package that carries citations today.
 *
 * A roster rather than a count, and asserted rather than derived: a count says something changed
 * and only members say which tree stopped being read. A project quietly dropped from
 * {@link PROJECTS}, or an `include` that has narrowed, takes its whole tree out of this list.
 *
 * If one of these three legitimately stops citing, that is worth a second look rather than a silent
 * edit — it means every docblock in that tree stopped offering a reader a jump.
 */
const TREES_THAT_CITE = ["e2e", "scripts", "src"];

describe("this repository", () => {
  const repository = check();

  it("walks every project the typecheck script does, so no tree is silently outside the rule", () => {
    expect(
      [...PROJECTS],
      "a fourth project added to typecheck and not here is a tree this walk stops reaching, and it reports clean for it",
    ).toStrictEqual(typecheckedProjects());
  });

  it("reads every tree that carries citations, so an empty verdict is not an unread one", () => {
    expect(
      repository.citing,
      "a tree the walk stopped reaching reports exactly what a tree whose every citation resolves reports",
    ).toStrictEqual(TREES_THAT_CITE);
  });

  it("has no citation offering a reader a jump that lands nowhere", () => {
    expect(
      repository.unresolved,
      "typecheck and lint both pass over an unresolvable citation in silence, so this is the only thing that reads them",
    ).toStrictEqual([]);
    expect(repository.clean).toBe(true);
  });
});
