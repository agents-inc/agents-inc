/**
 * The door every caller goes through to reach a host's plugin machinery.
 *
 * Two doors, because there are two ways a run knows which provider it is about and they are not
 * the same question:
 *
 * - {@link hostAt} — a caller holding a DIRECTORY and nothing else. The folder is the only record
 *   of a provider (there is no field in `config.ts` and nothing in a shared payload carries one),
 *   so this is C2's `providerInUse` with a host on the end of it. Almost every caller is this one.
 * - {@link hostFor} — a caller that has been TOLD the provider. `--provider` on a greenfield
 *   `init --from` is the case that exists, and it is the one no folder can answer, because the
 *   folder has not been created yet.
 *
 * **Both providers answer a host from C4, and the refusal that stood here until then is gone.**
 * It read "this release has a host for claude only", and its twin at the paths —
 * `refuseAProviderWithNoHost` in `install-layout.ts` — is deleted in the same step. Neither was
 * widened: a refusal that names one provider and a roster that names two cannot both be the rule,
 * and the switch below is now total over {@link Provider}, so the next provider is a compiler
 * error here rather than a silent fall-through into Claude's machinery.
 *
 * **Every host leaves here with its offered placements binding.** {@link bindsItsOfferedPlacements}
 * is applied once, at the door, rather than inside each host: a rule each host re-implements is a
 * rule the next host forgets, and for the one host this release ships every cell is offered, so
 * the omission would never have shown up.
 */

import type { Provider } from "../../consts.js";
import { providerInUse } from "../installation/install-layout.js";
import { claudeHost } from "./claude-host.js";
import { codexHost } from "./codex-host.js";
import { bindsItsOfferedPlacements } from "./offered-placements.js";
import type { PluginHost } from "./plugin-host.js";

/** The host for a provider this run has been told, rather than one it read off a folder. */
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

/**
 * The host the installation under `root` belongs to.
 *
 * @throws where the folder names a provider this release has no host for — the refusal is
 *   `providerInUse`'s, raised before this module is reached.
 */
export function hostAt(root: string): PluginHost {
  return hostFor(providerInUse(root));
}
