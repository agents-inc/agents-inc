import type { Provider } from "../../consts.js";
import { PROVIDERS } from "../../consts.js";
import { fileExists } from "../../utils/fs.js";
import { getProjectConfigPath } from "./install-base-dir.js";
import { scopeRootsInPlay, type ScopeKind, type ScopeRoot } from "./source-scopes.js";

export type DetectedInstallation = {
  provider: Provider;
  scope: ScopeKind;
  configPath: string;
};

/**
 * Global before project, roster order within a scope. Only a folder holding `config.ts` counts,
 * and a scope holding both providers yields two entries.
 */
export async function detectInstallations(cwd: string): Promise<DetectedInstallation[]> {
  const everywhereOneCouldBe = scopeRootsInPlay(cwd).flatMap(everyProviderUnder);
  const found = await Promise.all(everywhereOneCouldBe.map(installationIfPresent));

  return found.filter(
    (installation): installation is DetectedInstallation => installation !== null,
  );
}

function everyProviderUnder({ kind, root }: ScopeRoot): DetectedInstallation[] {
  return PROVIDERS.map((provider) => ({
    provider,
    scope: kind,
    configPath: getProjectConfigPath(root, provider),
  }));
}

async function installationIfPresent(
  candidate: DetectedInstallation,
): Promise<DetectedInstallation | null> {
  return (await fileExists(candidate.configPath)) ? candidate : null;
}
