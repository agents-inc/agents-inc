/**
 * Contract for `producer-rosters.ts` — the reader that finds a spec's roster of PRODUCERS and
 * says whether the file derives that roster from the tree.
 *
 * Every fixture below is a shape that killed a naive version of the reader, and each is written
 * as the real file that taught it rather than as an invented one. The reader is driven against
 * source text so the shapes it refuses can be planted: a scan whose only input is a tree with
 * nothing wrong in it has never been shown to report anything, and the gate beside this file is
 * green on a clean tree by design.
 */
import { describe, expect, it } from "vitest";

import { producerRostersIn } from "./producer-rosters.js";

/** What the fixtures are parsed as. Every roster gate in this tree is a `.test.ts`. */
const SPEC_FILE = "planted.test.ts";

/** A product module, a whole-module binding of one, and a test-support module. */
const PRODUCT_IMPORT = `import { marketplaceSchema } from "../schemas.js";`;
const NAMESPACE_IMPORT = `import * as configModule from "../configuration/config.js";`;
const SUPPORT_IMPORT = `import { createMockMarketplace } from "./factories/plugin-factories.js";`;

/**
 * The defect shape: three functions that each reach product code, gathered into a roster, and
 * nothing anywhere comparing that roster to what the tree holds. This is `JUDGES` with the
 * names changed.
 */
const HAND_WRITTEN_CALLABLE_ROSTER = [
  PRODUCT_IMPORT,
  ``,
  `function loadAccepts(name: string): boolean {`,
  `  return marketplaceSchema.safeParse({ name }).success;`,
  `}`,
  ``,
  `function publishAccepts(name: string): boolean {`,
  `  return marketplaceSchema.safeParse({ name }).success;`,
  `}`,
  ``,
  `const JUDGES = { load: loadAccepts, publish: publishAccepts };`,
  ``,
  `it("agree", () => {`,
  `  expect(Object.keys(JUDGES)).toStrictEqual(["load", "publish"]);`,
  `});`,
  ``,
].join("\n");

/**
 * The same roster with its membership held against the module namespace it is drawn from — the
 * shape `config-readers-agree.test.ts` uses, and the one every fix here has to reach.
 */
const ROSTER_HELD_AGAINST_A_NAMESPACE = [
  NAMESPACE_IMPORT,
  ``,
  `const READERS = [`,
  `  { name: "loadProjectConfig", read: (dir: string) => configModule.loadProjectConfig(dir) },`,
  `  { name: "loadGlobalConfig", read: () => configModule.loadGlobalConfig() },`,
  `];`,
  ``,
  `it("is one of the readers this file holds", () => {`,
  `  const exported = Object.keys(configModule).filter((name) => name.startsWith("load"));`,
  ``,
  `  expect(exported.sort()).toStrictEqual(READERS.map((reader) => reader.name).sort());`,
  `});`,
  ``,
].join("\n");

/**
 * The other derivation this repository uses: a filesystem walk reached through a local function,
 * as `page-object-space-presses.test.ts` and `config-types-agent-defs-agree.test.ts` both do. A
 * reader that only looked INSIDE the `expect` would condemn every one of them.
 */
const ROSTER_HELD_AGAINST_A_WALK_THROUGH_A_LOCAL = [
  PRODUCT_IMPORT,
  `import fg from "fast-glob";`,
  ``,
  `function judgeAccepts(name: string): boolean {`,
  `  return marketplaceSchema.safeParse({ name }).success;`,
  `}`,
  ``,
  `const JUDGES = [judgeAccepts, judgeAccepts];`,
  ``,
  `async function judgeSites(): Promise<string[]> {`,
  `  return (await fg("src/cli/**/*.ts")).sort();`,
  `}`,
  ``,
  `it("names every judge the tree holds", async () => {`,
  `  expect(await judgeSites()).toStrictEqual(JUDGES.map(() => "src/cli/lib/schemas.ts"));`,
  `});`,
  ``,
].join("\n");

