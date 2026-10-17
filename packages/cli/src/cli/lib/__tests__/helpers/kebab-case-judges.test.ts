import { describe, expect, it } from "vitest";

import { kebabCaseJudgesIn, SHARED_PATTERN } from "./kebab-case-judges.js";

const MODULE = "judge.ts";

const REACHES_THE_SHARED_PATTERN = [
  `import { ${SHARED_PATTERN} } from "../consts.js";`,
  ``,
  `export function validate(name: string): boolean {`,
  `  return ${SHARED_PATTERN}.test(name);`,
  `}`,
  ``,
].join("\n");

const HAND_ROLLED = [
  `import { z } from "zod";`,
  ``,
  `export const slugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);`,
  ``,
].join("\n");

const DECLARES_THE_SHARED_PATTERN = [
  `export const ${SHARED_PATTERN} = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;`,
  ``,
].join("\n");

/** Same character class, judging something else. */
const JUDGES_SOMETHING_ELSE = [
  `export const AUTHOR_HANDLE_PATTERN = /^@[a-z][a-z0-9-]*$/;`,
  `export const CONTENT_HASH = /^[a-f0-9]{7}$/;`,
  `export const FINDING_NAME = /(20\\d{2}-\\d{2}-\\d{2}-[a-z0-9][a-z0-9-]{10,})/g;`,
  `export const SAFE_NAME = /^[a-zA-Z0-9@._/ -]+$/;`,
  ``,
].join("\n");

/** Unanchored, so it judges no whole name. */
const JUDGES_ONE_CHARACTER = [
  `const KEBAB_CASE_CHARACTER = /[a-z0-9-]/;`,
  ``,
  `export function firstOffender(name: string): string | undefined {`,
  `  return [...name].find((character) => !KEBAB_CASE_CHARACTER.test(character));`,
  `}`,
  ``,
].join("\n");

const CARRIES_A_GLOBAL_FLAG = [`export const SLUG = /^[a-z][a-z0-9-]*$/g;`, ``].join("\n");

describe("every surface that judges a kebab-case name", () => {
  it("finds the one that reaches the shared pattern", () => {
    expect(kebabCaseJudgesIn(REACHES_THE_SHARED_PATTERN, MODULE)).toStrictEqual([SHARED_PATTERN]);
  });

  it("finds the one written with its own regex", () => {
    expect(
      kebabCaseJudgesIn(HAND_ROLLED, MODULE),
      "a judge with its own regex shares no spelling with the shared pattern, which is why a scan for a name cannot see it",
    ).toStrictEqual(["/^[a-z][a-z0-9-]*$/"]);
  });

  it("leaves the shared pattern's own declaration alone", () => {
    expect(
      kebabCaseJudgesIn(DECLARES_THE_SHARED_PATTERN, MODULE),
      "the constant's home judges nothing, and a roster carrying it names a surface with no caller",
    ).toStrictEqual([]);
  });

  it("leaves a pattern that judges something else alone", () => {
    expect(kebabCaseJudgesIn(JUDGES_SOMETHING_ELSE, MODULE)).toStrictEqual([]);
  });

  it("leaves a pattern that judges one character alone", () => {
    expect(kebabCaseJudgesIn(JUDGES_ONE_CHARACTER, MODULE)).toStrictEqual([]);
  });

  it("reads a global-flagged pattern without letting its cursor decide", () => {
    expect(
      kebabCaseJudgesIn(CARRIES_A_GLOBAL_FLAG, MODULE),
      "a global regex carries lastIndex between calls, so probing it in place answers on the order the probes were written",
    ).toStrictEqual(["/^[a-z][a-z0-9-]*$/g"]);
  });

  it("names each judge once however many times a file reaches for it", () => {
    const twice = [REACHES_THE_SHARED_PATTERN, REACHES_THE_SHARED_PATTERN].join("\n");

    expect(kebabCaseJudgesIn(twice, MODULE)).toStrictEqual([SHARED_PATTERN]);
  });
});
