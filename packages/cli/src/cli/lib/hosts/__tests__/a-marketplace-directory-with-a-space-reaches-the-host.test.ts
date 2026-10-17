import os from "os";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { claudePluginMarketplaceAdd } from "../claude-host.js";
import { codexMarketplaceAdd } from "../codex-host.js";
import { fakeChildProcess } from "./helpers/fake-child-process.js";

// `spawn` gets an argv with no shell, so a directory path with a space is data; a typed
// reference with one is still refused.

vi.mock("child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("child_process")>();
  return { ...actual, spawn: vi.fn<typeof actual.spawn>() };
});
vi.mock("../../../utils/logger");

const { spawn } = await import("child_process");

const HOME_WITH_A_SPACE = "/Users/My Name";

const A_MARKETPLACE_DIRECTORY = `${HOME_WITH_A_SPACE}/marketplaces/my-skills`;

/** A typed reference, not a directory: a space in it is still refused. */
const A_TYPED_REFERENCE_WITH_A_SPACE = "my org/their-repo";

const A_TYPED_REFERENCE_THAT_SUBSTITUTES = "$(whoami)/repo";

const argvs: (readonly string[])[] = [];

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
    // `spawn` itself throws on a NUL byte; the check turns that into a sentence.
    await expect(codexMarketplaceAdd(`${HOME_WITH_A_SPACE}/mark\u0000etplace`)).rejects.toThrow(
      "invalid control characters",
    );
    expect(argvs, "a refused source still reached a binary").toStrictEqual([]);
  });
});
