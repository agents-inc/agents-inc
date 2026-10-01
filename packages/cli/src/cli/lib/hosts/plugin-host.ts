/**
 * The seam between this CLI and whichever host's plugin machinery it is talking to.
 *
 * Until C3 the CLI called Claude Code's plugin commands from eight production files, each of
 * which spelled "install a skill" in one host's vocabulary. Nothing there was wrong; what it could
 * not do is be pointed at a second host. This module is the one place that shape is declared, and
 * `claude-host.ts` is the only implementation of it in this release.
 *
 * **Everything here is written in THIS product's words, never in a host's.** Scope is
 * {@link SkillScope} — `global` and `project` — although Claude's own plugin scope vocabulary is
 * `user` and `project` and Codex has no scope flag at all; mode is `INSTALL_MODES`'
 * `plugin` and `eject`. A member named after the binary it was extracted from would be the same
 * coupling one indirection further away, so each host translates at its own edge and the
 * translation is a host's private business.
 *
 * **Where the two hosts we know about diverge, and what on the seam carries it:**
 *
 * | Difference, measured on Codex 0.155.1              | What answers it here            |
 * | -------------------------------------------------- | ------------------------------- |
 * | Codex installs plugins globally only                | {@link PluginHost.offeredPlacements} and {@link PluginHost.installsProjectScopedPlugins} |
 * | `codex plugin remove` cannot be trusted for an exit code | {@link PluginRemovalOutcome}, classified from a listing or a message rather than a status |
 * | Codex keeps disabled plugins in its listing         | {@link HostPlugin.enabled}      |
 * | `CLAUDE_CONFIG_DIR` against `CODEX_HOME`            | {@link HostCallOptions.configDir}, on EVERY member that reads or writes an installation |
 * | `marketplace update` against `marketplace upgrade`  | the member is `refreshMarketplace`, and each host builds its own argv |
 *
 * **Every member that touches an installation takes {@link HostCallOptions}, the two that read
 * rather than write included.** That is a change this seam took after the first draft left
 * `isAvailable` and `listPlugins` without it, and it is a fact about Codex rather than a
 * symmetry. Both were re-derived against the pinned `@openai/codex` 0.155.1 on 2026-09-22, with
 * `HOME` and `CODEX_HOME` pinned to a scratch tree and `TMPDIR` moved out of it so Codex did not
 * refuse to write:
 *
 * ```
 * $ env -i PATH=… HOME=<s>/homeA CODEX_HOME=<s>/homeA/.codex TMPDIR=<s>/othertmp \
 *     node <codex.js> --version
 * codex-cli 0.155.1                     # exit 0, and wrote <s>/homeA/.codex/tmp/arg0/codex-arg08a6Nd7
 *
 * $ … CODEX_HOME=<s>/homeA/.codex … node <codex.js> plugin list --json      # from <s>/proj1
 * {"installed":[{"pluginId":"measure-plugin@c4-measure-marketplace", … "enabled":true, …}], …}
 * $ … the same command, run from <s>/proj2                                  # a different project
 * {"installed":[{"pluginId":"measure-plugin@c4-measure-marketplace", … "enabled":true, …}], …}
 * $ … CODEX_HOME=<s>/homeB/.codex … node <codex.js> plugin list --json      # from <s>/proj1
 * {"installed":[],"available":[]}
 * ```
 *
 * So an availability probe is a WRITE on this host — a member with no way to say which
 * installation it may write into writes the developer's own on every run — and a listing is a
 * function of `CODEX_HOME` and not of the directory it is asked from. `codex plugin list` takes
 * no project or scope argument at all (`-m/--marketplace`, `--available`, `--json`). Without the
 * option neither member can be pointed at a test's installation, and no spec or smoke run could
 * answer for either without touching the machine's real `~/.codex`.
 */

import type { Provider } from "../../consts.js";
import type { InstallMode, SkillScope } from "../../types/index.js";

/**
 * What a host answered when it was asked to remove a plugin.
 *
 * `void` is what `claudePluginUninstall` answered until C3, and it is why `uninstall` reports a
 * count of removals it never observed: a plugin the registry never had and one that was really
 * removed left the call identically. Neither is a failure — asking twice is ordinary — so the
 * distinction cannot be an exception and has to be the return value.
 */
export type PluginRemovalOutcome = "removed" | "absent";

/**
 * One mode/scope cell a host offers, in the product's own words.
 *
 * `mode` excludes `mixed`: that value describes an installation whose skills are not all the same
 * way round, which is a reading of a config rather than a place a single skill can be put.
 */
export type InstallPlacement = {
  mode: Exclude<InstallMode, "mixed">;
  scope: SkillScope;
};

/**
 * A plugin as a host reports it.
 *
 * `enabled` is the field this CLI has never carried. Claude's discovery filters by the enabled
 * switch before it answers, so "installed but disabled" has no representation today; Codex keeps a
 * disabled plugin in its listing with the switch beside it. A listing without the field cannot
 * tell the two apart.
 *
 * **Codex's switch is the GLOBAL config's, unless the global config trusts the project**, which is
 * not what this seam's first draft said (it read "per-project enablement is the only per-project
 * control it has"). Re-derived on 0.155.1, 2026-09-22, as a paired control in one `CODEX_HOME`
 * whose global `config.toml` says `[plugins."<id>"] enabled = true` throughout, with the project's
 * own `.codex/config.toml` saying `enabled = false` throughout, and only the global
 * `[projects."<abs path>"] trust_level = "trusted"` entry added and removed between the two runs:
 *
 * ```
 * # trust entry present  -> codex plugin list --json says "enabled": false   (the project won)
 * # trust entry removed  -> codex plugin list --json says "enabled": true    (it was ignored)
 * ```
 *
 * So the field is a per-project answer only where the user's own global config has already said
 * so, and the listing does not say which of the two decided it. That is the same trust gate
 * `codexProjectRoles` in `installation/install-layout.ts` carries for a compiled sub-agent, and
 * the reason no caller may read `enabled: true` as "this project has it switched on".
 */
