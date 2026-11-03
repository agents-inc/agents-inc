import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { afterEach, beforeEach } from "vitest";

import { cleanupTempDir, createTempDir } from "../test-fs-utils";
import type { MarketplaceInfo } from "../../hosts/claude-host.js";
import { captureEnv, type RestoreEnv } from "./env-override.js";

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
  "plugin update ",
  "plugin marketplace add ",
  "plugin marketplace remove ",
  "plugin marketplace update ",
];

const changesSetup = (call: string) => SETUP_CHANGES.some((verb) => call.startsWith(verb));

/** A file Claude's own CLI writes and what it holds, or a folder it makes and leaves empty. */
export type ClaudeLeftover = { file: string; content: string } | { folder: string };

export type ClaudeStub = {
  /** One line per call this spec made, its arguments joined by spaces, in the order made. */
  calls: () => Promise<string[]>;
  /** Those of `calls()` that change Claude's setup, in the order made, without the reads between. */
  changes: () => Promise<string[]>;
  /** Makes `plugin marketplace list --json` answer these, as a Claude holding them does. */
  holdMarketplaces: (marketplaces: readonly MarketplaceInfo[]) => Promise<void>;
  /** Makes `plugin marketplace list` fail, so no caller can tell what Claude holds. */
  failMarketplaceList: () => Promise<void>;
  /**
   * Makes each call that changes Claude's setup write these, as Claude's own CLI rewrites its files
   * on each, so a run's last such call leaves them as given. A read writes nothing.
   */
  leaveBehind: (leftovers: readonly ClaudeLeftover[]) => Promise<void>;
};

type StubFiles = {
  log: string;
  marketplaces: string;
  listFails: string;
  leaves: string;
  leftovers: string;
};

/** Each file's content waits in `contentsDir` under its index, so no content is shell-quoted. */
function leavesScript(leftovers: readonly ClaudeLeftover[], contentsDir: string): string {
  const lines = leftovers.flatMap((leftover, at) =>
    "folder" in leftover
      ? [`mkdir -p ${JSON.stringify(leftover.folder)}`]
      : [
          `mkdir -p ${JSON.stringify(path.dirname(leftover.file))}`,
          `cp ${JSON.stringify(path.join(contentsDir, String(at)))} ${JSON.stringify(leftover.file)}`,
        ],
  );
  return [...lines, ""].join("\n");
}

/**
 * Logs its arguments and, on a call that changes Claude's setup, writes what a spec said Claude
 * leaves. Then it answers as a Claude with nothing installed, or holding the marketplaces a spec
 * handed it: it accepts every request but a plugin uninstall, which it refuses as Claude Code
 * 2.1.310 refuses a plugin it does not hold.
 */
function stubScript({ log, marketplaces, listFails, leaves }: StubFiles): string {
  return [
    "#!/bin/sh",
    `printf '%s\\n' "$*" >> ${JSON.stringify(log)}`,
    `case "$*" in ${SETUP_CHANGES.map((verb) => `${JSON.stringify(verb)}*`).join("|")})`,
    `  if [ -f ${JSON.stringify(leaves)} ]; then . ${JSON.stringify(leaves)}; fi`,
    "  ;;",
    "esac",
    'if [ "$1 $2" = "plugin uninstall" ]; then',
    `  printf '✘ Failed to uninstall plugin "%s": Plugin "%s" not found in installed plugins\\n' "$3" "$3" >&2`,
    "  exit 1",
    "fi",
    'if [ "$1 $2 $3" = "plugin marketplace list" ]; then',
    `  if [ -f ${JSON.stringify(listFails)} ]; then`,
    "    printf '✘ Failed to list marketplaces\\n' >&2",
    "    exit 1",
    "  fi",
    `  if [ -f ${JSON.stringify(marketplaces)} ]; then`,
    `    cat ${JSON.stringify(marketplaces)}`,
    "    exit 0",
    "  fi",
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
  let restorePath: RestoreEnv;

  const files = (): StubFiles => ({
    log: path.join(stubDir, "calls.log"),
    marketplaces: path.join(stubDir, "marketplaces.json"),
    listFails: path.join(stubDir, "marketplace-list-fails"),
    leaves: path.join(stubDir, "leaves.sh"),
    leftovers: path.join(stubDir, "leftovers"),
  });

  beforeEach(async () => {
    const searchPath = process.env.PATH;
    if (searchPath === undefined) throw new Error("No PATH to put the claude stub first on.");
    restorePath = captureEnv("PATH");

    stubDir = await createTempDir("claude-stub-");
    const binDir = path.join(stubDir, "bin");
    await mkdir(binDir);
    await writeFile(files().log, "");
    await writeFile(path.join(binDir, CLAUDE_COMMAND), stubScript(files()), { mode: 0o755 });
    process.env.PATH = [binDir, searchPath].join(path.delimiter);
  });

  afterEach(async () => {
    restorePath();
    await cleanupTempDir(stubDir);
  });

  const calls = async () => (await readFile(files().log, "utf8")).split("\n").slice(0, -1);

  return {
    calls,
    changes: async () => (await calls()).filter(changesSetup),
    holdMarketplaces: (marketplaces) =>
      writeFile(files().marketplaces, JSON.stringify(marketplaces)),
    failMarketplaceList: () => writeFile(files().listFails, ""),
    async leaveBehind(leftovers) {
      const { leaves, leftovers: contentsDir } = files();
      await mkdir(contentsDir, { recursive: true });
      await Promise.all(
        leftovers.map((leftover, at) =>
          "file" in leftover
            ? writeFile(path.join(contentsDir, String(at)), leftover.content)
            : Promise.resolve(),
        ),
      );
      await writeFile(leaves, leavesScript(leftovers, contentsDir));
    },
  };
}
