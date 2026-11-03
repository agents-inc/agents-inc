import { flush, type Hook } from "@oclif/core";
import { runDashboardFlow } from "../commands/init.js";
import type { Provider } from "../consts.js";
import { findConfigLoadFailures } from "../lib/configuration/project-config.js";
import { detectInstallations } from "../lib/installation/detect-installations.js";
import {
  forgetTheProviderChosenForThisRun,
  providerInUse,
  rootsHoldingTheRetiredSourceFolder,
} from "../lib/installation/install-layout.js";
import { isHomeDirectory } from "../lib/installation/is-home-directory.js";
import { providerNamedIn } from "../lib/installation/provider-flag.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { installationConfigsUnreadable, retiredSourceFolderIgnored } from "../utils/messages.js";

const hook: Hook<"init"> = async function (options) {
  forgetTheProviderChosenForThisRun();
  // Before any path is read: `providerInUse` cannot load a config, so the roster records which
  // of the project's declare nothing.
  const projectHoldsOne = await projectHoldsAnInstallation(process.cwd());
  sayTheRetiredSourceFolderIsIgnored(
    process.cwd(),
    providerNamedIn(options.argv),
    projectHoldsOne || installsTheProject(options.id, options.argv),
  );

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

/**
 * Before any command's output, on stderr so piped output is unchanged; nothing reads the folder.
 * Flags are not parsed yet, so the provider a run names is read off its arguments: that run reads
 * the named provider's folder in every root.
 */
function sayTheRetiredSourceFolderIsIgnored(
  cwd: string,
  named: Provider | undefined,
  projectHasOne: boolean,
): void {
  for (const root of rootsHoldingTheRetiredSourceFolder(cwd)) {
    const provider = named ?? providerReadIn(root, cwd, projectHasOne);
    process.stderr.write(`${retiredSourceFolderIgnored(root, provider)}\n`);
  }
}

/**
 * A run naming no provider reads a project with its own tool, and HOME with the project's, as it
 * reads HOME's config; a project holding no installation, and getting none, leaves the run on
 * HOME's own.
 */
function providerReadIn(root: string, cwd: string, projectHasOne: boolean): Provider {
  if (!isHomeDirectory(root)) return providerInUse(root);
  return providerInUse(projectHasOne ? cwd : root);
}

const INIT_COMMAND = "init";
const FROM_FLAG = "--from";
const UI_FLAG = "--ui";

/** `init --from` installs the project unless `--ui` sends it to the editor instead. */
function installsTheProject(id: string | undefined, argv: readonly string[]): boolean {
  if (id !== INIT_COMMAND || argv.includes(UI_FLAG)) return false;
  return argv.some((token) => token === FROM_FLAG || token.startsWith(`${FROM_FLAG}=`));
}

/** A project config declaring nothing is not an installation, so it is not counted here. */
async function projectHoldsAnInstallation(cwd: string): Promise<boolean> {
  const found = await detectInstallations(cwd);
  return found.some((installation) => installation.scope === "project");
}

/** Not `this.exit(0)`: oclif swallows an exit 0 from a hook and goes on to print the root help. */
async function endRun(code: number): Promise<never> {
  await flush();
  process.exit(code);
}

export default hook;
