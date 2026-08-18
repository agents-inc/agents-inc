import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import pty from "@lydell/node-pty";
import { Terminal } from "@xterm/headless";
import treeKill from "tree-kill";
import { BIN_RUN, cleanupTempDir, pollUntil } from "./test-utils.js";
import { TIMEOUTS } from "../pages/constants.js";

const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 40;
const AUTO_HOME_PREFIX = "ai-e2e-home-";

function isDefinedEntry(entry: [string, string | undefined]): entry is [string, string] {
  return entry[1] !== undefined;
}

function getDefaultTimeout(): number {
  return process.env.CI ? TIMEOUTS.SESSION_DEFAULT_CI : TIMEOUTS.SESSION_DEFAULT;
}

export type TerminalSessionOptions = {
  cols?: number;
  rows?: number;
  env?: Record<string, string | undefined>;
  /** Override the default timeout for waitForText, waitForExit, etc. */
  defaultTimeout?: number;
  /**
   * The global HOME directory this session's install content lands in, echoed
   * back for assertions. Set by the wizard launchers (launchInProject /
   * launchInGlobal) alongside an explicit env.HOME; left undefined for plain
   * launches whose HOME is the internal auto-allocated dir.
   */
  globalHome?: string;
};

/**
 * Wraps @lydell/node-pty + @xterm/headless to provide clean, assertion-friendly
 * screen reads for interactive CLI E2E tests.
 *
 * PTY output is piped into a headless xterm terminal emulator, which processes
 * all ANSI escape sequences (cursor movement, clearing, etc.) and maintains a
 * proper screen buffer. getScreen() returns exactly what the user would see.
 *
 * HOME defaults to a freshly-created sibling temp directory, distinct from
 * cwd/projectDir, so os.homedir() never collapses onto the project directory —
 * a project `edit`/`init` stays at project scope, and tests remain isolated
 * from the user's real global config (~/.claude-src/config.ts). The auto-created
 * directory is removed by destroy(). Callers that need a specific HOME (e.g. to
 * model editing the GLOBAL installation) pass options.env.HOME; an explicit
 * value always wins and is never auto-removed.
 */
export class TerminalSession {
  private ptyProcess: pty.IPty;
  private xterm: Terminal;
  private rawChunks: string[] = [];
  private destroyed = false;
  private exitPromise: Promise<{ exitCode: number; signal?: number }>;
  /** Auto-allocated HOME dir, removed on destroy(). Undefined when the caller supplied HOME. */
  private autoHomeDir: string | undefined;
  readonly defaultTimeout: number;
  /**
   * The global HOME directory this session's install content lands in, exposed
   * for filesystem assertions. Set only by the scope-explicit wizard launchers;
   * undefined for plain launches (whose HOME is the internal autoHomeDir).
   */
  readonly globalHome: string | undefined;

  constructor(args: string[], cwd: string, options?: TerminalSessionOptions) {
    const cols = options?.cols ?? DEFAULT_COLS;
    const rows = options?.rows ?? DEFAULT_ROWS;
    this.defaultTimeout = options?.defaultTimeout ?? getDefaultTimeout();
    this.globalHome = options?.globalHome;

    this.xterm = new Terminal({ allowProposedApi: true, cols, rows });

    // Resolve HOME: an explicit env.HOME wins untouched; otherwise allocate a
    // fresh sibling temp dir (removed in destroy()) so os.homedir() never
    // collapses onto cwd/projectDir and silently forces a project edit/init
    // into global scope.
    const explicitHome = options?.env?.HOME;
    if (typeof explicitHome !== "string") {
      this.autoHomeDir = mkdtempSync(path.join(os.tmpdir(), AUTO_HOME_PREFIX));
    }
    const home = this.autoHomeDir ?? explicitHome;

    // Build env: merge process.env, defaults, and overrides.
    // node-pty converts `undefined` values to the string "undefined" instead of
    // removing them, so we must strip undefined entries before spawning.
    // HOME is resolved last so the auto-allocated (or explicit) value always wins.
    const rawEnv: Record<string, string | undefined> = {
      ...process.env,
      ...options?.env,
      HOME: home,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      // The harness's own variable, never the product's. `warn({ suppressInTest: true })`
      // (src/cli/utils/logger.ts) reads it, so a spread of process.env silences
      // user-facing warnings in every spawned binary — and a spec asserting one of those
      // lines passes by not looking. Cleared here rather than gated in the product,
      // because a spawned bin/run.js is a user's binary and should see a user's
      // environment. `CLI.run` clears it for the same reason on its own side.
      VITEST: undefined,
      // CI and GITHUB_ACTIONS pass through untouched, and that is load-bearing:
      // the CLI's own render wrapper (src/cli/components/render.ts) must trust
      // the real pseudo-terminal this harness provides over the CI variables.
      // This harness used to strip both so Ink's CI guess could not buffer
      // every frame until exit; leaving them in is what proves the wrapper
      // does its job on every CI run.
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
        resolve({ exitCode, ...(signal !== undefined && { signal }) });
      });
    });
  }

  /** Reads the first `lineCount` xterm buffer lines as trimmed text. */
  private readBufferLines(lineCount: number): string {
    const buffer = this.xterm.buffer.active;
    return Array.from({ length: lineCount }, (_, i) => buffer.getLine(i))
      .filter((line) => line !== undefined)
      .map((line) => line.translateToString(true))
      .join("\n")
      .trimEnd();
  }

  /** Reads the visible screen area (viewport only, no scrollback). */
  getScreen(): string {
    return this.readBufferLines(this.xterm.buffer.active.viewportY + this.xterm.rows);
  }

  /** Reads ALL output including scrollback above the viewport. */
  getFullOutput(): string {
    return this.readBufferLines(this.xterm.buffer.active.length);
  }

  /**
   * Returns ALL raw PTY data with ANSI codes stripped.
   * Unlike getScreen/getFullOutput (which reflect xterm's processed buffer),
   * this captures every byte the process wrote — including text that Ink later
   * overwrites in the terminal buffer.
   */
  getRawOutput(): string {
    return stripVTControlCharacters(this.rawChunks.join(""));
  }

  /**
   * Polls the full output until the given text appears, or throws on timeout.
   * Timeout is CI-aware: 20s in CI, 10s locally (overridable).
   */
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

  /** Waits for the PTY process to exit. Returns the exit code. */
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

  /**
   * Resize the PTY **and** the emulator. Both, always: resizing only the PTY
   * delivers SIGWINCH to the process but leaves xterm laying the new output out
   * at the old geometry, so `getScreen()` reads a viewport the process never
   * drew; resizing only xterm never reaches the process at all, so nothing
   * repaints.
   */
  resize(cols: number, rows: number): void {
    this.ptyProcess.resize(cols, rows);
    this.xterm.resize(cols, rows);
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

  arrowRight(): void {
    this.write("\x1b[C");
  }

  tab(): void {
    this.write("\t");
  }

  escape(): void {
    this.write("\x1b");
  }

  space(): void {
    this.write(" ");
  }

  ctrlC(): void {
    this.write("\x03");
  }

  /** Kills the PTY process tree and disposes the xterm instance. Safe to call multiple times. */
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
