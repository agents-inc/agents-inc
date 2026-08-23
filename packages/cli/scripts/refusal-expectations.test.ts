/**
 * Contract for `scripts/refusal-expectations.ts` — the assertion a refusal is proved by, and the
 * scan that says every suite under `scripts/` uses it.
 *
 * Two halves, like every check beside it. The first drives both readers against fixture sources,
 * because the shape that matters — an assertion that cannot tell the refusal it names from any
 * other failure — must not exist in this package's own gates at all; the second half is the
 * assertion that none does.
 */
import { describe, expect, it } from "vitest";

import {
  expectRefusal,
  NO_MESSAGE,
  UNSTATED_REFUSAL,
  vacuousThrowAssertions,
  vacuousThrowAssertionsIn,
} from "./refusal-expectations.js";

const FIXTURE = "scripts/check-fixture.test.ts";

/**
 * Two refusals of the shape every check in this package writes, kept short on purpose: vitest
 * elides a long expected value in its own failure text, and the delegation tests below read that
 * text to prove the message reached the matcher.
 */
const REFUSAL = "names no source file";
const OTHER_REFUSAL = "enumerates nothing";

function throwing(message: string): () => never {
  return () => {
    throw new Error(message);
  };
}

/** How every suite under `scripts/` reaches its check's refusal constants. */
const IMPORTS_A_REFUSAL = `import { check, NO_SOURCE_FILE } from "./check-fixture.js";`;

function fixtureSource(assertion: string): string {
  return [IMPORTS_A_REFUSAL, ``, `it("refuses", () => {`, `  ${assertion}`, `});`, ``].join("\n");
}

describe("an assertion that names a refusal its module has not stated", () => {
  it("fails rather than accepting whatever the code happened to throw", () => {
    expectRefusal(() => expectRefusal(throwing(OTHER_REFUSAL), undefined), UNSTATED_REFUSAL);
  });

  it("fails on an empty message, which matches every error as surely as an absent one", () => {
    expectRefusal(() => expectRefusal(throwing(OTHER_REFUSAL), ""), NO_MESSAGE);
  });

  it("passes when the code refuses for the reason the assertion names", () => {
    expectRefusal(throwing(`the claim: ${REFUSAL} — src/missing.ts`), REFUSAL);
  });

  it("fails when the code refuses for a different reason, rather than passing on any throw", () => {
    expectRefusal(() => expectRefusal(throwing(OTHER_REFUSAL), REFUSAL), REFUSAL);
  });
});

