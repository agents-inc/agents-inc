// The plugin host's `installed_plugins.json` (v2 registry) and `settings.json`, as test data.

const RECORD_DEFAULTS = { version: "1.0.0", installedAt: "2024-01-01" };

type RecordOverrides = Partial<typeof RECORD_DEFAULTS>;

/** A record `claude plugin install --scope user` writes: reachable from every project. */
export function buildUserPluginInstallation(installPath: string, overrides: RecordOverrides = {}) {
  return { scope: "user" as const, installPath, ...RECORD_DEFAULTS, ...overrides };
}

/** A record `claude plugin install --scope project` writes, filed under the project it names. */
export function buildProjectPluginInstallation(
  installPath: string,
  projectPath: string,
  overrides: RecordOverrides = {},
) {
  return { scope: "project" as const, projectPath, installPath, ...RECORD_DEFAULTS, ...overrides };
}

/** Keyed `<plugin>@<marketplace>`; `unknown[]` so refusal specs can hand malformed records. */
export function renderInstalledPluginsRegistry(
  plugins: Record<string, readonly unknown[]>,
): string {
  return JSON.stringify({ version: 2, plugins });
}

/** `unknown` per key: a truthy value that is not `true` is some spec's subject. */
export function renderEnabledPluginsSettings(enabledPlugins: Record<string, unknown>): string {
  return JSON.stringify({ enabledPlugins });
}
