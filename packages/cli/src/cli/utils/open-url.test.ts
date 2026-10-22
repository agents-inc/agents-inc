import { readFile, writeFile } from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { browserOpenerCommand, openUrl } from "./open-url.js";
import { editorConfigUrl } from "../consts.js";
import { cleanupTempDir, createTempDir } from "../lib/__tests__/test-fs-utils.js";

// Built from the product function so it cannot drift from the real link shape.
const EDITOR_LINK = editorConfigUrl("Ab3xY9_Q");
const OPENER_REFUSED_EXIT = 3;

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

/** The opener is spawned by name, so PATH is a folder holding a script of that name, or nothing. */
describe("openUrl", () => {
  const { command: opener } = browserOpenerCommand(process.platform, EDITOR_LINK);
  let binDir: string;

  beforeEach(async () => {
    binDir = await createTempDir("cc-open-url-");
    vi.stubEnv("PATH", binDir);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(binDir);
  });

  async function openerRuns(script: string): Promise<void> {
    await writeFile(path.join(binDir, opener), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
  }

  it("hands the link to the platform's opener", async () => {
    const argvLog = path.join(binDir, "opener-argv.log");
    await openerRuns(`printf '%s\\n' "$@" > ${JSON.stringify(argvLog)}`);

    expect(await openUrl(EDITOR_LINK)).toStrictEqual({ ok: true });
    expect(await readFile(argvLog, "utf8")).toBe(`${EDITOR_LINK}\n`);
  });

  it("reports an opener that refused rather than throwing", async () => {
    await openerRuns(`exit ${OPENER_REFUSED_EXIT}`);

    expect(await openUrl(EDITOR_LINK)).toStrictEqual({
      ok: false,
      error: `Could not open your browser — '${opener}' exited ${OPENER_REFUSED_EXIT}.`,
    });
  });

  it("reports a missing opener as a message, so a headless machine is never a failed command", async () => {
    expect(await openUrl(EDITOR_LINK)).toStrictEqual({
      ok: false,
      error: `Could not open your browser — '${opener}' could not be run: spawn ${opener} ENOENT`,
    });
  });
});
