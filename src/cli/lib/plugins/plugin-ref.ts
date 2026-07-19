import type { SkillConfig } from "../../types/config.js";

/**
 * Marketplace-qualified plugin reference (`{id}@{marketplace}`) — the form the
 * Claude CLI plugin registry expects. Bare ids do not match registry entries.
 */
export function buildMarketplacePluginRef(id: string, marketplace: string): string {
  return `${id}@${marketplace}`;
}

/**
 * Maps a cc scope to the Claude CLI plugin scope: `"global"` installs are
 * user-scoped in Claude (registered in `~/.claude/settings.json`); anything
 * else — including an absent scope — is project-scoped.
 */
export function toClaudePluginScope(scope: SkillConfig["scope"] | undefined): "project" | "user" {
  return scope === "global" ? "user" : "project";
}
