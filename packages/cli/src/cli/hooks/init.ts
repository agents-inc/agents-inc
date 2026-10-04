import os from "os";

import { flush, type Hook } from "@oclif/core";
import { runDashboardFlow } from "../commands/init.js";
import { findConfigLoadFailures } from "../lib/configuration/project-config.js";
import { retiredSourceFolderIn } from "../lib/installation/install-layout.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import {
  installationConfigsUnreadable,
  retiredSourceFolderUnsupported,
} from "../utils/messages.js";

const hook: Hook<"init"> = async function (options) {
  sayTheRetiredSourceFolderIsUnsupported(process.cwd());

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
 * One bare line, once per run, while the project or HOME holds the retired source folder.
 *
 * Here because every command passes through this hook exactly once, before it runs — so the line
 * is said once however many scopes hold the folder, and by every command alike. It is a notice
 * and nothing more: the run goes on exactly as it would without the folder, which no command
 * reads or writes. On stderr, so a command whose output is piped somewhere is not changed by it.
 */
function sayTheRetiredSourceFolderIsUnsupported(cwd: string): void {
  const replacement = retiredSourceFolderIn([cwd, os.homedir()]);
  if (replacement === null) return;
  process.stderr.write(`${retiredSourceFolderUnsupported(replacement)}\n`);
}

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
