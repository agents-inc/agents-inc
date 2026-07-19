import { Args, Flags } from "@oclif/core";
import path from "path";
import os from "os";
import { BaseCommand } from "../base-command.js";
import {
  copy,
  ensureDir,
  directoryExists,
  fileExists,
  listDirectories,
  writeFile,
} from "../utils/fs.js";
import {
  CLAUDE_SRC_DIR,
  DEFAULT_BRANDING,
  DIRS,
  LOCAL_SKILLS_PATH,
  PROJECT_ROOT,
  STANDARD_FILES,
} from "../consts.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { type SourceLoadResult } from "../lib/loading/index.js";
import { loadSource } from "../lib/operations/index.js";
import { matrix } from "../lib/matrix/matrix-provider";
import {
  saveSourceToProjectConfig,
  resolveSource,
  loadProjectSourceConfig,
  generateConfigSource,
} from "../lib/configuration/index.js";
import { copySkillsToLocalFlattened, type CopiedSkill } from "../lib/skills/index.js";
import type { MergedSkillsMatrix, ProjectConfig, SkillId } from "../types/index.js";
import { typedKeys } from "../utils/typed-object.js";

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
    "Skills are copied from the configured source (public marketplace by default).";

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
    ...BaseCommand.baseFlags,
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing files",
      default: false,
    }),
    output: Flags.string({
      char: "o",
      description: "Output directory (default: .claude/ in current directory)",
    }),
    refresh: Flags.boolean({
      description: "Force refresh from remote source",
      default: false,
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Eject);
    const projectDir = process.cwd();

    const ejectType = this.validateEjectType(args.type);
    const outputBase = await this.resolveOutputBase(flags, projectDir);

    this.printHeader(flags.output ? outputBase : undefined);

    const sourceResult = await this.loadSourceIfNeeded(ejectType, flags, projectDir);
    await this.executeEject(ejectType, outputBase, flags, projectDir, sourceResult);
    await this.saveSourceIfFlagged(flags.source, projectDir);
    await this.ensureConfig(projectDir, flags.source, sourceResult);

    this.log("");
    this.logSuccess("Eject complete!");
    this.log("");
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

  private async resolveOutputBase(flags: { output?: string }, projectDir: string): Promise<string> {
    if (flags.output) {
      const expandedPath = flags.output.startsWith("~")
        ? path.join(os.homedir(), flags.output.slice(1))
        : flags.output;
      const outputBase = path.resolve(projectDir, expandedPath);

      if (await fileExists(outputBase)) {
        this.error(`Output path exists as a file: ${outputBase}`, {
          exit: EXIT_CODES.INVALID_ARGS,
        });
      }

      return outputBase;
    }

    return path.join(projectDir, CLAUDE_SRC_DIR);
  }

  private printHeader(outputBase?: string): void {
    this.log("");
    this.log(`${DEFAULT_BRANDING.NAME} Eject`);
    this.log("");

    if (outputBase) {
      this.log(`Output directory: ${outputBase}`);
    }
  }

  private async loadSourceIfNeeded(
    ejectType: EjectType,
    flags: { source?: string; refresh: boolean },
    projectDir: string,
  ): Promise<SourceLoadResult | undefined> {
    if (ejectType === "skills" || ejectType === "all") {
      const loaded = await loadSource({
        sourceFlag: flags.source,
        projectDir,
        forceRefresh: flags.refresh,
      });
      return loaded.sourceResult;
    }
    return undefined;
  }

  private async executeEject(
    ejectType: EjectType,
    outputBase: string,
    flags: { force: boolean; output?: string },
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
          throw new Error("Source must be loaded for skills eject");
        }
        await this.handleSkills(projectDir, flags.force, sourceResult, directOutput, outputBase);
        break;
      case "all":
        if (!sourceResult) {
          throw new Error("Source must be loaded for full eject");
        }
        await this.handleAgentPartials(outputBase, flags.force, directOutput, false);
        await this.handleAgentPartials(outputBase, true, directOutput, true);
        await this.handleSkills(projectDir, flags.force, sourceResult, directOutput, outputBase);
        break;
      default: {
        const _exhaustive: never = ejectType;
        return _exhaustive;
      }
    }
  }

  private async saveSourceIfFlagged(
    sourceFlag: string | undefined,
    projectDir: string,
  ): Promise<void> {
    if (sourceFlag) {
      await saveSourceToProjectConfig(projectDir, sourceFlag, path.basename(projectDir));
      this.log(`Source saved to .claude-src/config.ts`);
    }
  }

  private async ensureConfig(
    projectDir: string,
    sourceFlag: string | undefined,
    sourceResult: SourceLoadResult | undefined,
  ): Promise<void> {
    const configResult = await ensureMinimalConfig({
      projectDir,
      sourceFlag,
      sourceResult,
    });
    if (configResult.created) {
      this.logSuccess(`Created ${CLAUDE_SRC_DIR}/config.ts`);
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
        : "You can now customize templates, agent intro, workflow, and examples locally.",
    );
  }

  private async handleSkills(
    projectDir: string,
    force: boolean,
    sourceResult: SourceLoadResult,
    directOutput: boolean,
    outputBase: string,
  ): Promise<void> {
    const result = await ejectSkills({
      projectDir,
      force,
      sourceResult,
      matrix,
      directOutput,
      customOutputBase: directOutput ? outputBase : undefined,
    });

    if (result.skipped) {
      this.warn(result.skipReason);
      return;
    }

    this.logSuccess(
      `${result.copiedSkills.length} skills ejected to ${result.destDir} from ${result.sourceLabel}`,
    );
    this.log("You can now customize skill content locally.");
  }
}

