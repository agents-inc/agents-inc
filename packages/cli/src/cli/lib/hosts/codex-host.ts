/**
 * Codex's plugin machinery, behind {@link PluginHost}.
 *
 * The second implementation of the seam, and the first one that proves the seam was worth having:
 * nothing above it changes shape, and almost nothing below it is spelled the way Claude's is.
 *
 * **Every difference here is a measured fact about `@openai/codex` 0.155.1, not a preference.**
 * Each was re-derived with `HOME` and `CODEX_HOME` pinned to a scratch tree and the global
 * `config.toml` deleted between runs — the reset matters because `--sandbox workspace-write` and
 * `danger-full-access` make Codex WRITE a trust entry into that very file, so a later run answers
 * for a reason the measurement never set:
 *
 * | What differs from Claude                                   | What this module does about it            |
 * | ---------------------------------------------------------- | ----------------------------------------- |
 * | the verbs are `add` / `remove` / `marketplace upgrade`      | its own argv per member — no shared builder |
 * | no subcommand takes a scope, and the cwd routes a WRITE nowhere | {@link codexPluginCwd}, pinned for every write verb |
 * | a LISTING does answer per directory, once the project is trusted | {@link codexListPlugins} asks from the project |
 * | `plugin marketplace list --json` answers an OBJECT           | {@link marketplaceRegistrySchema}         |
 * | `plugin remove` exits 0 whatever happened                    | the outcome comes from the listing BEFORE it |
 * | `marketplace upgrade` exits 1 on a local source              | {@link refreshCodexMarketplace} branches on `sourceType` |
 * | every run prints a PATH-alias WARNING on stderr, exit 0 too  | {@link withoutTheStandingWarning}         |
 * | one unreadable marketplace fails BOTH listings outright      | {@link namesAnUnreadableMarketplace}, on the two members that ask a question |
 *
 * **The scope argument is a lie this host cannot tell.** `codex plugin` has no `--scope`, and a
 * `plugin add` run from inside a project writes `[plugins."<id>@<mkt>"] enabled = true` into the
 * GLOBAL `config.toml` and creates no project file at all. So a project-scoped plugin is not a
 * thing that can be installed here, and `installsProjectScopedPlugins` is `false` with
 * `offeredPlacements` saying the same thing in the vocabulary a refusal can print. The refusal
 * itself is `hostFor`'s, applied at the door to every host — see `offered-placements.ts` for why
 * it is not re-implemented in each of them.
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
import { pluginsDir, userConfigRoot } from "../installation/install-layout.js";
import type {
  HostCallOptions,
  HostPlugin,
  InstallPlacement,
  PluginHost,
  PluginRemovalOutcome,
} from "./plugin-host.js";

/** The provider this module is the host for, named once so no member spells it again. */
const CODEX: PluginHost["provider"] = "codex";

/**
 * The staged copy of a plugin lives under this directory of the Codex state root.
 *
 * `plugin list --json` prints no install path, so the path is COMPOSED from the shape
 * `plugin add --json` reports back — `<CODEX_HOME>/plugins/cache/<marketplace>/<name>/<version>`,
 * measured. Two segments rather than one because the cache is nested by marketplace, and a caller
 * listing the cache root can never see a plugin's own name in it.
 */
const PLUGIN_CACHE_SUBDIR = "cache";

/**
 * The line Codex prints on stderr for every run whose `CODEX_HOME` sits under the temp directory,
 * including the ones that exit 0.
 *
 * It is not an error and quoting it into one names a cause that is not the cause. Recognised by
 * its own words rather than by its position, because it is emitted before anything this CLI asked
 * for and interleaves with whatever the command itself says.
 */
const STANDING_WARNING = /could not create PATH aliases/;

/**
 * Where every `codex plugin` call that WRITES is made from, and why it is not the project.
 *
 * Claude routes a user-scoped install by the working directory as well as by a flag, so its host
 * picks a cwd per scope. A Codex WRITE routes nothing by it: there is no scope flag, and `plugin
 * add` run inside a project silently writes the machine-wide switch. A host that let the cwd
 * follow the project would read as project work in every call site and be global work in every
 * effect, which is the one failure in this step that changes another project's installation.
 *
 * **It is not where a LISTING is asked from**, and the first draft of this host used it for every
 * call alike — see {@link codexListPlugins} for the measurement that separates the two.
 *
 * A function rather than a constant for the reason `installBaseDir` gives one file over: a home
 * directory frozen at import answers from whichever HOME the first import saw, and every later
 * call spawns against a directory that may since have been removed.
 */
