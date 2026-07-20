import type { SourceEntry } from "./config";
import { loadProjectSourceConfig, DEFAULT_SOURCE } from "./config";
import { writePartialProjectConfig } from "./config-writer";
import { fetchMarketplace } from "../loading/source-fetcher";
import { discoverLocalSkills } from "../skills/local-skill-loader";
import { discoverAllPluginSkills } from "../plugins/plugin-discovery";
import type { ProjectConfig } from "../../types";
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

  const config = (await loadProjectSourceConfig(projectDir)) ?? {};
  const sources = config.sources ?? [];

  const exists = sources.some((s) => s.name === name);
  if (exists) {
    throw new Error(`Source "${name}" already exists`);
  }

  const updated: Partial<ProjectConfig> = { ...config, sources: [...sources, { name, url }] };
  await writePartialProjectConfig(projectDir, updated);

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

  const config = (await loadProjectSourceConfig(projectDir)) ?? {};
  const sources = config.sources ?? [];

  const filtered = sources.filter((s) => s.name !== name);
  if (filtered.length === sources.length) {
    throw new Error(`Source "${name}" not found`);
  }

  const updated: Partial<ProjectConfig> = { ...config, sources: filtered };
  await writePartialProjectConfig(projectDir, updated);

  verbose(`Removed source "${name}"`);
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
