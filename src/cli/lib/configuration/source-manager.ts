import type { SourceEntry } from "./config";
import { loadProjectSourceConfig, DEFAULT_SOURCE } from "./config";
import { isHomeDirectory } from "../installation/is-home-directory";
import { lazyGateDeps, mutateGlobal, writeProjectPartial } from "../config-gate/index.js";
import { fetchMarketplace } from "../loading/source-fetcher";
import { discoverLocalSkills } from "../skills/local-skill-loader";
import { discoverAllPluginSkills } from "../plugins/plugin-discovery";
import { verbose } from "../../utils/logger";

const DEFAULT_SOURCE_NAME = "public";

export type SourceSummary = {
  sources: Array<SourceEntry & { enabled: boolean }>;
  localSkillCount: number;
  pluginSkillCount: number;
};

/**
 * Add a new source to the project configuration.
 * Validates the URL by fetching the marketplace.
 */
export async function addSource(
  projectDir: string,
  url: string,
): Promise<{ name: string; skillCount: number }> {
  const result = await fetchMarketplace(url, { forceRefresh: true });
  const name = result.marketplace.name;
  const skillCount = result.marketplace.plugins.length;

  await saveSourceList(projectDir, { kind: "add-source", entry: { name, url } }, (sources) => {
    if (sources.some((s) => s.name === name)) throw new Error(`Source "${name}" already exists`);
    return [...sources, { name, url }];
  });

  verbose(`Added source "${name}" with ${skillCount} skills`);
  return { name, skillCount };
}

/**
 * Remove a source by name. Cannot remove "public" (the default).
 */
export async function removeSource(projectDir: string, name: string): Promise<void> {
  if (name === DEFAULT_SOURCE_NAME) {
    throw new Error(`Cannot remove the "${DEFAULT_SOURCE_NAME}" source`);
  }

  await saveSourceList(projectDir, { kind: "remove-source", name }, (sources) => {
    const filtered = sources.filter((s) => s.name !== name);
    if (filtered.length === sources.length) throw new Error(`Source "${name}" not found`);
    return filtered;
  });

  verbose(`Removed source "${name}"`);
}

/**
 * Persists a change to the configured source list at whichever scope
 * `projectDir` names.
 *
 * At the home directory the file is the global manifest, so the change goes
 * through the gate: `sources` is a scalar the generated unions do not encode,
 * but registered projects inline it, so the gate propagates the config half
 * without regenerating any types or recompiling any agent. At project scope the
 * config is nobody else's input and is written directly.
 *
 * The write is immediate rather than deferred to the end of the wizard: the
 * sources step re-reads the persisted config to resolve what a newly added
 * marketplace offers, and a source the user confirmed by URL is a machine-level
 * preference that must survive an abandoned install.
 */
async function saveSourceList(
  projectDir: string,
  mutation: Parameters<typeof mutateGlobal>[0],
  apply: (sources: SourceEntry[]) => SourceEntry[],
): Promise<void> {
  if (isHomeDirectory(projectDir)) {
    await mutateGlobal(mutation, lazyGateDeps(projectDir));
    return;
  }

  const config = (await loadProjectSourceConfig(projectDir)) ?? {};
  await writeProjectPartial(projectDir, { ...config, sources: apply(config.sources ?? []) });
}

/**
 * Get summary of all configured sources and local/plugin counts.
 */
export async function getSourceSummary(projectDir: string): Promise<SourceSummary> {
  const config = (await loadProjectSourceConfig(projectDir)) ?? {};

  const sources: Array<SourceEntry & { enabled: boolean }> = [
    { name: DEFAULT_SOURCE_NAME, url: config.source ?? DEFAULT_SOURCE, enabled: true },
    ...(config.sources ?? []).map((source) => ({ ...source, enabled: true })),
  ];

  const [localSkillCount, pluginSkillCount] = await Promise.all([
    countLocalSkills(projectDir),
    countPluginSkills(projectDir),
  ]);

  return { sources, localSkillCount, pluginSkillCount };
}

async function countLocalSkills(projectDir: string): Promise<number> {
  try {
    const localResult = await discoverLocalSkills(projectDir);
    return localResult ? localResult.skills.length : 0;
  } catch {
    verbose("Failed to discover local skills for source summary");
    return 0;
  }
}

async function countPluginSkills(projectDir: string): Promise<number> {
  try {
    const discoveredSkills = await discoverAllPluginSkills(projectDir);
    return Object.keys(discoveredSkills).length;
  } catch {
    verbose("Failed to discover plugin skills for source summary");
    return 0;
  }
}