function codexPluginCwd(): string {
  return os.homedir();
}

/**
 * Every mode/scope cell a Codex installation offers, which is three of the four.
 *
 * `plugin + project` is the cell Codex has no way to fill and the one a shared configuration is
 * refused for by name. Rebuilt per call by {@link codexHost} so no two callers hold one array.
 */
function codexOfferedPlacements(): InstallPlacement[] {
  return [
    { mode: "plugin", scope: "global" },
    { mode: "eject", scope: "global" },
    { mode: "eject", scope: "project" },
  ];
}

/**
 * Which Codex installation a call reads and writes.
 *
 * The host's own spelling of {@link HostCallOptions}, kept as a name of its own because the e2e
 * harness drives these functions directly. `CODEX_HOME` relocates everything Codex keeps for a
 * user and is inherited by every process spawned below.
 */
export type CodexConfigOptions = HostCallOptions;

/**
 * The `execCommand` options fragment that pins the state tree — empty when there is none, so the
 * call inherits its process's environment untouched.
 */
function codexHomeEnv(options: CodexConfigOptions | undefined): { env?: NodeJS.ProcessEnv } {
  if (options?.configDir === undefined) return {};
  return { env: { CODEX_HOME: options.configDir } };
}

/**
 * The state tree this call is about: the one the caller pinned, or the one the layout answers.
 *
 * The layout's own `codexUserRoot` reads `CODEX_HOME` from the environment, which is the same
 * variable {@link codexHomeEnv} writes — so both branches name one directory and the unpinned one
 * is simply the variable this process already carries.
 */
function codexStateRoot(options: CodexConfigOptions | undefined, askedFrom: string): string {
  return options?.configDir ?? userConfigRoot(CODEX, "global", askedFrom);
}

/**
 * One `codex` invocation, from `askedFrom` and against the pinned state tree.
 *
 * The directory is a required argument rather than a constant inside this function, which is the
 * whole of {@link codexListPlugins}'s fix: while it was pinned here, every member asked from the
 * home directory and no call site said so, so the one member whose answer DEPENDS on the
 * directory was wrong in a way no reader of a call site could see.
 *
 * **The state tree is CREATED first, and the reason is measured rather than defensive.** On
 * 0.155.1, with `CODEX_HOME` naming a directory that does not exist:
 *
 * ```
 * $ codex --version                      # exit 0, "codex-cli 0.155.1", a WARNING on stderr
 * $ codex plugin marketplace list --json  # exit 1, "Error: failed to resolve CODEX_HOME"
 * $ codex plugin list --json              # exit 1, the same
 * ```
 *
 * So the probe succeeds and every verb fails — `isAvailable` answers `true` for a host on which
 * nothing this module does can work, which is the silent-in-the-direction-that-looks-fine failure
 * the rest of this file is written against. A user who has installed Codex and never run it is in
 * exactly that state, and so is every pinned HOME a spec hands us. The directory is Codex's own
 * and it creates it itself on first run; making it here is what lets the FIRST thing that ever
 * touches this home be an install.
 */
async function runCodex(
  args: string[],
  options: CodexConfigOptions | undefined,
  askedFrom: string,
): Promise<ExecResult> {
  await makeTheStateRoot(codexStateRoot(options, askedFrom));
  return execCommand("codex", args, { cwd: askedFrom, ...codexHomeEnv(options) });
}

/**
 * Creates the state tree, and DEGRADES where it cannot — which is a posture, not a swallow.
 *
 * The authority on whether a `CODEX_HOME` is usable is Codex, and its refusal names the path:
 * `Error: failed to resolve CODEX_HOME … but that path does not exist`. Turning a filesystem error
 * here into a thrown host failure would replace that sentence with one about a directory the user
 * did not ask us to make — and turning it into `isAvailable: false` would say the binary is
 * missing when it is not. So the reason is recorded where diagnostics go and the call proceeds to
 * the program that owns the answer.
 */
