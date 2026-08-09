import { TerminalSession } from "../../helpers/terminal-session.js";
import type { E2ESource } from "../../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createPermissionsFile,
  recordInstallSource,
} from "../../helpers/test-utils.js";
import { allocateProjectGlobalHome } from "./global-home.js";
import { STEP_TEXT, TIMEOUTS } from "../constants.js";
import { TerminalScreen } from "../terminal-screen.js";
import { BuildStep } from "../steps/build-step.js";
import type { WizardResult } from "../wizard-result.js";

export type EditWizardOptions = {
  /** Project directory (required -- must have existing installation). */
  projectDir: string;
  /**
   * The source this installation answers to.
   *
   * `edit` takes no `--source` and reads no `CC_SOURCE` — naming a source is `init`'s
   * decision (CLI-466) — so this is RECORDED in the install's config.ts before the
   * wizard launches, exactly as an `init --source` would have left it. Installs that
   * already name their own source (anything a wizard produced) are untouched.
   */
  source?: E2ESource;
  /** Terminal dimensions */
  cols?: number;
  rows?: number;
  /** Custom environment variables (merged with defaults). */
  env?: Record<string, string | undefined>;
  /** Extra CLI flags to pass (e.g., ["--project-setup"]). */
  extraArgs?: string[];
  /** Override the default timeout for the underlying TerminalSession. */
  defaultTimeout?: number;
  /**
   * Reuse an existing global HOME dir instead of allocating a fresh one
   * (launchInProject only). When set, this dir becomes the spawned CLI's HOME,
   * is stamped onto the WizardResult, and is exposed as `wizard.globalHome`, but
   * the wizard does NOT own its cleanup — the allocator (the test) does. Use for
   * multi-phase flows where this edit must see an earlier phase's global
   * content. Ignored by launch()/launchInGlobal().
   */
  globalHome?: string;
};

export class EditWizard {
  readonly build: BuildStep;
  private cleanupDirs: string[];
  private readonly _globalHome: string | undefined;

