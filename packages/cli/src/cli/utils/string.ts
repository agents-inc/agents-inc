/*
 * `no-control-regex` bans exactly the characters the five patterns below exist to match, and it is
 * right everywhere else in this package — a control character in a regex is almost always someone
 * pasting a byte they did not mean to. The rule takes no options, so there is no `^_`-style escape
 * hatch to reach for: matching a control character deliberately and matching one by accident are
 * the same expression to it.
 *
 * Kept INLINE rather than moved into `eslint.config.js`, which is the opposite of the usual call
 * and is the point of the row this came from. An override would permit control-character regexes
 * anywhere in the package, and what makes this a sanitiser rather than a patch per site is that
 * there is one of it. The next such regex SHOULD be reported, and this disable is what leaves the
 * rule able to report it.
 */
/* eslint-disable no-control-regex */

/**
 * An operating-system command — window title, hyperlink, clipboard write — and the payload it
 * carries. BEL and ST (`ESC \`) are the two terminators a terminal takes; end-of-input is the
 * third alternative here because a terminal reading an UNTERMINATED one swallows everything after
 * it waiting for a terminator that never arrives. A tail left behind is a tail nobody would see.
 */
const OSC = /\u001B\][\s\S]*?(?:\u0007|\u001B\\|$)/;

/**
 * A control sequence: cursor movement, erase-line, scroll region, colour. Parameter bytes, then
 * intermediate bytes, then a final byte — and the final byte is OPTIONAL so that a sequence left
 * incomplete is removed too. A terminal holds a fragment open and reads whatever follows as its
 * parameters, which makes half a sequence worse than a whole one rather than safer.
 */
const CSI = /\u001B\[[0-?]*[ -/]*[@-~]?/;

/**
 * Every other escape — charset selection, `ESC c` full reset — and a bare one at the end of the
 * text. `.` deliberately does not match a newline, so `ESC` before a line break costs the escape
 * and not the break.
 */
const OTHER_ESCAPE = /\u001B.?/;

/** The same introducers as single 8-bit bytes, which some terminals honour, and the rest of C1. */
const C1 = /[\u0080-\u009F]/;

/**
 * The C0 controls and DEL, less the only two that appear in text a person wrote: tab and
 * newline. Everything else in the range either moves the cursor (carriage return,
 * backspace, vertical tab, form feed) or is a protocol byte, and none of them belong in prose.
 *
 * Carriage return is the one worth naming, because it is half of the reproduction this exists
 * for: on its own it returns the cursor to column zero and lets what follows overwrite the line
 * the CLI just printed in its own voice. Dropping it also turns a `CRLF` body into a `LF` one,
 * which is the right answer twice over — the line break survives and the cursor move does not.
 */
const C0 = /[\u0000-\u0008\u000B-\u001F\u007F]/;

/* eslint-enable no-control-regex */

/**
 * One pattern matching whichever of the constructs above comes first at each position.
 *
 * Global, because the point is to remove every occurrence rather than to find one. Safe to hold at
 * module scope despite that flag: `String.prototype.replace` resets `lastIndex` on a global regex,
 * and nothing here calls `test` or `exec`, which are the two that would carry state between calls.
 */
function anyOf(patterns: RegExp[]): RegExp {
  return new RegExp(patterns.map((pattern) => pattern.source).join("|"), "g");
}

/**
 * Ordered longest-construct-first, which is load-bearing rather than tidy: alternation is tried
 * left to right at each position, so {@link OTHER_ESCAPE} listed before {@link CSI} would eat the
 * `[` and leave the parameters behind as text.
 */
const TERMINAL_CONTROLS = anyOf([OSC, CSI, OTHER_ESCAPE, C1, C0]);

/**
 * Text a terminal will PRINT, out of text it would otherwise OBEY.
 *
 * For anything this CLI did not author: a body off the wire, whatever arrived on stdin, and the
 * metadata in a skills repository somebody else wrote — which is the reachable one, because
 * `--marketplace` is a supported input rather than an attack. A short body carrying `ESC[2K` and
 * a carriage return repaints the line the CLI printed above it, so a store's refusal can forge a
 * sentence in the CLI's own voice, and nothing here stripped it.
 *
 * It reproduces the terminal's OWN parse rather than the sentence a reader sees, so what goes is
 * every byte a terminal would have swallowed as part of a sequence — not the escape characters
 * alone. {@link CSI} consumes an unbounded run of printable parameter and intermediate bytes after
 * `ESC[`, and an unterminated {@link OSC} runs to the end of the input, both of which a terminal
 * would have consumed identically. Printable text lost that way was never going to be printed.
 *
 * What it does not do is edit prose. A forged sentence carrying no controls survives whole, which
 * is the whole point — deciding what a store is allowed to SAY is not this function's business, and
 * a sanitiser that rewrote wording would be unreadable the first time an honest body tripped it.
 *
 * Newline and tab survive, and that direction of error is the one worth guarding: a multi-line
 * zod message is what the store really writes on the share route, and a sanitiser strict enough
 * to flatten it mangles every honest refusal to stop a rare hostile one. This is the CLI half of
 * a threat the editor settled by rendering the same foreign text through a React-escaped `<pre>`.
 */
export function stripTerminalControls(text: string): string {
  return text.replace(TERMINAL_CONTROLS, "");
}

/**
 * Foreign text, made inert and then bounded — in that order, which is the part that matters.
 *
 * Stripping FIRST is a correctness requirement, not a preference. A cut taken first can land
 * inside an escape sequence, and what it leaves is a fragment a terminal holds open, reading the
 * ellipsis and whatever the caller prints next as the sequence's missing parameters. The order is
 * owned here rather than left to callers precisely because there is a wrong way round to do it.
 *
 * It also decides what the budget buys. Escape bytes are invisible, so a budget spent on them
 * buys a reader nothing; measured after the strip, every character it allows is one somebody can
 * actually read.
 *
 * Every call site is text this CLI did not write — a refusal off the wire, an excerpt of stdin, a
 * rule author's `reason`, a catalogue description — so the strip belongs to the function they all
 * already call rather than to each of them separately. Where foreign text needs no bound,
 * {@link stripTerminalControls} is the same guarantee on its own.
 */
export function truncateText(text: string, maxLength: number): string {
  const inert = stripTerminalControls(text);
  if (inert.length <= maxLength) return inert;
  return inert.slice(0, maxLength - 1) + "\u2026";
}

/** Converts a kebab-case string to a space-separated Title Case string. */
export function toTitleCase(kebabCase: string): string {
  return kebabCase
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Locale-free string ordering for anything emitted into a file somebody commits.
 *
 * Declared in `@workspace/compile` because the emitters moved there — `generateStackAgentConfig`
 * orders a config-types.ts property list with it — and re-exported here so no CLI call site
 * moved. The reason it is not `localeCompare` lives with the declaration.
 */
export { bytewise } from "@workspace/compile";
