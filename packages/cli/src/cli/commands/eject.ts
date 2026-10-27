import { Args, Flags } from "@oclif/core";
import path from "path";
import os from "os";
import { BaseCommand } from "../base-command.js";
import {
  copy,
  ensureDir,
  directoryExists,
  fileExists,
  isSymlink,
  listDirectories,
} from "../utils/fs.js";
import { DIRS, PROJECT_ROOT } from "../consts.js";
import {
  providerInUse,
  relativeConfigPath,
  sourceFolderInUse,
} from "../lib/installation/install-layout.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { type SourceLoadResult } from "../lib/loading/index.js";
import { loadSource } from "../lib/operations/index.js";
import { matrix } from "../lib/matrix/matrix-provider";
import { resolveSource, getProjectConfigPath } from "../lib/configuration/index.js";
import {
  ensureBlankPair,
  lazyGateDeps,
  mutateGlobal,
  writeProjectPartial,
} from "../lib/config-gate/index.js";
import { isHomeDirectory, resolveInstallPaths } from "../lib/installation/index.js";
import {
  providerFlag,
  providerNamedBy,
  refuseAnAmbiguousInstallation,
} from "../lib/installation/provider-flag.js";
import { copyMarketplaceSkillsToLocalFlattened, type CopiedSkill } from "../lib/skills/index.js";
import { INCOMPLETE_WORK_RECOVERY, INFO_MESSAGES } from "../utils/messages.js";
import { getErrorMessage } from "../utils/errors.js";
import { bytewise, plural } from "../utils/string.js";
import type { MergedSkillsMatrix, ResolvedSkill } from "../types/index.js";

const EJECT_TYPES = ["agent-partials", "templates", "skills", "all"] as const;
type EjectType = (typeof EJECT_TYPES)[number];

function isEjectType(value: string): value is EjectType {
  return (EJECT_TYPES as readonly string[]).includes(value);
}

/** Skills come from the marketplace this installation reads, so only their ejects load it. */
type EjectPlan =
  | { type: "agent-partials" | "templates" }
  | { type: "skills" | "all"; sourceResult: SourceLoadResult };

function loadedSourceOf(plan: EjectPlan): SourceLoadResult | undefined {
  return "sourceResult" in plan ? plan.sourceResult : undefined;
}

export default class Eject extends BaseCommand {
  static summary = "Eject skills, agent partials, or templates for local customization";
  static description =
    "Copy agent partials, templates, or skills to your project for customization. " +
    "Agent partials and templates are always copied from the CLI. " +
    "Skills are copied from the marketplace this installation is configured to read " +
    "(the public one by default).";

  static examples = [
    {
      description: "Eject agent partials for customization",
      command: "<%= config.bin %> <%= command.id %> agent-partials",
    },
    {
      description: "Eject only agent templates",
      command: "<%= config.bin %> <%= command.id %> templates",
    },
    {
      description: "Eject skills to local directory",
      command: "<%= config.bin %> <%= command.id %> skills",
    },
    {
      description: "Eject everything with force overwrite",
      command: "<%= config.bin %> <%= command.id %> all --force",
    },
    {
      description: "Eject to a custom output directory",
      command: "<%= config.bin %> <%= command.id %> skills -o ./custom-dir",
    },
  ];

  static args = {
    type: Args.string({
      description: "What to eject: agent-partials, templates, skills, all",
      required: false,
      options: [...EJECT_TYPES],
    }),
  };

