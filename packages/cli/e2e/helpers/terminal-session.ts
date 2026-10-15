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

/**
 * The HOME a session hands its binary, and the directory this session allocated for it when the
 * caller named none — which is the one `destroy()` removes. A caller's HOME is never allocated here
 * and never removed.
 */
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
  /** Override the default timeout for waitForText, waitForExit, etc. */
  defaultTimeout?: number;
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
 * from the user's real global config (~/.agents-inc/claude/config.ts). The auto-created
 * directory is removed by destroy(). Callers that need a specific HOME (e.g. to
 * model editing the GLOBAL installation) pass options.env.HOME; an explicit
 * value always wins and is never auto-removed.
 */
export class TerminalSession {
  private ptyProcess: pty.IPty;
  private xterm: Terminal;
  private rawChunks: string[] = [];
  private destroyed = false;
  private exited = false;
  private exitPromise: Promise<{ exitCode: number; signal?: number }>;
  /** Auto-allocated HOME dir, removed on destroy(). Undefined when the caller supplied HOME. */
  private autoHomeDir: string | undefined;
  readonly defaultTimeout: number;

  constructor(args: string[], cwd: string, options?: TerminalSessionOptions) {
    const cols = options?.cols ?? DEFAULT_COLS;
    const rows = options?.rows ?? DEFAULT_ROWS;
    this.defaultTimeout = options?.defaultTimeout ?? getDefaultTimeout();

    this.xterm = new Terminal({ allowProposedApi: true, cols, rows });

    // Resolve HOME: an explicit env.HOME wins untouched; otherwise allocate a
    // fresh sibling temp dir (removed in destroy()) so os.homedir() never
    // collapses onto cwd/projectDir and silently forces a project edit/init
    // into global scope.
    const { home, autoHomeDir } = resolveSessionHome(options?.env?.HOME);
    this.autoHomeDir = autoHomeDir;

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
      // The seed API, DEFAULTED to an unroutable address rather than cleared: the product falls
      // back to the live store when it is unset. Ahead of `options.env`, so a session that names
      // its own store wins — `InteractivePrompt` passes `AGENTS_INC_API_URL` that way.
      ...NO_LIVE_SEED_API,
      // The CLI's own overrides — every other variable `src/cli/` reads by name that is not the
      // harness's. Each is a knob a developer's shell may legitimately carry for their own use,
      // and the spread above hands all of them to the spawned binary: an exported marketplace
      // points `init` somewhere no spec declares, a shared giget cache serves a source this run
      // never fetched, and a token authenticates a fetch that should have failed. Ahead of
      // `options.env`, so a session that needs a value still names its own.
      // `src/cli/lib/__tests__/e2e-runner-environment.test.ts` keeps this list and `CLI.run`'s
      // copy of it complete.
      CC_MARKETPLACE: undefined,
      XDG_CACHE_HOME: undefined,
      GIGET_AUTH: undefined,
      ...options?.env,
      HOME: home,
      // Each host's state directory, PINNED to this HOME after the caller's environment — the
      // same position `CLI.run` and `runCLI` pin them in. Both variables beat `HOME` in the binary
      // that reads them, so the `process.env` spread above would otherwise send every `claude` or
      // `codex` call the run makes into the developer's own installation whenever their shell
      // exports one. This door pinned neither until 2026-09-19.
      CLAUDE_CONFIG_DIR: claudeConfigDir(home),
      CODEX_HOME: codexHome(home),
      // The pinned codex, PREPENDED to whatever PATH is in effect — the line `CLI.run` carries, for
      // its reason: the product resolves its Codex host's binary BY NAME in this child, so a run
      // over a Codex installation otherwise found whatever `codex` this machine has, or none.
      // Absent from this door until 2026-09-26, which no spec noticed because none drove the
      // wizard over a Codex installation (CLI-894).
      PATH: withCodexOnIt(options?.env?.["PATH"]),
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      // The harness's own variable, never the product's. Cleared here rather than gated in the
      // product, because a spawned bin/run.js is a user's binary and should see a user's
      // environment. `CLI.run` clears it for the same reason on its own side.
      //
      // PINNED, NOT DEFAULTED — and deliberately (owner ruling 2026-08-21). This sits
      // AFTER `...options?.env` where the other two spawn doors put it BEFORE, so a caller here
      // cannot re-inject it. That asymmetry is the intent rather than an oversight: this door
      // drives the interactive commands, where a silenced product warning is exactly the failure
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
        this.exited = true;
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
   * protection this harness does not have.
   */
  getScreen(): string {
    return this.readBufferLines(this.xterm.buffer.active.viewportY + this.xterm.rows);
  }

  /** Reads the whole buffer. The same range {@link getScreen} reads — see the measurement there. */
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

  /** Whether the PTY process has ended — read without waiting, for a wait that races it. */
  hasExited(): boolean {
    return this.exited;
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
