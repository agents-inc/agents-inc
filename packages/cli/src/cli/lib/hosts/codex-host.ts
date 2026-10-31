/**
 * Codex's plugin machinery, behind {@link PluginHost}. `codex plugin` has no scope flag and every
 * write lands in the global `config.toml`, so project-scoped plugins are not offered.
 */

import os from "os";
import path from "path";
import { z } from "zod";

import { PLUGINS_SUBDIR } from "../../consts.js";
import type { SkillScope } from "../../types/config.js";
import { getErrorMessage } from "../../utils/errors.js";
import {
  execCommand,
  validateMarketplaceSource,
  validatePluginName,
  validatePluginPath,
  type ExecResult,
} from "../../utils/exec.js";
import { verbose, warnOnce } from "../../utils/logger.js";
import { ensureDir } from "../../utils/fs.js";
import { CODEX_CONFIG_FILE, pluginsDir, userConfigRoot } from "../installation/install-layout.js";
import {
  FailedLeavingPluginsSwitchedOnError,
  PluginsLeftSwitchedOnError,
  switchCodexPluginsOff,
} from "./codex-plugin-switch.js";
import type {
  HostCallOptions,
  HostPlugin,
  InstallPlacement,
  PluginHost,
  PluginRemovalOutcome,
} from "./plugin-host.js";

const CODEX: PluginHost["provider"] = "codex";

/**
 * `plugin list --json` prints no install path, so it is composed as
 * `<CODEX_HOME>/plugins/cache/<marketplace>/<name>/<version>`.
 */
const PLUGIN_CACHE_SUBDIR = "cache";

/** Printed on stderr by every run whose `CODEX_HOME` is under the temp dir, even on exit 0. */
const STANDING_WARNING = /could not create PATH aliases/;

/**
 * Writes run from home: `plugin add` inside a project still writes the global config. A function
 * so HOME is read per call, not frozen at import.
 */
function codexPluginCwd(): string {
  return os.homedir();
}

function codexOfferedPlacements(): InstallPlacement[] {
  return [
    { mode: "plugin", scope: "global" },
    { mode: "eject", scope: "global" },
    { mode: "eject", scope: "project" },
  ];
}

export type CodexConfigOptions = HostCallOptions;

function codexHomeEnv(options: CodexConfigOptions | undefined): { env?: NodeJS.ProcessEnv } {
  if (options?.configDir === undefined) return {};
  return { env: { CODEX_HOME: options.configDir } };
}

function codexStateRoot(options: CodexConfigOptions | undefined, askedFrom: string): string {
  return options?.configDir ?? userConfigRoot(CODEX, "global", askedFrom);
}

/**
 * Creates `CODEX_HOME` first: when it is missing, `--version` succeeds but every plugin verb
 * exits 1, so a never-run Codex would look available and fail every install.
 */
async function runCodex(
  args: string[],
  options: CodexConfigOptions | undefined,
  askedFrom: string,
): Promise<ExecResult> {
  await makeTheStateRoot(codexStateRoot(options, askedFrom));
  return execCommand("codex", args, { cwd: askedFrom, ...codexHomeEnv(options) });
}

/** Degrades on failure: Codex's own refusal names an unusable `CODEX_HOME` better than ours. */
async function makeTheStateRoot(root: string): Promise<void> {
  try {
    await ensureDir(root);
  } catch (error) {
    verbose(`Could not create the codex state directory at ${root}: ${getErrorMessage(error)}`);
  }
}

async function runCodexOrThrow(
  args: string[],
  options: CodexConfigOptions | undefined,
  attempt: string,
  askedFrom: string,
): Promise<ExecResult> {
  let result;
  try {
    result = await runCodex(args, options, askedFrom);
  } catch (error) {
    throw new Error(`Failed to ${attempt}: ${getErrorMessage(error)}`, { cause: error });
  }

  if (result.exitCode !== 0) throw new Error(`Failed to ${attempt}: ${whyItFailed(result)}`);
  return result;
}

function withoutTheStandingWarning(stream: string): string {
  return stream
    .split("\n")
    .filter((line) => !STANDING_WARNING.test(line))
    .join("\n")
    .trim();
}

