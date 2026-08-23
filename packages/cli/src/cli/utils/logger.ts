// Logging utility for lib/ modules that don't have access to oclif command context.
// In oclif commands, prefer using this.log() instead.

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
// When buffer mode is enabled (before Ink takes over the terminal), warn() pushes
// messages into a buffer instead of writing to stderr. The buffer is drained and
// handed to the wizard, which paints it as a band above the step — stderr is what
// the wizard's clearTerminal wipes, so a line written there is a line lost.

export type StartupMessage = {
  level: "info" | "warn" | "error";
  text: string;
};

let bufferMode = false;
let messageBuffer: StartupMessage[] = [];

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
export type WarnOptions = {
  /**
   * When true, suppresses this warning in a UNIT run — the gate reads `VITEST` from the
   * environment of the process evaluating it, so it can only ever mean that. Every E2E runner
   * hands the spawned binary `VITEST: undefined`, so an E2E run of the real binary is a test
   * environment in which this warning IS printed. Which runners those are is not a number worth
   * carrying here — it said "Both" while there were three, and the third was clearing nothing at
   * all; `src/cli/lib/__tests__/e2e-runner-environment.test.ts` derives the roster and is the
   * only place that count is correct by construction.
   */
  suppressInTest?: boolean;
};

export function warn(msg: string, options?: WarnOptions): void {
  if (options?.suppressInTest && process.env.VITEST) {
    return;
  }
  if (bufferMode) {
    messageBuffer.push({ level: "warn", text: msg });
    return;
  }
  console.warn(`  Warning: ${msg}`);
}
