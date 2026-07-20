import { TerminalSession } from "../../helpers/terminal-session.js";
import type { E2ESource } from "../../helpers/create-e2e-source.js";
import { createPermissionsFile } from "../../helpers/test-utils.js";
import { STEP_TEXT, TIMEOUTS } from "../constants.js";
import { TerminalScreen } from "../terminal-screen.js";
import { BuildStep } from "../steps/build-step.js";
import type { WizardResult } from "../wizard-result.js";

export type EditWizardOptions = {
  /** Project directory (required -- must have existing installation). */
  projectDir: string;
  /** Source directory for skill resolution. */
  source?: E2ESource;
  /** Terminal dimensions */
  cols?: number;
  rows?: number;
  /** Custom environment variables (merged with defaults). */
  env?: Record<string, string | undefined>;
  /** Extra CLI flags to pass (e.g., ["--refresh"]). */
  extraArgs?: string[];
  /** Override the default timeout for the underlying TerminalSession. */
  defaultTimeout?: number;
};

export class EditWizard {
  readonly build: BuildStep;

  private constructor(
    private session: TerminalSession,
    private projectDir: string,
    build: BuildStep,
  ) {
    this.build = build;
  }

  /** Launch the edit wizard. Returns an EditWizard with BuildStep ready. */
  static async launch(options: EditWizardOptions): Promise<EditWizard> {
    const args = ["edit"];
    if (options.source) {
      args.push("--source", options.source.sourceDir);
    }
    if (options.extraArgs) {
      args.push(...options.extraArgs);
    }

    // Create permissions file to prevent blocking prompt after recompile
    await createPermissionsFile(options.projectDir);

    const env: Record<string, string | undefined> = {
      AGENTSINC_SOURCE: undefined,
      ...options.env,
    };

    const session = new TerminalSession(args, options.projectDir, {
      cols: options.cols,
      rows: options.rows,
      env,
      defaultTimeout: options.defaultTimeout,
    });

    // Edit wizard opens directly to the build step (no stack step in this path,
    // so STEP_TEXT.BUILD's "Framework" label does not collide with the stack
    // step's "Other Frameworks" group). Three-sentinel sequence:
    //   1. BUILD_FOOTER ("Filter incompatible") -- build-step-only footer hint,
    //      rendered on the first build frame.
    //   2. waitForWizardFooter -- absorbs subsequent redraws.
    //   3. BUILD ("Framework") -- first category label, ensures build content
    //      has fully painted before callers read scrollback. Without this,
    //      mid-redraw frames can pollute getFullOutput() with category labels
    //      overwritten by later rows.
    const screen = new TerminalScreen(session);
    await screen.waitForText(STEP_TEXT.BUILD_FOOTER, TIMEOUTS.WIZARD_TRANSITION);
    await screen.waitForWizardFooter(TIMEOUTS.WIZARD_TRANSITION);
    await screen.waitForText(STEP_TEXT.BUILD, TIMEOUTS.WIZARD_TRANSITION);

    const build = new BuildStep(session, options.projectDir);
    return new EditWizard(session, options.projectDir, build);
  }

  /**
   * Pass through the edit wizard without changing anything.
   * Build (all domains) -> Sources -> Agents -> Confirm
   */
  async passThrough(): Promise<WizardResult> {
    const sources = await this.build.passThroughAllDomains();
    const agents = await sources.acceptDefaults();
    const confirm = await agents.acceptDefaults("edit");
    return confirm.confirm();
  }

  /**
   * Navigate from a single-domain build step through to completion.
   * Single domain: Enter once on build -> sources -> agents -> confirm -> complete.
   */
  async completeFromBuild(): Promise<WizardResult> {
    return this.build.saveFromBuild("edit");
  }

  /** Get the full output of the session. */
  getOutput(): string {
    return this.session.getFullOutput();
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
   * session — the standard read-only-scenario teardown ritual.
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

  /** Destroy the session. */
  async destroy(): Promise<void> {
    await this.session.destroy();
  }
}
