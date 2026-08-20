import { elementAt } from "./element-at.js";

/**
 * Every way one source file touches `process.env`, split by whether the touch names a variable.
 *
 * `unrecognised` is the load-bearing field. A reader that silently dropped the forms it did not
 * know would report a clean roster for a file full of reads it could not see, and a gate built on
 * it would be green for exactly that reason — so every occurrence lands in one of these four and
 * the caller decides what an unknown form means.
 */
export type EnvReads = {
  /** Variables the source spells out: `process.env.NAME`, `process.env["NAME"]`. */
  named: string[];
  /** Identifiers a bracket read goes through — each one's VALUE is the variable's name. */
  viaConstant: string[];
  /** `...process.env` — names no variable and forwards every one of them. */
  wholeObject: number;
  /** Occurrences none of the above explains, each with the text that follows it. */
  unrecognised: string[];
};

const ENV_OBJECT = "process.env";
const SPREAD = "...";

/** Enough of what follows an occurrence to say what shape it was, when nothing else can. */
const CONTEXT_CHARS = 24;

const NAMED_BY_DOT = /^\.([A-Za-z_$][\w$]*)/;
const NAMED_BY_LITERAL = /^\[\s*["']([^"']+)["']\s*\]/;
const VIA_CONSTANT = /^\[\s*([A-Za-z_$][\w$]*)\s*\]/;

/** The one group an anchored, single-group match captured. */
function captured(match: RegExpExecArray): string {
  return elementAt(match, 1);
}

/** Where every `process.env` sits in this source, in order. */
function occurrencesIn(source: string): number[] {
  const found: number[] = [];
  for (let at = source.indexOf(ENV_OBJECT); at !== -1; at = source.indexOf(ENV_OBJECT, at + 1)) {
    found.push(at);
  }
  return found;
}

/** Reads `source` for every `process.env` touch it holds. Order is the file's; duplicates stay. */
export function envReadsIn(source: string): EnvReads {
  const reads: EnvReads = { named: [], viaConstant: [], wholeObject: 0, unrecognised: [] };

  for (const at of occurrencesIn(source)) {
    const after = source.slice(at + ENV_OBJECT.length);
    const byDot = NAMED_BY_DOT.exec(after);
    const byLiteral = NAMED_BY_LITERAL.exec(after);
    const byConstant = VIA_CONSTANT.exec(after);

    if (byDot) reads.named.push(captured(byDot));
    else if (byLiteral) reads.named.push(captured(byLiteral));
    else if (byConstant) reads.viaConstant.push(captured(byConstant));
    else if (source.slice(Math.max(0, at - SPREAD.length), at) === SPREAD) reads.wholeObject += 1;
    else reads.unrecognised.push(`${ENV_OBJECT}${after.slice(0, CONTEXT_CHARS)}`);
  }

  return reads;
}
