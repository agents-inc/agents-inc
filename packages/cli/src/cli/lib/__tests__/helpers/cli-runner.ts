import path from "path";
import { fileURLToPath } from "url";
import { run, Errors } from "@oclif/core";
import ansis from "ansis";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CLI_ROOT = path.resolve(__dirname, "../../../../..");

/** oclif's refusal for an undeclared flag; the space after the colon is load-bearing. */
export function parseRefusal(flag: string): string {
  return `Nonexistent flag: ${flag}`;
}

/** oclif's refusal for a missing required positional; the count sits inside the message. */
export function missingArgsRefusal(count: number): string {
  return `Missing ${count} required arg`;
}

/** oclif's refusal for a positional value outside the command's declared `options`. */
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

type CapturedOutput = { stdout: string[]; stderr: string[]; restore: () => void };

/** Also captures `console.*`, which bun does not route through `process.stdout.write`. */
function captureProcessOutput(): CapturedOutput {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
  const origStdoutWrite = process.stdout.write;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- restored, not called
  const origStderrWrite = process.stderr.write;
  const origLog = console.log;
  const origWarn = console.warn;
  const origError = console.error;

  const stdout: string[] = [];
  const stderr: string[] = [];

  process.stdout.write = makeCapturingWrite(stdout);
  process.stderr.write = makeCapturingWrite(stderr);
  console.log = makeCapturingConsoleMethod(stdout);
  console.warn = makeCapturingConsoleMethod(stderr);
  console.error = makeCapturingConsoleMethod(stderr);

  return {
    stdout,
    stderr,
    restore: () => {
      process.stdout.write = origStdoutWrite;
      process.stderr.write = origStderrWrite;
      console.log = origLog;
      console.warn = origWarn;
      console.error = origError;
    },
  };
}

async function runReportingFailure(
  args: string[],
): Promise<(Error & Partial<Errors.CLIError>) | undefined> {
  try {
    await run(args, { root: CLI_ROOT });
    return undefined;
  } catch (e) {
    return e instanceof Error ? Object.assign(e, { message: ansis.strip(e.message) }) : undefined;
  }
}

function joinStripped(chunks: string[]): string {
  return chunks.map((chunk) => ansis.strip(chunk)).join("");
}

export async function runCliCommand(args: string[]) {
  const output = captureProcessOutput();
  const error = await runReportingFailure(args).finally(output.restore);

  return {
    stdout: joinStripped(output.stdout),
    stderr: joinStripped(output.stderr),
    // Unstripped: the only reading an assertion about ANSI escapes can be made against.
    rawStdout: output.stdout.join(""),
    error,
  };
}
