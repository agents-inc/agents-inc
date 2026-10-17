// Inline, not in eslint.config.js: matching control characters is this sanitiser's job alone.
/* eslint-disable no-control-regex */

// OSC; end-of-input terminates too, since an unterminated one swallows everything after it.
const OSC = /\u001B\][\s\S]*?(?:\u0007|\u001B\\|$)/;

// CSI; the final byte is optional so an incomplete sequence is removed too.
const CSI = /\u001B\[[0-?]*[ -/]*[@-~]?/;

// `.` skips newline, so ESC before a line break costs only the escape.
const OTHER_ESCAPE = /\u001B.?/;

const C1 = /[\u0080-\u009F]/;

// C0 and DEL, except tab and newline.
const C0 = /[\u0000-\u0008\u000B-\u001F\u007F]/;

/* eslint-enable no-control-regex */

// Global is safe at module scope: `replace` resets `lastIndex`.
function anyOf(patterns: RegExp[]): RegExp {
  return new RegExp(patterns.map((pattern) => pattern.source).join("|"), "g");
}

// Order matters: OTHER_ESCAPE before CSI would eat the `[` and leave the parameters as text.
const TERMINAL_CONTROLS = anyOf([OSC, CSI, OTHER_ESCAPE, C1, C0]);

/** Removes every byte a terminal would consume as a control sequence; tab and newline survive. */
export function stripTerminalControls(text: string): string {
  return text.replace(TERMINAL_CONTROLS, "");
}

/** Strips terminal controls first, so the cut can never land inside an escape sequence. */
export function truncateText(text: string, maxLength: number): string {
  const inert = stripTerminalControls(text);
  if (inert.length <= maxLength) return inert;
  return inert.slice(0, maxLength - 1) + "\u2026";
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function toTitleCase(kebabCase: string): string {
  return kebabCase
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export { bytewise } from "@workspace/compile";