type EjectAgentPartialsOptions = {
  outputBase: string;
  force: boolean;
  /** When true, outputBase is used directly as the destination (no subdirectory nesting). */
  directOutput?: boolean;
  /** When true, ejects only the _templates directory instead of the full agents directory. */
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
      /** Destination directory that was written to. */
      destDir: string;
      /** Whether templates were skipped during a full agent-partials eject (existing templates preserved). */
      templatesSkipped: boolean;
    };

/**
 * Copies agent partials or templates from the CLI source to a target directory.
 *
 * When `templatesOnly` is true, copies only the _templates subdirectory.
 * When false, copies the full agents directory (optionally skipping existing templates).
 *
 * Returns structured data — the command decides what to log.
 */
/** Direct output writes to the base itself; otherwise agents/ (plus templates/ in templates-only mode). */
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

type EjectSkillsOptions = {
  projectDir: string;
  force: boolean;
  sourceResult: SourceLoadResult;
  matrix: MergedSkillsMatrix;
  /** When true, uses customOutputBase as destination instead of LOCAL_SKILLS_PATH. */
  directOutput?: boolean;
  customOutputBase?: string;
};

type EjectSkillsResult =
  | {
      skipped: true;
      skipReason: string;
      copiedSkills: [];
    }
  | {
      skipped: false;
      /** Array of skills that were copied. */
      copiedSkills: CopiedSkill[];
      /** Destination directory that was written to. */
      destDir: string;
      /** Label describing the source that skills were copied from. */
      sourceLabel: string;
    };

/**
 * Copies non-local skills from source to a target directory.
 *
 * Filters out skills already marked as local, then copies the remaining skills
 * using copySkillsToLocalFlattened.
 *
 * Returns structured data — the command decides what to log.
 */
async function ejectSkills(options: EjectSkillsOptions): Promise<EjectSkillsResult> {
  const {
    projectDir,
    force,
    sourceResult,
    matrix,
    directOutput = false,
    customOutputBase,
  } = options;

  const destDir =
    directOutput && customOutputBase ? customOutputBase : path.join(projectDir, LOCAL_SKILLS_PATH);

  if ((await directoryExists(destDir)) && !force) {
    return {
      skipped: true,
      skipReason: `Skills already exist at ${destDir}. Use --force to overwrite.`,
      copiedSkills: [],
    };
  }

  const skillIds = typedKeys<SkillId>(matrix.skills).filter(
    (skillId) => !matrix.skills[skillId]?.local,
  );

  if (skillIds.length === 0) {
    return {
      skipped: true,
      skipReason: "No skills found in source to eject.",
      copiedSkills: [],
    };
  }

  await ensureDir(destDir);

  const copiedSkills = await copySkillsToLocalFlattened(skillIds, destDir, sourceResult);

  const sourceLabel = sourceResult.isLocal
    ? sourceResult.sourcePath
    : sourceResult.marketplace || sourceResult.sourceConfig.source;

  return {
    skipped: false,
    copiedSkills,
    destDir,
    sourceLabel,
  };
}

type EnsureMinimalConfigOptions = {
  projectDir: string;
  sourceFlag?: string;
  sourceResult?: SourceLoadResult;
};

type EnsureMinimalConfigResult = {
  /** Path to the config file. */
  configPath: string;
  /** Whether a new config was created. */
  created: boolean;
};

/**
 * Ensures a minimal config.ts exists so `agentsinc compile` works after eject.
 *
 * If the config already exists, returns immediately with `created: false`.
 * Otherwise generates a minimal config from the resolved source and project metadata.
 *
 * Returns structured data — the command decides what to log.
 */
async function ensureMinimalConfig(
  options: EnsureMinimalConfigOptions,
): Promise<EnsureMinimalConfigResult> {
  const { projectDir, sourceFlag, sourceResult } = options;

  const tsConfigPath = path.join(projectDir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS);

  if (await fileExists(tsConfigPath)) {
    return { configPath: tsConfigPath, created: false };
  }

  const resolvedConfig =
    sourceResult?.sourceConfig ?? (await resolveSource(sourceFlag, projectDir));
  const existingProjectConfig = await loadProjectSourceConfig(projectDir);

  const source = sourceFlag || resolvedConfig.source || undefined;
  const config: ProjectConfig = {
    name: path.basename(projectDir),
    skills: [],
    agents: [],
    ...(source ? { source } : {}),
    ...(resolvedConfig.marketplace ? { marketplace: resolvedConfig.marketplace } : {}),
    ...(existingProjectConfig?.author ? { author: existingProjectConfig.author } : {}),
    ...(existingProjectConfig?.agentsSource
      ? { agentsSource: existingProjectConfig.agentsSource }
      : {}),
  };

  await ensureDir(path.join(projectDir, CLAUDE_SRC_DIR));
  await writeFile(tsConfigPath, generateConfigSource(config));

  return { configPath: tsConfigPath, created: true };
}

/** Checks whether the agents directory contains any agent subdirectories (not just _templates). */
async function hasAgentPartialDirs(agentsDir: string): Promise<boolean> {
  const subdirs = await listDirectories(agentsDir);
  const templatesBasename = path.basename(DIRS.templates);
  return subdirs.some((dir) => dir !== templatesBasename);
}