function whyItFailed(result: ExecResult): string {
  const said = withoutTheStandingWarning(result.stderr) || withoutTheStandingWarning(result.stdout);
  return said || "Unknown error";
}

/**
 * Throws on unparseable output: a listing read as empty would make `marketplaceExists` false
 * forever and re-add the marketplace on every run.
 */
async function readJsonFromCodex<T>(
  schema: z.ZodType<T>,
  args: string[],
  options: CodexConfigOptions | undefined,
  attempt: string,
  askedFrom: string,
): Promise<T> {
  const result = await runCodexOrThrow(args, options, attempt, askedFrom);

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (error) {
    throw new Error(`Failed to ${attempt}: codex answered no JSON at all`, { cause: error });
  }

  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`Failed to ${attempt}: codex answered a document this release cannot read`);
  }
  return validated.data;
}

/** An object wrapping the array, unlike Claude's bare array; there is no top-level `source`. */
const marketplaceRegistrySchema = z.object({
  marketplaces: z.array(
    z.object({
      name: z.string(),
      marketplaceSource: z.object({ sourceType: z.string(), source: z.string() }),
    }),
  ),
});

type CodexMarketplace = z.infer<typeof marketplaceRegistrySchema>["marketplaces"][number];

/** `available` (what could be installed) comes back too and is deliberately not read. */
const pluginListingSchema = z.object({
  installed: z.array(
    z.object({
      pluginId: z.string(),
      name: z.string(),
      marketplaceName: z.string(),
      version: z.string(),
      enabled: z.boolean(),
    }),
  ),
});

type CodexInstalledPlugin = z.infer<typeof pluginListingSchema>["installed"][number];

function codexPluginsRoot(
  projectDir: string,
  options: CodexConfigOptions | undefined,
): string | null {
  if (options?.configDir !== undefined) return path.join(options.configDir, PLUGINS_SUBDIR);
  return pluginsDir(CODEX, "global", projectDir);
}

