import { TerminalSession } from "../../helpers/terminal-session.js";
import { createE2ESource, type E2ESource } from "../../helpers/create-e2e-source.js";
import { TIMEOUTS } from "../constants.js";
import { DashboardSession } from "../dashboard-session.js";
import { TerminalScreen } from "../terminal-screen.js";
import { ConfirmStep } from "../steps/confirm-step.js";
import { StackStep } from "../steps/stack-step.js";
import type { WizardResult } from "../wizard-result.js";
import { cleanupTempDir, createPermissionsFile, createTempDir } from "../../helpers/test-utils.js";

export type InitWizardOptions = {
  /** Pre-created source directory. If not provided, creates one. */
  source?: E2ESource;
  /** Pre-created project directory. If not provided, creates a temp dir. */
  projectDir?: string;
  /** Terminal dimensions */
  cols?: number;
  rows?: number;
  /** Custom environment variables (merged with defaults). */
  env?: Record<string, string | undefined>;
  /** Launch without --source flag (uses default source / BUILT_IN_MATRIX). */
  noSource?: boolean;
  /** Skip creating permissions file. */
  skipPermissions?: boolean;
  /** Override the default wizard load timeout (default: TIMEOUTS.WIZARD_LOAD). */
  loadTimeout?: number;
  /** Override the default timeout for the underlying TerminalSession. */
  defaultTimeout?: number;
};

/**
 * E2E Cleanup Conventions
 *
 * 1. Wizard/prompt sessions: Call `destroy()` in `afterEach`. The `destroy()`
 *    method handles both session teardown AND temp dir cleanup (cleanupDirs).
 *
 * 2. Shared sources: Clean up in `afterAll` via `cleanupTempDir(source.tempDir)`.
 *
 * 3. Manual temp dirs: Clean up in `afterEach` via `cleanupTempDir(tempDir)`.
 *
 * Prefer `afterEach` over `afterAll` for test isolation. Use `afterAll` only
 * for expensive shared fixtures (sources) that are read-only across tests.
 *
 * Do NOT use `try/finally` for cleanup — `afterEach` runs even on test failure.
 */
export class InitWizard {
  readonly stack: StackStep;
  private cleanupDirs: string[] = [];

  private constructor(
    private session: TerminalSession,
    private projectDir: string,
    stack: StackStep,
    cleanupDirs: string[],
  ) {
    this.stack = stack;
    this.cleanupDirs = cleanupDirs;
  }

  /** Shared setup for launch() and launchRaw(). */
  private static async setupSession(options?: InitWizardOptions): Promise<{
    session: TerminalSession;
    projectDir: string;
    cleanupDirs: string[];
  }> {
    const cleanupDirs: string[] = [];

    // Set up source
    let sourceDir: string | undefined;
    if (options?.noSource) {
      sourceDir = undefined;
    } else if (options?.source) {
      sourceDir = options.source.sourceDir;
    } else {
      const source = await createE2ESource();
      sourceDir = source.sourceDir;
      cleanupDirs.push(source.tempDir);
    }

    // Set up project dir
    let projectDir: string;
    if (options?.projectDir) {
      projectDir = options.projectDir;
    } else {
      projectDir = await createTempDir();
      cleanupDirs.push(projectDir);
    }

    // Create permissions file to prevent blocking prompt
    if (!options?.skipPermissions) {
      await createPermissionsFile(projectDir);
    }

    const args = sourceDir ? ["init", "--source", sourceDir] : ["init"];

    const env: Record<string, string | undefined> = {
      AGENTSINC_SOURCE: undefined,
      ...options?.env,
    };

    const session = new TerminalSession(args, projectDir, {
      cols: options?.cols,
      rows: options?.rows,
      env,
      defaultTimeout: options?.defaultTimeout,
    });

    return { session, projectDir, cleanupDirs };
  }

  /** Launch the init wizard. Returns an InitWizard with the StackStep ready. */
  static async launch(options?: InitWizardOptions): Promise<InitWizard> {
    const { session, projectDir, cleanupDirs } = await InitWizard.setupSession(options);

    const stack = new StackStep(session, projectDir);
    await stack.waitForReady(options?.loadTimeout);

    return new InitWizard(session, projectDir, stack, cleanupDirs);
  }

