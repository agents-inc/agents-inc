import type { AgentHookDefinition } from "./agents";

export type PluginAuthor = {
  name: string;
  email?: string;
};

/** plugin.json */
export type PluginManifest = {
  /** kebab-case */
  name: string;
  version?: string;
  description?: string;
  author?: PluginAuthor;
  category?: string;
  keywords?: string[];
  commands?: string | string[];
  agents?: string | string[];
  skills?: string | string[];
  hooks?: string | Record<string, Partial<AgentHookDefinition>[]>;
};

export type MarketplaceRemoteSource = {
  source: "github" | "url";
  /** owner/repo */
  repo?: string;
  url?: string;
  ref?: string;
};

export type MarketplacePlugin = {
  name: string;
  source: string | MarketplaceRemoteSource;
  description?: string;
  version?: string;
  author?: PluginAuthor;
  category?: string;
  keywords?: string[];
};

export type MarketplaceOwner = PluginAuthor;

export type MarketplaceMetadata = {
  pluginRoot?: string;
};

/** marketplace.json */
export type Marketplace = {
  $schema?: string;
  name: string;
  version: string;
  description?: string;
  owner: MarketplaceOwner;
  metadata?: MarketplaceMetadata;
  plugins: MarketplacePlugin[];
};

export type MarketplaceFetchResult = {
  marketplace: Marketplace;
  sourcePath: string;
  fromCache: boolean;
};
