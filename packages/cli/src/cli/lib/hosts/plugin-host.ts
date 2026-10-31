/**
 * The seam between this CLI and a host's plugin machinery, in this product's words: scope is
 * `global`/`project` and mode is `plugin`/`eject`. Each host translates at its own edge.
 */

import type { Provider } from "../../consts.js";
import type { InstallMode, SkillScope } from "../../types/index.js";

/** Both are ordinary outcomes, so the distinction is a return value rather than an exception. */
export type PluginRemovalOutcome = "removed" | "absent";

/** `mixed` describes a whole installation, not a place a single skill can be put. */
export type InstallPlacement = {
  mode: Exclude<InstallMode, "mixed">;
  scope: SkillScope;
};

/**
 * `enabled` is per-project only where the host lets the project decide; for Codex that needs the
 * global config to trust the project, and the listing does not say which decided.
 */
export type HostPlugin = {
  pluginKey: string;
  installPath: string;
  enabled: boolean;
};

/**
 * Which installation a call reads and writes; omitted, the process's own. Each host maps it to
 * its variable (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`).
 */
export type HostCallOptions = { configDir?: string };

/** A plain value object built fresh per call, so no caller shares another's arrays. */
export type PluginHost = {
  provider: Provider;

  /** Binding: `hostFor` makes `installPlugin` refuse a plugin cell this roster does not carry. */
  offeredPlacements: InstallPlacement[];

  /** Must agree with whether `offeredPlacements` carries plugin + project. */
  installsProjectScopedPlugins: boolean;

  /** Takes options because on Codex even the version probe writes into the installation. */
  isAvailable: (options?: HostCallOptions) => Promise<boolean>;

  marketplaceExists: (name: string, options?: HostCallOptions) => Promise<boolean>;

  addMarketplace: (source: string, options?: HostCallOptions) => Promise<void>;

  /** Named for neither host's verb: Claude's is `update`, Codex's is `upgrade`. */
  refreshMarketplace: (name: string, options?: HostCallOptions) => Promise<void>;

  installPlugin: (
    pluginRef: string,
    scope: SkillScope,
    projectDir: string,
    options?: HostCallOptions,
  ) => Promise<void>;

  /** Moves an installed plugin to the version its marketplace offers; a plugin not held throws. */
  updatePlugin: (
    pluginRef: string,
    scope: SkillScope,
    projectDir: string,
    options?: HostCallOptions,
  ) => Promise<void>;

  /** Throws only for a real failure; a missing plugin is `absent`. */
  uninstallPlugin: (
    pluginRef: string,
    scope: SkillScope,
    projectDir: string,
    options?: HostCallOptions,
  ) => Promise<PluginRemovalOutcome>;

  /** `projectDir` decides the enabled switch; `options` decides which installation is read. */
  listPlugins: (projectDir: string, options?: HostCallOptions) => Promise<HostPlugin[]>;
};
