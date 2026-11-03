import { matchedAsWritten } from "./matched-as-written.js";

/** Either ending: a pseudo-terminal writes each `\n` as `\r\n`. */
const LINE_BREAK = String.raw`\r?\n`;
const REST_OF_LINE = String.raw`[^\r\n]*`;
const ENTRY_LINE = `${LINE_BREAK} {2}(?! )`;
const REMEDY_LINE = `${LINE_BREAK} {4}`;

/**
 * The heading is written out rather than read off the product, so a reworded heading reddens the
 * specs.
 */
export function workOwedEntry(failures: number, named: string, remedy: string): RegExp {
  const counted = `${failures} ${failures === 1 ? "failure" : "failures"}`;
  const heading = `Completed with ${counted} — the changes above landed, these did not:`;
  const anyEntry = `${ENTRY_LINE}${REST_OF_LINE}${REMEDY_LINE}${REST_OF_LINE}`;
  const entryNaming = `${ENTRY_LINE}${REST_OF_LINE}${matchedAsWritten(named)}${REST_OF_LINE}`;
  const remedyHolding = `${REMEDY_LINE}${REST_OF_LINE}${matchedAsWritten(remedy)}`;

  return new RegExp(`${matchedAsWritten(heading)}(?:${anyEntry})*?${entryNaming}${remedyHolding}`);
}
