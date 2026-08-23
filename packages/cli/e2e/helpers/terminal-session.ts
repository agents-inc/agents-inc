import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";
import pty from "@lydell/node-pty";
import { Terminal } from "@xterm/headless";
import treeKill from "tree-kill";
import { BIN_RUN, NO_BACKGROUND_VERSION_CHECK, cleanupTempDir, pollUntil } from "./test-utils.js";
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
 * proper screen buffer. Read it through getScreen() or getFullOutput() — neither
 * is viewport-only, and in this harness the two read the SAME range. getScreen()
 * carries the measurement.
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
      // Stops oclif's update plugin spawning the detached child that writes into this
      // session's fake HOME after the process has exited. See its own doc for the mechanism;
      // ahead of options.env so a session that needs the warning can still drop it.
      ...NO_BACKGROUND_VERSION_CHECK,
      // The CLI's own overrides — every variable `src/cli/` reads by name that is not the
      // harness's. Each is a knob a developer's shell may legitimately carry for their own use,
      // and the spread above hands all of them to the spawned binary: an exported marketplace
      // points `init` somewhere no spec declares, an exported seed API answers `--from`, a
      // shared giget cache serves a source this run never fetched, and a token authenticates a
      // fetch that should have failed. Ahead of `options.env`, so a session that needs a value
      // still names its own — `InteractivePrompt` passes `AGENTS_INC_API_URL` that way.
      // `src/cli/lib/__tests__/e2e-runner-environment.test.ts` keeps this list and `CLI.run`'s
      // copy of it complete.
      CC_MARKETPLACE: undefined,
      AGENTS_INC_API_URL: undefined,
      XDG_CACHE_HOME: undefined,
      GIGET_AUTH: undefined,
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
      //
      // PINNED, NOT DEFAULTED — and deliberately (owner ruling 2026-08-21). This sits
      // AFTER `...options?.env` where the other two spawn doors put it BEFORE, so a caller here
      // cannot re-inject it. That asymmetry is the intent rather than an oversight: this door
      // drives the interactive wizard, where a silenced product warning is exactly the failure
      // the suite exists to catch, and no spec has a legitimate reason to want it back. A spec
      // that genuinely needs `VITEST` set re-injects it through `CLI.run`, which defaults rather
      // than pins. Do not "fix" this by moving it above the spread for consistency.
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

  /** Reads absolute buffer rows `startRow` (inclusive) to `endRow` (exclusive) as trimmed text. */
  private readBufferRange(startRow: number, endRow: number): string[] {
    const buffer = this.xterm.buffer.active;
    return Array.from({ length: Math.max(0, endRow - startRow) }, (_, i) =>
      buffer.getLine(startRow + i),
    )
      .filter((line) => line !== undefined)
      .map((line) => line.translateToString(true));
  }

  /** Reads the first `lineCount` xterm buffer lines as trimmed text. */
  private readBufferLines(lineCount: number): string {
    return this.readBufferRange(0, lineCount).join("\n").trimEnd();
  }

  /**
   * Reads absolute buffer lines `0 .. viewportY + rows` — scrollback PLUS the viewport, never the
   * visible area alone. `viewportY` is the absolute row of the TOP of the viewport, so everything
   * above it is included. The two coincide only while a session has produced no scrollback
   * (`viewportY === 0`), which is why the name reads as harmless.
   *
   * Consequence: `not.toContain(...)` on this string matches anything the session ever drew, so it
   * is safe for POSITIVE assertions about current content and unsound for absence. Prove a negative
   * by ORDER (`toMatch(/…$/)`) or by BEHAVIOUR — see `.ai-docs/standards/e2e/assertions.md`.
   *
   * AND IT IS THE SAME RANGE {@link getFullOutput} READS. For xterm's normal buffer
   * `length === baseY + rows`, and `viewportY === baseY` unless something has scrolled the
   * EMULATOR's own viewport — which nothing in `e2e/` does (`grep -rn 'scrollLines\|scrollToBottom\|
   * scrollToTop\|scrollToLine' e2e src` returns nothing). Measured against `@xterm/headless`
   * 2026-08-21 at three geometries — 6 rows/20 lines, 40 rows/200 lines, 40 rows/5 lines —
   * `viewportY + rows === length` held at all three. So choosing between the two readers protects
   * nothing, and a comment or a spec header offering one as the safer of the pair is describing a
   * protection this harness does not have. Where a negative on `getScreen()` IS sound, what makes
   * it sound is `waitForWizardFooter()` having just proved `viewportY === 0` — a property the
   * assertion establishes rather than one the reader has to trust.
   */
  getScreen(): string {
    return this.readBufferLines(this.xterm.buffer.active.viewportY + this.xterm.rows);
  }

  /** Reads the whole buffer. The same range {@link getScreen} reads — see the measurement there. */
  getFullOutput(): string {
    return this.readBufferLines(this.xterm.buffer.active.length);
  }

  /**
   * The lines sitting ABOVE the top of the viewport right now — empty while everything the
   * emulator holds is on screen, one entry per row that has been driven out of sight.
   *
   * `viewportY` is the absolute buffer row of the TOP of the viewport, so it counts those rows
   * exactly. Reading it says nothing on its own about whether they SHOULD be off screen: an
   * ordinary command is entitled to scroll. It becomes an assertion only under a caller that
   * knows a full-screen frame is painted — `BaseStep.waitForWizardFooter` is the one, and it
   * carries the reason zero is the floor there.
   *
   * Measured, because Ink reprints an overflowing frame behind its own `clearTerminal` (which
   * empties the emulator's scrollback as well as its screen), so the count is a gauge of the
   * frame painted NOW rather than a running total: it falls back to zero the moment a frame
   * that fits replaces one that did not. A frame that overflowed and has since been replaced is
   * not retrievable here — read it while the frame is on screen.
   */
  linesAboveViewport(): readonly string[] {
    return this.readBufferRange(0, this.xterm.buffer.active.viewportY);
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

  /**
   * Every keystroke this session has sent, in order. The page objects drive the
   * wizard by writing single keys, so the length is what a navigation helper
   * COST — which is the only observable a spec has for "this walk should not
   * have had to travel". Kept as the sequence rather than a bare count so a
   * failure can say which keys were spent, not merely how many.
   */
  private readonly keysWritten: string[] = [];

  /** @see keysWritten — the sequence itself, for specs that assert on cost. */
  keystrokes(): readonly string[] {
    return this.keysWritten;
  }

  write(data: string): void {
    this.keysWritten.push(data);
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
