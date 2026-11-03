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
import type { Provider } from "../../consts.js";
import type { SkillConfig } from "../../types/config.js";
import { hostFor } from "./host-for.js";
import { refuseUnofferedPlacements } from "./offered-placements.js";

/** Both scopes, each asked of its OWN host: the two scopes can be on different providers. */
export async function unofferablePlacementsFound(cwd: string): Promise<string[]> {
  return refusalsAmong(await Promise.all(configsInPlay(cwd).map(placementsAskedIn)));
}

/** A config's skills and its host's refusal of them; neither from one absent or unloadable. */
export type PlacementsAsked = { skills: SkillConfig[]; refusal: string | null };

export async function placementsAskedIn(config: ConfigInPlay): Promise<PlacementsAsked> {
  const skills = await configuredSkillsAt(config);
  if (skills === null) return { skills: [], refusal: null };

  return { skills, refusal: refusalOf(skills, config.provider) };
}

export function refusalsAmong(asked: readonly PlacementsAsked[]): string[] {
  return asked.map(({ refusal }) => refusal).filter((refusal) => refusal !== null);
}

function refusalOf(skills: SkillConfig[], provider: Provider): string | null {
  try {
    refuseUnofferedPlacements(skills, hostFor(provider));
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
