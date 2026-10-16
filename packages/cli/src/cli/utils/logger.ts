// Logging utility for lib/ modules that don't have access to oclif command context.
// In oclif commands, prefer using this.log() instead.

import { AsyncLocalStorage } from "node:async_hooks";

let verboseMode = false;

export function setVerbose(enabled: boolean): void {
  verboseMode = enabled;
}

export function verbose(msg: string): void {
  if (verboseMode) {
    console.log(`  ${msg}`);
  }
}

// Always visible (not gated by verbose mode).
// Used for user-facing progress output: compilation ticks, summaries, validation results.
export function log(msg: string): void {
  console.log(msg);
}

// --- Startup message buffering ---
// When buffer mode is enabled, warn() pushes messages into a buffer instead of
// writing to stderr, for the caller to drain.

/** What `warn()` buffers — the only call that buffers, so the only level there is. */
export type StartupMessage = {
  level: "warn";
  text: string;
};

let bufferMode = false;
let messageBuffer: StartupMessage[] = [];

/** Every warning this process has printed. */
const alreadySaid = new Set<string>();

/** Set across a call tree run by {@link sayingEachWarningOnce}. */
const eachWarningOnce = new AsyncLocalStorage<true>();

export function enableBuffering(): void {
  bufferMode = true;
  messageBuffer = [];
}

export function drainBuffer(): StartupMessage[] {
  const messages = [...messageBuffer];
  messageBuffer = [];
  return messages;
}

export function disableBuffering(): void {
  bufferMode = false;
  messageBuffer = [];
}

// Always visible (not gated by verbose mode).
// Used for issues the user should know about, like unresolved references.
//
// Error/warning message style guide:
//   - Start with a capital letter (restructure if it would capitalize a function name)
//   - End with a period if it's a complete sentence
//   - End without a period if it's a fragment (e.g., "Skipping 'foo': missing SKILL.md")
//   - Wrap dynamic values in single quotes: 'value' (not bare or double-quoted)
//   - Do NOT prefix the message with "Warning:" — this function adds it automatically
//   - After a colon, use lowercase (e.g., "Skipping 'foo': invalid frontmatter")
//   - Use em dash for supplemental info (e.g., "Missing category — defaulting to 'local'")
export function warn(msg: string): void {
  if (isARepeatToHoldBack(msg)) return;
  if (bufferMode) {
    messageBuffer.push({ level: "warn", text: msg });
    return;
  }
  alreadySaid.add(msg);
  console.warn(`  Warning: ${msg}`);
}

/**
 * Inside {@link sayingEachWarningOnce}, a warning already printed or already held in the buffer
 * waiting to be.
 */
function isARepeatToHoldBack(msg: string): boolean {
  if (eachWarningOnce.getStore() !== true) return false;
  return alreadySaid.has(msg) || messageBuffer.some((message) => message.text === msg);
}

/**
 * Runs `body` with every warning it raises said at most once per process: one already printed, or
 * already held in the buffer, is not said again.
 *
 * For warnings about the ENVIRONMENT rather than about the work in hand — a file on disk that will
 * not parse says the same thing however many passes read it, and said twice it reads as two faults.
 *
 * Keyed by the message, so two different causes are both still said. There is deliberately no
 * reset: the scope is one CLI invocation. A spec in this process that asserts on one of these
 * lines has to say something no earlier spec in its file said, which a path under its own
 * temporary directory does — nor an earlier attempt of itself, so one asserting "said once" sits
 * in a vitest project without `retry`, where a failed first attempt cannot turn the retry green.
 */
export function sayingEachWarningOnce<T>(body: () => T): T {
  return eachWarningOnce.run(true, body);
}

/**
 * The same warning, said once however many times this process reaches the line that says it.
 *
 * One unreadable entry in a user's own Codex marketplace registry fails every listing verb Codex
 * has, and a single `doctor` run asks for a listing from plugin discovery and from skill discovery.
 */
export function warnOnce(msg: string): void {
  sayingEachWarningOnce(() => warn(msg));
}
