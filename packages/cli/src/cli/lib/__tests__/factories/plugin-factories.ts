import type {
  CompileAgentConfig,
  CompileConfig,
  Marketplace,
  MarketplacePlugin,
} from "../../../types";

export function createMockCompileConfig(
  agents: Record<string, CompileAgentConfig>,
  overrides?: Partial<CompileConfig>,
): CompileConfig {
  return {
    name: "Test Plugin",
    description: "Test description",
    agents,
    ...overrides,
  };
}

export function createMockMarketplace(plugins: MarketplacePlugin[] = []): Marketplace {
  return {
    name: "test-marketplace",
    version: "1.0.0",
    owner: { name: "Test Owner" },
    plugins,
  };
}

export function createMockMarketplacePlugin(
  name: string,
  source: MarketplacePlugin["source"] = "local",
  category: MarketplacePlugin["category"] = "web-framework",
): MarketplacePlugin {
  return {
    name,
    source,
    category,
  };
}