  static flags = {
    provider: providerFlag(),
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing files",
      default: false,
    }),
    output: Flags.string({
      char: "o",
      // No default: each eject type has its own destination and this replaces all three.
      description:
        "Write everything into this directory instead of each eject type's own destination",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Eject);
    const projectDir = process.cwd();

    // Before the layout settle: this decides which installation that refusal is about.
    await refuseAnAmbiguousInstallation(
      projectDir,
      "eject",
      providerNamedBy(flags.provider),
      (message) => this.error(message, { exit: EXIT_CODES.INVALID_ARGS }),
    );

    // Before anything is copied, so a refusal never follows files already written.
    await this.ensureConfigReadable(projectDir);
    const ejectType = this.validateEjectType(args.type);
    const outputBase = await this.resolveOutputBase(flags, projectDir);

    this.printHeader(
      await this.resolveBrandingName(projectDir),
      flags.output ? outputBase : undefined,
    );

    const plan = await this.planEject(ejectType, projectDir);
    await this.executeEject(plan, outputBase, flags, projectDir);
    await this.ensureConfig(projectDir, loadedSourceOf(plan));

    this.reportEnding();
  }

  /** Withholds `Eject complete!` when part of the eject did not land. */
  private reportEnding(): void {
    this.log("");
    if (!this.hasIncompleteWork) this.logSuccess("Eject complete!");
    this.log("");

    this.exitIfWorkIncomplete();
  }

  private validateEjectType(typeArg: string | undefined): EjectType {
    if (!typeArg) {
      this.error("Please specify what to eject: agent-partials, templates, skills, or all", {
        exit: EXIT_CODES.INVALID_ARGS,
      });
    }

    if (!isEjectType(typeArg)) {
      this.error(`Unknown eject type: ${typeArg}`, {
        exit: EXIT_CODES.INVALID_ARGS,
      });
    }

    return typeArg;
  }

  private async resolveOutputBase(
    flags: { output: string | undefined },
    projectDir: string,
  ): Promise<string> {
    if (!flags.output) return sourceFolderInUse(projectDir, providerInUse(projectDir)).dir;

    const outputBase = path.resolve(projectDir, expandHome(flags.output));
    await this.refuseUnwritableOutput(outputBase);
    return outputBase;
  }

  private async refuseUnwritableOutput(outputBase: string): Promise<void> {
    // First, as the checks below follow a link, and so would every write.
    if (await isSymlink(outputBase)) {
      this.error(`Output path is a link: ${outputBase}. Name the folder it points to instead.`, {
        exit: EXIT_CODES.INVALID_ARGS,
      });
    }

    // `fileExists` is true of a directory too; an existing directory is written into, and each
    // kind then skips what it would write there already unless --force.
    const namesAFile = (await fileExists(outputBase)) && !(await directoryExists(outputBase));
    if (namesAFile) {
      this.error(`Output path exists as a file: ${outputBase}`, {
        exit: EXIT_CODES.INVALID_ARGS,
      });
    }
  }

  private printHeader(brandingName: string, outputBase?: string): void {
    this.log("");
    this.log(`${brandingName} Eject`);
    this.log("");

    if (outputBase) {
      this.log(`Output directory: ${outputBase}`);
    }
  }

  private async planEject(type: EjectType, projectDir: string): Promise<EjectPlan> {
    if (type === "agent-partials" || type === "templates") return { type };

    const { sourceResult } = await loadSource({ projectDir });
    return { type, sourceResult };
  }

  private async executeEject(
    plan: EjectPlan,
    outputBase: string,
    flags: { force: boolean; output: string | undefined },
    projectDir: string,
  ): Promise<void> {
    const directOutput = !!flags.output;

    switch (plan.type) {
      case "agent-partials":
        await this.handleAgentPartials(outputBase, flags.force, directOutput, false);
        break;
      case "templates":
        await this.handleAgentPartials(outputBase, flags.force, directOutput, true);
        break;
      case "skills":
        await this.handleSkills(
          skillsDestination(projectDir, directOutput, outputBase),
          flags.force,
          plan.sourceResult,
        );
        break;
      case "all": {
        // The partials carry the templates as one unit, so they arrive once and obey --force.
        await this.handleAgentPartials(outputBase, flags.force, directOutput, false);
        await this.handleSkills(
          skillsDestination(projectDir, directOutput, outputBase),
          flags.force,
          plan.sourceResult,
        );
        break;
      }
      default: {
        const _exhaustive: never = plan;
        return _exhaustive;
      }
    }
  }

  /**
   * Writes a minimal config where there is none. A refusal is reported as incomplete work rather
   * than thrown, because the ejection has already landed.
   */
  private async ensureConfig(
    projectDir: string,
    sourceResult: SourceLoadResult | undefined,
  ): Promise<void> {
    // Named before the write, which may create the provider folder.
    const configTsRel = relativeConfigPath(projectDir, providerInUse(projectDir));

    try {
      const configResult = await ensureMinimalConfig({
        projectDir,
        ...(sourceResult !== undefined && { sourceResult }),
      });
      if (configResult.created) {
        this.logSuccess(`Created ${configTsRel}`);
      }
    } catch (error) {
      this.reportIncompleteWork(
        `Could not create ${configTsRel}: ${getErrorMessage(error)}`,
        INCOMPLETE_WORK_RECOVERY.INSPECT_INSTALLATION,
      );
    }
  }

  private async handleAgentPartials(
    outputBase: string,
    force: boolean,
    directOutput: boolean,
    templatesOnly: boolean,
  ): Promise<void> {
    const result = await ejectAgentPartials({
      outputBase,
      force,
      directOutput,
      templatesOnly,
    });

    if (result.skipped) {
      this.warn(result.skipReason);
      return;
    }

    if (result.skippedSubAgents.length > 0) {
      this.warn(subAgentsAlreadyThere(result.destDir, result.skippedSubAgents));
    }

    if (result.templatesSkipped) {
      this.warn(
        "Agent templates already exist — skipping templates, only ejecting agent partials.",
      );
    }

    this.logSuccess(
      `${templatesOnly ? "Agent templates" : "Agent partials"} ejected to ${result.destDir}`,
    );
    this.log(
      templatesOnly
        ? "You can now customize agent templates locally."
        : INFO_MESSAGES.AGENT_PARTIALS_CUSTOMIZABLE,
    );
  }

  private async handleSkills(
    destinationDir: string,
    force: boolean,
    sourceResult: SourceLoadResult,
  ): Promise<void> {
    const result = await ejectSkills({ destinationDir, force, sourceResult, matrix });

    if (result.skipped) {
      this.warn(result.skipReason);
      return;
    }

    if (result.skippedSkillCount > 0) {
      this.warn(skillsAlreadyThere(destinationDir, result.skippedSkillCount));
    }

    this.logSuccess(
      `${plural(result.copiedSkills.length, "skill")} ejected to ${destinationDir} from ${result.sourceLabel}`,
    );
    this.log("You can now customize skill content locally.");
  }
}

