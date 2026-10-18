import { Args, Flags } from "@oclif/core";
import path from "path";
import os from "os";
import { BaseCommand } from "../base-command.js";
import { copy, ensureDir, directoryExists, fileExists, listDirectories } from "../utils/fs.js";
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
import {
  resolveSource,
  loadProjectSourceConfig,
  getProjectConfigPath,
} from "../lib/configuration/index.js";
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
import { copySkillsToLocalFlattened, type CopiedSkill } from "../lib/skills/index.js";
import { INCOMPLETE_WORK_RECOVERY, INFO_MESSAGES } from "../utils/messages.js";
import { getErrorMessage } from "../utils/errors.js";
import { plural } from "../utils/string.js";
import type { MergedSkillsMatrix } from "../types/index.js";

const EJECT_TYPES = ["agent-partials", "templates", "skills", "all"] as const;
type EjectType = (typeof EJECT_TYPES)[number];

function isEjectType(value: string): value is EjectType {
  return (EJECT_TYPES as readonly string[]).includes(value);
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

    const sourceResult = await this.loadSourceIfNeeded(ejectType, projectDir);
    await this.executeEject(ejectType, outputBase, flags, projectDir, sourceResult);
    await this.ensureConfig(projectDir, sourceResult);

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
    if (flags.output) {
      const expandedPath = flags.output.startsWith("~")
        ? path.join(os.homedir(), flags.output.slice(1))
        : flags.output;
      const outputBase = path.resolve(projectDir, expandedPath);

      // `fileExists` is true of a directory too; an existing directory is written into, and each
      // kind then skips its own destination unless --force.
      const namesAFile = (await fileExists(outputBase)) && !(await directoryExists(outputBase));
      if (namesAFile) {
        this.error(`Output path exists as a file: ${outputBase}`, {
          exit: EXIT_CODES.INVALID_ARGS,
        });
      }

      return outputBase;
    }

    return sourceFolderInUse(projectDir, providerInUse(projectDir)).dir;
  }

  private printHeader(brandingName: string, outputBase?: string): void {
    this.log("");
    this.log(`${brandingName} Eject`);
    this.log("");

    if (outputBase) {
      this.log(`Output directory: ${outputBase}`);
    }
  }

  private async loadSourceIfNeeded(
    ejectType: EjectType,
    projectDir: string,
  ): Promise<SourceLoadResult | undefined> {
    if (ejectType === "skills" || ejectType === "all") {
      const loaded = await loadSource({ projectDir });
      return loaded.sourceResult;
    }
    return undefined;
  }

  private async executeEject(
    ejectType: EjectType,
    outputBase: string,
    flags: { force: boolean; output: string | undefined },
    projectDir: string,
    sourceResult: SourceLoadResult | undefined,
  ): Promise<void> {
    const directOutput = !!flags.output;

    switch (ejectType) {
      case "agent-partials":
        await this.handleAgentPartials(outputBase, flags.force, directOutput, false);
        break;
      case "templates":
        await this.handleAgentPartials(outputBase, flags.force, directOutput, true);
        break;
      case "skills":
        if (!sourceResult) {
          throw new Error("The marketplace must be loaded for skills eject");
        }
        await this.handleSkills(
          await skillsDestinationOf(projectDir, directOutput, outputBase),
          flags.force,
          sourceResult,
        );
        break;
      case "all": {
        if (!sourceResult) {
          throw new Error("The marketplace must be loaded for full eject");
        }
        // Read before the partials land: under --output they create the directory skills share.
        const skillsDestination = await skillsDestinationOf(projectDir, directOutput, outputBase);
        await this.handleAgentPartials(outputBase, flags.force, directOutput, false);
        await this.handleAgentPartials(outputBase, true, directOutput, true);
        await this.handleSkills(skillsDestination, flags.force, sourceResult);
        break;
      }
      default: {
        const _exhaustive: never = ejectType;
        return _exhaustive;
      }
    }
  }

  /**
   * Writes a minimal config so `compile` works afterwards. A refusal is reported as incomplete
   * work rather than thrown, because the ejection has already landed.
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
    destination: SkillsDestination,
    force: boolean,
    sourceResult: SourceLoadResult,
  ): Promise<void> {
    const result = await ejectSkills({ destination, force, sourceResult, matrix });

    if (result.skipped) {
      this.warn(result.skipReason);
      return;
    }

    this.logSuccess(
      `${plural(result.copiedSkills.length, "skill")} ejected to ${destination.dir} from ${result.sourceLabel}`,
    );
    this.log("You can now customize skill content locally.");
  }
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
      templatesSkipped: false;
    }
  | {
      skipped: false;
      destDir: string;
      templatesSkipped: boolean;
    };

/** Direct output writes to the base itself; otherwise agents/, or agents/templates/. */
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

  const sourceDir = templatesOnly
    ? path.join(PROJECT_ROOT, DIRS.templates)
    : path.join(PROJECT_ROOT, DIRS.agents);

  if (!(await directoryExists(sourceDir))) {
    return {
      skipped: true,
      skipReason: templatesOnly
        ? "No agent templates found in CLI."
        : "No agent partials found in CLI.",
      templatesSkipped: false,
    };
  }

  const destDir = resolveEjectDestDir(outputBase, directOutput, templatesOnly);

  const templatesBasename = path.basename(DIRS.templates);

  if ((await directoryExists(destDir)) && !force) {
    if (templatesOnly) {
      return {
        skipped: true,
        skipReason: `Agent templates already exist at ${destDir}. Use --force to overwrite.`,
        templatesSkipped: false,
      };
    }

    const hasTemplates = await directoryExists(path.join(destDir, templatesBasename));
    if ((await hasAgentPartialDirs(destDir)) && !hasTemplates) {
      return {
        skipped: true,
        skipReason: `Agent partials already exist at ${destDir}. Use --force to overwrite.`,
        templatesSkipped: false,
      };
    }
  }

  await ensureDir(destDir);

  const skipTemplates =
    !templatesOnly && !force && (await directoryExists(path.join(destDir, templatesBasename)));

  if (skipTemplates) {
    const sourceEntries = await listDirectories(sourceDir);
    const nonTemplateEntries = sourceEntries.filter((entry) => entry !== templatesBasename);
    for (const entry of nonTemplateEntries) {
      await copy(path.join(sourceDir, entry), path.join(destDir, entry));
    }
  } else {
    await copy(sourceDir, destDir);
  }

  return {
    skipped: false,
    destDir,
    templatesSkipped: skipTemplates,
  };
}

