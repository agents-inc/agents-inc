/**
 * `.claude/settings.json` after a plugin install; keys are `<plugin>@<marketplace>`. `Read(*)`
 * stops a permission prompt blocking the PTY.
 */
export function buildClaudeSettings(enabledPluginKeys: readonly string[]) {
  return {
    permissions: { allow: ["Read(*)"] },
    enabledPlugins: Object.fromEntries(enabledPluginKeys.map((key) => [key, true])),
  };
}

/** `~/.claude.json` with the trust prompt accepted in each dir (absolute, as `cwd` reports it). */
export function buildClaudeTrustState(trustedProjectDirs: readonly string[]) {
  return {
    projects: Object.fromEntries(
      trustedProjectDirs.map((dir) => [dir, { hasTrustDialogAccepted: true }]),
    ),
  };
}
