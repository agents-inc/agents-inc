import type { ChildProcess } from "node:child_process";
import { describe, expect, it } from "vitest";

import { fakeChildProcess } from "./fake-child-process.js";

/** Everything a caller of `spawn` can observe about one child, in the order it arrived. */
type Observed = { events: string[]; stdout: string; stderr: string };

/** Subscribes the way `execCommand` does, then waits for the child to finish one way or the other. */
function observe(child: ChildProcess): Promise<Observed> {
  const observed: Observed = { events: [], stdout: "", stderr: "" };
  return new Promise((resolve) => {
    child.stdout?.on("data", (chunk: Buffer) => {
      observed.events.push("stdout");
      observed.stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      observed.events.push("stderr");
      observed.stderr += chunk.toString();
    });
    child.on("close", (code) => {
      observed.events.push(`close ${String(code)}`);
      resolve(observed);
    });
    child.on("error", (error) => {
      observed.events.push(`error ${error.message}`);
      resolve(observed);
    });
  });
}

describe("fakeChildProcess", () => {
  it("delivers both streams and then the exit code it was given", async () => {
    const child = fakeChildProcess({ stdout: "out", stderr: "err", exitCode: 3 });

    expect(await observe(child)).toStrictEqual({
      events: ["stdout", "stderr", "close 3"],
      stdout: "out",
      stderr: "err",
    });
  });

  it("answers empty streams and a clean exit when the reply names nothing", async () => {
    expect(await observe(fakeChildProcess())).toStrictEqual({
      events: ["stdout", "stderr", "close 0"],
      stdout: "",
      stderr: "",
    });
  });

  it("reports an unrunnable binary as an error and never as an exit", async () => {
    const child = fakeChildProcess({ unrunnable: true, exitCode: 0 });

    expect(await observe(child)).toStrictEqual({
      events: ["error spawn ENOENT"],
      stdout: "",
      stderr: "",
    });
  });
});