function expandHome(outputPath: string): string {
  return outputPath.startsWith("~") ? path.join(os.homedir(), outputPath.slice(1)) : outputPath;
}

/** Some of what an eject copies was already there: named, with the rest copied beside it. */
function subAgentsAlreadyThere(destDir: string, subAgents: readonly string[]): string {
  return `Agent partials already exist at ${destDir} — skipped ${plural(subAgents.length, "sub-agent")}: ${subAgents.join(", ")}. Use --force to overwrite them.`;
}

/** Counted rather than named: a re-run into a nearly full folder skips most of the marketplace. */
function skillsAlreadyThere(destinationDir: string, skippedCount: number): string {
  return `Skills already exist at ${destinationDir} — skipped ${plural(skippedCount, "skill")}. Use --force to overwrite them.`;
}

/** Those of `names` already at `dir`, file or folder: what an eject without --force leaves. */
async function alreadyIn<Name extends string>(
  dir: string,
  names: readonly Name[],
): Promise<Name[]> {
  const checked = await Promise.all(
    names.map(async (name) => ({ name, there: await fileExists(path.join(dir, name)) })),
  );
  return checked.filter(({ there }) => there).map(({ name }) => name);
}

type EjectAgentPartialsOptions = {
  outputBase: string;
  force: boolean;
  directOutput?: boolean;
  templatesOnly?: boolean;
};

type EjectAgentPartialsResult =
  | {
      skipped: true;
      skipReason: string;
    }
  | {
      skipped: false;
      destDir: string;
      /** The sub-agents left as they were, by name, bytewise-sorted. */
      skippedSubAgents: string[];
      templatesSkipped: boolean;
    };

function resolveEjectDestDir(
  outputBase: string,
  directOutput: boolean,
  templatesOnly: boolean,
): string {
  if (directOutput) return outputBase;
  const agentsDir = path.join(outputBase, path.basename(DIRS.agents));
  return templatesOnly ? path.join(agentsDir, path.basename(DIRS.templates)) : agentsDir;
}

