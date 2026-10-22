import fs from "fs";

import { PROVIDERS, type Provider } from "../../consts.js";
import { getProjectConfigPath } from "./install-base-dir.js";
import { isTheProviderOfANewInstallation } from "./install-layout.js";

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

/**
 * For a handed-out `init --from`: also names `provider` alone in `root` when a bare `init` would
 * create another one in its place. `uninstall` and `edit` act on a lone installation bare.
 */
export function initProviderToNameAt(root: string, provider: Provider): Provider | undefined {
  return (
    providerToNameAt(root, provider) ??
    (isTheProviderOfANewInstallation(provider) ? undefined : provider)
  );
}
