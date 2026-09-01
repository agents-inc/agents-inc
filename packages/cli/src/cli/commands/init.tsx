import React from "react";

import { Flags, type Interfaces } from "@oclif/core";
import { Box, Text, useApp } from "ink";
import { render } from "../components/render.js";

import { BaseCommand } from "../base-command.js";
import { type WizardResultV2 } from "../components/wizard/wizard.js";
import { runWizardSession } from "../components/wizard/run-wizard-session.js";
import { useTerminalDimensions } from "../components/hooks/use-terminal-dimensions.js";
import { type SourceLoadResult } from "../lib/loading/index.js";
import {
  loadSource,
  loadAgentDefs,
  copyLocalSkills,
  writeProjectConfig,
  compileAgentsAllScopes,
  type CompilationResult,
  type SkillCopyResult,
  discoverInstalledSkills,
} from "../lib/operations/index.js";
import { fetchSeedConfig } from "../lib/seed/fetch-seed.js";
import {
  registerExternalSkills,
  writeExternalSkills,
  type ExternalSkillInstall,
} from "../lib/seed/external-skills.js";
import { seedToWizardResult, type SeedMapping } from "../lib/seed/seed-to-wizard.js";
import { getInstallationInfo } from "../lib/plugins/plugin-info.js";
import { loadProjectConfig } from "../lib/configuration/project-config.js";
import { resolveBranding } from "../lib/configuration/config.js";
import {
  type InstallMode,
  detectInstallation,
  detectGlobalInstallation,
  detectProjectInstallation,
  deriveInstallMode,
  resolveInstallPaths,
  buildAgentScopeMap,
  isHomeDirectory,
  INSTALL_MODE_LABELS,
  INSTALL_MODE_DESCRIPTIONS,
} from "../lib/installation/index.js";
import { checkPermissions } from "../lib/permission-checker.js";
import {
  ASCII_LOGO,
  CLAUDE_SRC_DIR,
  CLI_INVOKE_COMMAND,
  DEFAULT_BRANDING,
  EDITOR_URL,
  EDIT_PROJECT_SETUP_FLAG,
  EJECT_SOURCE,
  STANDARD_FILES,
  editorConfigUrl,
} from "../consts.js";
import { clearTerminalScreen } from "../utils/terminal.js";
import { SelectList, type SelectListItem } from "../components/common/select-list.js";
import { promptValue } from "../components/common/prompt-confirm.js";
import { Spinner } from "../components/common/spinner.js";
import { getErrorMessage } from "../utils/errors.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { openUrl } from "../utils/open-url.js";
import type { AgentName, MergedSkillsMatrix, SkillScope } from "../types/index.js";
import { type StartupMessage } from "../utils/logger.js";
import {
  INCOMPLETE_WORK_RECOVERY,
  STATUS_MESSAGES,
  agentsNotCompiled,
  carriedSkillsWritten,
  globalScopedAgentsHint,
  initSucceeded,
  sharedConfigExistingInstall,
  sharedConfigGlobalInstall,
  skippedUnknownAgents,
  skippedUnknownSkills,
} from "../utils/messages.js";
import type { SeedPayload } from "@workspace/matrix/seed";

const DASHBOARD_OPTIONS = [
  { label: "Edit", value: "edit" },
  { label: "Compile", value: "compile" },
  { label: "Doctor", value: "doctor" },
  { label: "List", value: "list" },
] as const satisfies readonly SelectListItem<string>[];

/** The commands offered by the project dashboard (single source: DASHBOARD_OPTIONS). */
export type DashboardCommand = (typeof DASHBOARD_OPTIONS)[number]["value"];

/**
 * The dashboard's title: {@link ASCII_LOGO} for an installation resting on the shipped branding,
 * and the configured name in its place for one that white-labels it.
 *
 * **The logo gives way rather than sitting above the name, because it spells the shipped name.**
 * `branding.name` replaces a heading everywhere else it is read — every configured leg of
 * `commands/branding-name-reaches-headings` asserts {@link DEFAULT_BRANDING.NAME} is ABSENT — so
 * painting `AGENTS INC` in block capitals above `Northwind` would leave the vendor's name at the
 * most prominent surface the product has, which is the one thing white-labelling is for.
 *
 * The default path is untouched by construction: {@link resolveBranding} answers
 * {@link DEFAULT_BRANDING.NAME} for a configuration with no `branding` key, so an unbranded
 * install takes the logo arm. A configuration naming the shipped name explicitly takes it too —
 * it asked for the shipped name and gets the shipped presentation of it.
 */
const DashboardTitle: React.FC<{ name: string }> = ({ name }) =>
  name === DEFAULT_BRANDING.NAME ? <Text>{ASCII_LOGO}</Text> : <Text bold>{name}</Text>;

type DashboardProps = {
  /** Everything the screen paints, exactly as {@link formatDashboardText} is handed it. */
  data: DashboardData;
  onSelect: (command: DashboardCommand) => void;
  onCancel: () => void;
};

export const Dashboard: React.FC<DashboardProps> = ({ data, onSelect, onCancel }) => {
  const { exit } = useApp();
  const { rows: terminalHeight } = useTerminalDimensions();

  return (
    <Box flexDirection="column" height={terminalHeight}>
      <Box marginBottom={1}>
        <DashboardTitle name={data.name} />
      </Box>
      <Box marginBottom={1}>
        <Text>{dashboardCountLines(data).join("\n")}</Text>
      </Box>
      <SelectList
        items={DASHBOARD_OPTIONS}
        onSelect={(command) => {
          onSelect(command);
          exit();
        }}
        onCancel={() => {
          onCancel();
          exit();
        }}
      />
    </Box>
  );
};

