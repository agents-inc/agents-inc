import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { STEP_TEXT } from "../pages/constants.js";
import { browserOpenerCommand } from "../../src/cli/utils/open-url.js";

// `openUrl` spawns its opener by name, so a stub first on PATH logs the link instead of opening a tab.
export type BrowserOpenerStub = {
  path: string;
  /** One argument per line; absent until something is opened. */
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