describe("the shapes the scan condemns", () => {
  it("condemns a refusal asserted by a constant the file imports", () => {
    expect(
      vacuousThrowAssertionsIn(fixtureSource(`expect(check).toThrow(NO_SOURCE_FILE);`), FIXTURE),
    ).toStrictEqual([`${FIXTURE}: expect(check).toThrow(NO_SOURCE_FILE)`]);
  });

  it("condemns the same assertion written with the matcher's other spelling", () => {
    expect(
      vacuousThrowAssertionsIn(
        fixtureSource(`expect(check).toThrowError(NO_SOURCE_FILE);`),
        FIXTURE,
      ),
    ).toStrictEqual([`${FIXTURE}: expect(check).toThrowError(NO_SOURCE_FILE)`]);
  });

  it("condemns an assertion that names no message at all", () => {
    expect(
      vacuousThrowAssertionsIn(fixtureSource(`expect(check).toThrow();`), FIXTURE),
    ).toStrictEqual([`${FIXTURE}: expect(check).toThrow()`]);
  });

  it("says nothing about a message written where the file can be read", () => {
    expect(
      vacuousThrowAssertionsIn(fixtureSource(`expect(check).toThrow("does not exist");`), FIXTURE),
    ).toStrictEqual([]);
  });

  it("says nothing about a regular expression, which no absent export can spell", () => {
    expect(
      vacuousThrowAssertionsIn(fixtureSource(`expect(check).toThrow(/does not exist/);`), FIXTURE),
    ).toStrictEqual([]);
  });

  it("condemns an imported constant wrapped in `new RegExp`, which reads as the repair and is not", () => {
    expect(
      vacuousThrowAssertionsIn(
        fixtureSource(`expect(check).toThrow(new RegExp(NO_SOURCE_FILE));`),
        FIXTURE,
      ),
      "`new RegExp(undefined)` is `/(?:)/` — the empty pattern, a substring of every error message — so the wrapped form accepts any throw exactly as the bare one does",
    ).toStrictEqual([`${FIXTURE}: expect(check).toThrow(new RegExp(NO_SOURCE_FILE))`]);
  });

  it("condemns the same constant wrapped without `new`, which builds the identical pattern", () => {
    expect(
      vacuousThrowAssertionsIn(
        fixtureSource(`expect(check).toThrow(RegExp(NO_SOURCE_FILE));`),
        FIXTURE,
      ),
    ).toStrictEqual([`${FIXTURE}: expect(check).toThrow(RegExp(NO_SOURCE_FILE))`]);
  });

  it("says nothing about a pattern built from a message the file can be read for", () => {
    expect(
      vacuousThrowAssertionsIn(
        fixtureSource(`expect(check).toThrow(new RegExp("does not exist"));`),
        FIXTURE,
      ),
    ).toStrictEqual([]);
  });

  it("says nothing about a wrapped constant the file declares itself", () => {
    const source = [
      `const LOCAL = "does not exist";`,
      ``,
      `it("refuses", () => {`,
      `  expect(check).toThrow(new RegExp(LOCAL));`,
      `});`,
      ``,
    ].join("\n");

    expect(
      vacuousThrowAssertionsIn(source, FIXTURE),
      "a name the file declares cannot be the one its module forgot to export, wrapped or bare",
    ).toStrictEqual([]);
  });

  it("says nothing about an imported constant interpolated into a pattern, which fails loudly", () => {
    expect(
      vacuousThrowAssertionsIn(
        // A plain string, so the template literal reaches the fixture's parser unexpanded.
        fixtureSource("expect(check).toThrow(new RegExp(`${NO_SOURCE_FILE} at`));"),
        FIXTURE,
      ),
      "an absent export interpolates to the literal text `undefined`, which matches no real message — the assertion goes red rather than passing on anything",
    ).toStrictEqual([]);
  });

  it("says nothing about a constant the file declares itself", () => {
    const source = [
      `const LOCAL = "does not exist";`,
      ``,
      `it("refuses", () => {`,
      `  expect(check).toThrow(LOCAL);`,
      `});`,
      ``,
    ].join("\n");

    expect(
      vacuousThrowAssertionsIn(source, FIXTURE),
      "a name the file declares cannot be the one its module forgot to export",
    ).toStrictEqual([]);
  });

  it("says nothing about an assertion that the code does NOT throw", () => {
    expect(
      vacuousThrowAssertionsIn(fixtureSource(`expect(check).not.toThrow();`), FIXTURE),
      "`not.toThrow()` names the whole of what it asserts, and a message would narrow it wrongly",
    ).toStrictEqual([]);
  });

  it("reads every assertion in the file rather than the first", () => {
    const source = [
      IMPORTS_A_REFUSAL,
      ``,
      `it("refuses twice", () => {`,
      `  expect(check).toThrow(NO_SOURCE_FILE);`,
      `  expect(check).toThrow();`,
      `});`,
      ``,
    ].join("\n");

    expect(vacuousThrowAssertionsIn(source, FIXTURE)).toStrictEqual([
      `${FIXTURE}: expect(check).toThrow(NO_SOURCE_FILE)`,
      `${FIXTURE}: expect(check).toThrow()`,
    ]);
  });
});

describe("this package", () => {
  it("has more than one suite under scripts/ to scan, since a scan of nothing agrees with itself", () => {
    expect(vacuousThrowAssertions().scanned.length).toBeGreaterThan(1);
  });

  it("asserts every refusal its own gates make against a message the run can read", () => {
    expect(
      vacuousThrowAssertions().vacuous,
      "an imported constant its module never exported is `undefined` here, and `toThrow(undefined)` accepts any error at all — so the red-first run that was meant to prove the refusal proved nothing",
    ).toStrictEqual([]);
  });
});
