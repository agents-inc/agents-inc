import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { afterEach, beforeEach } from "vitest";

import { cleanupTempDir, createTempDir } from "../test-fs-utils";

/** The name the Claude host spawns its CLI by, which PATH resolves. */
const CLAUDE_COMMAND = "claude";

/**
 * The calls the Claude host makes that change what Claude has installed or registered. Its others,
 * `--version` and `plugin marketplace list --json`, only read. A verb missing here is left out of
 * `changes()` as a read would be, so one the host starts to spawn is added here.
 */
const SETUP_CHANGES = [
  "plugin install ",
  "plugin uninstall ",
  "plugin marketplace add ",
  "plugin marketplace remove ",
  "plugin marketplace update ",
];

const changesSetup = (call: string) => SETUP_CHANGES.some((verb) => call.startsWith(verb));

export type ClaudeStub = {
  /** One line per call this spec made, its arguments joined by spaces, in the order made. */
  calls: () => Promise<string[]>;
  /** Those of `calls()` that change Claude's setup, in the order made, without the reads between. */
  changes: () => Promise<string[]>;
};

/**
 * Logs its arguments, then answers as a Claude with nothing installed: it accepts every request but
 * a plugin uninstall, which it refuses as Claude Code 2.1.310 refuses a plugin it does not hold.
 */
function stubScript(logPath: string): string {
  return [
    "#!/bin/sh",
    `printf '%s\\n' "$*" >> ${JSON.stringify(logPath)}`,
    'if [ "$1 $2" = "plugin uninstall" ]; then',
    `  printf '✘ Failed to uninstall plugin "%s": Plugin "%s" not found in installed plugins\\n' "$3" "$3" >&2`,
    "  exit 1",
    "fi",
    "printf '[]\\n'",
    "",
  ].join("\n");
}

/**
 * A `claude` first on PATH for each spec, so a run that reaches Claude Code's CLI is logged here
 * rather than spawning the real one. For runs through `dist/`, which no module mock reaches.
 */
export function useClaudeStub(): ClaudeStub {
  let stubDir: string;
  let pathBefore: string;

  const logPath = () => path.join(stubDir, "calls.log");

  beforeEach(async () => {
    const searchPath = process.env.PATH;
    if (searchPath === undefined) throw new Error("No PATH to put the claude stub first on.");
    pathBefore = searchPath;

    stubDir = await createTempDir("claude-stub-");
    const binDir = path.join(stubDir, "bin");
    await mkdir(binDir);
    await writeFile(logPath(), "");
    await writeFile(path.join(binDir, CLAUDE_COMMAND), stubScript(logPath()), { mode: 0o755 });
    process.env.PATH = [binDir, pathBefore].join(path.delimiter);
  });

  afterEach(async () => {
    process.env.PATH = pathBefore;
    await cleanupTempDir(stubDir);
  });

  const calls = async () => (await readFile(logPath(), "utf8")).split("\n").slice(0, -1);

  return {
    calls,
    changes: async () => (await calls()).filter(changesSetup),
  };
}
