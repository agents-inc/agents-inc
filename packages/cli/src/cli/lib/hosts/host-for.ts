/** The door to a host's plugin machinery; every host leaves with its placements binding. */

import type { Provider } from "../../consts.js";
import { providerInUse } from "../installation/install-layout.js";
import { claudeHost } from "./claude-host.js";
import { codexHost } from "./codex-host.js";
import { bindsItsOfferedPlacements } from "./offered-placements.js";
import type { PluginHost } from "./plugin-host.js";

/** For a run TOLD its provider, e.g. `init --from --provider` before the folder exists. */
export function hostFor(provider: Provider): PluginHost {
  switch (provider) {
    case "claude":
      return bindsItsOfferedPlacements(claudeHost());
    case "codex":
      return bindsItsOfferedPlacements(codexHost());
    default: {
      const _exhaustive: never = provider;
      return _exhaustive;
    }
  }
}

/** For a caller holding only a directory: the folder is the only record of a provider. */
export function hostAt(root: string): PluginHost {
  return hostFor(providerInUse(root));
}