async function ejectAgentPartials(
  options: EjectAgentPartialsOptions,
): Promise<EjectAgentPartialsResult> {
  const { outputBase, force, directOutput = false, templatesOnly = false } = options;
  const destDir = resolveEjectDestDir(outputBase, directOutput, templatesOnly);

  return templatesOnly ? ejectTemplates(destDir, force) : ejectSubAgentPartials(destDir, force);
}

/** Whole or not at all: a templates folder already there is kept unless --force. */
async function ejectTemplates(destDir: string, force: boolean): Promise<EjectAgentPartialsResult> {
  const sourceDir = path.join(PROJECT_ROOT, DIRS.templates);

  if (!(await directoryExists(sourceDir))) {
    return { skipped: true, skipReason: "No agent templates found in CLI." };
  }

  if ((await directoryExists(destDir)) && !force) {
    return {
      skipped: true,
      skipReason: `Agent templates already exist at ${destDir}. Use --force to overwrite.`,
    };
  }

  await ensureDir(destDir);
  await copy(sourceDir, destDir);
  return { skipped: false, destDir, skippedSubAgents: [], templatesSkipped: false };
}

/** Unit by unit: one already there is kept unless --force, and the rest are copied beside it. */
async function ejectSubAgentPartials(
  destDir: string,
  force: boolean,
): Promise<EjectAgentPartialsResult> {
  const sourceDir = path.join(PROJECT_ROOT, DIRS.agents);

  if (!(await directoryExists(sourceDir))) {
    return { skipped: true, skipReason: "No agent partials found in CLI." };
  }

  const units = await partialUnitsIn(sourceDir);
  const present = force ? [] : await alreadyIn(destDir, units);
  const absent = units.filter((unit) => !present.includes(unit));

  if (absent.length === 0) {
    return {
      skipped: true,
      skipReason: `Agent partials already exist at ${destDir}. Use --force to overwrite.`,
    };
  }

  await copyUnits(absent, sourceDir, destDir);

  return {
    skipped: false,
    destDir,
    skippedSubAgents: subAgentNames(present),
    templatesSkipped: present.some(isTemplatesUnit),
  };
}

const TEMPLATES_UNIT = path.basename(DIRS.templates);

function isTemplatesUnit(unit: string): boolean {
  return unit === TEMPLATES_UNIT;
}

/**
 * What a re-eject keeps or copies whole: each sub-agent's directory, as `<category>/<agent>`, and
 * the templates. A category folder is not one, so a file of the user's in it is written beside.
 */
async function partialUnitsIn(agentsSourceDir: string): Promise<string[]> {
  const entries = await listDirectories(agentsSourceDir);
  const categories = entries.filter((entry) => !isTemplatesUnit(entry));
  const subAgentDirs = await Promise.all(
    categories.map((category) => subAgentDirsOf(agentsSourceDir, category)),
  );
  return [...entries.filter(isTemplatesUnit), ...subAgentDirs.flat()];
}

async function subAgentDirsOf(agentsSourceDir: string, category: string): Promise<string[]> {
  const agents = await listDirectories(path.join(agentsSourceDir, category));
  return agents.map((agent) => path.join(category, agent));
}

/** As the skipped-list warning names them: by directory name, bytewise-sorted. */
function subAgentNames(units: readonly string[]): string[] {
  return units
    .filter((unit) => !isTemplatesUnit(unit))
    .map((unit) => path.basename(unit))
    .sort(bytewise);
}

/** `copy` makes the folders above each unit. */
async function copyUnits(
  units: readonly string[],
  sourceDir: string,
  destDir: string,
): Promise<void> {
  for (const unit of units) {
    await copy(path.join(sourceDir, unit), path.join(destDir, unit));
  }
}

function skillsDestination(projectDir: string, directOutput: boolean, outputBase: string): string {
  return directOutput ? outputBase : installedSkillsDir(projectDir);
}

type EjectSkillsOptions = {
  destinationDir: string;
  force: boolean;
  sourceResult: SourceLoadResult;
  matrix: MergedSkillsMatrix;
};

type EjectSkillsResult =
  | {
      skipped: true;
      skipReason: string;
    }
  | {
      skipped: false;
      copiedSkills: CopiedSkill[];
      /** How many skills were left as they were. */
      skippedSkillCount: number;
      sourceLabel: string;
    };

