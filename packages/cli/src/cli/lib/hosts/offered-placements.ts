/**
 * What makes {@link PluginHost.offeredPlacements} binding rather than decorative.
 *
 * The roster exists so that a refusal reads data off the host instead of being written as
 * `if (provider === "codex")` in the installer. A roster nothing consults is neither: it reads as
 * the rule while the installer goes on trying whatever it was asked for. So the seam enforces it
 * at the one verb that CHOOSES a placement, and it does so once — a rule each host re-implements
 * is a rule the next host forgets, and the forgetting is silent in the direction that looks fine.
 *
 * **The enforcement is at the DOOR, not inside a host.** `hostFor` wraps whatever host it answers
 * with {@link bindsItsOfferedPlacements}, so a host written in a later step is bound before its
 * author has read this file. Putting the same guard inside `claude-host.ts` would leave a branch
 * no Claude test can reach — Claude offers all four cells — and would have to be remembered again
 * for every host after it.
 *
 * **The refusal names the cells it read**, because a message that says only "not supported" leaves
 * the user to guess which of the remaining ones to ask for. `unbackedPluginInstallError` in
 * `operations/skills/install-plugin-skills.ts` is the precedent for a refusal that advises.
 */

import { EJECT_SOURCE } from "../../consts.js";
import type { SkillConfig } from "../../types/config.js";
import type { InstallPlacement, PluginHost } from "./plugin-host.js";

/** A placement as one comparable name. Nothing is parsed out of it — it is a spelling. */
function placementName(placement: InstallPlacement): string {
  return `${placement.mode}+${placement.scope}`;
}

function offersPlacement(host: PluginHost, placement: InstallPlacement): boolean {
  return host.offeredPlacements.some(
    (offered) => offered.mode === placement.mode && offered.scope === placement.scope,
  );
}

/**
 * Refuses a placement the host's own roster does not carry, naming the ones it does.
 *
 * Exported because the install pre-flight refuses the same thing earlier and from a config rather
 * than from one call — a user is owed the refusal before anything is written, not after the first
 * skill has been installed. Both readings come off the same roster, so they cannot disagree.
 */
export function refuseUnofferedPlacement(
  host: PluginHost,
  placement: InstallPlacement,
  subject: string,
): void {
  if (offersPlacement(host, placement)) return;

  throw new Error(
    `Refusing to install ${subject} as ${placementName(placement)}: the ${host.provider} host ` +
      `offers ${host.offeredPlacements.map(placementName).join(", ")}. Nothing has been changed.`,
  );
}

/**
 * The placement one configured skill asks for, in the product's own two words.
 *
 * `origin` carries the marketplace a plugin skill came from, so anything that is not
 * {@link EJECT_SOURCE} is a plugin row. Nothing is parsed out of the name — which marketplace it
 * was is a question for the installer, not for whether the cell exists at all.
 */
function placementAskedFor(skill: SkillConfig): InstallPlacement {
  return { mode: skill.origin === EJECT_SOURCE ? "eject" : "plugin", scope: skill.scope };
}

/**
 * Refuses a CONFIGURATION asking for a cell its host does not offer, naming the first such skill.
 *
 * **The read path needs this as much as the install path does, and nothing ties a folder's
 * contents to its name.** There is no `provider` field in `config.ts` and the ruling forbids one,
 * so a user who reads "the folder says the provider" and copies `.agents-inc/claude/` to
 * `.agents-inc/codex/` has a Codex installation holding a configuration that never passed through
 * `init --from --provider codex` and never met its pre-flight. Every later command reads that
 * file.
 *
 * It comes off the same roster {@link refuseUnofferedPlacement} reads, so the message a user gets
 * from `compile` names the same cells the one from `init` does. A second spelling written at the
 * read path would be a second thing to keep true.
 *
 * **Excluded rows are skipped**, because an excluded skill is one this installation is NOT
 * placing anywhere: refusing on one would make a configuration unreadable over a row whose whole
 * meaning is that nothing is installed for it.
 *
 * The FIRST offending row rather than all of them: the refusal is a stop, and a user fixing a
 * configuration reruns the command, so a list would be a list of guesses about rows the first fix
 * may well have been.
 */
export function refuseUnofferedPlacements(skills: readonly SkillConfig[], host: PluginHost): void {
  for (const skill of skills) {
    if (skill.excluded === true) continue;
    refuseUnofferedPlacement(host, placementAskedFor(skill), skill.id);
  }
}

/**
 * The same host, with its roster binding on the verb that picks a placement.
 *
 * `installPlugin` only: `uninstallPlugin` at a scope the host never installs at is an ordinary
 * no-op sweep, and `pluginScopesToSweep` in `commands/uninstall.tsx` already reads the roster to
 * decide how wide that sweep is.
 */
export function bindsItsOfferedPlacements(host: PluginHost): PluginHost {
  return {
    ...host,
    // `async` so a refused placement arrives as a rejected promise rather than as a synchronous
    // throw: `installPluginSkills` collects per-skill failures around an `await`, and a member
    // that threw before returning one would escape that collection and abort the whole install.
    installPlugin: async (pluginRef, scope, projectDir, options) => {
      refuseUnofferedPlacement(host, { mode: "plugin", scope }, pluginRef);
      return host.installPlugin(pluginRef, scope, projectDir, options);
    },
  };
}
