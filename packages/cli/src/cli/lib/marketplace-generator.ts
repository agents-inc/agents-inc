import path from "path";
import { countBy, sortBy } from "remeda";

import {
  DEFAULT_PUBLIC_SOURCE_NAME,
  DEFAULT_VERSION,
  PLUGIN_MANIFEST_DIR,
  PLUGIN_MANIFEST_FILE,
  PUBLIC_CATALOGUE_PACKAGE,
} from "../consts";
import { writeFile, glob, ensureDir } from "../utils/fs";
import { verbose, warn } from "../utils/logger";
import type { Marketplace, MarketplacePlugin, PluginManifest } from "../types";
import { readPluginManifest } from "./plugins";

const PLUGIN_MANIFEST_PATH = `${PLUGIN_MANIFEST_DIR}/${PLUGIN_MANIFEST_FILE}`;
const MARKETPLACE_SCHEMA_URL = "https://anthropic.com/claude-code/marketplace.schema.json";

/** Namespace a skill with no marketplace at all is given. */
const EXTERNAL_SKILL_NAMESPACE = "external";

/** Namespace a skill created in place, rather than fetched from a marketplace, is given. */
const LOCAL_SKILL_NAMESPACE = "local";

/**
 * Marketplace names that are not an author's to take.
 *
 * The public catalogue's skills ship unprefixed, so every bare id in the catalogue
 * already lives in `agents-inc`; the other two hold the skills that belong to no
 * marketplace. Publishing under any of them claims ids the marketplace does not own.
 */
const RESERVED_MARKETPLACE_NAMES: readonly string[] = [
  DEFAULT_PUBLIC_SOURCE_NAME,
  EXTERNAL_SKILL_NAMESPACE,
  LOCAL_SKILL_NAMESPACE,
];

/** How many offending ids a namespace refusal lists before summarising the rest. */
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

/**
 * Refuses a marketplace name that belongs to a namespace the author does not own,
 * or returns null when the name is theirs to take.
 *
 * `packageName` is package.json's own `name`. It is read for one purpose: the public
 * catalogue publishes under a reserved name legitimately, and
 * {@link PUBLIC_CATALOGUE_PACKAGE} is what distinguishes it from a claimant.
 */
export function validateMarketplaceName(
  marketplaceName: string,
  packageName: string,
): string | null {
  if (!RESERVED_MARKETPLACE_NAMES.includes(marketplaceName)) return null;
  if (isCatalogueOwnReservedName(marketplaceName, packageName)) return null;

  return reservedNameError(marketplaceName);
}

/**
 * Refuses a marketplace whose skill ids fall outside its own namespace, or returns
 * null when every id carries it.
 *
 * The public catalogue is exempt: its skills ship unprefixed by design and
 * `agents-inc` IS the namespace they occupy. Reading that exemption off the NAME is
 * only safe because {@link validateMarketplaceName} runs first and lets nothing but
 * the catalogue's own package hold it — the two checks are a pair, in that order.
 */
export function validateSkillIdNamespace(marketplace: Marketplace): string | null {
  if (marketplace.name === DEFAULT_PUBLIC_SOURCE_NAME) return null;

  const foreignIds = marketplace.plugins
    .filter((plugin) => !carriesNamespace(plugin.name, marketplace.name))
    .map((plugin) => plugin.name);

  if (foreignIds.length === 0) return null;

  return namespaceViolationError(foreignIds, marketplace.name);
}

/**
 * Whether the reserved NAME this build publishes under is the catalogue's own, which
 * takes both halves: the name claimed is the catalogue's, and the package claiming it
 * is the catalogue's package.
 *
 * The load side asks a different question of the same identity: `isPublicCatalogueCheckout`
 * in `configuration/config.ts` asks whether a DIRECTORY is a checkout of that repository,
 * and reads the package name off it rather than being handed one.
 */
function isCatalogueOwnReservedName(marketplaceName: string, packageName: string): boolean {
  return marketplaceName === DEFAULT_PUBLIC_SOURCE_NAME && packageName === PUBLIC_CATALOGUE_PACKAGE;
}

function carriesNamespace(skillId: string, marketplaceName: string): boolean {
  return skillId.startsWith(`${marketplaceName}-`);
}

function reservedNameError(marketplaceName: string): string {
  return (
    `Marketplace name '${marketplaceName}' is reserved. ` +
    `'${DEFAULT_PUBLIC_SOURCE_NAME}' is the public catalogue's own namespace, and ` +
    `'${EXTERNAL_SKILL_NAMESPACE}' and '${LOCAL_SKILL_NAMESPACE}' hold the skills that belong to ` +
    `no marketplace — publishing under any of them claims skill ids that are not this ` +
    `marketplace's. Choose a name of your own: set package.json 'name', or pass --name.`
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
    `Rename each skill directory and the id in its metadata, re-run 'build plugins', then ` +
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
