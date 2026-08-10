import path from "path";
import { countBy, sortBy } from "remeda";

import { DEFAULT_VERSION, PLUGIN_MANIFEST_DIR, PLUGIN_MANIFEST_FILE } from "../consts";
import { writeFile, glob, ensureDir } from "../utils/fs";
import { verbose, warn } from "../utils/logger";
import type { Marketplace, MarketplacePlugin, PluginManifest } from "../types";
import { readPluginManifest } from "./plugins";

const PLUGIN_MANIFEST_PATH = `${PLUGIN_MANIFEST_DIR}/${PLUGIN_MANIFEST_FILE}`;
const MARKETPLACE_SCHEMA_URL = "https://anthropic.com/claude-code/marketplace.schema.json";

type MarketplaceOptions = {
  name: string;
  version?: string;
  description?: string;
  ownerName: string;
  ownerEmail?: string;
  pluginRoot: string;
};

function convertManifestToMarketplacePlugin(
  manifest: PluginManifest,
  pluginRoot: string,
  pluginDirName: string,
): MarketplacePlugin {
  return {
    name: manifest.name,
    source: `./${pluginRoot}/${pluginDirName}`,
    ...(manifest.description !== undefined && { description: manifest.description }),
    ...(manifest.version !== undefined && { version: manifest.version }),
    ...(manifest.author !== undefined && { author: manifest.author }),
    ...(manifest.category !== undefined && { category: manifest.category }),
    ...(manifest.keywords !== undefined && { keywords: manifest.keywords }),
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
    const separator = manifestFile.indexOf("/");
    const pluginDirName = separator === -1 ? manifestFile : manifestFile.slice(0, separator);
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
    version: options.version ?? DEFAULT_VERSION,
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