  private constructor(
    private session: TerminalSession,
    private projectDir: string,
    build: BuildStep,
    cleanupDirs: string[],
    globalHome: string | undefined,
  ) {
    this.build = build;
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
        "globalHome is only exposed on EditWizard.launchInProject()/launchInGlobal(); " +
          "launch() uses an internal auto-allocated HOME.",
      );
    }
    return this._globalHome;
  }

  /**
   * Spawn the edit session and wait for the build step to fully paint.
   * `globalHome` sets the spawned process's HOME (undefined = internal
   * auto-allocated) and is echoed onto the session for assertions.
   */
  private static async createSession(
    options: EditWizardOptions,
    globalHome: string | undefined,
    awaitBuildCategory = true,
  ): Promise<{ session: TerminalSession; build: BuildStep }> {
    const args = ["edit"];
    if (options.extraArgs) {
      args.push(...options.extraArgs);
    }

    if (options.source) {
      // In `resolveSource`'s own order: the project's config, then whichever HOME this
      // session runs under — a global-only install keeps its config there and nowhere else.
      const homes = [globalHome, options.env?.HOME].filter((dir) => dir !== undefined);
      await recordInstallSource([options.projectDir, ...homes], options.source.sourceDir);
    }

    // Create permissions file to prevent blocking prompt after recompile
    await createPermissionsFile(options.projectDir);

    const env: Record<string, string | undefined> = {
      CC_SOURCE: undefined,
      ...options.env,
      ...(globalHome !== undefined ? { HOME: globalHome } : {}),
    };

    const session = new TerminalSession(args, options.projectDir, {
      ...(options.cols !== undefined && { cols: options.cols }),
      ...(options.rows !== undefined && { rows: options.rows }),
      env,
      ...(options.defaultTimeout !== undefined && { defaultTimeout: options.defaultTimeout }),
      ...(globalHome !== undefined && { globalHome }),
    });

    // Edit wizard opens directly to the build step (no stack step in this path,
    // so STEP_TEXT.BUILD's "Framework" label does not collide with the stack
    // step's "Other Frameworks" group). Three-sentinel sequence:
    //   1. BUILD_FOOTER ("Labels") -- build-step-only footer hint,
    //      rendered on the first build frame.
    //   2. waitForWizardFooter -- absorbs subsequent redraws.
    //   3. BUILD ("Framework") -- first category label, ensures build content
    //      has fully painted before callers read scrollback. Without this,
    //      mid-redraw frames can pollute getFullOutput() with category labels
    //      overwritten by later rows.
    //
    // The third wait is skipped when `awaitBuildCategory` is false: at a very
    // short terminal height the build grid overflows the viewport and the
    // "Framework" category header is overdrawn by later rows, so it never
    // settles as a stable substring. The launcher-only step-through callers
    // (blind Enter navigation + focused-skill toggles) do not read the grid, so
    // BUILD_FOOTER + footer is a sufficient "build step is live" signal for them.
    const screen = new TerminalScreen(session);
    await screen.waitForText(STEP_TEXT.BUILD_FOOTER, TIMEOUTS.WIZARD_TRANSITION);
    await screen.waitForWizardFooter(TIMEOUTS.WIZARD_TRANSITION);
    if (awaitBuildCategory) {
      await screen.waitForText(STEP_TEXT.BUILD, TIMEOUTS.WIZARD_TRANSITION);
    }

    const build = new BuildStep(session, options.projectDir);
    return { session, build };
  }

  /**
   * Launch the edit wizard. Returns an EditWizard with BuildStep ready.
   *
   * Escape hatch: HOME is an internal auto-allocated sibling dir that is NOT
   * exposed (`wizard.globalHome` throws). Use launchInProject() when the test
   * asserts on installed content (`.claude/skills`, compiled agents,
   * settings.json).
   */
  static async launch(options: EditWizardOptions): Promise<EditWizard> {
    const { session, build } = await EditWizard.createSession(options, undefined);
    return new EditWizard(session, options.projectDir, build, [], undefined);
  }

  /**
   * Launch `cc edit` as a PROJECT install: HOME is a fresh dir distinct from
   * projectDir, exposed as `wizard.globalHome`. Global-scoped install content
   * (compiled agents, ejected skills for global-scoped entries) lands at
   * `<globalHome>/.claude/...`; the project config.ts stays under projectDir.
   * The auto-allocated globalHome is removed by destroy().
   */
  static async launchInProject(options: EditWizardOptions): Promise<EditWizard> {
    const { dir: globalHome, cleanupDirs } = await allocateProjectGlobalHome(options.globalHome);
    const { session, build } = await EditWizard.createSession(options, globalHome);
    return new EditWizard(session, options.projectDir, build, cleanupDirs, globalHome);
  }

  /**
   * launchInProject variant for very short terminals (TERMINAL_SIZE.SHORT), where
   * the build grid overflows the viewport and the "Framework" category header
   * never settles as a stable substring. Skips the build-category settle wait
   * (BUILD_FOOTER + footer still confirm the build step is live). ONLY valid for
   * callers that step through the build step blind — pressing Enter to advance
   * domains and toggling the already-focused skill — never for callers that read
   * the grid to locate a skill by name (findSkillGridPosition needs the clean
   * category layout this variant deliberately does not wait for).
   *
   * Since the size gate rose to 20 rows the first category header does settle at
   * SHORT, so this is now a tolerance rather than a necessity — the grid still
   * overflows (the second category card is clipped) and blind callers still have
   * no reason to wait on a layout they never read.
   */
  static async launchInProjectShort(options: EditWizardOptions): Promise<EditWizard> {
    const { dir: globalHome, cleanupDirs } = await allocateProjectGlobalHome(options.globalHome);
    const { session, build } = await EditWizard.createSession(options, globalHome, false);
    return new EditWizard(session, options.projectDir, build, cleanupDirs, globalHome);
  }

  /**
   * Launch `cc edit` on the GLOBAL install: HOME === cwd === projectDir (the
   * intentional collapse). `wizard.globalHome` equals projectDir; no extra dir
   * is allocated, so destroy() leaves projectDir to the caller's own cleanup.
   */
  static async launchInGlobal(options: EditWizardOptions): Promise<EditWizard> {
    const globalHome = options.projectDir;
    const { session, build } = await EditWizard.createSession(options, globalHome);
    return new EditWizard(session, options.projectDir, build, [], globalHome);
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

  /** Destroy the session and clean up any wizard-owned temp dirs (globalHome). */
  async destroy(): Promise<void> {
    await this.session.destroy();
    for (const dir of this.cleanupDirs) {
      await cleanupTempDir(dir);
    }
  }
}
