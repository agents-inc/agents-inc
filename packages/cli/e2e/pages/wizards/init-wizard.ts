import { TerminalSession } from "../../helpers/terminal-session.js";
import { createE2ESource, type E2ESource } from "../../helpers/create-e2e-source.js";
import { INTERNAL_DELAYS, STEP_TEXT, TIMEOUTS } from "../constants.js";
import { DashboardSession } from "../dashboard-session.js";
import { TerminalScreen } from "../terminal-screen.js";
import { ConfirmStep } from "../steps/confirm-step.js";
import { DomainStep } from "../steps/domain-step.js";
import { StackStep } from "../steps/stack-step.js";
import type { WizardResult } from "../wizard-result.js";
import { allocateProjectGlobalHome } from "./global-home.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  createTempDir,
  delay,
} from "../../helpers/test-utils.js";

/**
 * How a spawned wizard resolves HOME, which decides where global-scoped
 * install content (the default scope) lands:
 *   - "auto": TerminalSession auto-allocates an internal, unexposed sibling
 *     HOME. Used by the plain launch()/launchRaw() escape hatches.
 *   - "project": a fresh (or caller-reused) dir distinct from projectDir.
 *     Models a PROJECT install — os.homedir() !== cwd, so scope stays
 *     project-side and global content is observable at the exposed globalHome.
 *   - "global": HOME === cwd === projectDir. Models the GLOBAL install (the
 *     intentional collapse).
 */