/**
 * The same walk reached through an INTERMEDIATE CONSTANT holding a projection of the roster —
 * the shape `kebab-name-judges-agree.test.ts` deduplicates its sites into. The comparison names
 * the projection, so the roster's own identifier appears in no assertion at all, and a reader
 * that asked each assertion for a literal mention of it condemned a file whose walk is right
 * there.
 */
const ROSTER_HELD_AGAINST_A_WALK_THROUGH_AN_INTERMEDIATE = [
  PRODUCT_IMPORT,
  `import fg from "fast-glob";`,
  ``,
  `function judgeAccepts(name: string): boolean {`,
  `  return marketplaceSchema.safeParse({ name }).success;`,
  `}`,
  ``,
  `const JUDGES = [judgeAccepts, judgeAccepts];`,
  `const SITES = [...new Set(JUDGES.map(() => "src/cli/lib/schemas.ts"))];`,
  ``,
  `async function judgeSites(): Promise<string[]> {`,
  `  return (await fg("src/cli/**/*.ts")).sort();`,
  `}`,
  ``,
  `it("names every judge the tree holds", async () => {`,
  `  expect(await judgeSites()).toStrictEqual(SITES);`,
  `});`,
  ``,
].join("\n");

/**
 * The trap the defective file sets, and the one reason the reader cannot simply look for
 * `Object.keys`: reading the roster's OWN keys to build the expectation is what makes a spec
 * vacuous, not what makes it derived. A reader keying on the call name calls this file fixed.
 */
const ROSTER_READING_ITS_OWN_KEYS = [
  PRODUCT_IMPORT,
  ``,
  `function judgeAccepts(name: string): boolean {`,
  `  return marketplaceSchema.safeParse({ name }).success;`,
  `}`,
  ``,
  `const JUDGES = { load: judgeAccepts, publish: judgeAccepts };`,
  ``,
  `it("agrees with itself", () => {`,
  `  const verdicts = Object.entries(JUDGES).map(([judge]) => [judge, true]);`,
  ``,
  `  expect(Object.fromEntries(verdicts)).toStrictEqual(`,
  `    Object.fromEntries(Object.keys(JUDGES).map((judge) => [judge, true])),`,
  `  );`,
  `});`,
  ``,
].join("\n");

/**
 * The same own-key read with the roster's identifier moved out of the assertion, which is the
 * one thing a reader following bindings must not be talked into: the trail from the comparison
 * arrives at the roster, and what it finds there is still the roster listing itself.
 */
const ROSTER_READING_ITS_OWN_KEYS_THROUGH_AN_INTERMEDIATE = [
  PRODUCT_IMPORT,
  ``,
  `function judgeAccepts(name: string): boolean {`,
  `  return marketplaceSchema.safeParse({ name }).success;`,
  `}`,
  ``,
  `const JUDGES = { load: judgeAccepts, publish: judgeAccepts };`,
  `const CLAIMED = Object.keys(JUDGES);`,
  ``,
  `it("agrees with itself", () => {`,
  `  expect(CLAIMED).toStrictEqual(["load", "publish"]);`,
  `});`,
  ``,
].join("\n");

/**
 * Both operands projected off the roster through intermediates. Nothing here reads the tree at
 * all, so the trail the widened reader follows finds a comparison the roster cannot lose.
 */
const ROSTER_COMPARED_TO_A_PROJECTION_OF_ITSELF = [
  PRODUCT_IMPORT,
  ``,
  `function judgeAccepts(name: string): boolean {`,
  `  return marketplaceSchema.safeParse({ name }).success;`,
  `}`,
  ``,
  `const JUDGES = [judgeAccepts, judgeAccepts];`,
  `const CLAIMED = JUDGES.map(() => "src/cli/lib/schemas.ts");`,
  `const EXPECTED = JUDGES.map(() => "src/cli/lib/schemas.ts");`,
  ``,
  `it("agrees with itself", () => {`,
  `  expect(CLAIMED).toStrictEqual(EXPECTED);`,
  `});`,
  ``,
].join("\n");