/**
 * What this installation is, as the lines both dashboards paint between the title and the menu.
 *
 * **Shared because the two paths had diverged, not for reuse.** `showDashboard` branches on
 * `process.stdin.isTTY`, and only the text branch drew these — so the screen a person sits in
 * front of was less informative than the output they get by piping it, and no assertion could see
 * it, because each path was only ever compared against itself. One producer is what makes the two
 * unable to drift apart again.
 */
export function dashboardCountLines(data: DashboardData): string[] {
  const lines = [
    `  Skills:       ${data.skillCount} installed`,
    `  Agents:       ${data.agentCount} compiled`,
    `  Mode:         ${INSTALL_MODE_LABELS[data.mode]}`,
  ];
  if (data.source) {
    lines.push(`  Marketplace:  ${data.source}`);
  }
  return lines;
}

/** Formats the dashboard summary as plain text lines (for non-interactive/test output). */
export function formatDashboardText(data: DashboardData): string {
  return [
    data.name,
    "",
    ...dashboardCountLines(data),
    "",
    `  [Edit]  [Compile]  [Doctor]  [List]`,
  ].join("\n");
}

/**
 * Shows the project dashboard and returns the selected command (or null if cancelled).
 * In non-interactive environments (no TTY), prints the summary text and returns null.
 */
export async function showDashboard(
  projectDir: string,
  log?: (message: string) => void,
): Promise<DashboardCommand | null> {
  const data = await getDashboardData(projectDir);

  // Non-interactive: print text summary and exit (CI, piped, tests)
  if (!process.stdin.isTTY) {
    const output = log ?? console.log;
    output(formatDashboardText(data));
    return null;
  }

  // First-wins resolution via promptValue; clearOnResolve repaints a clean
  // terminal before unmount (dashboard occupies the full height).
  const selectedCommand = await promptValue<DashboardCommand | null>(
    (resolve) => (
      <Dashboard
        data={data}
        onSelect={(command) => resolve(command)}
        onCancel={() => resolve(null)}
      />
    ),
    { onExit: null, clearOnResolve: true },
  );

  clearTerminalScreen();

  return selectedCommand;
}

/**
 * Why the dashboard is on screen.
 *
 * `"init"` — the user ran `cc init` in an already-installed directory. That is a request
 * to set this project up, so choosing Edit continues the setup: it must materialise the
 * project even if the wizard changes nothing.
 *
 * `"standalone"` — the bare `cc` dashboard. Edit is just an editor there; a pass with no
 * changes is an inspection and must leave the filesystem untouched.
 */
export type DashboardOrigin = "init" | "standalone";

/** The extra argv a dashboard selection needs to carry its origin into the command. */
function dashboardCommandArgv(command: DashboardCommand, origin: DashboardOrigin): string[] {
  if (command !== "edit" || origin !== "init") return [];
  return [`--${EDIT_PROJECT_SETUP_FLAG}`];
}

/**
 * Shared dashboard entry: when the project is already initialized, shows the
 * dashboard and runs the chosen command. Returns true when the project was
 * initialized (dashboard shown), false otherwise. Never exits the process —
 * callers decide (the init hook exits SUCCESS at its own call site).
 */
export async function runDashboardFlow(
  projectDir: string,
  config: Interfaces.Config,
  origin: DashboardOrigin,
  log?: (message: string) => void,
): Promise<boolean> {
  const installation = await detectInstallation(projectDir);
  if (!installation) return false;

  const selectedCommand = await showDashboard(projectDir, log);
  if (selectedCommand) {
    await config.runCommand(selectedCommand, dashboardCommandArgv(selectedCommand, origin));
  }
  return true;
}

/**
 * What `init` decided to install, and the little each producer knows that the shared spine does
 * not. Keeping these on the value rather than branching on a flag downstream is what stops the
 * two paths growing separate copies of the install sequence.
 */
/**
 * The marketplace this run was pointed at, as oclif hands it over.
 *
 * `marketplace` is a required key holding `string | undefined` rather than
 * `marketplace?: string` because that is what oclif produces: a non-required flag still gets
 * its key written on the parse result, set to `undefined` when it was not passed. Under
 * `exactOptionalPropertyTypes` the two are different types, and `?` would be describing a
 * producer that never omits the key.
 */
type SourceFlags = { marketplace: string | undefined };

type Selection = {
  result: WizardResultV2;
  sourceResult: SourceLoadResult;
  /**
   * The marketplace this selection was actually loaded from, which the shared spine records in
   * the written config. Carried on the value because a shared id may name one the command line
   * did not, and the install has to record where its skills really came from either way.
   */
  sourceFlags: SourceFlags;
  /** Whether a person is at the terminal, so the permission notice may wait for them. */
  interactive: boolean;
  /** What to say if the selection turns out to be empty — only the producer knows why it is. */
  emptyMessage: string;
};

/**
 * Whether a decoded selection would write anything into the user's own ~/.claude. Skills and
 * sub-agents are asked separately because either can be globally scoped on its own: a shared
 * configuration can pin every skill to the project and still send a sub-agent home, and the
 * reverse.
 */
function writesGlobalContent(result: WizardResultV2): boolean {
  return (
    result.skills.some((skill) => skill.scope === "global") ||
    result.agentConfigs.some((agent) => agent.scope === "global")
  );
}

