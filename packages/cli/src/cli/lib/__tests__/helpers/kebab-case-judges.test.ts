/**
 * Contract for `kebab-case-judges.ts` — the scan that finds every surface deciding whether a
 * name is kebab-case.
 *
 * The recogniser is BEHAVIOURAL rather than syntactic, and the fixtures are what makes that
 * worth the cost: the shape it exists to find is a judge written with its own regex, and there
 * is no spelling to match on. `/^[a-z][a-z0-9-]*$/` and `/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/` share
 * no useful substring, and a scan looking for one of them cannot see the other — which is the
 * whole reason the roster it feeds went stale.
 */
import { describe, expect, it } from "vitest";

import { kebabCaseJudgesIn, SHARED_PATTERN } from "./kebab-case-judges.js";

const MODULE = "judge.ts";

/** A judge reaching the one constant, which is what every aligned surface does. */
const REACHES_THE_SHARED_PATTERN = [
  `import { ${SHARED_PATTERN} } from "../consts.js";`,
  ``,
  `export function validate(name: string): boolean {`,
  `  return ${SHARED_PATTERN}.test(name);`,
  `}`,
  ``,
].join("\n");

/**
 * The defect: a judge with its own regex, in the exact spelling the tree carries one. It shares
 * no substring with the shared pattern and it accepts two names the shared pattern refuses.
 */
const HAND_ROLLED = [
  `import { z } from "zod";`,
  ``,
  `export const slugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/);`,
  ``,
].join("\n");

/**
 * Where the shared pattern is DECLARED. Both halves of a declaration read as a judge to a naive
 * scan — the literal is the pattern, and the name beside it is the name — so a roster fed by
 * one would carry the constant's own home as a fourth surface that judges nothing.
 */
const DECLARES_THE_SHARED_PATTERN = [
  `export const ${SHARED_PATTERN} = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;`,
  ``,
].join("\n");

/**
 * Anchored patterns over the same character class that judge something else entirely — an
 * author handle, a content hash, a finding's filename. Each is a hit for any scan keying on
 * `a-z0-9` and a hit for none that asks what the pattern ACCEPTS.
 */
const JUDGES_SOMETHING_ELSE = [
  `export const AUTHOR_HANDLE_PATTERN = /^@[a-z][a-z0-9-]*$/;`,
  `export const CONTENT_HASH = /^[a-f0-9]{7}$/;`,
  `export const FINDING_NAME = /(20\\d{2}-\\d{2}-\\d{2}-[a-z0-9][a-z0-9-]{10,})/g;`,
  `export const SAFE_NAME = /^[a-zA-Z0-9@._/ -]+$/;`,
  ``,
].join("\n");

/**
 * The per-character helper `validate-kebab-name.ts` keeps beside the shared pattern. It is
 * built from the same class and judges no whole name — an unanchored class matches a letter
 * inside `Acme-Skills` as readily as inside `acme-skills`.
 */
const JUDGES_ONE_CHARACTER = [
  `const KEBAB_CASE_CHARACTER = /[a-z0-9-]/;`,
  ``,
  `export function firstOffender(name: string): string | undefined {`,
  `  return [...name].find((character) => !KEBAB_CASE_CHARACTER.test(character));`,
  `}`,
  ``,
].join("\n");

/** A regex with a global flag, whose `lastIndex` survives a call and skips the next one. */
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