/**
 * A file that walks the tree and a roster that is never held against the walk — the two in
 * neighbouring assertions of one `it`. The statement is the unit a derivation is read in, so a
 * walk asserted about beside the roster is not a walk the roster was compared to.
 */
const ROSTER_BESIDE_AN_UNRELATED_WALK = [
  PRODUCT_IMPORT,
  `import fg from "fast-glob";`,
  ``,
  `function judgeAccepts(name: string): boolean {`,
  `  return marketplaceSchema.safeParse({ name }).success;`,
  `}`,
  ``,
  `const JUDGES = [judgeAccepts, judgeAccepts];`,
  `const SITES = JUDGES.map(() => "src/cli/lib/schemas.ts");`,
  ``,
  `async function everySource(): Promise<string[]> {`,
  `  return (await fg("src/cli/**/*.ts")).sort();`,
  `}`,
  ``,
  `it("reads the tree, and separately names its judges", async () => {`,
  `  expect((await everySource()).length).toBeGreaterThan(0);`,
  ``,
  `  expect(SITES).toStrictEqual(["src/cli/lib/schemas.ts", "src/cli/lib/schemas.ts"]);`,
  `});`,
  ``,
].join("\n");

/**
 * A roster of test DATA — `NAMES` in `kebab-name-judges-agree.test.ts`, which is correctly
 * hand-written and correctly discriminating. A gate condemning this is unusable, and every
 * broader recogniser tried here condemned it: the names parameterise the same assertions the
 * judges do, and they reach product code as arguments.
 */
const ROSTER_OF_TEST_DATA = [
  PRODUCT_IMPORT,
  ``,
  `const NAMES = [`,
  `  { name: "acme-skills", accepted: true },`,
  `  { name: "acme--skills", accepted: false },`,
  `];`,
  ``,
  `it.each(NAMES)("judges $name", ({ name, accepted }) => {`,
  `  expect(marketplaceSchema.safeParse({ name }).success).toBe(accepted);`,
  `});`,
  ``,
].join("\n");

/**
 * A roster of callables that reach NOTHING — `TITLE_SHAPES` in `spec-filenames.test.ts`, whose
 * members build fixture text. They are functions, so a reader keying on callability alone
 * reports them; they are producers of nothing, so a roster of them cannot go stale against the
 * tree, because there is no tree side to go stale against.
 */
const ROSTER_OF_FIXTURE_BUILDERS = [
  PRODUCT_IMPORT,
  ``,
  `const TITLE_SHAPES = [`,
  '  (title: string) => `it("${title}", () => {});`,',
  '  (title: string) => `describe("${title}", () => {});`,',
  `];`,
  ``,
  `it.each(TITLE_SHAPES)("reads a title", (shape) => {`,
  `  expect(shape("x")).toContain("x");`,
  `});`,
  ``,
].join("\n");

/**
 * A roster of callables that reach only test support — factory wrappers, which every fixture
 * directory is full of. They are code paths, and they are not the ones a user reaches: a gate
 * asking a spec to derive its fixture machinery from the tree is asking for the impossible.
 */
const ROSTER_OF_SUPPORT_WRAPPERS = [
  SUPPORT_IMPORT,
  ``,
  `function oneSkill() {`,
  `  return createMockMarketplace([]);`,
  `}`,
  ``,
  `function twoSkills() {`,
  `  return createMockMarketplace([]);`,
  `}`,
  ``,
  `const FIXTURES = [oneSkill, twoSkills];`,
  ``,
  `it.each(FIXTURES)("builds a marketplace", (build) => {`,
  `  expect(build()).toBeDefined();`,
  `});`,
  ``,
].join("\n");

