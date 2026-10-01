import { ChildProcess } from "node:child_process";
import { PassThrough } from "node:stream";

/**
 * What the fake binary answers. Absent fields are an empty stream and a clean exit; `unrunnable`
 * is a binary that is not on PATH, which Node reports as an `error` event and never as an exit.
 */
export type FakeChildReply = {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  unrunnable?: boolean;
};

/**
 * The child a mocked `spawn` hands back, for the specs that record what a host sends its binary.
 *
 * **A real `ChildProcess` that never started**, with two pass-through streams standing in for its
 * pipes. The return type is what lets `vi.mocked(spawn).mockImplementation(...)` type-check against
 * `spawn` itself: vitest types an implementation from the LAST overload, which answers
 * `ChildProcess`, so a hand-built object literal could only get there through an `as unknown as`
 * cast.
 *
 * The answer arrives on a later tick, because a caller subscribes after `spawn` returns — as it
 * must with a real child — and an answer delivered synchronously would reach no listener at all.
 * Each stream emits its text as one chunk and the close follows both.
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
