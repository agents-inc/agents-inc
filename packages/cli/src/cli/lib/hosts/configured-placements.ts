/**
 * The placement refusal on the read path: `config.ts` carries no provider, so a config copied into
 * another provider's folder never met that host's pre-flight. Not run by `uninstall`, which must
 * still be able to remove such an installation.
 */

import {
  ConfigLoadError,
  configsInPlay,
  loadProjectConfigFromDir,
  type ConfigInPlay,
} from "../configuration/project-config.js";
import { getErrorMessage } from "../../utils/errors.js";
import type { SkillConfig } from "../../types/config.js";
import { hostFor } from "./host-for.js";
import { refuseUnofferedPlacements } from "./offered-placements.js";

/** Both scopes, each asked of its OWN host: the two scopes can be on different providers. */
export async function unofferablePlacementsFound(cwd: string): Promise<string[]> {
  const findings = await Promise.all(configsInPlay(cwd).map(unofferablePlacementIn));
  return findings.filter((finding): finding is string => finding !== null);
}

async function unofferablePlacementIn(config: ConfigInPlay): Promise<string | null> {
  const skills = await configuredSkillsAt(config);
  if (skills === null) return null;

  try {
    refuseUnofferedPlacements(skills, hostFor(config.provider));
    return null;
  } catch (error) {
    return getErrorMessage(error);
  }
}

/** Degrades on `ConfigLoadError` only, which `ensureConfigReadable` and doctor report by name. */
async function configuredSkillsAt({ dir, provider }: ConfigInPlay): Promise<SkillConfig[] | null> {
  try {
    const loaded = await loadProjectConfigFromDir(dir, provider);
    return loaded?.config.skills ?? null;
  } catch (error) {
    if (error instanceof ConfigLoadError) return null;
    throw error;
  }
}
