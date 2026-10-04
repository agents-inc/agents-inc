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

/**
 * `~/.claude.json` as Claude Code leaves it once the user has accepted its trust prompt in each of
 * `trustedProjectDirs`, which are absolute paths spelled the way a process started in that folder
 * reports its working directory.
 *
 * Only the field a trust check reads is modelled. Claude Code runs a project sub-agent's hooks,
 * its completion gate among them, only in a folder this record trusts.
 */
export function buildClaudeTrustState(trustedProjectDirs: readonly string[]) {
  return {
    projects: Object.fromEntries(
      trustedProjectDirs.map((dir) => [dir, { hasTrustDialogAccepted: true }]),
    ),
  };
}
