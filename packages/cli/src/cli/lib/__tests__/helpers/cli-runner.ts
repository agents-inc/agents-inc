import path from "path";
import { fileURLToPath } from "url";
import { run, Errors } from "@oclif/core";
import ansis from "ansis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CLI_ROOT = path.resolve(__dirname, "../../../../..");

/**
 * The refusal oclif's parser prints for a flag a command has not declared, for the
 * given spelling — long or short. A spec proving a flag IS declared negates this;
 * one proving a flag was withdrawn asserts it.
 *
 * Built here rather than spelled at each call site because the space after the
 * colon is load-bearing: a site that loses it negates a string the parser can
 * never print, and the assertion goes silently vacuous again. `e2e/pages/
 * terminal-screen.ts` carries the same string as `PARSE_REFUSAL` for the PTY
 * harness, which cannot import from this tree.
 */
export function parseRefusal(flag: string): string {
  return `Nonexistent flag: ${flag}`;
}

/**
 * The refusal oclif's parser prints when a command is invoked without a positional
 * argument it declares `required` — `Missing 1 required arg:`. A spec proving a
 * command declares NO required positional negates the one-arg spelling, which is
 * what a first required argument would produce.
 *
 * The count sits inside the message rather than after it, so a call site spelling
 * the string by hand elides it — `missing required arg` is not a substring of
 * anything the parser prints, and the negative it feeds can never fail.
 */
export function missingArgsRefusal(count: number): string {
  return `Missing ${count} required arg`;
}

/**
 * The refusal oclif's parser prints for a positional argument outside the `options`
 * its command declares — `Expected config to be one of: agent-partials, templates,
 * skills, all`. A spec proving a value IS a declared option negates it.
 *
 * This is the argument-side counterpart of {@link parseRefusal}: the value is named
 * inside the message, so it is the only form of the refusal that distinguishes one
 * rejected option from another. `eject` is the only command declaring `options`
 * today, and the string lives here beside its sibling so the next one finds it.
 */
export function argOptionRefusal(value: string): string {
  return `Expected ${value} to be one of:`;
}

function makeCapturingWrite(buf: string[]): typeof process.stdout.write {
  return function (str: unknown, encoding?: unknown, cb?: unknown): boolean {
    buf.push(String(str));
    if (typeof encoding === "function") {
      (encoding as () => void)();
    } else if (typeof cb === "function") {
      (cb as () => void)();
    }
    return true;
  };
}

function makeCapturingConsoleMethod(buf: string[]): (...args: unknown[]) => void {
  return (...consoleArgs: unknown[]) => {
    buf.push(consoleArgs.map(String).join(" ") + "\n");
  };
}

/**
 * Run a CLI command and capture its output.
 *
 * Bun's `console.log` does not go through `process.stdout.write`, so
 * `@oclif/test`'s `runCommand` (which only intercepts `process.stdout.write`)
 * returns empty stdout/stderr in bun. This helper intercepts both layers
 * to work correctly in both Node.js and bun environments.
 */
export async function runCliCommand(args: string[]) {
  // These two are saved to be assigned straight back onto the same object in
  // the finally block below, so each is called with the receiver it came from.
  // Binding here would restore a wrapper rather than the original method.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
  const origStdoutWrite = process.stdout.write;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
  const origStderrWrite = process.stderr.write;
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  const stdoutBuf: string[] = [];
  const stderrBuf: string[] = [];

  // Intercept process.stdout/stderr.write (Node.js path)
  process.stdout.write = makeCapturingWrite(stdoutBuf);
  process.stderr.write = makeCapturingWrite(stderrBuf);

  // Intercept console methods (bun path — console.log bypasses process.stdout.write)
  console.log = makeCapturingConsoleMethod(stdoutBuf);
  console.warn = makeCapturingConsoleMethod(stderrBuf);
  console.error = makeCapturingConsoleMethod(stderrBuf);

  let error: (Error & Partial<Errors.CLIError>) | undefined;
  try {
    await run(args, { root: CLI_ROOT });
  } catch (e) {
    if (e instanceof Error) {
      error = Object.assign(e, { message: ansis.strip(e.message) });
    }
  } finally {
    process.stdout.write = origStdoutWrite;
    process.stderr.write = origStderrWrite;
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  }

  return {
    stdout: stdoutBuf.map((s) => ansis.strip(s)).join(""),
    stderr: stderrBuf.map((s) => ansis.strip(s)).join(""),
    // The same bytes the command really wrote, and the only reading an assertion about ESCAPES
    // can be made against. `stdout` above has been through `ansis.strip`, so
    // `expect(stdout).not.toContain(ESCAPE)` cannot fail whatever the command wrote — the
    // harness removed the escape before the assertion saw it. Every spec asserting on WORDS
    // should keep using `stdout`, which is why the strip is the default rather than the
    // exception: a spec about output text should not have to know whether the run had colour.
    rawStdout: stdoutBuf.join(""),
    error,
  };
}
