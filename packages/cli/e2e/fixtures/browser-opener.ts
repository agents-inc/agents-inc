import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { STEP_TEXT } from "../pages/constants.js";
import { browserOpenerCommand } from "../../src/cli/utils/open-url.js";

/**
 * The browser a spawned CLI can reach, replaced by one that writes down what it was handed.
 *
 * `openUrl` spawns its platform's opener by name with no shell, so a stub of that name first on
 * `PATH` is the only browser the run can reach: a machine with a real one opens no tab, and the
 * spec reads {@link BrowserOpenerStub.logPath} to know whether a link was opened at all, and which.
 */
export type BrowserOpenerStub = {
  /** The `PATH` to hand the spawned CLI — the stub's directory in front of this process's own. */
  path: string;
  /** Every argument the opener was handed, one per line. Absent until something is opened. */
  logPath: string;
};

export async function stubBrowserOpener(dir: string): Promise<BrowserOpenerStub> {
  const binDir = path.join(dir, "browser-opener-bin");
  const logPath = path.join(dir, "browser-opener.log");
  const { command } = browserOpenerCommand(process.platform, STEP_TEXT.EDITOR_URL);

  await mkdir(binDir, { recursive: true });
  await writeFile(
    path.join(binDir, command),
    `#!/bin/sh\nprintf '%s\\n' "$@" >> ${JSON.stringify(logPath)}\n`,
    { mode: 0o755 },
  );

  return { path: `${binDir}${path.delimiter}${process.env.PATH ?? ""}`, logPath };
}
