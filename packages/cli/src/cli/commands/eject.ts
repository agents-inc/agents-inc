import { Args, Flags } from "@oclif/core";
import path from "path";
import os from "os";
import { BaseCommand } from "../base-command.js";
import { copy, ensureDir, directoryExists, fileExists, listDirectories } from "../utils/fs.js";
import {
  CLAUDE_SRC_DIR,
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
import { isHomeDirectory } from "../lib/installation/index.js";
import { copySkillsToLocalFlattened, type CopiedSkill } from "../lib/skills/index.js";
import { INCOMPLETE_WORK_RECOVERY, INFO_MESSAGES } from "../utils/messages.js";
import { getErrorMessage } from "../utils/errors.js";
import type { MergedSkillsMatrix, SkillId } from "../types/index.js";
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
    force: Flags.boolean({
      char: "f",
      description: "Overwrite existing files",
      default: false,
    }),
    output: Flags.string({
      char: "o",
      // No `default:`, and no default named here either: each eject type has its own
      // destination and this flag replaces all three at once. The reference page carries
      // the table; a one-line description that picked one of the three would be wrong
      // about the other two, which is what it was.
      description:
        "Write everything into this directory instead of each eject type's own destination",
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Eject);
    const projectDir = process.cwd();

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

  /**
   * The command's last word.
   *
   * `Eject complete!` claims the whole eject landed, so it is withheld whenever part of it did
   * not — the account {@link BaseCommand.exitIfWorkIncomplete} prints replaces that tick rather
   * than sitting under it, and carries the non-zero exit with it.
   */
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

      if (await fileExists(outputBase)) {
        this.error(`Output path exists as a file: ${outputBase}`, {
          exit: EXIT_CODES.INVALID_ARGS,
        });
      }

      return outputBase;
    }

    return path.join(projectDir, CLAUDE_SRC_DIR);
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
        await this.handleSkills(projectDir, flags.force, sourceResult, directOutput, outputBase);
        break;
      case "all":
        if (!sourceResult) {
          throw new Error("The marketplace must be loaded for full eject");
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

  /**
   * The convenience step after the eject: a minimal `config.ts` so a later `compile` has
   * something to read.
   *
   * It can refuse, and by the time it does the ejection has already landed — the templates,
   * partials or skills are on disk and stay there. So the throw is caught rather than left to
   * become the process's exit code: an `ERROR` tells the caller nothing landed and the run can
   * be repeated, which is the wrong instruction for a tree that now holds an ejection. What is
   * owed is the account and `EXIT_CODES.COMPLETED_WITH_FAILURES`.
   *
   * The refusal itself is right and is not weakened here: `ensureMinimalConfig` will not invent
   * a config recording a marketplace it read out of a file it could not evaluate.
   */
  private async ensureConfig(
    projectDir: string,
    sourceResult: SourceLoadResult | undefined,
  ): Promise<void> {
    try {
      const configResult = await ensureMinimalConfig({
        projectDir,
        ...(sourceResult !== undefined && { sourceResult }),
      });
      if (configResult.created) {
        this.logSuccess(`Created ${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}`);
      }
    } catch (error) {
      this.reportIncompleteWork(
        `Could not create ${CLAUDE_SRC_DIR}/${STANDARD_FILES.CONFIG_TS}: ${getErrorMessage(error)}`,
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
      ...(directOutput && { customOutputBase: outputBase }),
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
      skipReason: "No skills found in the marketplace to eject.",
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
  sourceResult?: SourceLoadResult;
};

type EnsureMinimalConfigResult = {
  /** Path to the config file. */
  configPath: string;
  /** Whether a new config was created. */
  created: boolean;
};

/**
 * Ensures a minimal config.ts exists so `npx agents-inc compile` works after eject.
 *
 * If the config already exists, returns immediately with `created: false`.
 * Otherwise generates a minimal config from the resolved source and project metadata.
 *
 * Returns structured data — the command decides what to log.
 */
async function ensureMinimalConfig(
  options: EnsureMinimalConfigOptions,
): Promise<EnsureMinimalConfigResult> {
  const { projectDir, sourceResult } = options;

  const tsConfigPath = getProjectConfigPath(projectDir);

  if (await fileExists(tsConfigPath)) {
    return { configPath: tsConfigPath, created: false };
  }

  // ABORT on an unreadable config. The project has none — the guard above returned for that — so
  // what these two can meet is an unreadable GLOBAL config, and the file about to be invented
  // would record a marketplace read from nowhere. The second call is unreachable for the same
  // reason the guard exists: this project's own config is not there to be unreadable.
  const resolvedConfig =
    sourceResult?.sourceConfig ?? (await resolveSource({ caller: "stored", projectDir }));
  const existingProjectConfig = await loadProjectSourceConfig(projectDir);
  const source = resolvedConfig.source || undefined;

  // At the home directory the invented config IS the global manifest, and the
  // file it opens with `import type { ProjectConfig } from "./config-types"`
  // cannot resolve its own types without the sibling. The gate writes the pair.
  if (isHomeDirectory(projectDir)) {
    await ensureBlankPair();
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

/**
 * Records the marketplace ref in whichever scope's config `projectDir` names. At the home
 * directory that config is the global manifest every project's generated types
 * import from, so the write goes through the gate: registered projects inline
 * the scalar and follow it.
 */
async function recordSource(projectDir: string, source: string): Promise<void> {
  if (isHomeDirectory(projectDir)) {
    await mutateGlobal(
      { kind: "set-source", source, fallbackName: path.basename(projectDir) },
      lazyGateDeps(projectDir),
    );
    return;
  }

  // ABORT on an unreadable config. The `?? {}` is a fallback for a config that is not THERE; on
  // one that is there and unreadable it would hand the writer an empty partial, and this scalar
  // write would replace the user's whole file with a two-field one under an invented name.
  const existing = (await loadProjectSourceConfig(projectDir)) ?? {};
  await writeProjectPartial(
    projectDir,
    { ...existing, marketplace: source },
    { fallbackName: path.basename(projectDir) },
  );
}

/** Checks whether the agents directory contains any agent subdirectories (not just _templates). */
async function hasAgentPartialDirs(agentsDir: string): Promise<boolean> {
  const subdirs = await listDirectories(agentsDir);
  const templatesBasename = path.basename(DIRS.templates);
  return subdirs.some((dir) => dir !== templatesBasename);
}
