import { elementAt } from "./element-at.js";

/** Every occurrence lands in one field; unknown forms go to `unrecognised` rather than vanish. */
export type EnvReads = {
  named: string[];
  /** Identifiers in `process.env[X]`; each one's value is the variable's name. */
  viaConstant: string[];
  /** Count of `...process.env` spreads. */
  wholeObject: number;
  unrecognised: string[];
};

const ENV_OBJECT = "process.env";
const SPREAD = "...";

const CONTEXT_CHARS = 24;

const NAMED_BY_DOT = /^\.([A-Za-z_$][\w$]*)/;
const NAMED_BY_LITERAL = /^\[\s*["']([^"']+)["']\s*\]/;
const VIA_CONSTANT = /^\[\s*([A-Za-z_$][\w$]*)\s*\]/;

function captured(match: RegExpExecArray): string {
  return elementAt(match, 1);
}

function occurrencesIn(source: string): number[] {
  const found: number[] = [];
  for (let at = source.indexOf(ENV_OBJECT); at !== -1; at = source.indexOf(ENV_OBJECT, at + 1)) {
    found.push(at);
  }
  return found;
}

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
