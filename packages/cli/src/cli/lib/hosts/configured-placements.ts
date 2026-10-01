/**
 * The placement refusal on the READ path: every command that acts on a configuration it did not
 * just write asks whether that configuration's host can place what it asks for.
 *
 * **Nothing ties a folder's contents to its name, and the ruling forbids the field that would.**
 * `config.ts` carries no provider — that is what keeps one saved configuration installable onto
 * either provider and every existing share id working — so a user who reads "the folder says the
 * provider" and copies `.agents-inc/claude/` to `.agents-inc/codex/` has a Codex installation
 * holding a configuration that never passed through `init --from --provider codex` and never met
 * its pre-flight. Every later command reads that file.
 *
 * **It reaches `compile`, `edit`, `update`, `share` and `doctor`, and it reached `compile` alone
 * until now.** The others were the half that made the refusal look complete while leaving the
 * configuration reachable: `edit` writes it, `update` acts on the marketplaces it names, `share`
 * publishes it to the store as "what is installed here", and `doctor` — the command whose whole
 * job is saying whether an installation is healthy — pronounced a clean bill of health on a
 * configuration no other command would act on. A diagnostic that disagrees with every command it
 * is diagnosing is worse than a missing one.
 *
 * **`share` was missing from that roster until 2026-09-22 while the roster claimed to be
 * complete**, which is the more expensive half of the defect: a list that names four commands and
 * says "every such command" stops anyone looking for a fifth. It was found by driving the commands
 * rather than by reading this sentence.
 *
 * **`uninstall` reads the same file and is deliberately not on the roster.** A refusal there would
 * make an unofferable installation unremovable, which is a guard that has swallowed its own
 * domain — the shape this package's rule against unpaired refusals is written about.
 *
 * **Doctor's is a ROW and the other four are refusals**, which is the same distinction
 * `BaseCommand.settleSourceLayoutBeforeWriting` already draws: a command that changes nothing must
 * not refuse to LOOK, because the state it is reporting on is exactly the state a user needs to
 * see. {@link unofferablePlacementsFound} is the shared reading and each caller decides its own
 * posture from it.
 *
 * One message, from one roster, at every door — `refuseUnofferedPlacements` reads the host's own
 * `offeredPlacements` — so the sentence a user gets from `compile` names the same cells the one
 * from `init` does. A second spelling written at the read path would be a second thing to keep
 * true.
 */

import {
  ConfigLoadError,
  configDirsInPlay,
  loadInstalledConfig,
} from "../configuration/project-config.js";
import { getErrorMessage } from "../../utils/errors.js";
import type { SkillConfig } from "../../types/config.js";
import { hostAt } from "./host-for.js";
import { refuseUnofferedPlacements } from "./offered-placements.js";

/**
 * Every unofferable-placement finding a run from `cwd` would meet, in the order it reads them.
 *
 * Both scopes, because a project inherits its global's rows and an unofferable row in either file
 * is a row the run would act on. Each installation is asked about its OWN host: two scopes can be
 * on different providers, and asking one host about the other's configuration is how a refusal
 * fires on a cell that is offered where the skill actually lives.
 *
 * **A config that exists and cannot be LOADED contributes nothing here**, and that is a posture
 * rather than an oversight: `BaseCommand.ensureConfigReadable` and `doctor`'s own Config row both
 * report that fault by name, and a second report of it wearing this refusal's words would name the
 * wrong cause. Only `ConfigLoadError` degrades — anything else is a real fault and propagates.
 */
export async function unofferablePlacementsFound(cwd: string): Promise<string[]> {
  const findings = await Promise.all(configDirsInPlay(cwd).map(unofferablePlacementIn));
  return findings.filter((finding): finding is string => finding !== null);
}

/** The finding one scope's configuration produces, or `null` when its host can place every row. */
async function unofferablePlacementIn(root: string): Promise<string | null> {
  const skills = await configuredSkillsAt(root);
  if (skills === null) return null;

  try {
    refuseUnofferedPlacements(skills, hostAt(root));
    return null;
  } catch (error) {
    return getErrorMessage(error);
  }
}

/**
 * The rows one scope's configuration carries, and `null` where there is nothing to ask about.
 *
 * DEGRADE posture, and only for `ConfigLoadError`: a configuration that exists and cannot be
 * parsed is a finding `ensureConfigReadable` and doctor's Config row each report by name, and
 * repeating it in this refusal's words would name the wrong cause. Every other failure is a real
 * fault and propagates, as `findConfigLoadFailures` does one module over.
 */
async function configuredSkillsAt(root: string): Promise<SkillConfig[] | null> {
  try {
    const loaded = await loadInstalledConfig(root);
    return loaded?.config.skills ?? null;
  } catch (error) {
    if (error instanceof ConfigLoadError) return null;
    throw error;
  }
}