export type HostPlugin = {
  pluginKey: string;
  installPath: string;
  enabled: boolean;
};

/**
 * Which installation of the host a call reads and writes.
 *
 * Omitted, the call inherits the one its process already points at — the user's own, in
 * production. Named neutrally because the variable is not: Claude reads `CLAUDE_CONFIG_DIR`,
 * which relocates its whole config tree and beats `HOME`; Codex reads `CODEX_HOME`, which every
 * `codex` process the CLI spawns inherits. Translating the name is each host's own job.
 */
export type HostCallOptions = { configDir?: string };

/**
 * Everything this CLI asks of a host's plugin machinery, and nothing else.
 *
 * A value object rather than a class instance, and built fresh per call by `hostFor`, for
 * the reason `agentCodec` in `install-layout.ts` gives: a shared object is held by identity, so
 * one caller pushing onto `offeredPlacements` would corrupt every other holder, and no type flags
 * it. A prototype would additionally hide the members from `Object.keys`, and the roster is what
 * the contract spec reads.
 */
export type PluginHost = {
  /** Which host this is. The only member that names a provider, because it IS the name. */
  provider: Provider;

  /**
   * The mode/scope cells this host offers, and therefore the ones a refusal may name.
   *
   * Four for Claude, three for Codex — plugin+project is the cell Codex has no way to fill. Data
   * rather than a branch, so the installer reads the roster off the host instead of asking which
   * provider it is holding.
   *
   * **It is binding, and `hosts/offered-placements.ts` is what binds it.** `hostFor` wraps every
   * host it answers so that `installPlugin` refuses a plugin cell this roster does not carry,
   * with the offered cells named in the message. A roster nothing consults would read as the rule
   * while the installer went on trying whatever it was asked for — and for the one host this
   * release has, every cell is offered, so the roster would never have been wrong out loud.
   */
  offeredPlacements: InstallPlacement[];

  /**
   * Whether a plugin can be installed for one project alone.
   *
   * It stops being a fallback switch in C3 and becomes the source of a refusal. It cannot
   * disagree with the plugin+project cell above: a host whose flag says one thing and whose cells
   * say another refuses a placement it also offers, and both members read as correct on their own
   * in different files.
   */
  installsProjectScopedPlugins: boolean;

  /**
   * Whether the host's own binary is there and runnable at all.
   *
   * It takes {@link HostCallOptions} because on Codex this probe is a WRITE: `codex --version`
   * links its helper binaries under `$CODEX_HOME/tmp/arg0/` before it reads an argument. A probe
   * with no way to name an installation writes the developer's own on every run.
   */
  isAvailable: (options?: HostCallOptions) => Promise<boolean>;

  /** Whether this host already knows a marketplace by that NAME. */
  marketplaceExists: (name: string, options?: HostCallOptions) => Promise<boolean>;

  /** Registers a marketplace from its SOURCE — the one verb that does not take a name. */
  addMarketplace: (source: string, options?: HostCallOptions) => Promise<void>;

  /**
   * Pulls a registered marketplace's current contents.
   *
   * Deliberately not `updateMarketplace`: `update` is Claude's verb and `upgrade` is Codex's, so
   * naming the member after either one leaves the other implementing a command it does not have.
   */
  refreshMarketplace: (name: string, options?: HostCallOptions) => Promise<void>;

  /** Installs a marketplace-qualified plugin at one scope, for one project. */
  installPlugin: (
    pluginRef: string,
    scope: SkillScope,
    projectDir: string,
    options?: HostCallOptions,
  ) => Promise<void>;

  /**
   * Removes a plugin at one scope, saying whether there was one to remove.
   *
   * Throws only for a failure that is neither — a host answering `absent` for every failure would
   * report a clean removal for a plugin it could not touch.
   */
  uninstallPlugin: (
    pluginRef: string,
    scope: SkillScope,
    projectDir: string,
    options?: HostCallOptions,
  ) => Promise<PluginRemovalOutcome>;

  /**
   * What this host has installed, as seen from one project.
   *
   * Both arguments carry, and they answer different halves. `projectDir` is what makes the answer
   * "as seen from one project" — Claude reads that project's own `settings.json` for the switch,
   * and Codex reads the project's `.codex/config.toml` for it where the global config trusts the
   * project. `options` is which INSTALLATION is being read: Claude's registry under a pinned
   * config directory, Codex's whole answer, which is a function of `CODEX_HOME` and of nothing
   * else.
   *
   * It is the one read every caller of the plugin registry goes through, so that "what is
   * installed" has one answer per host rather than one per reader.
   */
  listPlugins: (projectDir: string, options?: HostCallOptions) => Promise<HostPlugin[]>;
};