async function makeTheStateRoot(root: string): Promise<void> {
  try {
    await ensureDir(root);
  } catch (error) {
    verbose(`Could not create the codex state directory at ${root}: ${getErrorMessage(error)}`);
  }
}

/**
 * The same invocation, where anything but a clean exit is this host's failure to report.
 *
 * Two shapes of failure meet here and a member that handled one of them would let the other reach
 * a caller as something else entirely: a binary that ran and refused arrives as an exit code, and
 * a binary that is not on PATH arrives as a rejected spawn. `attempt` is the verb phrase the
 * message is built on — "add marketplace", "install plugin" — so every failure on this host reads
 * as one sentence about what was being done.
 */
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

/**
 * What a failing `codex` call said, with the standing warning taken out of it.
 *
 * Line by line rather than by a replacement over the whole string: the warning arrives on its own
 * line and what follows it is the cause a user needs, so removing the line keeps the cause's own
 * formatting intact.
 */
function withoutTheStandingWarning(stream: string): string {
  return stream
    .split("\n")
    .filter((line) => !STANDING_WARNING.test(line))
    .join("\n")
    .trim();
}

/** Whichever stream carried the reason a call failed, ready to quote. */
function whyItFailed(result: ExecResult): string {
  const said = withoutTheStandingWarning(result.stderr) || withoutTheStandingWarning(result.stdout);
  return said || "Unknown error";
}

/**
 * The JSON one `--json` call printed, or a throw naming what was being read.
 *
 * **A parse failure is loud here, where Claude's marketplace reader answers `[]` after a warning.**
 * That reader's silence is survivable on a host whose shape it was written for and is not on this
 * one: an unreadable listing read as "nothing is registered" makes `marketplaceExists` answer
 * false forever, so the marketplace is re-added on every run and the doctor row that reports it
 * can never go green — with nothing failing anywhere to say so.
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

/**
 * Codex's marketplace registry, which is an OBJECT with the array inside it.
 *
 * Claude answers `[{name, source, …}]`; this answers `{"marketplaces":[{name, root,
 * marketplaceSource:{sourceType, source}}]}`. There is no top-level `source` at all, which is why
 * a reader written for the other shape parses nothing and reports an empty registry.
 */
const marketplaceRegistrySchema = z.object({
  marketplaces: z.array(
    z.object({
      name: z.string(),
      marketplaceSource: z.object({ sourceType: z.string(), source: z.string() }),
    }),
  ),
});

/** One marketplace as Codex's registry reports it. */
type CodexMarketplace = z.infer<typeof marketplaceRegistrySchema>["marketplaces"][number];

/**
 * Codex's own listing of what is installed, disabled plugins included.
 *
 * `available` comes back beside `installed` and is deliberately not read: it is the catalogue of
 * what COULD be installed, and a reader that merged the two would report a plugin as installed
 * for being on offer.
 */
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

/**
 * Which plugins directory a listing composes its paths under, given the installation the caller
 * pinned.
 *
 * `CODEX_HOME` names the state tree itself, so the plugins directory hangs off it directly.
 * Unpinned, the answer is the layout's — which reads the same variable, from the environment this
 * process is actually in. `null` is a cell with no plugins directory at all, which `pluginsDir`
 * answers for Codex at PROJECT scope, where plugins are a machine's and not a project's; the
 * global scope asked for here always has one, and the branch is the layout's shape rather than a
 * state this host can reach.
 */
function codexPluginsRoot(
  projectDir: string,
  options: CodexConfigOptions | undefined,
): string | null {
  if (options?.configDir !== undefined) return path.join(options.configDir, PLUGINS_SUBDIR);
  return pluginsDir(CODEX, "global", projectDir);
}

/**
 * Whether the `codex` binary is there and runnable at all.
 *
 * The state tree is pinned even though nothing is being installed, because on this host the probe
 * is a WRITE: `codex --version` links its helper binaries under `$CODEX_HOME/tmp/arg0/` before it
 * reads an argument. A probe with no way to name an installation writes the developer's own on
 * every run, which is what made the option part of the seam rather than of one member.
 */
