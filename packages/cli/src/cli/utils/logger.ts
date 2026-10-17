// For lib/ modules without oclif command context; commands use this.log().

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

export function log(msg: string): void {
  console.log(msg);
}

// In buffer mode, warn() queues messages for the caller to drain instead of writing to stderr.

export type StartupMessage = {
  level: "warn";
  text: string;
};

let bufferMode = false;
let messageBuffer: StartupMessage[] = [];

const alreadySaid = new Set<string>();

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

/** Adds the `Warning:` prefix itself; quote dynamic values in single quotes. */
export function warn(msg: string): void {
  if (isARepeatToHoldBack(msg)) return;
  if (bufferMode) {
    messageBuffer.push({ level: "warn", text: msg });
    return;
  }
  alreadySaid.add(msg);
  console.warn(`  Warning: ${msg}`);
}

function isARepeatToHoldBack(msg: string): boolean {
  if (eachWarningOnce.getStore() !== true) return false;
  return alreadySaid.has(msg) || messageBuffer.some((message) => message.text === msg);
}

/**
 * Says each distinct warning `body` raises at most once per process (printed or buffered).
 * No reset: the scope is one CLI invocation, so specs asserting on these lines need unique text.
 */
export function sayingEachWarningOnce<T>(body: () => T): T {
  return eachWarningOnce.run(true, body);
}

export function warnOnce(msg: string): void {
  sayingEachWarningOnce(() => warn(msg));
}