  /**
   * Launch the init wizard without waiting for the stack step.
   * Use when testing resize warnings or other pre-stack conditions.
   * Returns a raw InitWizard whose getScreen()/getOutput() can be called.
   */
  static async launchRaw(options?: InitWizardOptions): Promise<InitWizard> {
    const { session, projectDir, cleanupDirs } = await InitWizard.setupSession(options);

    // Wait for output to render (resize warning or wizard).
    // Use a polling loop to ensure we have non-empty output.
    const start = Date.now();
    while (Date.now() - start < TIMEOUTS.WIZARD_LOAD) {
      const output = session.getFullOutput();
      if (output.trim().length > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const stack = new StackStep(session, projectDir);
    return new InitWizard(session, projectDir, stack, cleanupDirs);
  }

  /**
   * Complete the wizard with default selections.
   * Optionally select a specific stack by name.
   * Flow: Stack -> Domain -> Build (all domains) -> Sources -> Agents -> Confirm
   */
  async completeWithDefaults(stackName?: string): Promise<WizardResult> {
    const domain = stackName
      ? await this.stack.selectStack(stackName)
      : await this.stack.selectFirstStack();
    const build = await domain.acceptDefaults();
    const sources = await build.passThroughAllDomains();
    const agents = await sources.acceptDefaults();
    const confirm = await agents.acceptDefaults("init");
    return confirm.confirm();
  }

  /**
   * Select first stack and accept its defaults via "A" hotkey.
   * Skips domain/build/sources/agents traversal entirely.
   * Use when domain count is unknown (e.g., BUILT_IN_MATRIX).
   * Flow: Stack -> Domain -> Build -> "A" -> Confirm
   */
  async acceptStackDefaults(): Promise<WizardResult> {
    const domain = await this.stack.selectFirstStack();
    await domain.acceptDefaults();
    await new TerminalScreen(this.session).waitForWizardFooter(TIMEOUTS.WIZARD_LOAD);
    this.session.write("a");
    const confirm = new ConfirmStep(this.session, this.projectDir, "init");
    return confirm.confirm();
  }

  /** Get the full output of the session. */
  getOutput(): string {
    return this.session.getFullOutput();
  }

  /** Get the visible screen of the session. */
  getScreen(): string {
    return this.session.getScreen();
  }

  /** Get the raw PTY output. */
  getRawOutput(): string {
    return this.session.getRawOutput();
  }

  /** Wait for the process to exit and return exit code. */
  async waitForExit(timeoutMs?: number): Promise<number> {
    return this.session.waitForExit(timeoutMs);
  }

  /** Abort the wizard with Ctrl+C. */
  abort(): void {
    this.session.ctrlC();
  }

  /**
   * Abort the wizard (Ctrl+C), wait for the process to exit, then destroy the
   * session and its temp dirs — the standard read-only-scenario teardown
   * ritual.
   *
   * Returns the exit code so sites that assert on it keep their assertion.
   * `timeoutMs` is passed through to `waitForExit` verbatim — omitting it
   * falls back to the session's own default, exactly as a bare
   * `waitForExit()` does. Adopting sites must pass whatever value they used
   * before (`TIMEOUTS.EXIT_WAIT`, `TIMEOUTS.EXIT`, or nothing) so the wait
   * budget stays byte-identical.
   */
  async abortAndDestroy(timeoutMs?: number): Promise<number> {
    this.abort();
    const exitCode = await this.waitForExit(timeoutMs);
    await this.destroy();
    return exitCode;
  }

  /** Press Escape on the wizard (useful for cancelling from stack step). */
  escape(): void {
    this.session.escape();
  }

  /** Destroy the session and clean up temp dirs. */
  async destroy(): Promise<void> {
    await this.session.destroy();
    for (const dir of this.cleanupDirs) {
      await cleanupTempDir(dir);
    }
  }

  /**
   * Launch init in a directory that already has an installation (dashboard mode).
   * Returns a raw session wrapper since the dashboard is NOT a wizard.
   * The caller can check output and press keys.
   */
  static async launchForDashboard(options: {
    projectDir: string;
    source?: E2ESource;
    env?: Record<string, string | undefined>;
  }): Promise<DashboardSession> {
    let sourceDir: string | undefined;
    const cleanupDirs: string[] = [];

    if (options.source) {
      sourceDir = options.source.sourceDir;
    } else {
      const source = await createE2ESource();
      sourceDir = source.sourceDir;
      cleanupDirs.push(source.tempDir);
    }

    const env: Record<string, string | undefined> = {
      AGENTSINC_SOURCE: undefined,
      ...options.env,
    };

    const session = new TerminalSession(["init", "--source", sourceDir], options.projectDir, {
      env,
    });

    return new DashboardSession(session, options.projectDir, cleanupDirs);
  }
}