/**
 * Which marketplace a shared configuration installs from.
 *
 * A payload names the one its skills were fetched from, because a skill id carries whose skill it
 * is and never where that repository lives — so without the ref the load walks on to the default
 * public catalogue and installs a different repository's skill under the same id.
 *
 * `--marketplace` still outranks it: naming one is an instruction about THIS install, while the
 * payload's ref is a record of where the sharer's came from. A payload that names none leaves the
 * flag undefined, which puts the load back on the rungs it has always walked.
 */
function sharedConfigSourceFlags(flags: SourceFlags, payload: SeedPayload): SourceFlags {
  return { marketplace: flags.marketplace ?? payload.marketplace };
}

export default class Init extends BaseCommand {
  /**
   * The name this run prints itself under, resolved once on {@link install}'s spine because the
   * closing line is printed several calls below it. Same shape and same reason as `uninstall`'s
   * field: a plain `string` holding the shipped default rather than an optional every reader
   * would have to answer for.
   */
  private brandingName: string = DEFAULT_BRANDING.NAME;

  static summary = `Initialize ${DEFAULT_BRANDING.NAME} in this project`;
  static description =
    "Interactive wizard to set up skills and agents. Supports Plugin Mode (native install) and Eject Mode (copy to .claude/).";

  static examples = [
    {
      description: "Start the setup wizard",
      command: "<%= config.bin %> <%= command.id %>",
    },
    {
      description: "Initialize from a custom marketplace",
      command: "<%= config.bin %> <%= command.id %> --marketplace github:org/marketplace",
    },
  ];

  static flags = {
    marketplace: Flags.string({
      char: "m",
      description: "Skills marketplace path or URL",
      required: false,
    }),
    from: Flags.string({
      description: "Install a configuration shared from agentsinc.sh by its id, without the wizard",
      helpValue: "<id>",
    }),
    ui: Flags.boolean({
      description:
        "Open agentsinc.sh/editor instead of the terminal — the id --from names, or the catalogue",
      default: false,
    }),
  };

  /**
   * The command in two statements: do the work, then answer for it.
   *
   * {@link install} owns every path through the setup and returns however it likes; the exit
   * code is decided once, here, after the last of them. Deciding it inside would mean deciding
   * it at each of that method's endings, and an ending added later would inherit the exit-0
   * default silently — which is the defect this pair exists to close. `edit` is two statements
   * for the same reason.
   */
  async run(): Promise<void> {
    await this.install();
    this.exitIfWorkIncomplete();
  }

  /**
   * The editor, opened on whatever `--from` named — or on nothing when it named nothing.
   *
   * **One rule, both commands (owner ruling 2026-08-24): `--ui` opens the command's SUBJECT, and
   * `--from` is what supplies one.** `edit --ui` alone opens this installation because that is
   * `edit`'s subject; `init --ui` alone opens the catalogue because a fresh directory has none.
   * Given an id, either opens that id — which is what makes a shared configuration something a
   * recipient can look at rather than only apply blind.
   *
   * No publish happens here and none is needed. `edit --ui` mints an id because an installation
   * is not a configuration the store holds yet; an id already IS one, so this is
   * `editorConfigUrl` and nothing else — no network, no marketplace, no catalogue load.
   *
   * The link is PRINTED first and opened second. Over a pipe, in CI, and on a machine with no
   * desktop session there is no browser to be anybody's — a link nobody can copy is the whole
   * loss, so opening one is the convenience on top and a failure to open is a warning beside a
   * link that still works.
   */
  private async openEditor(id: string | undefined): Promise<void> {
    const url = id === undefined ? EDITOR_URL : editorConfigUrl(id);

    this.log(id === undefined ? `Build it at ${url}` : `Open it at ${url}`);
    if (id === undefined) {
      this.log(`Then install what it gives you with '${CLI_INVOKE_COMMAND} init --from <id>'.`);
    } else {
      this.log(`To install it here instead, run '${CLI_INVOKE_COMMAND} init --from ${id}'.`);
    }

    if (!process.stdin.isTTY) return;

    const opened = await openUrl(url);
    if (!opened.ok) this.warn(opened.error);
  }

  /**
   * One spine, two producers. The wizard and a shared id differ only in *where the selection
   * comes from* — everything after it (the empty guard, the install pipeline) is identical, so it
   * lives here once rather than being written twice and drifting.
   */
  private async install(): Promise<void> {
    const { flags } = await this.parse(Init);
    const projectDir = process.cwd();

    // Above `ensureConfigReadable`, and above every read below it, because this route touches no
    // installation at all. A config too broken to load must not stop someone reaching the other
    // front door, and an id somebody shared is not this directory's business either.
    if (flags.ui) return this.openEditor(flags.from);

    // Every route below reads the configs first — to show a dashboard, to refuse a shared id, or
    // to inline the global one. One that exists but cannot be read is recreated, not installed
    // over, and saying so here is what keeps the raw loader error off the screen.
    await this.ensureConfigReadable(projectDir);

    // Read once on the spine, because the closing line is printed several calls below it. The
    // degrade arm of `resolveBrandingName` cannot fire here: the line above has already refused
    // every config this would read.
    this.brandingName = await this.resolveBrandingName(projectDir);

    // Only a bare `init` is diverted to the dashboard. An id is an explicit instruction to install
    // *that* configuration, so it overrides an existing installation instead.
    if (!flags.from && (await this.showDashboardIfInitialized(projectDir))) return;

    const selection = flags.from
      ? await this.selectionFromSharedConfig(flags.from, flags, projectDir)
      : await this.selectionFromWizard(flags, projectDir);

    if (!selection) this.exit(EXIT_CODES.CANCELLED);

    // On the spine rather than in either producer: a broken constraint is a fact about the
    // selection, not about where it came from, and `edit` reports the same fact the same way
    // the moment the wizard hands it one. Both producers run the same validator over the same
    // matrix — the wizard over what was chosen, `--from` over what survived the decode — so
    // what is said here is this catalog's verdict either way.
    this.reportValidationErrors(selection.result.validation);

    // A sub-agent is installable on its own — it has front-matter, a prompt and a compiled file
    // without owning a single skill — so only a selection with neither is nothing to install.
    if (selection.result.skills.length === 0 && selection.result.selectedAgents.length === 0) {
      // The producer supplies the wording because only it knows why empty means what it means:
      // nothing chosen, versus a payload this catalog cannot install.
      this.error(selection.emptyMessage, { exit: EXIT_CODES.ERROR });
    }

    await this.handleInstallation(
      selection.result,
      selection.sourceResult,
      selection.sourceFlags,
      selection.interactive,
    );
  }

