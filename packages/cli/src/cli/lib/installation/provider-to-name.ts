import fs from "fs";

import { PROVIDERS, type Provider } from "../../consts.js";
import { getProjectConfigPath } from "./install-base-dir.js";

/**
 * `provider`, where `root` also holds another provider's installation: there every acting command
 * refuses until it is told which, so a command handed out for this one must name it. Synchronous,
 * because the error that carries it is built where it is thrown.
 */
export function providerToNameAt(root: string, provider: Provider): Provider | undefined {
  const besideAnother = PROVIDERS.some(
    (other) => other !== provider && fs.existsSync(getProjectConfigPath(root, other)),
  );
  return besideAnother ? provider : undefined;
}
