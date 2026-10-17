import { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";

/** `unrunnable` is a binary not on PATH: Node reports an `error` event, never an exit. */
export type FakeChildReply = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  unrunnable?: boolean;
};

/**
 * A real, never-started `ChildProcess`, so the mock type-checks against `spawn` without a cast.
 * It answers on a later tick, because callers subscribe after `spawn` returns.
 */
export function fakeChildProcess(reply: FakeChildReply = {}): ChildProcess {
  const child = new ChildProcess();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  child.stdout = stdout;
  child.stderr = stderr;

  setTimeout(() => {
    if (reply.unrunnable) {
      child.emit("error", new Error("spawn ENOENT"));
      return;
    }
    stdout.emit("data", Buffer.from(reply.stdout ?? ""));
    stderr.emit("data", Buffer.from(reply.stderr ?? ""));
    child.emit("close", reply.exitCode ?? 0);
  }, 0);

  return child;
}
