import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import pty from "@lydell/node-pty";
import { Terminal } from "@xterm/headless";
import treeKill from "tree-kill";
import {
  BIN_RUN,
  NO_BACKGROUND_VERSION_CHECK,
  NO_LIVE_SEED_API,
  claudeConfigDir,
  cleanupTempDir,
  codexHome,
  pollUntil,
} from "./test-utils.js";
import { withCodexOnIt } from "../fixtures/codex-on-path.js";
import { TIMEOUTS } from "../pages/constants.js";

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;
const AUTO_HOME_PREFIX = "ai-e2e-home-";

function isDefinedEntry(entry: [string, string | undefined]): entry is [string, string] {
  return entry[1] !== undefined;
}

/** `autoHomeDir` is set only when HOME was allocated here; `destroy()` removes it. */
function resolveSessionHome(explicitHome: string | undefined): {
  home: string;
  autoHomeDir: string | undefined;
} {
  if (explicitHome !== undefined) return { home: explicitHome, autoHomeDir: undefined };

  const autoHomeDir = mkdtempSync(path.join(os.tmpdir(), AUTO_HOME_PREFIX));
  return { home: autoHomeDir, autoHomeDir };
}

function getDefaultTimeout(): number {
  return process.env.CI ? TIMEOUTS.SESSION_DEFAULT_CI : TIMEOUTS.SESSION_DEFAULT;
}

export type TerminalSessionOptions = {
  cols?: number;
  rows?: number;
  env?: Record<string, string | undefined>;
  defaultTimeout?: number;
};

/**
 * A PTY piped into a headless xterm, so reads see the rendered screen buffer.
 * HOME defaults to a fresh temp dir apart from cwd, so a project run never resolves as global.
 */
export class TerminalSession {
  private ptyProcess: pty.IPty;
  private xterm: Terminal;
  private rawChunks: string[] = [];
  private destroyed = false;
  private exited = false;
  private exitPromise: Promise<{ exitCode: number; signal?: number }>;
  private autoHomeDir: string | undefined;
  readonly defaultTimeout: number;

  constructor(args: string[], cwd: string, options?: TerminalSessionOptions) {
    const cols = options?.cols ?? DEFAULT_COLS;
    const rows = options?.rows ?? DEFAULT_ROWS;
    this.defaultTimeout = options?.defaultTimeout ?? getDefaultTimeout();

    this.xterm = new Terminal({ allowProposedApi: true, cols, rows });

    const { home, autoHomeDir } = resolveSessionHome(options?.env?.HOME);
    this.autoHomeDir = autoHomeDir;

    // node-pty passes `undefined` as the string "undefined", so those entries are stripped below.
    const rawEnv: Record<string, string | undefined> = {
      ...process.env,
      ...NO_BACKGROUND_VERSION_CHECK,
      ...NO_LIVE_SEED_API,
      // A developer's shell must not steer the CLI; e2e-runner-environment.test.ts keeps this list.
      CC_MARKETPLACE: undefined,
      XDG_CACHE_HOME: undefined,
      GIGET_AUTH: undefined,
      ...options?.env,
      HOME: home,
      // Pinned after the caller's env: both beat HOME in the host binaries.
      CLAUDE_CONFIG_DIR: claudeConfigDir(home),
      CODEX_HOME: codexHome(home),
      // The product finds `codex` by name, so the pinned one goes first on PATH.
      PATH: withCodexOnIt(options?.env?.["PATH"]),
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      // Deliberately after `...options?.env` (unlike the other spawn doors) so no interactive spec
      // can re-inject it and silence product warnings.
      VITEST: undefined,
      // CI and GITHUB_ACTIONS pass through: the render wrapper must trust the real PTY over them.
    };
    const cleanEnv = Object.fromEntries(Object.entries(rawEnv).filter(isDefinedEntry));

    this.ptyProcess = pty.spawn("node", [BIN_RUN, ...args], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: cleanEnv,
    });

    this.ptyProcess.onData((data) => {
      this.rawChunks.push(data);
      this.xterm.write(data);
    });

    this.exitPromise = new Promise((resolve) => {
      this.ptyProcess.onExit(({ exitCode, signal }) => {
        this.exited = true;
        resolve({ exitCode, ...(signal !== undefined && { signal }) });
      });
    });
  }

  private readBufferRange(startRow: number, endRow: number): string[] {
    const buffer = this.xterm.buffer.active;
    return Array.from({ length: Math.max(0, endRow - startRow) }, (_, i) =>
      buffer.getLine(startRow + i),
    )
      .filter((line) => line !== undefined)
      .map((line) => line.translateToString(true));
  }

  private readBufferLines(lineCount: number): string {
    return this.readBufferRange(0, lineCount).join("\n").trimEnd();
  }

  /**
   * Scrollback plus viewport — the same range as `getFullOutput()` — so it holds everything ever
   * drawn: sound for presence, unsound for absence (prove a negative by order or behaviour).
   */
  getScreen(): string {
    return this.readBufferLines(this.xterm.buffer.active.viewportY + this.xterm.rows);
  }

  getFullOutput(): string {
    return this.readBufferLines(this.xterm.buffer.active.length);
  }

  /** Every byte written, ANSI stripped — including text Ink later overwrote on screen. */
  getRawOutput(): string {
    return stripVTControlCharacters(this.rawChunks.join(""));
  }

  async waitForText(text: string, timeoutMs?: number): Promise<void> {
    const timeout = timeoutMs ?? this.defaultTimeout;
    await pollUntil(
      () => this.getFullOutput().includes(text),
      timeout,
      () =>
        new Error(
          `Timeout waiting for "${text}" after ${timeout}ms.\n` +
            `Screen:\n${this.getScreen()}\n` +
            `Full output:\n${this.getFullOutput()}`,
        ),
    );
  }

  hasExited(): boolean {
    return this.exited;
  }

  async waitForExit(timeoutMs?: number): Promise<number> {
    const timeout = timeoutMs ?? this.defaultTimeout;
    const timeoutError = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`Process did not exit within ${timeout}ms`)), timeout),
    );
    const { exitCode } = await Promise.race([this.exitPromise, timeoutError]);
    return exitCode;
  }

  write(data: string): void {
    this.ptyProcess.write(data);
  }

  enter(): void {
    this.write("\r");
  }

  arrowDown(): void {
    this.write("\x1b[B");
  }

  arrowUp(): void {
    this.write("\x1b[A");
  }

  escape(): void {
    this.write("\x1b");
  }

  ctrlC(): void {
    this.write("\x03");
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    await new Promise<void>((resolve) => {
      treeKill(this.ptyProcess.pid, "SIGKILL", () => resolve());
    });
    this.xterm.dispose();

    if (this.autoHomeDir) {
      await cleanupTempDir(this.autoHomeDir);
    }
  }
}
