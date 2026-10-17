import { describe, expect, it } from "vitest";

import { producerRostersIn } from "./producer-rosters.js";

const SPEC_FILE = "planted.test.ts";

const PRODUCT_IMPORT = `import { marketplaceSchema } from "../schemas.js";`;
const NAMESPACE_IMPORT = `import * as configModule from "../configuration/config.js";`;
const SUPPORT_IMPORT = `import { createMockMarketplace } from "./factories/plugin-factories.js";`;

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
