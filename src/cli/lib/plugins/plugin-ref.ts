import type { ClaudePluginScope, SkillScope } from "../../types/config.js";

/**
 * Marketplace-qualified plugin reference (`{id}@{marketplace}`) — the form the
 * Claude CLI plugin registry expects. Bare ids do not match registry entries.
 */
export function buildMarketplacePluginRef(id: string, marketplace: string): string {
  return `${id}@${marketplace}`;
}

/**
 * Inverse of buildMarketplacePluginRef: extracts the skill id from a
 * `{id}@{marketplace}` reference. Returns the whole string when no `@` is present.
 */
export function parseMarketplacePluginRef(ref: string): string {
  return ref.split("@")[0];
}

/**
 * Maps a cc scope to the Claude CLI plugin scope: `"global"` installs are
 * user-scoped in Claude (registered in `~/.claude/settings.json`); anything
 * else — including an absent scope — is project-scoped.
 */
export function toClaudePluginScope(scope: SkillScope | undefined): ClaudePluginScope {
  return scope === "global" ? "user" : "project";
}
