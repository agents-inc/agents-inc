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

  // A named command runs as named; no command is the dashboard.
  if (options.id !== undefined) return;

  const projectDir = process.cwd();
  // Checked here: oclif's hook runner swallows a load error thrown inside the dashboard.
  const unreadable = await findConfigLoadFailures(projectDir);
  if (unreadable.length > 0) {
    this.error(installationConfigsUnreadable(unreadable), { exit: EXIT_CODES.ERROR });
  }

  const dashboard = await runDashboardFlow(projectDir, options.config);
  switch (dashboard) {
    case "cancelled":
      return this.error("Cancelled", { exit: EXIT_CODES.CANCELLED });
    case "shown":
      return endRun(EXIT_CODES.SUCCESS);
    case "not-installed":
      // oclif goes on to print the root help.
      return;
    default: {
      const _exhaustive: never = dashboard;
      return _exhaustive;
    }
  }
};

/** Notice only, once per root that holds the folder, home first; stderr so piped output is unchanged. */
function sayTheRetiredSourceFolderIsUnsupported(cwd: string): void {
  for (const root of retiredSourceFolderIn([os.homedir(), cwd])) {
    process.stderr.write(`${retiredSourceFolderUnsupported(root)}\n`);
  }
}

/** Not `this.exit(0)`: oclif swallows an exit 0 from a hook and goes on to print the root help. */
async function endRun(code: number): Promise<never> {
  await flush();
  process.exit(code);
}

export default hook;
