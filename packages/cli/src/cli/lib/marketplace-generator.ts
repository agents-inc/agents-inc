import path from "path";
import { countBy, sortBy } from "remeda";

import {
  DEFAULT_PUBLIC_SOURCE_NAME,
  DEFAULT_VERSION,
  EJECT_SOURCE,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  PUBLIC_CATALOGUE_PACKAGE,
} from "../consts";
import { writeFile, glob, ensureDir } from "../utils/fs";
import { verbose, warn } from "../utils/logger";
import type { Marketplace, MarketplacePlugin, PluginManifest } from "../types";
// Not the `./plugins` barrel, which reaches the loader back through plugin discovery.
import { readPluginManifest } from "./plugins/plugin-finder";

const PLUGIN_MANIFEST_PATH = `${PLUGIN_MANIFEST_DIR}/${PLUGIN_MANIFEST_FILE}`;
const MARKETPLACE_SCHEMA_URL = "https://anthropic.com/claude-code/marketplace.schema.json";

const EXTERNAL_SKILL_NAMESPACE = "external";

const LOCAL_SKILL_NAMESPACE = "local";

/** Ids an author does not own: the catalogue's, `external`, `local`, and `eject`. */
const RESERVED_MARKETPLACE_NAMES: readonly string[] = [
  DEFAULT_PUBLIC_SOURCE_NAME,
  EXTERNAL_SKILL_NAMESPACE,
  LOCAL_SKILL_NAMESPACE,
  EJECT_SOURCE,
];

const MAX_REPORTED_NAMESPACE_VIOLATIONS = 10;

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
    const pluginDirName = pluginDirNameOf(manifestFile);
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

  // Field order matters: the object is serialized verbatim into marketplace.json.
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

/** The first segment of a manifest's path under the plugins directory. */
function pluginDirNameOf(manifestFile: string): string {
  const separator = manifestFile.indexOf("/");
  return separator === -1 ? manifestFile : manifestFile.slice(0, separator);
}

/** `packageName` tells the catalogue's own package from a claimant; `wayOut` is the remedy. */
export function validateMarketplaceName(
  marketplaceName: string,
  packageName: string,
  wayOut: string,
): string | null {
  if (!RESERVED_MARKETPLACE_NAMES.includes(marketplaceName)) return null;
  if (isCatalogueOwnReservedName(marketplaceName, packageName)) return null;

  return reservedNameError(marketplaceName, wayOut);
}

/** The reserved list less the catalogue's own name: a load has no package.json to check. */
export function validateLoadedMarketplaceName(
  marketplaceName: string,
  wayOut: string,
): string | null {
  if (marketplaceName === DEFAULT_PUBLIC_SOURCE_NAME) return null;
  return RESERVED_MARKETPLACE_NAMES.includes(marketplaceName)
    ? reservedNameError(marketplaceName, wayOut)
    : null;
}

/**
 * The public catalogue is exempt, which is safe only because `validateMarketplaceName` runs first.
 */
export function validateSkillIdNamespace(marketplace: Marketplace): string | null {
  if (marketplace.name === DEFAULT_PUBLIC_SOURCE_NAME) return null;

  const foreignIds = marketplace.plugins
    .filter((plugin) => !carriesNamespace(plugin.name, marketplace.name))
    .map((plugin) => plugin.name);

  if (foreignIds.length === 0) return null;

  return namespaceViolationError(foreignIds, marketplace.name);
}

/** Both halves: the name claimed is the catalogue's and so is the package claiming it. */
function isCatalogueOwnReservedName(marketplaceName: string, packageName: string): boolean {
  return marketplaceName === DEFAULT_PUBLIC_SOURCE_NAME && packageName === PUBLIC_CATALOGUE_PACKAGE;
}

function carriesNamespace(skillId: string, marketplaceName: string): boolean {
  return skillId.startsWith(`${marketplaceName}-`);
}

function reservedNameError(marketplaceName: string, wayOut: string): string {
  return (
    `Marketplace name '${marketplaceName}' is reserved. ` +
    `'${DEFAULT_PUBLIC_SOURCE_NAME}' is the public catalogue's own namespace, ` +
    `'${EXTERNAL_SKILL_NAMESPACE}' and '${LOCAL_SKILL_NAMESPACE}' hold the skills that belong to ` +
    `no marketplace, and '${EJECT_SOURCE}' is what an installation records for a skill copied ` +
    `into it rather than installed as a plugin — a marketplace under any of them is read back ` +
    `as something it is not. Choose a name of your own: ${wayOut}.`
  );
}

function namespaceViolationError(foreignIds: string[], marketplaceName: string): string {
  const listed = foreignIds
    .slice(0, MAX_REPORTED_NAMESPACE_VIOLATIONS)
    .map((id) => `  ${id} -> ${marketplaceName}-${id}`);
  const unlisted = foreignIds.length - listed.length;

  return [
    `Marketplace '${marketplaceName}' ships ${foreignIds.length} skill id(s) outside its own ` +
      `namespace. Every skill id must begin with the marketplace's name:`,
    ...listed,
    ...(unlisted > 0 ? [`  ... and ${unlisted} more`] : []),
    `Rename each skill directory and the 'name' in its SKILL.md, re-run 'build plugins', then ` +
      `build the marketplace again.`,
  ].join("\n");
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
