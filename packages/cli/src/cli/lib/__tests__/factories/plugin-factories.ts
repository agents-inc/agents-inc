import { CLAUDE_DIR, DEFAULT_PLUGIN_NAME, PLUGINS_SUBDIR } from "../../../consts";
import type {
  CompileAgentConfig,
  CompileConfig,
  CompileContext,
  Marketplace,
  MarketplacePlugin,
} from "../../../types";

export function createCompileContext(overrides?: Partial<CompileContext>): CompileContext {
  return {
    stackId: "test-stack",
    verbose: false,
    projectRoot: "/project",
    outputDir: `/project/${CLAUDE_DIR}/${PLUGINS_SUBDIR}/${DEFAULT_PLUGIN_NAME}`,
    ...overrides,
  };
}

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