  /** The interactive producer: load the source, run the wizard, return what was chosen. */
  private async selectionFromWizard(
    flags: SourceFlags,
    projectDir: string,
  ): Promise<Selection | null> {
    // The blank global config is created by writeProjectConfig() once the
    // wizard succeeds, never before it renders: a cancelled init must leave no
    // artifact that the next run could mistake for an existing installation.
    const isGlobalRoot = isHomeDirectory(projectDir);

    const { sourceResult, startupMessages } = await this.loadWizardInputsUnderSpinner(flags);

    const result = await this.runWizard(startupMessages, isGlobalRoot);
    if (!result) return null;

    return {
      result,
      sourceResult,
      sourceFlags: flags,
      // A person is already at the terminal, so the permission notice can wait for them.
      interactive: true,
      emptyMessage: "No skills selected",
    };
  }

  /**
   * Everything the wizard needs, loaded behind a spinner that comes down whichever way the
   * await ends.
   *
   * The cleanup is a `finally` because a source that cannot be loaded refuses the run from
   * inside this await, and oclif would otherwise paint its error under an Ink tree still
   * repainting over it. Never a `catch`: the throw reaches oclif untouched, or both the
   * error rendering and the exit code change with it.
   */
  private async loadWizardInputsUnderSpinner(flags: SourceFlags): Promise<{
    sourceResult: SourceLoadResult;
    startupMessages: StartupMessage[];
  }> {
    const { unmount, clear: clearSpinner } = render(
      <Spinner label={STATUS_MESSAGES.LOADING_SKILLS} />,
    );
    try {
      return await this.loadSourceOrFail(flags);
    } finally {
      clearSpinner();
      unmount();
    }
  }

  /**
   * The `--from <id>` producer: fetch and map, no wizard. Nothing here may assume a TTY — running
   * headless is most of why the flag exists.
   *
   * It is also greenfield-only, which is what two of the three refusals are: a shared
   * configuration is installed whole, so anything it would have to install over has to be
   * uninstalled first. The third is about the LOCATION rather than what is already in it — a
   * global installation holds only global-scoped content, and this is the one producer that never
   * asked. All three fire before anything is written.
   */
  private async selectionFromSharedConfig(
    id: string,
    flags: SourceFlags,
    projectDir: string,
  ): Promise<Selection> {
    await this.refuseInstalledProject(projectDir);

    this.log(`Fetching configuration ${id}...`);
    const fetched = await fetchSeedConfig(id);
    if (!fetched.ok) {
      this.error(fetched.error, { exit: EXIT_CODES.ERROR });
    }

    const sourceFlags = sharedConfigSourceFlags(flags, fetched.payload);
    const { sourceResult } = await this.loadSourceOrFail(sourceFlags);
    // Before the decode, because a skill the payload CARRIES answers to no catalogue: unseated,
    // its id is skipped like any other unknown one and its content is never read.
    const carriedSkills = this.registerExternalSkillsOrFail(
      fetched.payload,
      sourceResult.matrix,
      projectDir,
    );
    const { result, skippedSkillIds, skippedAgentNames } = this.decodeSeedOrFail(
      fetched.payload,
      sourceResult.matrix,
    );

    // The location refusal is `BaseCommand`'s, because `edit --from` reaches the same
    // contradiction through the other door and an invariant enforced on one producer is enforced
    // nowhere. It runs before {@link refuseBlockingGlobalInstall} because it needs no filesystem
    // probe to answer: where the install root is, and what the payload said, is all of it.
    this.refuseProjectScopedContentAtHome(result, projectDir);
    await this.refuseBlockingGlobalInstall(result);

    // After the refusals and before the install: every refusal on this path fires with nothing
    // written, and the copy step that follows finds these skills already where they belong.
    await this.writeCarriedSkills(carriedSkills);

    // Named, not counted. "3 skills were skipped" cannot be acted on; the ids can, and this is the
    // one moment the user can tell whether what they shared is what they are getting. Worded once,
    // in `messages.ts`, because `edit --from` reports the same skips about the same wire.
    if (skippedSkillIds.length > 0) this.warn(skippedUnknownSkills(skippedSkillIds));
    if (skippedAgentNames.length > 0) this.warn(skippedUnknownAgents(skippedAgentNames));

    if (result.skills.length > 0) {
      this.log(
        `Installing ${result.skills.length} skill(s) across ${result.selectedAgents.length} sub-agent(s)\n`,
      );
    }

    return {
      result,
      sourceResult,
      sourceFlags,
      interactive: false,
      emptyMessage: `Configuration '${id}' contains no skills this catalog can install.`,
    };
  }

