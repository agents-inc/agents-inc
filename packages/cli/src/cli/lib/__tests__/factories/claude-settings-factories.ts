/**
 * A project's `.claude/settings.json` as a plugin install leaves it: every key in
 * `enabledPluginKeys` switched on, beside the `Read(*)` grant every E2E project carries so a
 * post-install permission prompt cannot block the PTY.
 *
 * The keys are `<plugin>@<marketplace>`, as Claude Code writes them, and they are the whole of
 * what a spec varies — which plugins the CLI installed, and which ones somebody else did.
 */
export function buildClaudeSettings(enabledPluginKeys: readonly string[]) {
  return {
    permissions: { allow: ["Read(*)"] },
    enabledPlugins: Object.fromEntries(enabledPluginKeys.map((key) => [key, true])),
  };
}
