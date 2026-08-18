import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockExecCommand } = vi.hoisted(() => ({ mockExecCommand: vi.fn() }));

vi.mock("./exec.js", () => ({ execCommand: mockExecCommand }));

const { browserOpenerCommand, openUrl } = await import("./open-url.js");

/** A link of the shape the CLI actually hands a browser — the editor's, with an id on it. */
const EDITOR_LINK = "https://agentsinc.sh/?fromId=Ab3xY9_Q";
const OPENER_REFUSED_EXIT = 3;
const MISSING_OPENER_MESSAGE = "spawn xdg-open ENOENT";

describe("browserOpenerCommand", () => {
  it("asks macOS to open the link with its own handler", () => {
    expect(browserOpenerCommand("darwin", EDITOR_LINK)).toStrictEqual({
      command: "open",
      args: [EDITOR_LINK],
    });
  });

  it("goes through cmd on Windows, with an empty title so the link is not read as one", () => {
    expect(browserOpenerCommand("win32", EDITOR_LINK)).toStrictEqual({
      command: "cmd",
      args: ["/c", "start", "", EDITOR_LINK],
    });
  });

  it("falls to the freedesktop opener on every other platform", () => {
    expect(browserOpenerCommand("linux", EDITOR_LINK)).toStrictEqual({
      command: "xdg-open",
      args: [EDITOR_LINK],
    });
    expect(browserOpenerCommand("freebsd", EDITOR_LINK)).toStrictEqual({
      command: "xdg-open",
      args: [EDITOR_LINK],
    });
  });
});

describe("openUrl", () => {
  beforeEach(() => {
    mockExecCommand.mockReset();
  });

  it("hands the link to the platform's opener", async () => {
    mockExecCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });

    const result = await openUrl(EDITOR_LINK);

    expect(result).toStrictEqual({ ok: true });
    expect(mockExecCommand).toHaveBeenCalledTimes(1);
    // The link is passed as its own argument rather than interpolated into a command line:
    // `execCommand` spawns without a shell, so the argument vector is the whole of the guard.
    expect(mockExecCommand.mock.calls[0]?.[1]).toContain(EDITOR_LINK);
  });

  it("reports an opener that refused rather than throwing", async () => {
    mockExecCommand.mockResolvedValue({ stdout: "", stderr: "", exitCode: OPENER_REFUSED_EXIT });

    const result = await openUrl(EDITOR_LINK);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain(String(OPENER_REFUSED_EXIT));
  });

  it("reports a missing opener as a message, so a headless machine is never a failed command", async () => {
    mockExecCommand.mockRejectedValue(new Error(MISSING_OPENER_MESSAGE));

    const result = await openUrl(EDITOR_LINK);

    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.error).toContain(MISSING_OPENER_MESSAGE);
  });
});