/**
 * Only the loaded marketplace's own skills, each copied from the marketplace: others' are not on
 * disk here. One already in the destination is skipped unless --force; a local copy anywhere else
 * is the user's own and is left out either way.
 */
async function ejectSkills(options: EjectSkillsOptions): Promise<EjectSkillsResult> {
  const { destinationDir, force, sourceResult, matrix } = options;

  const marketplaceSkillIds = [...sourceResult.marketplaceSkillIds];
  const alreadyThere = force ? [] : await alreadyIn(destinationDir, marketplaceSkillIds);
  const notThere = marketplaceSkillIds.filter((skillId) => !alreadyThere.includes(skillId));
  const skillIds = notThere.filter(
    (skillId) => !isLocalCopyElsewhere(matrix.skills[skillId], destinationDir),
  );

  if (skillIds.length === 0 && alreadyThere.length > 0) {
    return {
      skipped: true,
      skipReason: `Skills already exist at ${destinationDir}. Use --force to overwrite.`,
    };
  }

  if (skillIds.length === 0) {
    return { skipped: true, skipReason: "No skills found in the marketplace to eject." };
  }

  await ensureDir(destinationDir);

  const copiedSkills = await copyMarketplaceSkillsToLocalFlattened(
    skillIds,
    destinationDir,
    sourceResult,
  );

  const sourceLabel = sourceResult.isLocal
    ? sourceResult.sourcePath
    : sourceResult.marketplace || sourceResult.sourceConfig.source;

  return {
    skipped: false,
    copiedSkills,
    skippedSkillCount: alreadyThere.length,
    sourceLabel,
  };
}

/** Local, and not the copy at `<destinationDir>/<id>`, which is where an eject writes the skill. */
function isLocalCopyElsewhere(skill: ResolvedSkill | undefined, destinationDir: string): boolean {
  if (!skill?.local) return false;
  if (!skill.localPath) return true;
  return path.resolve(skill.localPath) !== path.resolve(destinationDir, skill.id);
}

/** Where the host of the installation `projectDir` roots reads skills. */
function installedSkillsDir(projectDir: string): string {
  const scope = isHomeDirectory(projectDir) ? "global" : "project";
  return resolveInstallPaths(projectDir, scope).skillsDir;
}

type EnsureMinimalConfigOptions = {
  projectDir: string;
  sourceResult?: SourceLoadResult;
};

type EnsureMinimalConfigResult = {
  configPath: string;
  created: boolean;
};

async function ensureMinimalConfig(
  options: EnsureMinimalConfigOptions,
): Promise<EnsureMinimalConfigResult> {
  const { projectDir, sourceResult } = options;

  const provider = providerInUse(projectDir);
  const tsConfigPath = getProjectConfigPath(projectDir, provider);

  if (await fileExists(tsConfigPath)) {
    return { configPath: tsConfigPath, created: false };
  }

  // ABORT on an unreadable global config: the invented file would record a marketplace from nowhere.
  const resolvedConfig =
    sourceResult?.sourceConfig ?? (await resolveSource({ caller: "stored", projectDir }));
  const source = resolvedConfig.source || undefined;

  // At home the invented config is the global manifest, which needs its config-types sibling.
  if (isHomeDirectory(projectDir)) {
    await ensureBlankPair(provider);
    if (source) await recordSourceInGlobal(projectDir, source);
    return { configPath: tsConfigPath, created: true };
  }

  await writeProjectPartial(
    projectDir,
    {
      skills: [],
      agents: [],
      ...(source ? { marketplace: source } : {}),
      ...(resolvedConfig.marketplace ? { marketplaceName: resolvedConfig.marketplace } : {}),
    },
    { fallbackName: path.basename(projectDir) },
  );

  return { configPath: tsConfigPath, created: true };
}

/** At home the config is the global manifest projects inline from, so it goes through the gate. */
async function recordSourceInGlobal(projectDir: string, source: string): Promise<void> {
  await mutateGlobal(
    { kind: "set-source", source, fallbackName: path.basename(projectDir) },
    lazyGateDeps(projectDir),
  );
}