/** The state tree is pinned because even `codex --version` writes under `$CODEX_HOME/tmp/arg0/`. */
async function isCodexCLIAvailable(options?: CodexConfigOptions): Promise<boolean> {
  try {
    const result = await runCodex(["--version"], options, codexPluginCwd());
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Both listing verbs exit 1 with this when any recorded marketplace is unreadable, while writes
 * keep working. Only the members that ask a question degrade on it.
 */
const UNREADABLE_MARKETPLACE = /failed to load (?:configured )?marketplace/i;

function namesAnUnreadableMarketplace(error: unknown): boolean {
  return UNREADABLE_MARKETPLACE.test(getErrorMessage(error));
}

async function codexMarketplaces(
  options: CodexConfigOptions | undefined,
): Promise<CodexMarketplace[]> {
  const registry = await readJsonFromCodex(
    marketplaceRegistrySchema,
    ["plugin", "marketplace", "list", "--json"],
    options,
    "read the marketplaces codex knows",
    codexPluginCwd(),
  );
  return registry.marketplaces;
}

/** By name, never by count: a Codex home may hold the user's own marketplaces beside ours. */
async function codexMarketplaceExists(
  name: string,
  options?: CodexConfigOptions,
): Promise<boolean> {
  return (await codexRegisteredMarketplace(name, options)) !== null;
}

/** `null` also for an unreadable registry; the caller then adds, which still works there. */
async function codexRegisteredMarketplace(
  name: string,
  options?: CodexConfigOptions,
): Promise<CodexMarketplace | null> {
  let registered;
  try {
    registered = await codexMarketplaces(options);
  } catch (error) {
    if (!namesAnUnreadableMarketplace(error)) throw error;
    warnOnce(sayWhatCodexRefused("list the marketplaces it knows", getErrorMessage(error)));
    return null;
  }

  return registered.find((marketplace) => marketplace.name === name) ?? null;
}

function sayWhatCodexRefused(attempt: string, said: string): string {
  return `Codex could not ${attempt}, so this run is treating it as having none. It said: ${said}`;
}

export async function codexMarketplaceAdd(
  source: string,
  options?: CodexConfigOptions,
): Promise<void> {
  validateMarketplaceSource(source);
  await runCodexOrThrow(
    ["plugin", "marketplace", "add", source, "--json"],
    options,
    "add marketplace",
    codexPluginCwd(),
  );
}

/**
 * `marketplace upgrade` is git-only (exits 1 on a local source), so a local marketplace is
 * refreshed by re-adding each of its installed plugins.
 */
async function refreshCodexMarketplace(name: string, options?: CodexConfigOptions): Promise<void> {
  validatePluginName(name);

  const registered = (await codexMarketplaces(options)).find(
    (marketplace) => marketplace.name === name,
  );
  if (registered === undefined) {
    throw new Error(`Failed to refresh marketplace: codex has no marketplace named '${name}'`);
  }

  if (isGitSourced(registered)) return upgradeGitMarketplace(name, options);
  return reinstallEachPluginOf(name, options);
}

function isGitSourced(marketplace: CodexMarketplace): boolean {
  return marketplace.marketplaceSource.sourceType === "git";
}

async function upgradeGitMarketplace(
  name: string,
  options: CodexConfigOptions | undefined,
): Promise<void> {
  await runCodexOrThrow(
    ["plugin", "marketplace", "upgrade", name, "--json"],
    options,
    "refresh marketplace",
    codexPluginCwd(),
  );
}

/** Every plugin of the marketplace, named in the project's config or not. */
async function reinstallEachPluginOf(
  name: string,
  options: CodexConfigOptions | undefined,
): Promise<void> {
  const ofTheMarketplace = (await codexPluginListing(options, codexPluginCwd())).filter(
    (plugin) => plugin.marketplaceName === name,
  );

  // Sequential: every add writes the same `config.toml` and cache.
  for (const [at, plugin] of ofTheMarketplace.entries()) {
    try {
      await installCodexPlugin(plugin.pluginId, options);
    } catch (refusal) {
      await switchBackOffThenRethrow(refusal, ofTheMarketplace.slice(0, at), options);
    }
  }
  await switchBackOff(ofTheMarketplace, options);
}

/** A refusal partway still leaves the plugins added before it switched on. */
async function switchBackOffThenRethrow(
  refusal: unknown,
  added: readonly CodexInstalledPlugin[],
  options: CodexConfigOptions | undefined,
): Promise<never> {
  try {
    await switchBackOff(added, options);
  } catch (error) {
    if (!(error instanceof PluginsLeftSwitchedOnError)) throw error;
    throw new FailedLeavingPluginsSwitchedOnError(refusal, error.leftOn);
  }
  throw refusal;
}

/** `plugin add` switches on whatever it adds, so the ones held switched off before go back off. */
async function switchBackOff(
  heldBefore: readonly CodexInstalledPlugin[],
  options: CodexConfigOptions | undefined,
): Promise<void> {
  await switchCodexPluginsOff(
    codexConfigFile(options),
    heldBefore.filter((plugin) => !plugin.enabled).map((plugin) => plugin.pluginId),
  );
}

function codexConfigFile(options: CodexConfigOptions | undefined): string {
  return path.join(codexStateRoot(options, codexPluginCwd()), CODEX_CONFIG_FILE);
}

/** Scope and project are unused: Codex takes no scope, and `hostFor` refuses plugin + project. */
async function codexInstallPlugin(
  pluginRef: string,
  _scope: SkillScope,
  _projectDir: string,
  options?: CodexConfigOptions,
): Promise<void> {
  await installCodexPlugin(pluginRef, options);
}

async function installCodexPlugin(
  pluginRef: string,
  options: CodexConfigOptions | undefined,
  attempt = "install",
): Promise<void> {
  validatePluginPath(pluginRef);
  await runCodexOrThrow(
    ["plugin", "add", pluginRef, "--json"],
    options,
    `${attempt} ${pluginRef}`,
    codexPluginCwd(),
  );
}

/**
 * Codex has no update verb; adding an installed plugin again installs the version its marketplace
 * offers. One Codex does not hold is refused, as Claude refuses it, so an update installs nothing.
 */
async function codexUpdatePlugin(
  pluginRef: string,
  _scope: SkillScope,
  _projectDir: string,
  options?: CodexConfigOptions,
): Promise<void> {
  const held = await heldPlugin(pluginRef, options);
  if (held === undefined) {
    throw new Error(`Failed to update ${pluginRef}: codex has not installed it`);
  }
  await installCodexPlugin(pluginRef, options, "update");
  await switchBackOff([held], options);
}

/**
 * `plugin remove` exits 0 whatever happened, so the outcome comes from listings taken before and
 * after. Removal is machine-wide whichever scope asks.
 */
async function codexUninstallPlugin(
  pluginRef: string,
  _scope: SkillScope,
  _projectDir: string,
  options?: CodexConfigOptions,
): Promise<PluginRemovalOutcome> {
  validatePluginName(pluginRef);

  const wasInstalled = await isListed(pluginRef, options);
  await runCodexOrThrow(
    ["plugin", "remove", pluginRef, "--json"],
    options,
    `remove ${pluginRef}`,
    codexPluginCwd(),
  );

  if (await isListed(pluginRef, options)) {
    throw new Error(
      `Failed to remove ${pluginRef}: codex still lists it after removing it. ` +
        `Nothing else has been changed.`,
    );
  }

  return wasInstalled ? "removed" : "absent";
}

async function isListed(
  pluginRef: string,
  options: CodexConfigOptions | undefined,
): Promise<boolean> {
  return (await heldPlugin(pluginRef, options)) !== undefined;
}

async function heldPlugin(
  pluginRef: string,
  options: CodexConfigOptions | undefined,
): Promise<CodexInstalledPlugin | undefined> {
  const installed = await codexPluginListing(options, codexPluginCwd());
  return installed.find((plugin) => plugin.pluginId === pluginRef);
}

async function codexPluginListing(
  options: CodexConfigOptions | undefined,
  askedFrom: string,
): Promise<CodexInstalledPlugin[]> {
  const listing = await readJsonFromCodex(
    pluginListingSchema,
    ["plugin", "list", "--json"],
    options,
    "read the plugins codex has installed",
    askedFrom,
  );
  return listing.installed;
}

/**
 * Asked from the project root: in a project the global config trusts, the project's own
 * `config.toml` decides `enabled`. An unreadable marketplace degrades to an empty listing.
 */
async function codexListPlugins(
  projectDir: string,
  options?: CodexConfigOptions,
): Promise<HostPlugin[]> {
  const listing = await codexPluginsOrUnreadable(projectDir, options);
  if (listing.kind === "listed") return [...listing.plugins];

  warnOnce(sayWhatCodexRefused("list the plugins it has installed", listing.reason));
  return [];
}

type CodexPluginListing =
  | { readonly kind: "listed"; readonly plugins: readonly HostPlugin[] }
  | { readonly kind: "unreadable"; readonly reason: string };

async function codexPluginsOrUnreadable(
  projectDir: string,
  options?: CodexConfigOptions,
): Promise<CodexPluginListing> {
  const pluginsRoot = codexPluginsRoot(projectDir, options);
  if (pluginsRoot === null) return { kind: "listed", plugins: [] };
  const cacheRoot = path.join(pluginsRoot, PLUGIN_CACHE_SUBDIR);

  let installed;
  try {
    installed = await codexPluginListing(options, projectDir);
  } catch (error) {
    if (!namesAnUnreadableMarketplace(error)) throw error;
    return { kind: "unreadable", reason: getErrorMessage(error) };
  }

  return {
    kind: "listed",
    plugins: installed.map((plugin) => ({
      pluginKey: plugin.pluginId,
      installPath: path.join(cacheRoot, plugin.marketplaceName, plugin.name, plugin.version),
      enabled: plugin.enabled,
    })),
  };
}

/** A factory so no caller shares another's `offeredPlacements` array by identity. */
export function codexHost(): PluginHost {
  return {
    provider: CODEX,
    offeredPlacements: codexOfferedPlacements(),
    installsProjectScopedPlugins: false,
    isAvailable: isCodexCLIAvailable,
    marketplaceExists: codexMarketplaceExists,
    addMarketplace: codexMarketplaceAdd,
    refreshMarketplace: refreshCodexMarketplace,
    installPlugin: codexInstallPlugin,
    updatePlugin: codexUpdatePlugin,
    uninstallPlugin: codexUninstallPlugin,
    listPlugins: codexListPlugins,
  };
}
