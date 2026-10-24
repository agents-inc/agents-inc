/**
 * `--provider`: names the installation where the folder cannot — a greenfield `init --from`, or a
 * scope holding both providers, where acting commands refuse until it is given.
 */

import os from "os";

import { Flags } from "@oclif/core";

import { PROVIDERS, EDITOR_URL, CLI_INVOKE_COMMAND, type Provider } from "../../consts.js";
import { detectInstallations, type DetectedInstallation } from "./detect-installations.js";
import { chooseProviderForThisRun, providerInUse } from "./install-layout.js";

/** A factory because oclif mutates flag definitions, so commands must not share one. */
export function providerFlag() {
  return Flags.string({
    description: "Which provider's installation this run is about",
    helpValue: `<${PROVIDERS.join("|")}>`,
    options: [...PROVIDERS],
  });
}

/** oclif has already rejected unlisted values; this only narrows. */
export function providerNamedBy(flagValue: string | undefined): Provider | undefined {
  if (flagValue === undefined) return undefined;
  return PROVIDERS.find((provider) => provider === flagValue);
}

const PROVIDER_FLAG = "--provider";
const PROVIDER_FLAG_WITH_ITS_VALUE = `${PROVIDER_FLAG}=`;
const END_OF_FLAGS = "--";

/**
 * For a run oclif has not parsed yet: `--provider <name>` or `--provider=<name>`, ahead of any
 * `--`; a value naming no provider names none.
 */
export function providerNamedIn(argv: readonly string[]): Provider | undefined {
  const end = argv.indexOf(END_OF_FLAGS);
  const flags = end === -1 ? argv : argv.slice(0, end);

  const spaced = flags.indexOf(PROVIDER_FLAG);
  if (spaced !== -1) return providerNamedBy(flags[spaced + 1]);

  const joined = flags.find((token) => token.startsWith(PROVIDER_FLAG_WITH_ITS_VALUE));
  return providerNamedBy(joined?.slice(PROVIDER_FLAG_WITH_ITS_VALUE.length));
}

export function providerNeedsAConfigurationToInstall(): string {
  return (
    `--provider names which installation to create and needs the configuration to create it ` +
    `from, so it is only meaningful beside --from. Build one at ${EDITOR_URL}, then run ` +
    `'${CLI_INVOKE_COMMAND} init --from <id> --provider <provider>'.`
  );
}

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

type InstallationsInPlay = {
  scopeRoot: string;
  providers: Provider[];
};

/** The project's installations, or the global ones only when the project has none. */
async function installationsInPlay(cwd: string): Promise<InstallationsInPlay> {
  const found = await detectInstallations(cwd);
  const inTheProject = atScope(found, "project");

  if (inTheProject.length > 0) return { scopeRoot: cwd, providers: providersOf(inTheProject) };
  return { scopeRoot: os.homedir(), providers: providersOf(atScope(found, "global")) };
}

function atScope(
  found: readonly DetectedInstallation[],
  scope: DetectedInstallation["scope"],
): DetectedInstallation[] {
  return found.filter((installation) => installation.scope === scope);
}

function providersOf(installations: readonly DetectedInstallation[]): Provider[] {
  return installations.map((installation) => installation.provider);
}

/**
 * A named provider is committed for the run; two installations and no flag call `onAmbiguous`
 * (the command's `this.error`); otherwise nothing happens.
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

/** The non-refusing read the remedies hand a command out from, so they and the refusal agree. */
export async function providersInPlay(cwd: string): Promise<Provider[]> {
  return (await installationsInPlay(cwd)).providers;
}

/**
 * Which installation a handed-out acting command must name: the one the run named, else the choice
 * where two are in play, since a bare one refuses there.
 */
export async function installationToName(
  cwd: string,
  named: Provider | undefined,
): Promise<Provider | Provider[] | undefined> {
  if (named !== undefined) return named;

  const providers = await providersInPlay(cwd);
  return providers.length > 1 ? providers : undefined;
}

/** The non-refusing form, for `doctor`. */
export async function ambiguityFinding(cwd: string): Promise<string | null> {
  const { scopeRoot, providers } = await installationsInPlay(cwd);
  if (providers.length <= 1) return null;

  return ambiguousInstallation("every command that acts on one", providers, scopeRoot);
}

/**
 * For `list`: names the other installation in the scope, or `null` when there is none. The one
 * shown is read off the scope the roster came from, as `detectInstallation` reads it.
 */
export async function otherInstallationsInThisScope(cwd: string): Promise<string | null> {
  const { scopeRoot, providers } = await installationsInPlay(cwd);
  const showing = providerInUse(scopeRoot);
  const others = providers.filter((provider) => provider !== showing);
  if (others.length === 0) return null;

  return (
    `${scopeRoot} holds ${providers.length} installations — ${providers.join(" and ")} — and this ` +
    `is the ${showing} one. Show another with --provider <${providers.join("|")}>.`
  );
}
