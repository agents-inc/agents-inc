import path from "path";

import { ensureDir, writeFile } from "../../utils/fs";
import { DEFAULT_VERSION } from "../../consts";
import type { PluginAuthor, PluginManifest } from "../../types";
import { getPluginManifestPath } from "./plugin-finder";

const AGENT_PLUGIN_PREFIX = "agent-";

type SkillManifestOptions = {
  skillName: string;
  description?: string;
  author?: string;
  authorEmail?: string;
  category?: string;
  version?: string;
  keywords?: string[];
};

type AgentManifestOptions = {
  agentName: string;
  description?: string;
  version?: string;
};

function buildAuthor(name?: string, email?: string): PluginAuthor | undefined {
  if (!name) {
    return undefined;
  }
  return { name, ...(email ? { email } : {}) };
}

export function generateSkillPluginManifest(options: SkillManifestOptions): PluginManifest {
  const author = buildAuthor(options.author, options.authorEmail);
  return {
    name: options.skillName,
    version: options.version ?? DEFAULT_VERSION,
    skills: "./skills/",
    ...(options.description ? { description: options.description } : {}),
    ...(author ? { author } : {}),
    ...(options.category ? { category: options.category } : {}),
    ...(options.keywords?.length ? { keywords: options.keywords } : {}),
  };
}

/** Both the plugin's manifest name and the folder it is built into. */
export function agentPluginName(agentName: string): string {
  return `${AGENT_PLUGIN_PREFIX}${agentName}`;
}

export function generateAgentPluginManifest(options: AgentManifestOptions): PluginManifest {
  return {
    name: agentPluginName(options.agentName),
    version: options.version ?? DEFAULT_VERSION,
    agents: "./agents/",
    ...(options.description ? { description: options.description } : {}),
  };
}

export async function writePluginManifest(
  outputDir: string,
  manifest: PluginManifest,
): Promise<string> {
  const manifestPath = getPluginManifestPath(outputDir);

  await ensureDir(path.dirname(manifestPath));

  const content = JSON.stringify(manifest, null, 2);
  await writeFile(manifestPath, content);

  return manifestPath;
}
