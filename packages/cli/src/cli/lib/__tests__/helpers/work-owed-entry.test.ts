import { describe, expect, it } from "vitest";

import { workOwedEntry } from "./work-owed-entry.js";

const ONE_FAILURE = "Completed with 1 failure — the changes above landed, these did not:";
const TWO_FAILURES = "Completed with 2 failures — the changes above landed, these did not:";

const PLUGIN = "web-framework-react@acme";
const REMEDY = "enabled = false";

const PLUGIN_ENTRY = [`  Plugin ${PLUGIN} is switched on again`, `    Set ${REMEDY} in its table`];
const COMPILE_ENTRY = ["  Could not compile web-developer", "    Run compile again"];

function closingList(heading: string, ...entryLines: string[]): string {
  return ["", heading, ...entryLines, "", ""].join("\n");
}

describe("workOwedEntry", () => {
  it("matches the only entry, naming the subject, with the remedy on the line under it", () => {
    expect(closingList(ONE_FAILURE, ...PLUGIN_ENTRY)).toMatch(workOwedEntry(1, PLUGIN, REMEDY));
  });

  it("matches an entry listed after another", () => {
    expect(closingList(TWO_FAILURES, ...COMPILE_ENTRY, ...PLUGIN_ENTRY)).toMatch(
      workOwedEntry(2, PLUGIN, REMEDY),
    );
  });

  it("matches a pseudo-terminal's line endings", () => {
    expect(closingList(ONE_FAILURE, ...PLUGIN_ENTRY).replaceAll("\n", "\r\n")).toMatch(
      workOwedEntry(1, PLUGIN, REMEDY),
    );
  });

  it("does not match a heading counting another number of failures", () => {
    expect(closingList(ONE_FAILURE, ...PLUGIN_ENTRY)).not.toMatch(workOwedEntry(2, PLUGIN, REMEDY));
    expect(closingList(TWO_FAILURES, ...COMPILE_ENTRY, ...PLUGIN_ENTRY)).not.toMatch(
      workOwedEntry(1, PLUGIN, REMEDY),
    );
  });

  it("does not match a subject and remedy named above the list rather than in it", () => {
    const output = [
      `Warning: Codex switched plugin ${PLUGIN} back on. To switch it off, set ${REMEDY}.`,
      closingList(ONE_FAILURE, ...COMPILE_ENTRY),
    ].join("\n");

    expect(output).not.toMatch(workOwedEntry(1, PLUGIN, REMEDY));
  });

  it("does not match a remedy that sits under another entry", () => {
    const output = closingList(
      TWO_FAILURES,
      `  Plugin ${PLUGIN} is switched on again`,
      "    Run doctor",
      "  Could not compile web-developer",
      `    Set ${REMEDY} in its table`,
    );

    expect(output).not.toMatch(workOwedEntry(2, PLUGIN, REMEDY));
  });

  it("does not match a remedy written on the entry's own line", () => {
    const output = closingList(
      ONE_FAILURE,
      `  Plugin ${PLUGIN} is switched on again: set ${REMEDY}`,
      "    Run doctor",
    );

    expect(output).not.toMatch(workOwedEntry(1, PLUGIN, REMEDY));
  });

  it("does not read a remedy line as an entry", () => {
    const output = closingList(
      TWO_FAILURES,
      "  Could not compile web-developer",
      `    Switch ${PLUGIN} off`,
      "  Could not copy react",
      `    Set ${REMEDY} in its table`,
    );

    expect(output).not.toMatch(workOwedEntry(2, PLUGIN, REMEDY));
  });

  it("matches the subject as written, not as a pattern", () => {
    const output = closingList(
      ONE_FAILURE,
      "  Plugin web-framework-react@acmeXio is switched on again",
      `    Set ${REMEDY} in its table`,
    );

    expect(output).not.toMatch(workOwedEntry(1, "web-framework-react@acme.io", REMEDY));
  });
});
