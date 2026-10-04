import { flush, type Hook } from "@oclif/core";
import { runDashboardFlow } from "../commands/init.js";
import { findConfigLoadFailures } from "../lib/configuration/project-config.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { installationConfigsUnreadable } from "../utils/messages.js";

const hook: Hook<"init"> = async function (options) {
  // When no command is given and project is already initialized, show dashboard
  if (options.id === undefined) {
    const projectDir = process.cwd();
    // Refused as every command refuses it (`BaseCommand.ensureConfigReadable`). Left to the
    // dashboard, the load error was swallowed by oclif's hook runner and the run printed the root
    // help, as though nothing were installed.
    const unreadable = await findConfigLoadFailures(projectDir);
    if (unreadable.length > 0) {
      this.error(installationConfigsUnreadable(unreadable), { exit: EXIT_CODES.ERROR });
    }

    const dashboard = await runDashboardFlow(projectDir, options.config, "standalone");
    if (dashboard === "cancelled") this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });
    if (dashboard === "shown") await endRun(EXIT_CODES.SUCCESS);
  }
};

/**
 * Ends the run here, once the dashboard is done with it.
 *
 * `this.exit(0)` cannot: oclif swallows an exit 0 thrown from a hook and carries on with the run
 * the hook interrupted — and a run with no command is a request for the root help, so the full help
 * listing printed under every dashboard that was left with Escape or a chosen command. A non-zero
 * exit is not swallowed, which is why Ctrl+C's `this.error` already ended the run. This is the
 * ending oclif's own error handler gives a command's `this.exit()`, with the output flushed first.
 */
async function endRun(code: number): Promise<never> {
  await flush();
  process.exit(code);
}

export default hook;