type HomeStrategy = "auto" | "project" | "global";

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
  /** Launch without --marketplace flag (uses default source / BUILT_IN_MATRIX). */
  noSource?: boolean;
  /** Skip creating permissions file. */
  skipPermissions?: boolean;
  /** Override the default wizard load timeout (default: TIMEOUTS.WIZARD_LOAD). */
  loadTimeout?: number;
  /** Override the default timeout for the underlying TerminalSession. */
  defaultTimeout?: number;
  /**
   * Reuse an existing global HOME dir instead of allocating a fresh one
   * (launchInProject only). When set, this dir becomes the spawned CLI's HOME,
   * is stamped onto the WizardResult, and is exposed as `wizard.globalHome`, but
   * the wizard does NOT own its cleanup — the allocator (the test) does. Use for
   * multi-phase flows where a later phase must see an earlier phase's global
   * content. Ignored by launch()/launchInGlobal().
   */
  globalHome?: string;
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
  private readonly _globalHome: string | undefined;

  private constructor(
    private session: TerminalSession,
    private projectDir: string,
    stack: StackStep,
    cleanupDirs: string[],
    globalHome: string | undefined,
  ) {
    this.stack = stack;
    this.cleanupDirs = cleanupDirs;
    this._globalHome = globalHome;
  }

  /**
   * The global HOME directory this wizard's install content lands in, exposed
   * for filesystem assertions (e.g. `expect({ dir: wizard.globalHome })
   * .toHaveCompiledAgents()`). Available only on wizards created via
   * launchInProject()/launchInGlobal(); accessing it on a plain launch()
   * wizard throws, because launch()'s auto-allocated HOME is internal.
   */
  get globalHome(): string {
    if (this._globalHome === undefined) {
      throw new Error(
        "globalHome is only exposed on InitWizard.launchInProject()/launchInGlobal(); " +
          "launch()/launchRaw() use an internal auto-allocated HOME.",
      );
    }
    return this._globalHome;
  }

  /** Shared session setup for every launch path — see {@link HomeStrategy}. */
  private static async setupSession(
    options: InitWizardOptions | undefined,
    homeStrategy: HomeStrategy,
  ): Promise<{
    session: TerminalSession;
    projectDir: string;
    cleanupDirs: string[];
    globalHome: string | undefined;
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

    const args = sourceDir ? ["init", "--marketplace", sourceDir] : ["init"];

    // Resolve the global HOME per strategy. "auto" resolves to undefined: HOME
    // stays unset so the TerminalSession auto-allocates (and owns cleanup of)
    // an internal dir.
    let globalHome: string | undefined;
    if (homeStrategy === "project") {
      const allocated = await allocateProjectGlobalHome(options?.globalHome);
      globalHome = allocated.dir;
      cleanupDirs.push(...allocated.cleanupDirs);
    } else if (homeStrategy === "global") {
      globalHome = projectDir;
    }

    const env: Record<string, string | undefined> = {
      CC_MARKETPLACE: undefined,
      ...options?.env,
      ...(globalHome !== undefined ? { HOME: globalHome } : {}),
    };

    const session = new TerminalSession(args, projectDir, {
      ...(options?.cols !== undefined && { cols: options.cols }),
      ...(options?.rows !== undefined && { rows: options.rows }),
      env,
      ...(options?.defaultTimeout !== undefined && { defaultTimeout: options.defaultTimeout }),
      ...(globalHome !== undefined && { globalHome }),
    });

    return { session, projectDir, cleanupDirs, globalHome };
  }

  /** Shared launch path: set up the session, wait for the stack step, wrap it. */
  private static async launchWith(
    options: InitWizardOptions | undefined,
    homeStrategy: HomeStrategy,
  ): Promise<InitWizard> {
    const { session, projectDir, cleanupDirs, globalHome } = await InitWizard.setupSession(
      options,
      homeStrategy,
    );

    const stack = new StackStep(session, projectDir);
    await stack.waitForReady(options?.loadTimeout);

    return new InitWizard(session, projectDir, stack, cleanupDirs, globalHome);
  }

  /**
   * Launch the init wizard. Returns an InitWizard with the StackStep ready.
   *
   * Escape hatch: HOME is an internal auto-allocated sibling dir that is NOT
   * exposed (`wizard.globalHome` throws). Use launchInProject() when the test
   * asserts on installed content (`.claude/skills`, compiled agents,
   * settings.json) or runs a follow-up CLI.run against global content.
   */
  static async launch(options?: InitWizardOptions): Promise<InitWizard> {
    return InitWizard.launchWith(options, "auto");
  }

  /**
   * Launch `cc init` as a PROJECT install: HOME is a fresh dir distinct from
   * projectDir, exposed as `wizard.globalHome`. Default-scope (global) install
   * content lands at `<globalHome>/.claude/...` and is observable there; the
   * project config.ts stays under projectDir. The returned WizardResult stamps
   * globalHome onto its ProjectHandle so CLI.run reads the same HOME.
   */
  static async launchInProject(options?: InitWizardOptions): Promise<InitWizard> {
    return InitWizard.launchWith(options, "project");
  }

  /**
   * Launch `cc init` as the GLOBAL install: HOME === cwd === projectDir (the
   * intentional collapse). `wizard.globalHome` equals projectDir.
   */
  static async launchInGlobal(options?: InitWizardOptions): Promise<InitWizard> {
    return InitWizard.launchWith(options, "global");
  }

  /**
   * Launch `cc init` as a PROJECT install against a source that ships no stacks,
   * and wait for the DOMAINS step — the first step such a session renders.
   *
   * The CLI's built-in stacks stand in only for the default public marketplace,
   * so a custom marketplace shipping none leaves the stack step with nothing to
   * offer and the wizard opens past it. Returns the domain step it opened on
   * alongside the wizard, which owns teardown and exposes `globalHome` exactly
   * as launchInProject() does. `wizard.stack` is NOT ready on this path —
   * nothing waited for a step that never renders.
   */
  static async launchOnDomainsInProject(
    options?: InitWizardOptions,
  ): Promise<{ wizard: InitWizard; domain: DomainStep }> {
    const { session, projectDir, cleanupDirs, globalHome } = await InitWizard.setupSession(
      options,
      "project",
    );

    const timeout = options?.loadTimeout ?? TIMEOUTS.WIZARD_LOAD;
    const screen = new TerminalScreen(session);
    await screen.waitForText(STEP_TEXT.DOMAINS, timeout);
    await screen.waitForWizardFooter(timeout);

    const stack = new StackStep(session, projectDir);
    const wizard = new InitWizard(session, projectDir, stack, cleanupDirs, globalHome);
    return { wizard, domain: new DomainStep(session, projectDir) };
  }

  /**
   * Launch the init wizard without waiting for the stack step.
   * Use when testing resize warnings or other pre-stack conditions.
   * Returns a raw InitWizard whose getScreen()/getOutput() can be called.
   *
   * Escape hatch: like launch(), HOME is internal and `globalHome` is unexposed.
   */
  static async launchRaw(options?: InitWizardOptions): Promise<InitWizard> {
    const { session, projectDir, cleanupDirs, globalHome } = await InitWizard.setupSession(
      options,
      "auto",
    );

    // Wait for output to render (resize warning or wizard).
    // Use a polling loop to ensure we have non-empty output.
    const start = Date.now();
    while (Date.now() - start < TIMEOUTS.WIZARD_LOAD) {
      const output = session.getFullOutput();
      if (output.trim().length > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const stack = new StackStep(session, projectDir);
    return new InitWizard(session, projectDir, stack, cleanupDirs, globalHome);
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

  /**
   * Abort the wizard with Ctrl+C. Async, and awaited by every caller: a bare
   * synchronous write races the handler the current frame registered, which is
   * why every other keypress wrapper in this framework carries the same delay.
   */
  async abort(): Promise<void> {
    this.session.ctrlC();
    await delay(INTERNAL_DELAYS.KEYSTROKE);
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
    await this.abort();
    const exitCode = await this.waitForExit(timeoutMs);
    await this.destroy();
    return exitCode;
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
      CC_MARKETPLACE: undefined,
      ...options.env,
    };

    const session = new TerminalSession(["init", "--marketplace", sourceDir], options.projectDir, {
      env,
    });

    return new DashboardSession(session, options.projectDir, cleanupDirs);
  }
}
