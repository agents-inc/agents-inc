/**
 * `--provider`: the one flag that names an installation this release cannot read off a folder.
 *
 * **The folder is the record, and this flag is not a second one.** There is no `provider` field in
 * `config.ts`, nothing in a shared payload carries one and a share id encodes none — which is what
 * keeps one saved configuration installable onto either provider and every existing id working.
 * So after an install the folder answers, `providerInUse` reads it, and no command needs a flag.
 * Two questions survive that, and both are the absence of a folder rather than a doubt about one:
 *
 * 1. **A greenfield `init --from <id> --provider codex`** — the folder does not exist yet, so
 *    there is nothing to read. This is the flag's whole purpose, and it is why the flag is
 *    meaningless without `--from`: the provider is chosen in the web app, so the only run that can
 *    be told one is the run that installs what the app produced (D15). A wizard walked to the end
 *    and then refused would have spent the user's time before saying so, and there is no wizard
 *    step to choose a provider in.
 * 2. **A scope holding BOTH folders** — the disk has two answers, `providerInUse` resolves them by
 *    roster order, and a command that acted on the roster's first answer would act on a user's
 *    other installation with nothing on screen saying so. `edit`, `uninstall`, `share`, `eject`,
 *    `compile` and `update` refuse instead, naming this flag; `list` takes it too and, given no
 *    flag, names both installations above the one it is showing —
 *    {@link otherInstallationsInThisScope}. **`compile`, `update` and `list` were outside this from C7b
 *    until 2026-09-23**, on the reading that a command reading the provider off the FOLDER needs
 *    no flag. True of a folder, false of a SCOPE: a scope holds up to one installation per
 *    provider, and `providerInUse` then answers by roster order — so the two that write rewrote
 *    one of a user's two in silence and the one that reports showed one of them.
 *
 * **The refusal and the selection are one module, deliberately.** A refusal naming a flag that
 * does nothing is worse than neither: the user reads the sentence, types the flag, and the command
 * refuses again or — worse — acts on whichever installation it was going to act on anyway.
 * {@link refuseAnAmbiguousInstallation} is the refusal and {@link chooseProviderForThisRun} is
 * what the flag it names does, and neither can be added without the other.
 *
 * **It was hidden through C6 and is on the help screens from C7b.** Between C4 and C5 a Codex
 * install compiled no sub-agents, so the flag was a user-reachable surface for a provider that
 * was not finished. Hiding it was never disabling it — oclif parses a hidden flag exactly as it
 * parses any other, which is what let the e2e suite drive it throughout and is why no behavioural
 * spec reddened when the hiding came off. The one surface that can tell a shipped flag from an
 * undiscoverable one is help output, so that is where the claim lives:
 * `e2e/commands/provider-is-on-every-help-screen.e2e.test.ts` asserts each command that declares
 * it advertises it with both provider names, and that `doctor` — which reports on every
 * installation in the scope rather than acting on one — does not.
 */

import os from "os";

import { Flags } from "@oclif/core";

import { PROVIDERS, EDITOR_URL, CLI_INVOKE_COMMAND, type Provider } from "../../consts.js";
import { detectInstallations, type DetectedInstallation } from "./detect-installations.js";
import { chooseProviderForThisRun } from "./install-layout.js";

/**
 * The flag itself, declared once and built into each command's own `static flags`.
 *
 * `options` is what makes the roster closed: oclif refuses an unlisted value with exit 2 and a
 * message naming every provider there is, so a user who typed one wrong is told the spelling of
 * the one they wanted rather than that something was invalid.
 *
 * A FACTORY rather than a shared constant, for the reason `agentCodec` and
 * `claudeOfferedPlacements` each give: every command declaring it would otherwise hold one object
 * by identity, oclif writes onto a flag definition while building a command's flag map, and
 * nothing in the types says either thing.
 */
export function providerFlag() {
  return Flags.string({
    description: "Which provider's installation this run is about",
    helpValue: `<${PROVIDERS.join("|")}>`,
    options: [...PROVIDERS],
  });
}

/**
 * The parsed flag as a {@link Provider}, or `undefined` for a run that named none.
 *
 * oclif has already refused anything outside the roster by the time this is reached — `options`
 * above is checked during `parse` — so the guard here is a narrowing rather than a second
 * validation, and it is written as a membership test rather than a cast because a cast would
 * survive the roster growing a member this switch has never seen.
 */
export function providerNamedBy(flagValue: string | undefined): Provider | undefined {
  if (flagValue === undefined) return undefined;
  return PROVIDERS.find((provider) => provider === flagValue);
}

/**
 * What `init` says when it is handed a provider and no configuration to install.
 *
 * Both halves are load-bearing. `--from` is what the flag needs, and the EDITOR is where an id
 * comes from — a user told only that `--from` is missing has no way to produce one, and the CLI
 * has no step that mints it. The `/editor` segment rather than the apex, because the apex is a
 * landing page that knows nothing about a configuration.
 */