  /**
   * Refuses to install a shared configuration into a directory that already has one.
   *
   * Project-scoped detection rather than `detectInstallation`, whose global fallback would refuse
   * every clean project on a machine with a global install — including for a payload that never
   * goes near it. Whether a global install is in the way is a question about the PAYLOAD, and
   * {@link refuseBlockingGlobalInstall} is where it is asked.
   *
   * This runs before the fetch: there is nothing to learn from the network about a directory that
   * is already spoken for.
   */
  private async refuseInstalledProject(projectDir: string): Promise<void> {
    const installation = await detectProjectInstallation(projectDir);
    if (!installation) return;

    this.error(sharedConfigExistingInstall(installation.configPath), { exit: EXIT_CODES.ERROR });
  }

  /**
   * The other half of the same rule. A payload carrying global-scoped skills or sub-agents writes
   * into the user's own ~/.claude, so an installation there is in its way even when this project
   * is spotless. A payload with nothing global cannot reach that far and is never refused for it.
   */
  private async refuseBlockingGlobalInstall(result: WizardResultV2): Promise<void> {
    if (!writesGlobalContent(result)) return;

    const globalInstallation = await detectGlobalInstallation();
    if (!globalInstallation) return;

    this.error(sharedConfigGlobalInstall(globalInstallation.configPath), {
      exit: EXIT_CODES.ERROR,
    });
  }