/** Where skills eject to, and whether it was there before this run wrote anything. */
type SkillsDestination = {
  dir: string;
  existed: boolean;
};

async function skillsDestinationOf(
  projectDir: string,
  directOutput: boolean,
  outputBase: string,
): Promise<SkillsDestination> {
  const dir = directOutput ? outputBase : installedSkillsDir(projectDir);
  return { dir, existed: await directoryExists(dir) };
}

type EjectSkillsOptions = {
  destination: SkillsDestination;
  force: boolean;
  sourceResult: SourceLoadResult;
  matrix: MergedSkillsMatrix;
};

type EjectSkillsResult =
  | {
      skipped: true;
      skipReason: string;
      copiedSkills: [];
    }
  | {
      skipped: false;
      copiedSkills: CopiedSkill[];
      sourceLabel: string;
    };

/** Only the loaded marketplace's own non-local skills: others' skills are not on disk here. */
async function ejectSkills(options: EjectSkillsOptions): Promise<EjectSkillsResult> {
  const { destination, force, sourceResult, matrix } = options;

  if (destination.existed && !force) {
    return {
      skipped: true,
      skipReason: `Skills already exist at ${destination.dir}. Use --force to overwrite.`,
      copiedSkills: [],
    };
  }

  const skillIds = [...sourceResult.marketplaceSkillIds].filter(
    (skillId) => !matrix.skills[skillId]?.local,
  );

  if (skillIds.length === 0) {
    return {
      skipped: true,
      skipReason: "No skills found in the marketplace to eject.",
      copiedSkills: [],
    };
  }

  await ensureDir(destination.dir);

  const copiedSkills = await copySkillsToLocalFlattened(skillIds, destination.dir, sourceResult);

  const sourceLabel = sourceResult.isLocal
    ? sourceResult.sourcePath
    : sourceResult.marketplace || sourceResult.sourceConfig.source;

  return {
    skipped: false,
    copiedSkills,
    sourceLabel,
  };
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
  const existingProjectConfig = await loadProjectSourceConfig(projectDir);
  const source = resolvedConfig.source || undefined;

  // At home the invented config is the global manifest, which needs its config-types sibling.
  if (isHomeDirectory(projectDir)) {
    await ensureBlankPair(provider);
    if (source) await recordSource(projectDir, source);
    return { configPath: tsConfigPath, created: true };
  }

  await writeProjectPartial(
    projectDir,
    {
      skills: [],
      agents: [],
      ...(source ? { marketplace: source } : {}),
      ...(resolvedConfig.marketplace ? { marketplaceName: resolvedConfig.marketplace } : {}),
      ...(existingProjectConfig?.author ? { author: existingProjectConfig.author } : {}),
      ...(existingProjectConfig?.agentsSource
        ? { agentsSource: existingProjectConfig.agentsSource }
        : {}),
    },
    { fallbackName: path.basename(projectDir) },
  );

  return { configPath: tsConfigPath, created: true };
}

/** At home the config is the global manifest projects inline from, so it goes through the gate. */
async function recordSource(projectDir: string, source: string): Promise<void> {
  if (isHomeDirectory(projectDir)) {
    await mutateGlobal(
      { kind: "set-source", source, fallbackName: path.basename(projectDir) },
      lazyGateDeps(projectDir),
    );
    return;
  }

  // ABORT on an unreadable config: `?? {}` is for an absent one, and would overwrite the user's file.
  const existing = (await loadProjectSourceConfig(projectDir)) ?? {};
  await writeProjectPartial(
    projectDir,
    { ...existing, marketplace: source },
    { fallbackName: path.basename(projectDir) },
  );
}

async function hasAgentPartialDirs(agentsDir: string): Promise<boolean> {
  const subdirs = await listDirectories(agentsDir);
  const templatesBasename = path.basename(DIRS.templates);
  return subdirs.some((dir) => dir !== templatesBasename);
}
