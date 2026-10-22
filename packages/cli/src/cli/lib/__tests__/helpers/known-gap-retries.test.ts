import { describe, expect, it } from "vitest";

import { knownGapsIn } from "./known-gap-retries.js";

const SPEC_FILE = "eject.e2e.test.ts";

const GAP_RUN_ONCE = [
  `it.fails("overwrites existing skills with --force", { retry: 0 }, async () => {`,
  `  expect(ejected).toContain("skills ejected");`,
  `});`,
  ``,
].join("\n");

const GAP_LEFT_TO_THE_CONFIG = [
  `it.fails("overwrites existing skills with --force", async () => {`,
  `  expect(ejected).toContain("skills ejected");`,
  `});`,
  ``,
].join("\n");

const GAP_RETRIED_BY_ITS_OWN_OPTIONS = [
  `it.fails("overwrites existing skills with --force", { retry: 1 }, async () => {});`,
  ``,
].join("\n");

const GAP_TIMED_BUT_LEFT_TO_THE_CONFIG = [
  `it.fails(`,
  `  "leaves out the skill a Codex global already holds",`,
  `  { timeout: TIMEOUTS.LIFECYCLE },`,
  `  async () => {},`,
  `);`,
  ``,
].join("\n");

const GAP_RUN_ONCE_BESIDE_A_TIMEOUT = [
  `describe("on a Codex installation", () => {`,
  `  // KNOWN GAP: the Codex global copy is not seen.`,
  `  it.fails(`,
  `    "leaves out the skill a Codex global already holds",`,
  `    { retry: 0, timeout: TIMEOUTS.LIFECYCLE },`,
  `    async () => {},`,
  `  );`,
  `});`,
  ``,
].join("\n");

const GAP_WITH_A_QUOTED_RETRY_KEY = [
  `it.fails("overwrites existing skills with --force", { "retry": 0 }, async () => {});`,
  ``,
].join("\n");

const EVERY_OTHER_KNOWN_GAP_FORM = [
  `test.fails("shows all skill ids", { retry: 0 }, async () => {});`,
  `it.concurrent.fails("tells CLI-managed skills from the user's", async () => {});`,
  `it.skipIf(onWindows).fails("fails on a broken template", { retry: 0 }, async () => {});`,
  ``,
].join("\n");

const NAMED_BUT_NEVER_CALLED = [
  `// it.fails("overwrites existing skills with --force", async () => {});`,
  `const shown = 'it.fails("overwrites existing skills with --force", async () => {})';`,
  ``,
].join("\n");

const NOT_A_KNOWN_GAP = [
  `it("overwrites existing skills with --force", { retry: 0 }, async () => {});`,
  `it.skip("shows all skill ids", async () => {});`,
  `it.todo("tells CLI-managed skills from the user's");`,
  `describe.skip("on a Codex installation", () => {});`,
  ``,
].join("\n");

const RETRY_FROM_A_CONSTANT = [
  `it.fails("overwrites existing skills with --force", { retry: NO_RETRY }, async () => {});`,
  ``,
].join("\n");

const OPTIONS_FROM_A_CONSTANT = [
  `it.fails("overwrites existing skills with --force", KNOWN_GAP_OPTIONS, async () => {});`,
  ``,
].join("\n");

const SPREAD_OPTIONS = [
  `it.fails("overwrites existing skills with --force", { ...LIFECYCLE }, async () => {});`,
  ``,
].join("\n");

const A_TABLE_OF_KNOWN_GAPS = [
  `it.fails.each([["react"], ["hono"]])("ejects %s", async () => {});`,
  ``,
].join("\n");

const A_KNOWN_GAP_HANDED_ON = [`const gap = asKnownGap(it.fails, "ejects react");`, ``].join("\n");

describe("knownGapsIn", () => {
  it("reads retry: 0 from a known gap's own options", () => {
    expect(knownGapsIn(GAP_RUN_ONCE, SPEC_FILE)).toStrictEqual([{ line: 1, retry: 0 }]);
  });

  it("reads a known gap with no options as setting no retry, which leaves the config's", () => {
    expect(knownGapsIn(GAP_LEFT_TO_THE_CONFIG, SPEC_FILE)).toStrictEqual([
      { line: 1, retry: null },
    ]);
  });

  it("reads a retry its own options set to something other than 0", () => {
    expect(knownGapsIn(GAP_RETRIED_BY_ITS_OWN_OPTIONS, SPEC_FILE)).toStrictEqual([
      { line: 1, retry: 1 },
    ]);
  });

  it("reads options that set only a timeout as setting no retry", () => {
    expect(knownGapsIn(GAP_TIMED_BUT_LEFT_TO_THE_CONFIG, SPEC_FILE)).toStrictEqual([
      { line: 1, retry: null },
    ]);
  });

  it("reads retry beside other options on a call spread over lines, at the line it starts", () => {
    expect(knownGapsIn(GAP_RUN_ONCE_BESIDE_A_TIMEOUT, SPEC_FILE)).toStrictEqual([
      { line: 3, retry: 0 },
    ]);
  });

  it("reads a retry under a quoted key", () => {
    expect(knownGapsIn(GAP_WITH_A_QUOTED_RETRY_KEY, SPEC_FILE)).toStrictEqual([
      { line: 1, retry: 0 },
    ]);
  });

  it("reads test.fails, and a known gap behind another modifier", () => {
    expect(knownGapsIn(EVERY_OTHER_KNOWN_GAP_FORM, SPEC_FILE)).toStrictEqual([
      { line: 1, retry: 0 },
      { line: 2, retry: null },
      { line: 3, retry: 0 },
    ]);
  });

  it("finds no known gap in a comment or a string naming one", () => {
    expect(knownGapsIn(NAMED_BUT_NEVER_CALLED, SPEC_FILE)).toStrictEqual([]);
  });

  it("finds no known gap in an ordinary test, a skip or a todo", () => {
    expect(knownGapsIn(NOT_A_KNOWN_GAP, SPEC_FILE)).toStrictEqual([]);
  });

  it("refuses a retry it cannot evaluate, naming the file and line", () => {
    expect(() => knownGapsIn(RETRY_FROM_A_CONSTANT, SPEC_FILE)).toThrow(
      `${SPEC_FILE}:1 gives a known gap a retry this reader cannot evaluate`,
    );
  });

  it("refuses options it cannot read, naming the file and line", () => {
    expect(() => knownGapsIn(OPTIONS_FROM_A_CONSTANT, SPEC_FILE)).toThrow(
      `${SPEC_FILE}:1 gives a known gap options this reader cannot read`,
    );
  });

  it("refuses spread options, which may carry a retry", () => {
    expect(() => knownGapsIn(SPREAD_OPTIONS, SPEC_FILE)).toThrow(
      `${SPEC_FILE}:1 spreads options into a known gap, which may carry a retry`,
    );
  });

  it("refuses a known gap it cannot read as one call, naming the file and line", () => {
    expect(() => knownGapsIn(A_TABLE_OF_KNOWN_GAPS, SPEC_FILE)).toThrow(
      `${SPEC_FILE}:1 marks a known gap in a form this reader cannot read`,
    );
  });

  it("refuses it.fails handed to another call rather than called itself", () => {
    expect(() => knownGapsIn(A_KNOWN_GAP_HANDED_ON, SPEC_FILE)).toThrow(
      `${SPEC_FILE}:1 marks a known gap in a form this reader cannot read`,
    );
  });
});
