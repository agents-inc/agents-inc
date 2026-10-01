/**
 * The two files a Claude plugin host reads, as test data: `installed_plugins.json` (claude CLI
 * v2 registry) and a `settings.json` carrying `enabledPlugins`.
 *
 * Records are built here and serialised by the render functions, so a spec states only the
 * fields its assertion reads — which scope, which project, which directory — and a malformed
 * record, which is some spec's whole subject, stays spelled out where that spec refuses it.
 */

/** The version and timestamp every record carries unless a spec's subject is one of them. */
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

/**
 * An `installed_plugins.json` body, keyed `<plugin>@<marketplace>`.
 *
 * `unknown[]` per key because the registry is parse-boundary data: a spec pinning a refusal hands
 * a record the schema must reject, and that record has no builder above by design.
 */
export function renderInstalledPluginsRegistry(
  plugins: Record<string, readonly unknown[]>,
): string {
  return JSON.stringify({ version: 2, plugins });
}

/**
 * A `settings.json` body enabling the given plugins. `unknown` per key for the same reason: a
 * truthy value that is not `true` is some spec's subject.
 */
export function renderEnabledPluginsSettings(enabledPlugins: Record<string, unknown>): string {
  return JSON.stringify({ enabledPlugins });
}