export async function isCodexCLIAvailable(options?: CodexConfigOptions): Promise<boolean> {
  try {
    const result = await runCodex(["--version"], options, codexPluginCwd());
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

/**
 * Codex's own refusal when a marketplace it has RECORDED can no longer be read.
 *
 * Both listing verbs answer it, in their own words — `failed to load marketplace(s)` from
 * `plugin marketplace list` and `failed to load configured marketplace snapshot(s)` from `plugin
 * list` — and both exit 1 having printed no JSON at all. Recorded 2026-09-22 on the pinned
 * 0.155.1 by adding a local marketplace and then moving its directory away:
 *
 * ```
 * $ codex plugin marketplace list --json                                            # exit 1
 * Error: failed to load marketplace(s):
 * - `c4-measure-marketplace` at <gone>: marketplace root does not contain a supported manifest
 * $ codex plugin list --json                                                        # exit 1
 * Error: failed to load configured marketplace snapshot(s):
 * - `c4-measure-marketplace` at <gone>: marketplace root does not contain a supported manifest
 * ```
 *
 * **It is total, and it is not about us.** One unreadable entry fails the whole listing, so a
 * marketplace a user added by hand and later deleted takes down every read this host makes — while
 * `plugin marketplace add` and `plugin remove` go on working in the same state, measured. That is
 * why the degrade is at the two members that ask a QUESTION and nowhere else: a write whose
 * correctness is decided by a listing must not be told the listing was empty.
 */
const UNREADABLE_MARKETPLACE = /failed to load (?:configured )?marketplace/i;

/** Whether a failure from a listing verb is that refusal rather than a failure of this host's. */
function namesAnUnreadableMarketplace(error: unknown): boolean {
  return UNREADABLE_MARKETPLACE.test(getErrorMessage(error));
}

/** Every marketplace this Codex installation knows, in its own shape. */
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

/**
 * Whether this Codex installation knows a marketplace by that NAME.
 *
 * **By name and never by count.** A Codex home holds whatever marketplaces its user has added
 * beside ours, so a predicate answering "the registry is not empty" is green on somebody else's
 * entry — and one answering "the registry holds exactly ours" is red the moment they add one.
 *
 * *Correction, 2026-09-22.* This paragraph used to give a different reason: that Codex ships its
 * own `openai-api-curated` rooted at `$CODEX_HOME/.tmp/plugins`, so ours is never the only entry.
 * That does not reproduce offline. Against the pinned 0.155.1 with a virgin `CODEX_HOME`,
 * `plugin marketplace list --json` answers `{"marketplaces":[]}` and `plugin list --json` answers
 * `{"installed":[],"available":[]}`. The names `openai-api-curated`, `openai-curated` and
 * `openai-bundled` are all in the shipped binary, so something registers them — an account, a
 * fetch, a feature — and nothing this rig can reach does. The RULE is unchanged; only its reason
 * was a claim that cannot be re-run, and the condition that produces the bundled entry is an open
 * question for the owner's real-Codex hand check rather than a fact this file may assert.
 *
 * **An unreadable marketplace is not an answer to this question, and it is not this host's
 * failure either** — see {@link namesAnUnreadableMarketplace}. Answering `false` is what Claude's
 * twin does for a registry it cannot parse, and it is the survivable direction here: the caller
 * adds our marketplace again, which `plugin marketplace add` performs in exactly this state.
 */
async function codexMarketplaceExists(
  name: string,
  options?: CodexConfigOptions,
): Promise<boolean> {
  return (await codexRegisteredMarketplace(name, options)) !== null;
}

/**
 * The registration Codex holds under one marketplace NAME, with the source it was added from.
 *
 * `null` for a name nothing is registered under, and for a registry Codex could not read at all —
 * which is the posture {@link codexMarketplaceExists} had when it owned this read, and it is the
 * survivable direction for the same reason: the caller goes on to ADD, which `plugin marketplace
 * add` performs in exactly that state.
 *
 * {@link codexMarketplaceExists} is expressed over this rather than beside it, so the two cannot
 * answer differently about one registry.
 */
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

/**
 * Codex's own words for the refusal, quoted rather than summarised.
 *
 * The refusal names the marketplace and the path it could not read there, and neither is
 * derivable from anything this CLI holds — so a warning that said "codex could not read its
 * marketplaces" would leave a user with a degraded answer and no way to find the entry that
 * caused it.
 */
function sayWhatCodexRefused(attempt: string, said: string): string {
  return `Codex could not ${attempt}, so this run is treating it as having none. It said: ${said}`;
}

/** Registers a marketplace from its SOURCE — the one verb here that does not take a name. */
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
 * Pulls a registered marketplace's current contents — two different commands behind one member.
 *
 * `marketplace upgrade` is git-only: against a local source it exits 1 with ``marketplace `…` is
 * not configured as a Git marketplace``, measured. This CLI's own generated marketplace IS local,
 * so a refresh that reached for `upgrade` unconditionally would report a failed update for the
 * one marketplace that is working exactly as designed. A local marketplace is refreshed by
 * installing its plugins again over the top, which is what `plugin add` does to an installed one.
 *
 * A name nothing registered is a throw rather than a silent no-op: `update` collects the failure
 * and names the marketplace, where a quiet return would report every marketplace refreshed.
 *
 * **The name is validated before anything is spawned**, which this member did not do until
 * 2026-09-22 while its Claude twin `claudePluginMarketplaceUpdate` always has. It is the one value
 * on this host that reached an argument vector unchecked: `add` checks its source and both plugin
 * verbs check their reference, so the gap was invisible beside three neighbours that read as the
 * rule. Checked here rather than in {@link upgradeGitMarketplace}, because the refusal is owed
 * whichever branch a caller's name would have taken.
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

/** Whether Codex recorded this marketplace as a git checkout, which is what `upgrade` needs. */
function isGitSourced(marketplace: CodexMarketplace): boolean {
  return marketplace.marketplaceSource.sourceType === "git";
}

/** The one verb that refreshes a git marketplace in place. */
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

/** Every installed plugin of one local marketplace, installed again over the top of itself. */
async function reinstallEachPluginOf(
  name: string,
  options: CodexConfigOptions | undefined,
): Promise<void> {
  // From the home directory: what is INSTALLED is a function of `CODEX_HOME` alone, and this
  // listing decides what gets written rather than what one project sees.
  const installed = await codexPluginListing(options, codexPluginCwd());

  // In sequence rather than through `Promise.all`: every one of these writes the same
  // `config.toml` and the same cache, and a host that raced them would interleave writes to one
  // file for no gain a user could see.
  for (const plugin of installed.filter((entry) => entry.marketplaceName === name)) {
    await installCodexPlugin(plugin.pluginId, options);
  }
}

/**
 * Installs a marketplace-qualified plugin.
 *
 * The scope and the project directory are the seam's, and this host has no use for either: no
 * Codex subcommand takes a scope, and the working directory is pinned for {@link codexPluginCwd}'s
 * reason. A `plugin + project` placement never reaches here at all — `hostFor` binds the roster on
 * this verb, so the refusal happens before anything is spawned.
 */
async function codexInstallPlugin(
  pluginRef: string,
  _scope: SkillScope,
  _projectDir: string,
  options?: CodexConfigOptions,
): Promise<void> {
  await installCodexPlugin(pluginRef, options);
}

/** One `plugin add`, which is the whole of an install on this host. */
async function installCodexPlugin(
  pluginRef: string,
  options: CodexConfigOptions | undefined,
): Promise<void> {
  validatePluginPath(pluginRef);
  await runCodexOrThrow(
    ["plugin", "add", pluginRef, "--json"],
    options,
    `install ${pluginRef}`,
    codexPluginCwd(),
  );
}

/**
 * Removes a plugin, and says which of the two ordinary outcomes it was.
 *
 * **The answer cannot come from the command that does it.** Measured three times on 0.155.1: a
 * plugin that was never installed, one that really went, and one removed a second time all exit 0
 * and print the same three fields on stdout. So the classification is the listing taken BEFORE the
 * removal, and the listing taken after is what turns a failed removal into a throw rather than
 * into a cheerful count — `uninstall` reports what it observed, which is D11(b).
 *
 * The scope and the project directory are the seam's; a Codex removal is machine-wide whichever
 * scope asks for it, and `uninstall` decides which scopes sweep at all.
 *
 * **The reference is held to the same check its Claude twin uses**, which is `validatePluginName`
 * and not the looser `validatePluginPath` this member reached for until 2026-09-22. A plugin
 * reference is `<name>@<marketplace>` and needs neither the colon nor the tilde the path check
 * admits, so the two hosts were refusing different values for one argument.
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

/**
 * Whether this Codex installation currently lists that plugin, switched on or off.
 *
 * Asked from the home directory, because the question is about the machine-wide registry a
 * removal acts on. The membership of that listing does not move with the directory — only the
 * `enabled` switch does, which this predicate never reads.
 */
async function isListed(
  pluginRef: string,
  options: CodexConfigOptions | undefined,
): Promise<boolean> {
  const installed = await codexPluginListing(options, codexPluginCwd());
  return installed.some((plugin) => plugin.pluginId === pluginRef);
}

/** The `installed` array of one `plugin list --json`, parsed, as seen from `askedFrom`. */
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
 * What Codex has installed, as seen from one project — and it is ASKED from that project.
 *
 * **This is the one member whose answer the working directory decides, and it asked from the home
 * directory until 2026-09-22.** `codex plugin list` takes no project or scope argument at all
 * (`-m/--marketplace`, `--available` and `--json` are the whole of it), which is what the first
 * draft read as "the directory cannot matter" — and the membership of the listing really is a
 * function of `CODEX_HOME` alone. The `enabled` switch is not. Re-derived on the pinned 0.155.1,
 * one `CODEX_HOME` whose global `config.toml` says `[plugins."<id>"] enabled = true`, one project
 * whose own `.codex/config.toml` says `enabled = false`, and the global `[projects."<abs path>"]
 * trust_level = "trusted"` entry added between the second run and the first:
 *
 * ```
 * untrusted, asked from the project   -> "enabled": true    # the project file is ignored
 * TRUSTED,   asked from the project   -> "enabled": false   # the project file wins
 * TRUSTED,   asked from the home dir  -> "enabled": true    # the project is not in play
 * TRUSTED,   asked from ANOTHER project -> "enabled": true  # nor is its file
 * ```
 *
 * So a host pinned to the home directory answers the global switch to every caller, and the field
 * the seam was widened to carry — "installed but disabled for THIS project" — has no state it can
 * ever report. The doctor row that reads it would be green over a plugin the project has switched
 * off.
 *
 * **`projectDir` is the project ROOT, and on this host that matters.** From a SUBDIRECTORY of the
 * same trusted project the answer went back to `true` — unless the project is a git repository,
 * in which case the subdirectory answers `false` like the root. Measured both ways in the same
 * rig, the repository written as files rather than by running `git`. The seam passes a resolved
 * project root, so this host is on the safe side of it either way; it is recorded because a
 * caller that ever passes a cwd instead would get the global switch back with nothing to say so.
 *
 * A WRITE is still made from the home directory, and that asymmetry is the measurement rather
 * than an inconsistency: `plugin add` run inside a project writes the machine-wide switch and
 * creates no project file, so following the project there changes another project's installation.
 * See {@link codexPluginCwd}.
 *
 * No caller may read `enabled: true` as "this project has it switched on" even now: an untrusted
 * project's own file is ignored in silence, and the listing does not say which of the two
 * answered. That is the same trust gate `codexProjectRoles` in `installation/install-layout.ts`
 * carries for a compiled sub-agent.
 *
 * **An unreadable marketplace answers an empty listing rather than throwing**, which is Claude's
 * posture for a registry it cannot read — see {@link namesAnUnreadableMarketplace} for why the
 * failure is not about this installation at all.
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

/**
 * What Codex has installed, or the reason it could not say — the same read with the degrade left
 * visible.
 *
 * `reason` is Codex's OWN words and nothing else — the refusal names the marketplace and the path
 * it could not read there, neither of which anything in this CLI holds. The caller wraps them in
 * its own sentence.
 */
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

/**
 * Codex as a {@link PluginHost}.
 *
 * A factory rather than a shared constant, so no caller holds another's `offeredPlacements` array
 * by identity — the rule `validResult()` in `lib/validation-result.ts` states and `claudeHost`
 * follows one file over.
 */
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
    uninstallPlugin: codexUninstallPlugin,
    listPlugins: codexListPlugins,
  };
}
