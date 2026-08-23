import path from "path";

import { ensureDir, writeFile } from "../../utils/fs";
import { DEFAULT_VERSION, PLUGIN_MANIFEST_DIR, STANDARD_FILES } from "../../consts";
import type { PluginAuthor, PluginManifest } from "../../types";

const PLUGIN_DIR_NAME = PLUGIN_MANIFEST_DIR;
const PLUGIN_MANIFEST_FILE = STANDARD_FILES.PLUGIN_JSON;
const AGENT_PLUGIN_PREFIX = "agent-";

export type SkillManifestOptions = {
  skillName: string;
  description?: string;
  author?: string;
  authorEmail?: string;
  category?: string;
  version?: string;
  keywords?: string[];
};

export type AgentManifestOptions = {
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

export function generateAgentPluginManifest(options: AgentManifestOptions): PluginManifest {
  return {
    name: `${AGENT_PLUGIN_PREFIX}${options.agentName}`,
    version: options.version ?? DEFAULT_VERSION,
    agents: "./agents/",
    ...(options.description ? { description: options.description } : {}),
  };
}

export async function writePluginManifest(
  outputDir: string,
  manifest: PluginManifest,
): Promise<string> {
  const pluginDir = path.join(outputDir, PLUGIN_DIR_NAME);
  const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST_FILE);

  await ensureDir(pluginDir);

  const content = JSON.stringify(manifest, null, 2);
  await writeFile(manifestPath, content);

  return manifestPath;
}
