import type { AgentHookDefinition } from "./agents";

/** Plugin author metadata */
export type PluginAuthor = {
  name: string;
  email?: string;
};

/** Plugin manifest for Claude Code plugins (plugin.json) */
export type PluginManifest = {
  /** Plugin name in kebab-case (e.g., "skill-react", "stack-nextjs-fullstack") */
  name: string;
  version?: string;
  description?: string;
  author?: PluginAuthor;
  /** Skill category from the skill's metadata.yaml — copied onto the marketplace entry */
  category?: string;
  keywords?: string[];
  commands?: string | string[];
  agents?: string | string[];
  skills?: string | string[];
  hooks?: string | Record<string, AgentHookDefinition[]>;
};

/** Remote source configuration for marketplace plugins (GitHub or URL) */
export type MarketplaceRemoteSource = {
  source: "github" | "url";
  /** GitHub repository in owner/repo format */
  repo?: string;
  url?: string;
  /** Git ref (branch, tag, or commit) */
  ref?: string;
};

/** Plugin entry in marketplace.json */
export type MarketplacePlugin = {
  name: string;
  /** Local path or remote source configuration */
  source: string | MarketplaceRemoteSource;
  description?: string;
  version?: string;
  author?: PluginAuthor;
  /** Category for marketplace grouping — optional string (external data, lenient) */
  category?: string;
  keywords?: string[];
};

/** Marketplace owner metadata — same shape as a plugin author */
export type MarketplaceOwner = PluginAuthor;

/** Marketplace-level metadata (e.g., plugin root directory) */
export type MarketplaceMetadata = {
  /** Root directory for plugin sources */
  pluginRoot?: string;
};

/** Marketplace configuration (marketplace.json) */
export type Marketplace = {
  $schema?: string;
  name: string;
  version: string;
  description?: string;
  owner: MarketplaceOwner;
  metadata?: MarketplaceMetadata;
  plugins: MarketplacePlugin[];
};

/** Result from fetching marketplace data from a remote source */
export type MarketplaceFetchResult = {
  marketplace: Marketplace;
  /** Path where source was fetched/cached */
  sourcePath: string;
  fromCache: boolean;
};