export function providerNeedsAConfigurationToInstall(): string {
  return (
    `--provider names which installation to create and needs the configuration to create it ` +
    `from, so it is only meaningful beside --from. Build one at ${EDITOR_URL}, then run ` +
    `'${CLI_INVOKE_COMMAND} init --from <id> --provider <provider>'.`
  );
}

/**
 * What a command says when the scope it is about holds an installation of each provider.
 *
 * It names both, because "there is more than one" leaves the user to go and look; and it names the
 * flag, because the sentence is only worth printing if it says how to answer.
 */
function ambiguousInstallation(
  subject: string,
  providers: readonly Provider[],
  scopeRoot: string,
): string {
  return (
    `${scopeRoot} holds ${providers.length} installations — ${providers.join(" and ")} — so ` +
    `${subject} cannot tell which one you mean. Name it with --provider <${providers.join("|")}>. ` +
    `Nothing has been changed.`
  );
}

/** One scope's installations: the directory they are under, and which providers are there. */
type InstallationsInPlay = {
  scopeRoot: string;
  providers: Provider[];
};

/**
 * The installations a run from `cwd` could act on, and which providers they belong to.
 *
 * The project's own first and the global only when the project has none, which is the fallback
 * every command already walks — a project installation is the subject of a command run inside it,
 * and the global is what a run with no project installation is about. Answering over both at once
 * would refuse a Claude project on a machine whose HOME happens to carry two installations, which
 * is a fact about the machine rather than about this run.
 */
async function installationsInPlay(cwd: string): Promise<InstallationsInPlay> {
  const found = await detectInstallations(cwd);
  const inTheProject = atScope(found, "project");

  if (inTheProject.length > 0) return { scopeRoot: cwd, providers: providersOf(inTheProject) };
  // `os.homedir()` rather than a path derived from a config file, because it is the root
  // `detectInstallations` itself looked under — so the directory the message names is the
  // directory that was read, under a pinned HOME as much as under a real one.
  return { scopeRoot: os.homedir(), providers: providersOf(atScope(found, "global")) };
}

/** The installations one scope root holds. */
function atScope(
  found: readonly DetectedInstallation[],
  scope: DetectedInstallation["scope"],
): DetectedInstallation[] {
  return found.filter((installation) => installation.scope === scope);
}

/** Which providers a set of installations belongs to, in the roster order discovery answered in. */
function providersOf(installations: readonly DetectedInstallation[]): Provider[] {
  return installations.map((installation) => installation.provider);
}

/**
 * Settles which installation a command acts on, and refuses rather than guessing.
 *
 * Three endings, and the middle one is the whole point:
 *
 * - a run TOLD a provider commits to it for every path it builds, through
 *   {@link chooseProviderForThisRun}. That is what makes the refusal below actionable.
 * - a scope holding two installations and no flag is refused by `onAmbiguous`, which never
 *   returns: half of this — a refusal naming a flag that selects nothing — is worse than neither.
 * - anything else is left exactly as it was, so a scope holding one installation needs no flag and
 *   every existing invocation keeps working.
 *
 * `onAmbiguous` is the command's own `this.error`, so the exit code and the rendering are oclif's
 * rather than this module's; it is typed `never` so a caller cannot forget to stop.
 */
export async function refuseAnAmbiguousInstallation(
  cwd: string,
  subject: string,
  named: Provider | undefined,
  onAmbiguous: (message: string) => never,
): Promise<void> {
  if (named !== undefined) {
    chooseProviderForThisRun(named);
    return;
  }

  const { scopeRoot, providers } = await installationsInPlay(cwd);
  if (providers.length <= 1) return;

  onAmbiguous(ambiguousInstallation(subject, providers, scopeRoot));
}

/**
 * The same question asked without refusing, for `doctor` — which changes nothing and therefore
 * reports rather than stops.
 *
 * A read-only command that refused would leave a user whose scope holds two installations unable
 * to LOOK at either, which is the one state they most need to see.
 */
export async function ambiguityFinding(cwd: string): Promise<string | null> {
  const { scopeRoot, providers } = await installationsInPlay(cwd);
  if (providers.length <= 1) return null;

  return ambiguousInstallation("every command that acts on one", providers, scopeRoot);
}

/**
 * The same question for a command that REPORTS one of the installations — `list`.
 *
 * A third sentence rather than either of the two above, because `list` is in neither of their
 * positions. It writes nothing, so refusing would leave a user unable to LOOK at what they have;
 * and it does not describe the whole scope the way `doctor` does, so "every command that acts on
 * one" would be a sentence about other commands printed above a report of one installation. What
 * it owes is the fact its own report omits: there is a second installation here, this is not it,
 * and here is how to ask for the other.
 *
 * `null` where the scope holds one installation, so the ordinary case prints nothing at all.
 */
export async function otherInstallationsInThisScope(
  cwd: string,
  showing: Provider,
): Promise<string | null> {
  const { scopeRoot, providers } = await installationsInPlay(cwd);
  const others = providers.filter((provider) => provider !== showing);
  if (others.length === 0) return null;

  return (
    `${scopeRoot} holds ${providers.length} installations — ${providers.join(" and ")} — and this ` +
    `is the ${showing} one. Show another with --provider <${providers.join("|")}>.`
  );
}
