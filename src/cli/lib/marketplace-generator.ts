import path from "path";
import { countBy, sortBy } from "remeda";

import { MAX_PLUGIN_FILE_SIZE } from "../consts";
import { getErrorMessage } from "../utils/errors";
import { readFileSafe, writeFile, glob, ensureDir } from "../utils/fs";
import { verbose, warn } from "../utils/logger";
import type { Marketplace, MarketplacePlugin, PluginManifest } from "../types";
import { pluginManifestSchema } from "./schemas";

const PLUGIN_MANIFEST_PATH = ".claude-plugin/plugin.json";
const MARKETPLACE_SCHEMA_URL = "https://anthropic.com/claude-code/marketplace.schema.json";

type MarketplaceOptions = {
  name: string;
  version?: string;
  description?: string;
  ownerName: string;
  ownerEmail?: string;
  pluginRoot: string;
};

async function readPluginManifest(pluginDir: string): Promise<PluginManifest | null> {
  const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST_PATH);

  try {
    const content = await readFileSafe(manifestPath, MAX_PLUGIN_FILE_SIZE);
    return pluginManifestSchema.parse(JSON.parse(content));
  } catch (error) {
    verbose(`Failed to read plugin manifest at '${manifestPath}': ${getErrorMessage(error)}`);
    return null;
  }
}

function convertManifestToMarketplacePlugin(
  manifest: PluginManifest,
  pluginRoot: string,
  pluginDirName: string,
): MarketplacePlugin {
  return {
    name: manifest.name,
    source: `./${pluginRoot}/${pluginDirName}`,
    description: manifest.description,
    version: manifest.version,
    author: manifest.author,
    keywords: manifest.keywords,
  };
}

export async function generateMarketplace(
  pluginsDir: string,
  options: MarketplaceOptions,
): Promise<Marketplace> {
  verbose(`Scanning plugins directory: ${pluginsDir}`);

  const manifestFiles = await glob(`**/${PLUGIN_MANIFEST_PATH}`, pluginsDir);
  verbose(`Found ${manifestFiles.length} plugin manifests`);

  const plugins: MarketplacePlugin[] = [];

  for (const manifestFile of manifestFiles) {
    const pluginDirName = manifestFile.split("/")[0];
    const pluginDir = path.join(pluginsDir, pluginDirName);

    const manifest = await readPluginManifest(pluginDir);
    if (!manifest) {
      warn(`Could not read plugin manifest: '${manifestFile}'`);
      continue;
    }

    const plugin = convertManifestToMarketplacePlugin(
      manifest,
      options.pluginRoot.replace(/^\.\//, ""),
      pluginDirName,
    );
    plugins.push(plugin);
    verbose(`  [OK] ${plugin.name}`);
  }

  const sortedPlugins = sortBy(plugins, (p) => p.name);

  // Field order matters: the object is serialized verbatim into marketplace.json,
  // so conditional fields keep the same positions the previous emissions used.
  return {
    $schema: MARKETPLACE_SCHEMA_URL,
    name: options.name,
    version: options.version ?? "1.0.0",
    owner: {
      name: options.ownerName,
      ...(options.ownerEmail ? { email: options.ownerEmail } : {}),
    },
    metadata: {
      pluginRoot: options.pluginRoot,
    },
    plugins: sortedPlugins,
    ...(options.description ? { description: options.description } : {}),
  };
}

export async function writeMarketplace(
  outputPath: string,
  marketplace: Marketplace,
): Promise<void> {
  await ensureDir(path.dirname(outputPath));
  const content = `${JSON.stringify(marketplace, null, 2)}\n`;
  await writeFile(outputPath, content);
}

export function getMarketplaceStats(marketplace: Marketplace): {
  total: number;
  byCategory: Record<string, number>;
} {
  return {
    total: marketplace.plugins.length,
    byCategory: countBy(marketplace.plugins, (p) => p.category ?? "uncategorized"),
  };
}
