import { mkdirSync, writeFileSync } from "fs";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir } from "../src/cli/lib/__tests__/test-fs-utils.js";

import { check, NO_MODULES, NO_SPECS, specNamesIn } from "./check-spec-name-vocabulary.js";
import { expectRefusal } from "./refusal-expectations.js";

const SPEC = "src/thing.test.ts";
const MODULE = "src/thing.ts";

const LIVE = "LIVE_CONSTANT";
const WITHDRAWN = "WITHDRAWN_CONSTANT";

const MODULE_HOLDING_LIVE = `export const ${LIVE} = "live";\n`;

const MODULE_NAMING_WITHDRAWN_IN_A_COMMENT = [
  `/** Superseded ${WITHDRAWN}, which nothing reads any more. */`,
  `export const ${LIVE} = "live";`,
  ``,
].join("\n");

function specNaming(name: string): string {
  return [`it("${name}", () => {});`, ``].join("\n");
}

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(cleanupTempDir));
});

async function writeFixturePackage(files: Record<string, string>): Promise<string> {
  const root = await createTempDir("spec-name-vocabulary-");
  roots.push(root);

  for (const [file, content] of Object.entries(files)) {
    const filePath = path.join(root, file);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, content);
  }

  return root;
}

describe("a spec name against the vocabulary its package holds", () => {
  it("says nothing about a name whose constant a module declares", async () => {
    const packageRoot = await writeFixturePackage({
      [MODULE]: MODULE_HOLDING_LIVE,
      [SPEC]: specNaming(`reads ${LIVE} when the flag is absent`),
    });

    expect(check({ packageRoot }).unresolved).toStrictEqual([]);
  });

  it("reports a name whose constant no module holds", async () => {
    const packageRoot = await writeFixturePackage({
      [MODULE]: MODULE_HOLDING_LIVE,
      [SPEC]: specNaming(`reads ${WITHDRAWN} when the flag is absent`),
    });

    expect(check({ packageRoot }).unresolved).toStrictEqual([
      { spec: SPEC, test: `reads ${WITHDRAWN} when the flag is absent`, token: WITHDRAWN },
    ]);
  });

  it("reports it even when a module names it in a comment, since prose is what nothing catches", async () => {
    const packageRoot = await writeFixturePackage({
      [MODULE]: MODULE_NAMING_WITHDRAWN_IN_A_COMMENT,
      [SPEC]: specNaming(`reads ${WITHDRAWN} when the flag is absent`),
    });

    expect(
      check({ packageRoot }).unresolved.map((finding) => finding.token),
      "a withdrawn name mentioned in any docblock would otherwise vouch for every spec still naming it",
    ).toStrictEqual([WITHDRAWN]);
  });

  it("does not let one spec's own name vouch for another's", async () => {
    const packageRoot = await writeFixturePackage({
      [MODULE]: MODULE_HOLDING_LIVE,
      "src/other.test.ts": specNaming(`also reads ${WITHDRAWN}`),
      [SPEC]: specNaming(`reads ${WITHDRAWN} when the flag is absent`),
    });

    expect(
      check({ packageRoot })
        .unresolved.map((finding) => finding.spec)
        .sort(),
    ).toStrictEqual(["src/other.test.ts", SPEC]);
  });

  it("says nothing about capitalised words that are not constant-shaped", async () => {
    const packageRoot = await writeFixturePackage({
      [MODULE]: MODULE_HOLDING_LIVE,
      [SPEC]: specNaming("refuses YAML the CLI cannot parse as JSON"),
    });

    expect(
      check({ packageRoot }).unresolved,
      "an underscore is what separates a constant from an ordinary capitalised word",
    ).toStrictEqual([]);
  });

  it("refuses a tree holding no spec, rather than reporting the vocabulary clean", async () => {
    const packageRoot = await writeFixturePackage({ [MODULE]: MODULE_HOLDING_LIVE });

    expectRefusal(() => check({ packageRoot }), NO_SPECS);
  });

  it("refuses a tree holding no module, rather than reporting every name withdrawn", async () => {
    const packageRoot = await writeFixturePackage({ [SPEC]: specNaming(`reads ${LIVE}`) });

    expectRefusal(() => check({ packageRoot }), NO_MODULES);
  });
});

describe("the names a spec gives itself", () => {
  it("reads a describe, an it and a test alike", () => {
    const source = [
      `describe("outer ${LIVE}", () => {`,
      `  it("inner ${LIVE}", () => {});`,
      `  test("beside ${LIVE}", () => {});`,
      `});`,
      ``,
    ].join("\n");

    expect(specNamesIn(source, SPEC)).toStrictEqual([
      `outer ${LIVE}`,
      `inner ${LIVE}`,
      `beside ${LIVE}`,
    ]);
  });

  it("reads a name however the call has been qualified", () => {
    const source = [
      `describe.skipIf(false)("skipped ${LIVE}", () => {});`,
      `it.each([1])("each ${LIVE} %i", () => {});`,
      `it.fails("failing ${LIVE}", () => {});`,
      ``,
    ].join("\n");

    expect(
      specNamesIn(source, SPEC),
      'a qualified call is the shape a scan for `it("` would miss, and a missed name is one nobody judges',
    ).toStrictEqual([`skipped ${LIVE}`, `each ${LIVE} %i`, `failing ${LIVE}`]);
  });

  it("reads the literal parts of a name built from a template", () => {
    const source = [
      'const scope = "global";',
      "",
      `it(\`reads ${"${scope}"} through ${LIVE}\`, () => {});`,
      ``,
    ].join("\n");

    expect(
      specNamesIn(source, SPEC),
      "the substitution is a value the run supplies and is nobody's vocabulary",
    ).toStrictEqual(["reads ", ` through ${LIVE}`]);
  });
});