/** A roster of one, which names no agreement — two producers is the smallest disagreement. */
const ROSTER_OF_ONE = [
  PRODUCT_IMPORT,
  ``,
  `function judgeAccepts(name: string): boolean {`,
  `  return marketplaceSchema.safeParse({ name }).success;`,
  `}`,
  ``,
  `const JUDGES = [judgeAccepts];`,
  ``,
  `it("judges", () => {`,
  `  expect(JUDGES[0]!("acme")).toBe(true);`,
  `});`,
  ``,
].join("\n");

describe("the roster of producers a spec compares", () => {
  it("reports a hand-written roster of callables as underived", () => {
    expect(producerRostersIn(HAND_WRITTEN_CALLABLE_ROSTER, SPEC_FILE)).toStrictEqual([
      { name: "JUDGES", derived: false },
    ]);
  });

  it("reads the roster's own key list as no derivation at all", () => {
    expect(
      producerRostersIn(ROSTER_READING_ITS_OWN_KEYS, SPEC_FILE),
      "building the expectation out of the roster is what makes a spec vacuous, not what fixes it",
    ).toStrictEqual([{ name: "JUDGES", derived: false }]);
  });

  it("accepts a roster held against a module namespace", () => {
    expect(producerRostersIn(ROSTER_HELD_AGAINST_A_NAMESPACE, SPEC_FILE)).toStrictEqual([
      { name: "READERS", derived: true },
    ]);
  });

  it("accepts a roster held against a walk reached through a local function", () => {
    expect(
      producerRostersIn(ROSTER_HELD_AGAINST_A_WALK_THROUGH_A_LOCAL, SPEC_FILE),
      "every derived roster in this tree reaches its walk through a local binding",
    ).toStrictEqual([{ name: "JUDGES", derived: true }]);
  });

  it("accepts a roster held against a walk through an intermediate constant", () => {
    expect(
      producerRostersIn(ROSTER_HELD_AGAINST_A_WALK_THROUGH_AN_INTERMEDIATE, SPEC_FILE),
      "a comparison that names a projection of the roster names the roster",
    ).toStrictEqual([{ name: "JUDGES", derived: true }]);
  });

  it("reads the roster's own key list as no derivation when an intermediate holds it", () => {
    expect(
      producerRostersIn(ROSTER_READING_ITS_OWN_KEYS_THROUGH_AN_INTERMEDIATE, SPEC_FILE),
      "following the trail to the roster must not turn the roster into its own tree side",
    ).toStrictEqual([{ name: "JUDGES", derived: false }]);
  });

  it("reads a roster compared to a projection of itself as underived", () => {
    expect(
      producerRostersIn(ROSTER_COMPARED_TO_A_PROJECTION_OF_ITSELF, SPEC_FILE),
      "two projections of one roster agree however stale the roster is",
    ).toStrictEqual([{ name: "JUDGES", derived: false }]);
  });

  it("reads a roster beside an unrelated walk as underived", () => {
    expect(
      producerRostersIn(ROSTER_BESIDE_AN_UNRELATED_WALK, SPEC_FILE),
      "a walk asserted about beside the roster is not a walk the roster was compared to",
    ).toStrictEqual([{ name: "JUDGES", derived: false }]);
  });

  it("leaves a roster of test data alone", () => {
    expect(
      producerRostersIn(ROSTER_OF_TEST_DATA, SPEC_FILE),
      "a gate that condemns the inputs a spec is parameterised by is one that gets silenced",
    ).toStrictEqual([]);
  });

  it("leaves a roster of callables that reach no product code alone", () => {
    expect(producerRostersIn(ROSTER_OF_FIXTURE_BUILDERS, SPEC_FILE)).toStrictEqual([]);
  });

  it("leaves a roster of test-support wrappers alone", () => {
    expect(producerRostersIn(ROSTER_OF_SUPPORT_WRAPPERS, SPEC_FILE)).toStrictEqual([]);
  });

  it("leaves a roster of one alone", () => {
    expect(producerRostersIn(ROSTER_OF_ONE, SPEC_FILE)).toStrictEqual([]);
  });
});
