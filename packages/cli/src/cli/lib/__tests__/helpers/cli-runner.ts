import path from "path";
import { fileURLToPath } from "url";
import { run, Errors } from "@oclif/core";
import ansis from "ansis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CLI_ROOT = path.resolve(__dirname, "../../../../..");

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
    error,
  };
}
