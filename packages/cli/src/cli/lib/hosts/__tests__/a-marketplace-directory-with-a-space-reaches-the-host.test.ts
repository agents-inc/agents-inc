import os from "os";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { claudePluginMarketplaceAdd } from "../claude-host.js";
import { codexMarketplaceAdd } from "../codex-host.js";
import { fakeChildProcess } from "./helpers/fake-child-process.js";

/**
 * A marketplace directory whose path contains a space, against the check that stands between it
 * and the binary.
 *
 * **A directory's name is the filesystem's to decide.** `validateMarketplaceSource` in
 * `utils/exec.ts` held every marketplace source to `/^[a-zA-Z0-9._@\/:~-]+$/` — a pattern written
 * for a REFERENCE a user types (`owner/repo`, `github:org/repo`) — and so refused a DIRECTORY on
 * any machine whose home is `/Users/My Name` or `C:\Users\My Name`, although the host had no
 * objection to it. Measured on the pinned `@openai/codex` 0.155.1, 2026-09-23, with `HOME` and
 * `CODEX_HOME` pinned to a scratch tree whose path contains a space: `codex plugin marketplace add
 * '<scratch>/My Home/…' --json` exits 0.
 *
 * **There is no shell for the value to be re-read by**, which is the other half of why the class
 * was refusing nothing: `execCommand` in `utils/exec.ts` calls `spawn(command, args)` and never
 * passes `shell`, so the source is one element of an argument vector and the binary is handed it
 * as data. The class stays on for a typed reference all the same — it is what refuses a value that
 * is not a reference at all, and nothing below weakens it.
 *
 * **The pair is the point.** An admitted directory on its own cannot tell a check that reads the
 * shape from one that has been switched off, so every case here sits beside a refusal that must
 * still hold.
 */

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() };
});
vi.mock("../../../utils/logger");

const { spawn } = await import("child_process");

/** A home directory whose path contains a space, which is what every case here is about. */
const HOME_WITH_A_SPACE = "/Users/My Name";

/** A marketplace directory a user names inside it. */
const A_MARKETPLACE_DIRECTORY = `${HOME_WITH_A_SPACE}/marketplaces/my-skills`;

/** A reference a user types. It is not a directory, and a space in it is still a refusal. */
const A_TYPED_REFERENCE_WITH_A_SPACE = "my org/their-repo";

/** The injection class this programme has already shipped once. It stays refused. */
const A_TYPED_REFERENCE_THAT_SUBSTITUTES = "$(whoami)/repo";

/** Every argument vector the case under test sent, in order. */
const argvs: (readonly string[])[] = [];

/** Records each argument vector and answers it with a clean exit, which is all a case here asks. */
function recordEveryArgv(): void {
  vi.mocked(spawn).mockImplementation((_command, args) => {
    argvs.push(args);
    return fakeChildProcess();
  });
}

describe("a marketplace source that names a directory on this machine", () => {
  beforeEach(() => {
    argvs.length = 0;
    vi.spyOn(os, "homedir").mockReturnValue(HOME_WITH_A_SPACE);
    recordEveryArgv();
  });

  it("reaches the binary whole, rather than split on the space", async () => {
    await codexMarketplaceAdd(A_MARKETPLACE_DIRECTORY);

    // One argument, not two. `spawn` is called with an argv array and no shell, so the path is
    // data — there is nothing to quote it against and nothing to split it.
    expect(argvs[0]).toContain(A_MARKETPLACE_DIRECTORY);
  });

  it("is admitted on the Claude host by the same check", async () => {
    await claudePluginMarketplaceAdd(A_MARKETPLACE_DIRECTORY);

    expect(argvs).toStrictEqual([["plugin", "marketplace", "add", A_MARKETPLACE_DIRECTORY]]);
  });
});

describe("a marketplace source that is a reference rather than a directory", () => {
  beforeEach(() => {
    argvs.length = 0;
    recordEveryArgv();
  });

  // Without these, the cases above are equally green over a check that was deleted outright.
  it("is still refused for a space, on both hosts", async () => {
    await expect(codexMarketplaceAdd(A_TYPED_REFERENCE_WITH_A_SPACE)).rejects.toThrow(
      "invalid characters",
    );
    await expect(claudePluginMarketplaceAdd(A_TYPED_REFERENCE_WITH_A_SPACE)).rejects.toThrow(
      "invalid characters",
    );
    expect(argvs, "a refused source still reached a binary").toStrictEqual([]);
  });

  it("is still refused for a shell substitution, on both hosts", async () => {
    await expect(codexMarketplaceAdd(A_TYPED_REFERENCE_THAT_SUBSTITUTES)).rejects.toThrow(
      "invalid characters",
    );
    await expect(claudePluginMarketplaceAdd(A_TYPED_REFERENCE_THAT_SUBSTITUTES)).rejects.toThrow(
      "invalid characters",
    );
    expect(argvs, "a refused source still reached a binary").toStrictEqual([]);
  });

  it("is still refused for a control character inside a directory path", async () => {
    // The one refusal a directory does NOT escape: a NUL byte is not a filename on any host this
    // runs on, and `spawn` itself throws on one — the check is what turns that into a sentence.
    await expect(codexMarketplaceAdd(`${HOME_WITH_A_SPACE}/mark\u0000etplace`)).rejects.toThrow(
      "invalid control characters",
    );
    expect(argvs, "a refused source still reached a binary").toStrictEqual([]);
  });
});