  /**
   * The decode refuses a payload the config model has nowhere to write (see `seedToWizardResult`).
   * That is a failure of this command, reported with this command's exit code rather than left to
   * surface as an unhandled throw.
   */
  private decodeSeedOrFail(payload: SeedPayload, matrix: MergedSkillsMatrix): SeedMapping {
    try {
      return seedToWizardResult(payload, matrix);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Seats the catalogue entries the payload carries with it, or refuses the run.
   *
   * The refusal is `registerExternalSkills`' own — a carried skill asked for as a plugin, which
   * no marketplace serves — and is reported with this command's exit code for the same reason the
   * decode's is.
   */
  private registerExternalSkillsOrFail(
    payload: SeedPayload,
    matrix: MergedSkillsMatrix,
    projectDir: string,
  ): ExternalSkillInstall[] {
    try {
      return registerExternalSkills(payload, matrix, projectDir);
    } catch (error) {
      this.handleError(error);
    }
  }

  /** Writes the skills the payload brought with it, and says which they were. */
  private async writeCarriedSkills(carried: ExternalSkillInstall[]): Promise<void> {
    if (carried.length === 0) return;

    await writeExternalSkills(carried);
    // Named rather than counted, like the skips: these are the entries no catalogue can explain,
    // so this line is the only place the user learns what arrived with the configuration itself.
    this.log(carriedSkillsWritten(carried.map((skill) => skill.id)));
  }

  private async showDashboardIfInitialized(projectDir: string): Promise<boolean> {
    return runDashboardFlow(projectDir, this.config, "init", (msg) => this.log(msg));
  }

  private async loadSourceOrFail(
    flags: SourceFlags,
  ): Promise<{ sourceResult: SourceLoadResult; startupMessages: StartupMessage[] }> {
    try {
      const loaded = await loadSource({
        // The one load that may CHOOSE a marketplace rather than read the stored one.
        caller: "init",
        ...(flags.marketplace !== undefined && { sourceFlag: flags.marketplace }),
        projectDir: process.cwd(),
        captureStartupMessages: true,
      });
      return { sourceResult: loaded.sourceResult, startupMessages: loaded.startupMessages };
    } catch (error) {
      this.error(getErrorMessage(error), {
        exit: EXIT_CODES.ERROR,
      });
    }
  }

  /**
   * `init`'s wizard opens on an empty selection, and can open on nothing else: it is reached
   * only once {@link showDashboardIfInitialized} has found no installation, and that check
   * falls back to the home directory — so a global roster to hydrate from would have diverted
   * this run to the dashboard before the wizard was built. Hydrating a saved selection is
   * `edit`'s job, and `Edit.runEditWizard` is where it happens.
   */
  private async runWizard(
    startupMessages: StartupMessage[],
    isGlobalRoot: boolean,
  ): Promise<WizardResultV2 | null> {
    return runWizardSession({
      hydrate: { isEditingFromGlobalScope: isGlobalRoot },
      props: {
        version: this.config.version,
        logo: ASCII_LOGO,
        startupMessages,
      },
      onCancel: () => this.log("Setup cancelled"),
      clearTerminal: () => this.clearTerminal(),
    });
  }

  private async handleInstallation(
    result: WizardResultV2,
    sourceResult: SourceLoadResult,
    flags: SourceFlags,
    /**
     * Whether the caller can hold the terminal. The permission notice is an Ink app with no exit
     * of its own, so `waitUntilExit()` only ever resolves because a person is there to end it —
     * which is fine after the wizard and a hang everywhere else. `--from` sets this false: it has
     * to complete over a pipe and in CI.
     */
    interactive = true,
  ): Promise<void> {
    const projectDir = process.cwd();
    const activeSkills = result.skills.filter((s) => !s.excluded);
    const installMode = deriveInstallMode(activeSkills);
    const ejectedSkills = activeSkills.filter((s) => s.origin === EJECT_SOURCE);
    const pluginSkills = activeSkills.filter((s) => s.origin !== EJECT_SOURCE);

    this.logInstallPlan(installMode, ejectedSkills, pluginSkills);

    // Resolve marketplace up front — BEFORE any filesystem mutation. If
    // resolution fails in mixed mode, the hard-error must fire before
    // `copyEjectSkillsStep` copies anything to `.claude/skills/`, otherwise
    // we leave an orphaned half-install with no config.ts to recognise it.
    const resolvedMarketplace =
      pluginSkills.length > 0
        ? await this.requireMarketplaceOrExit(
            sourceResult,
            "install plugin skills",
            (marketplace) => this.log(`Registering marketplace "${marketplace}"...`),
          )
        : null;

    const copyResult =
      installMode === "eject" || installMode === "mixed"
        ? await this.copyEjectSkillsStep(ejectedSkills, projectDir, sourceResult, installMode)
        : null;

    if (resolvedMarketplace !== null) {
      await this.installPluginSkillsReported(
        pluginSkills,
        resolvedMarketplace,
        projectDir,
        sourceResult.matrix,
      );
    }
    // The shared install reporter hard-errors on any failure, so reaching here with
    // a resolved marketplace means plugin mode fully succeeded.
    const pluginModeSucceeded = resolvedMarketplace !== null;

    try {
      const { configResult, compileResult, agentScopeMap } = await this.writeConfigAndCompile(
        result,
        sourceResult,
        flags,
      );
      this.reportSuccess(
        configResult,
        compileResult,
        agentScopeMap,
        installMode,
        pluginModeSucceeded,
        copyResult,
      );

      await this.showPermissionNotice(projectDir, interactive);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * The permission notice, where there is one to show. It is an Ink app with no exit of its own,
   * so `waitUntilExit()` only ever resolves because a person is there to end it — which is fine
   * after the wizard and a hang everywhere else. Without a terminal to hold, one frame is
   * rendered and let go: the notice is information, not a prompt, so there is nothing to answer
   * and nothing to wait for.
   */
  private async showPermissionNotice(projectDir: string, interactive: boolean): Promise<void> {
    const permissionWarning = await checkPermissions(projectDir);
    if (!permissionWarning) return;

    if (!interactive) {
      const { unmount } = render(permissionWarning);
      unmount();
      return;
    }

    const { waitUntilExit } = render(permissionWarning);
    await waitUntilExit();
  }

  private logInstallPlan(
    installMode: InstallMode,
    ejectedSkills: WizardResultV2["skills"],
    pluginSkills: WizardResultV2["skills"],
  ): void {
    this.log("\n");
    this.log(`Selected ${ejectedSkills.length + pluginSkills.length} skills`);
    this.log(
      `Install mode: ${
        installMode === "mixed"
          ? `${INSTALL_MODE_LABELS.mixed} (${ejectedSkills.length} eject, ${pluginSkills.length} plugin)`
          : INSTALL_MODE_DESCRIPTIONS[installMode]
      }`,
    );
  }

  private async copyEjectSkillsStep(
    localSkills: WizardResultV2["skills"],
    projectDir: string,
    sourceResult: SourceLoadResult,
    installMode: InstallMode,
  ): Promise<SkillCopyResult> {
    this.log("Copying skills to local directory...");
    const copyResult = await copyLocalSkills(localSkills, projectDir, sourceResult);

    if (installMode === "mixed") {
      if (copyResult.projectCopied.length > 0 && copyResult.globalCopied.length > 0) {
        this.log(
          `Copied ${copyResult.totalCopied} local skills (${copyResult.projectCopied.length} project, ${copyResult.globalCopied.length} global)`,
        );
      } else if (copyResult.globalCopied.length > 0) {
        this.log(`Copied ${copyResult.globalCopied.length} local skills to ~/.claude/skills/`);
      } else {
        this.log(`Copied ${copyResult.projectCopied.length} local skills to .claude/skills/`);
      }
    } else {
      this.log(`Copied ${copyResult.totalCopied} skills to .claude/skills/\n`);
    }

    return copyResult;
  }

  private async writeConfigAndCompile(
    result: WizardResultV2,
    sourceResult: SourceLoadResult,
    flags: SourceFlags,
  ): Promise<{
    configResult: Awaited<ReturnType<typeof writeProjectConfig>>;
    compileResult: CompilationResult;
    agentScopeMap: Map<AgentName, SkillScope>;
  }> {
    this.log("Generating configuration...");
    const configResult = await writeProjectConfig({
      wizardResult: result,
      sourceResult,
      projectDir: process.cwd(),
      ...(flags.marketplace !== undefined && { sourceFlag: flags.marketplace }),
    });

    if (configResult.wasMerged) {
      this.log(`Merged with existing config at ${configResult.existingConfigPath}`);
    }

    this.log(`Configuration saved (${configResult.config.agents.length} agents)\n`);
    this.reportUnassignedSkills(configResult.config);

    this.log(STATUS_MESSAGES.COMPILING_AGENTS);
    const cwd = process.cwd();
    const agentDefs = await loadAgentDefs();
    const { allSkills } = await discoverInstalledSkills(cwd);
    const agentScopeMap = buildAgentScopeMap(configResult.config);
    const compileResult = await compileAgentsAllScopes({
      projectDir: cwd,
      sourcePath: agentDefs.sourcePath,
      skills: allSkills,
      agentScopeMap,
    });
    this.reportCompilation(compileResult);

    this.reportPropagatedRecompile(configResult.propagation);

    return { configResult, compileResult, agentScopeMap };
  }

  /**
   * What the compile pass did, including the half this command used to drop.
   *
   * It read `compiled` and nothing else, so a pass that lost a sub-agent printed a number that
   * looked perfectly right — `compiled` counts successes, so it is correct either way — and the
   * failures reached no surface at all: no count, no reason, no exit code. A user's FIRST
   * install could silently land a roster missing a sub-agent.
   *
   * The compile is the last thing `init` does, so a failure here cannot be answered by aborting:
   * the skills are on disk and `config.ts` and `config-types.ts` describe them. What is owed is
   * the account, which {@link BaseCommand.exitIfWorkIncomplete} prints and answers for.
   */
  private reportCompilation(compileResult: CompilationResult): void {
    const { compiled, failed, warnings } = compileResult;
    const summary = `Compiled ${compiled.length} agents`;

    if (failed.length === 0) {
      this.log(`${summary}\n`);
      return;
    }

    this.log(`${summary} (${failed.length} failed)\n`);
    for (const warning of warnings) {
      this.warn(warning);
    }
    // Recorded off `failed` rather than off the warnings just printed: `warnings` also carries
    // entries that are not failures — a scope with nothing to compile contributes one on every
    // project-context run — and the ending must not file those as work owed.
    this.recordIncompleteWork(agentsNotCompiled(failed), INCOMPLETE_WORK_RECOVERY.RECOMPILE);
  }

  private reportSuccess(
    configResult: Awaited<ReturnType<typeof writeProjectConfig>>,
    compileResult: CompilationResult,
    agentScopeMap: Map<AgentName, SkillScope>,
    installMode: InstallMode,
    pluginModeSucceeded: boolean,
    copyResult: SkillCopyResult | null,
  ): void {
    // A run with work owed ends on the failure account instead — `initialized successfully!`
    // over a roster missing a sub-agent is the claim being withdrawn, not a line beside it.
    // Where the install landed is still reported below: that is what the account is about.
    if (!this.hasIncompleteWork) this.log(`${initSucceeded(this.brandingName)}\n`);

    const isEjectOutput =
      installMode === "eject" || (installMode === "mixed" && !pluginModeSucceeded);
    if (isEjectOutput && copyResult && copyResult.totalCopied > 0) {
      this.reportSkillsCopied(copyResult);
    }
    this.reportAgentsCompiled(compileResult.compiled, agentScopeMap);
    this.reportConfiguration(configResult.configPath, agentScopeMap);
  }

  /**
   * Names the config that actually holds this install's assignments, and where a
   * recompile of them has to be run from.
   *
   * Split by the same `agentScopeMap` the two reporters above split on, because the
   * same scope decides both. A project config's `stack` is filtered down to
   * project-scoped agents on the way out, so a wholly GLOBAL install leaves it
   * carrying no assignment at all — naming it sends the user to a file with nothing
   * in it — and `compile` in this cwd runs the PROJECT pass, which recompiles no
   * global agent. At the home root both scopes resolve to one file and one pass, so
   * there is nothing to split and the project wording stands.
   */
  private reportConfiguration(
    projectConfigPath: string,
    agentScopeMap: Map<AgentName, SkillScope>,
  ): void {
    const cwd = process.cwd();
    const paths = {
      global: resolveInstallPaths(cwd, "global").configPath,
      project: projectConfigPath,
    };
    const split = splitAgentScopes(cwd, agentScopeMap);

    this.log("Configuration:");
    for (const configPath of configsHoldingAssignments(split, paths)) {
      this.log(`  ${configPath}`);
    }
    this.log("");

    this.log("To customize agent-skill assignments:");
    for (const [index, step] of customizationSteps(split, paths.global).entries()) {
      this.log(`  ${index + 1}. ${step}`);
    }
    this.log("");
  }

  /**
   * Reports where the skills actually landed. `copyLocalSkills` splits by scope,
   * so a default install driven from a project directory writes every skill
   * under HOME — reporting the project path there names a directory that was
   * never written.
   *
   * This block is a filesystem listing, so the entries are the on-disk directory
   * names — skill ids, not display names. `copySkillsToLocalFlattened` names each
   * destination directory after `skill.id`, so a user can copy any line and `cd`
   * into it.
   */
  private reportSkillsCopied(copyResult: SkillCopyResult): void {
    const cwd = process.cwd();
    const groups = isHomeDirectory(cwd)
      ? [
          {
            dir: resolveInstallPaths(cwd, "project").skillsDir,
            copied: [...copyResult.globalCopied, ...copyResult.projectCopied],
          },
        ]
      : [
          { dir: resolveInstallPaths(cwd, "global").skillsDir, copied: copyResult.globalCopied },
          { dir: resolveInstallPaths(cwd, "project").skillsDir, copied: copyResult.projectCopied },
        ].filter((group) => group.copied.length > 0);

    for (const group of groups) {
      this.log("Skills copied to:");
      this.log(`  ${group.dir}`);
      for (const copied of group.copied) {
        this.log(`    ${copied.skillId}/`);
      }
      this.log("");
    }
  }

  /**
   * Reports where the agents actually landed, mirroring the scope split
   * `compileAgentsAllScopes` performs: one pass at the home root, otherwise a
   * global pass under HOME and a project pass under the project directory.
   */
  private reportAgentsCompiled(
    compiled: AgentName[],
    agentScopeMap: Map<AgentName, SkillScope>,
  ): void {
    const cwd = process.cwd();
    const groups = isHomeDirectory(cwd)
      ? [{ dir: resolveInstallPaths(cwd, "project").agentsDir, agents: compiled }]
      : [
          {
            dir: resolveInstallPaths(cwd, "global").agentsDir,
            agents: compiled.filter((name) => agentScopeMap.get(name) === "global"),
          },
          {
            dir: resolveInstallPaths(cwd, "project").agentsDir,
            agents: compiled.filter((name) => agentScopeMap.get(name) !== "global"),
          },
        ].filter((group) => group.agents.length > 0);

    for (const group of groups) {
      this.log("Agents compiled to:");
      this.log(`  ${group.dir}`);
      for (const agentName of group.agents) {
        this.log(`    ${agentName}.md`);
      }
      this.log("");
    }
  }
}

/** The two config files an install can write, as the closing block refers to them. */
type ConfigPaths = { global: string; project: string };

/** How this install's sub-agents fall across the two scopes, seen from the directory it ran in. */
type AgentScopeSplit = { globalAgentCount: number; isGlobalOnly: boolean };

/**
 * At the home root the two scopes resolve to ONE config file and ONE compile pass, so there
 * is nothing to split and the split reports none — which is what leaves the project wording
 * standing there unchanged. Same fork `reportAgentsCompiled` makes over the same question.
 */
function splitAgentScopes(cwd: string, agentScopeMap: Map<AgentName, SkillScope>): AgentScopeSplit {
  if (isHomeDirectory(cwd)) return { globalAgentCount: 0, isGlobalOnly: false };

  const scopes = [...agentScopeMap.values()];
  const globalAgentCount = scopes.filter((scope) => scope === "global").length;
  return {
    globalAgentCount,
    isGlobalOnly: globalAgentCount > 0 && globalAgentCount === scopes.length,
  };
}

/**
 * The config file(s) this install's assignments actually landed in. A wholly global install
 * has none in the project file — the writer filters its `stack` down to project-scoped
 * agents — so naming it would send the user to a file with nothing in it.
 */
function configsHoldingAssignments(split: AgentScopeSplit, paths: ConfigPaths): string[] {
  if (split.isGlobalOnly) return [paths.global];
  if (split.globalAgentCount > 0) return [paths.global, paths.project];
  return [paths.project];
}

/**
 * What changing an assignment takes, in the order it takes it. The compile step is the half
 * that has to be scope-aware: `compile` run in a project directory performs the PROJECT pass
 * only, so it recompiles no global agent — which `globalScopedAgentsHint` already says, in
 * the words `compile` itself says it in when it lands in the mirror image of this state.
 */
function customizationSteps(split: AgentScopeSplit, globalConfigPath: string): string[] {
  if (split.isGlobalOnly) {
    return [`Edit ${globalConfigPath}`, globalScopedAgentsHint(split.globalAgentCount)];
  }

  return [
    `Edit ${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`,
    `Run '${CLI_INVOKE_COMMAND} compile' to regenerate agents`,
    ...(split.globalAgentCount > 0 ? [globalScopedAgentsHint(split.globalAgentCount)] : []),
  ];
}

export type DashboardData = {
  /**
   * The name the dashboard is titled with — `branding.name` where the configuration supplies one
   * and {@link DEFAULT_BRANDING.NAME} otherwise. Carried on the data rather than read by either
   * consumer so {@link formatDashboardText} stays a pure function of what it is handed, and so
   * the one place that reaches a configuration is the one that already loads it.
   *
   * **Both of {@link showDashboard}'s branches read it, and that is the invariant to keep.** This
   * field was resolved for the piped branch alone for as long as it was, while the `Dashboard`
   * component was handed only its callbacks and painted {@link ASCII_LOGO} — so the dashboard a
   * person actually sees was the one surface `branding.name` never reached, and every spec on the
   * subject drove through a pipe and could not see it.
   */
  name: string;
  skillCount: number;
  agentCount: number;
  mode: InstallMode;
  source?: string;
};

/**
 * Gathers dashboard data from the installation and project config.
 *
 * Both counts come from the same scope-aware installation so the summary cannot
 * mix a project-only figure with a global one — a default install driven from a
 * project directory puts every skill and agent under HOME.
 */
export async function getDashboardData(projectDir: string): Promise<DashboardData> {
  // ABORT is the posture on `resolveBranding`, and it is the one already in force: the
  // `loadProjectConfig` beside it raises for the same file, so a configuration that cannot be
  // evaluated fails this call whether branding is read or not. Nothing is degraded here that was
  // not already, and the dashboard is only reached once an installation has been detected.
  const [info, loaded, branding] = await Promise.all([
    getInstallationInfo(),
    loadProjectConfig(projectDir),
    resolveBranding(projectDir),
  ]);

  const activeSkills = loaded?.config.skills.filter((s) => !s.excluded);
  const skillCount = info?.skillCount ?? 0;
  const agentCount = info?.agentCount ?? 0;
  const mode = info?.mode ?? (activeSkills ? deriveInstallMode(activeSkills) : "eject");
  const source = loaded?.config.marketplace;

  return {
    name: branding.name,
    skillCount,
    agentCount,
    mode,
    ...(source !== undefined && { source }),
  };
}
