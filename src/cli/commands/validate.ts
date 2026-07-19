import os from "os";
import path from "path";
import { parse as parseYaml } from "yaml";
import { BaseCommand } from "../base-command.js";
import { getErrorMessage } from "../utils/errors.js";
import { EXIT_CODES } from "../lib/exit-codes.js";
import { ERROR_MESSAGES } from "../utils/messages.js";
import {
  validateAllPlugins,
  printPluginValidationResult,
  validateSkillFrontmatter,
  validateAgentFrontmatter,
  getUserPluginsDir,
  getProjectPluginsDir,
} from "../lib/plugins/index.js";
import { validateSource } from "../lib/source-validator.js";
import { isLocalSource, resolveAllSources, type SourceEntry } from "../lib/configuration/index.js";
import { resolveInstallPaths, isHomeDirectory } from "../lib/installation/index.js";
import { formatZodErrors } from "../lib/schema-validator.js";
import { validateSkillMetadata } from "../lib/schemas.js";
import { PLUGIN_MANIFEST_DIR, STANDARD_FILES } from "../consts.js";
import type { ValidationResult } from "../types/index.js";
import { directoryExists, fileExists, glob, listDirectories, readFile } from "../utils/fs.js";

const COL_NAME_WIDTH = 30;
const COL_URL_WIDTH = 40;
const COL_PATH_WIDTH = 50;

const VALIDATE_STATUS = {
  SKIPPED_REMOTE: "— skipped (remote source)",
  NOT_PRESENT: "— not present",
  EMPTY: "— none",
  NO_PLUGINS: "— no plugins",
} as const;

type AggregateCounts = {
  errors: number;
  warnings: number;
};

const NO_ISSUES: AggregateCounts = { errors: 0, warnings: 0 };

function sumCounts(counts: AggregateCounts[]): AggregateCounts {
  return counts.reduce(
    (acc, c) => ({ errors: acc.errors + c.errors, warnings: acc.warnings + c.warnings }),
    NO_ISSUES,
  );
}

/** Prints each named validation result and sums its error/warning counts. */
function printAndSumResults(
  results: Array<{ name: string; result: ValidationResult }>,
): AggregateCounts {
  return sumCounts(
    results.map(({ name, result }) => {
      printPluginValidationResult(name, result);
      return {
        errors: result.valid ? 0 : result.errors.length,
        warnings: result.warnings.length,
      };
    }),
  );
}

export default class Validate extends BaseCommand {
  static summary =
    "Validate every registered source, installed plugin, installed skill, and installed agent";
  static description =
    "Read-only validation. Walks every registered source, every installed plugin, " +
    "every installed skill, and every installed agent. Prints a summary table with " +
    "per-directory counts; exits non-zero if any pass produced an error.";

  static examples = [
    { description: "Validate everything", command: "<%= config.bin %> <%= command.id %>" },
  ];

  // Override parent baseFlags to drop --source (validate is a zero-flag command)
  static baseFlags = {} as (typeof BaseCommand)["baseFlags"];

  static flags = {};

  async run(): Promise<void> {
    await this.parse(Validate);

    let totals: AggregateCounts = NO_ISSUES;

    try {
      totals = await this.validateAllRegistered();
    } catch (error) {
      const message = getErrorMessage(error);
      this.error(`${ERROR_MESSAGES.VALIDATION_FAILED}: ${message}`, { exit: EXIT_CODES.ERROR });
    }

    this.log("");
    this.log(`Result: ${totals.errors} error(s), ${totals.warnings} warning(s)`);
    this.log("");

    if (totals.errors > 0) {
      this.error(ERROR_MESSAGES.VALIDATION_FAILED, { exit: EXIT_CODES.ERROR });
    }
  }

  private async validateAllRegistered(): Promise<AggregateCounts> {
    const projectDir = process.cwd();
    const globalPaths = resolveInstallPaths(projectDir, "global");
    const projectPaths = resolveInstallPaths(projectDir, "project");

    const inHome = isHomeDirectory(projectDir);

    this.log("");
    this.log("Validating sources");

    const { primary, extras } = await resolveAllSources(projectDir);
    const sources: SourceEntry[] = [primary, ...extras];

    const counts: AggregateCounts[] = [];
    for (const source of sources) {
      counts.push(await this.validateRegisteredSource(source));
    }

    this.log("");
    this.log("Validating plugins");

    counts.push(await this.validatePluginsDirectory(getUserPluginsDir()));
    if (!inHome) {
      counts.push(await this.validatePluginsDirectory(getProjectPluginsDir(projectDir)));
    }

    this.log("");
    this.log("Validating skills");

    counts.push(await this.validateInstalledSkillsDirectory(globalPaths.skillsDir));
    if (!inHome) {
      counts.push(await this.validateInstalledSkillsDirectory(projectPaths.skillsDir));
    }

    this.log("");
    this.log("Validating agents");

    counts.push(await this.validateInstalledAgentsDirectory(globalPaths.agentsDir));
    if (!inHome) {
      counts.push(await this.validateInstalledAgentsDirectory(projectPaths.agentsDir));
    }

    return sumCounts(counts);
  }

  private async validateRegisteredSource(source: SourceEntry): Promise<AggregateCounts> {
    if (!isLocalSource(source.url)) {
      this.log(
        `  ${source.name.padEnd(COL_NAME_WIDTH)} ${source.url.padEnd(COL_URL_WIDTH)} ${VALIDATE_STATUS.SKIPPED_REMOTE}`,
      );
      return NO_ISSUES;
    }

    try {
      const result = await validateSource(source.url);
      this.log(
        `  ${source.name.padEnd(COL_NAME_WIDTH)} ${source.url.padEnd(COL_URL_WIDTH)} ${result.skillCount} skill(s), ${result.errorCount} error(s), ${result.warningCount} warning(s)`,
      );

      for (const issue of result.issues) {
        const prefix = issue.severity === "error" ? "ERROR" : "WARN";
        this.log(`    [${prefix}] ${issue.file}: ${issue.message}`);
      }

      return { errors: result.errorCount, warnings: result.warningCount };
    } catch (error) {
      const message = getErrorMessage(error);
      this.log(
        `  ${source.name.padEnd(COL_NAME_WIDTH)} ${source.url.padEnd(COL_URL_WIDTH)} failed: ${message}`,
      );
      return { errors: 1, warnings: 0 };
    }
  }

  private async validatePluginsDirectory(pluginsDir: string): Promise<AggregateCounts> {
    const displayPath = displayDir(pluginsDir);

    if (!(await directoryExists(pluginsDir))) {
      this.log(`  ${displayPath.padEnd(COL_PATH_WIDTH)} ${VALIDATE_STATUS.NOT_PRESENT}`);
      return NO_ISSUES;
    }

    const pluginDirs = await findPluginDirectories(pluginsDir);
    if (pluginDirs.length === 0) {
      this.log(`  ${displayPath.padEnd(COL_PATH_WIDTH)} ${VALIDATE_STATUS.NO_PLUGINS}`);
      return NO_ISSUES;
    }

    const result = await validateAllPlugins(pluginsDir);

    this.log(
      `  ${displayPath.padEnd(COL_PATH_WIDTH)} ${result.summary.total} plugin(s), ${result.summary.invalid} invalid, ${result.summary.withWarnings} with warnings`,
    );

    return printAndSumResults(result.results);
  }

  private async validateInstalledSkillsDirectory(skillsDir: string): Promise<AggregateCounts> {
    const displayPath = displayDir(skillsDir);

    if (!(await directoryExists(skillsDir))) {
      this.log(`  ${displayPath.padEnd(COL_PATH_WIDTH)} ${VALIDATE_STATUS.NOT_PRESENT}`);
      return NO_ISSUES;
    }

    const skillDirs = await listDirectories(skillsDir);
    if (skillDirs.length === 0) {
      this.log(`  ${displayPath.padEnd(COL_PATH_WIDTH)} ${VALIDATE_STATUS.EMPTY}`);
      return NO_ISSUES;
    }

    const results = await Promise.all(
      skillDirs.map(async (name) => ({
        name,
        result: await validateInstalledSkill(path.join(skillsDir, name)),
      })),
    );

    const invalidCount = results.filter((r) => !r.result.valid).length;
    const warnCount = results.filter((r) => r.result.warnings.length > 0).length;

    this.log(
      `  ${displayPath.padEnd(COL_PATH_WIDTH)} ${skillDirs.length} skill(s), ${invalidCount} invalid, ${warnCount} with warnings`,
    );

    return printAndSumResults(results);
  }

  private async validateInstalledAgentsDirectory(agentsDir: string): Promise<AggregateCounts> {
    const displayPath = displayDir(agentsDir);

    if (!(await directoryExists(agentsDir))) {
      this.log(`  ${displayPath.padEnd(COL_PATH_WIDTH)} ${VALIDATE_STATUS.NOT_PRESENT}`);
      return NO_ISSUES;
    }

    const agentFiles = await findAgentFiles(agentsDir);
    if (agentFiles.length === 0) {
      this.log(`  ${displayPath.padEnd(COL_PATH_WIDTH)} ${VALIDATE_STATUS.EMPTY}`);
      return NO_ISSUES;
    }

    const results = await Promise.all(
      agentFiles.map(async (fileName) => ({
        name: fileName,
        result: await validateAgentFrontmatter(path.join(agentsDir, fileName)),
      })),
    );

    const invalidCount = results.filter((r) => !r.result.valid).length;
    const warnCount = results.filter((r) => r.result.warnings.length > 0).length;

    this.log(
      `  ${displayPath.padEnd(COL_PATH_WIDTH)} ${agentFiles.length} agent(s), ${invalidCount} invalid, ${warnCount} with warnings`,
    );

    return printAndSumResults(results);
  }
}

/** Render an absolute path with a `~/` prefix when it's under the user's home directory. */
function displayDir(absolutePath: string): string {
  const home = os.homedir();
  if (absolutePath === home) return "~";
  if (absolutePath.startsWith(home + path.sep)) {
    return `~${path.sep}${path.relative(home, absolutePath)}`;
  }
  return absolutePath;
}

async function findAgentFiles(agentsDir: string): Promise<string[]> {
  return glob("*.md", agentsDir);
}

async function validateInstalledSkill(skillDir: string): Promise<ValidationResult> {
  const skillMdPath = path.join(skillDir, STANDARD_FILES.SKILL_MD);
  const metadataPath = path.join(skillDir, STANDARD_FILES.METADATA_YAML);
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(await fileExists(skillMdPath))) {
    errors.push(`Missing ${STANDARD_FILES.SKILL_MD}`);
  } else {
    const frontmatterResult = await validateSkillFrontmatter(skillMdPath);
    errors.push(...frontmatterResult.errors);
    warnings.push(...frontmatterResult.warnings);
  }

  if (!(await fileExists(metadataPath))) {
    errors.push(`Missing ${STANDARD_FILES.METADATA_YAML}`);
  } else {
    const metadataResult = await validateInstalledSkillMetadata(metadataPath);
    errors.push(...metadataResult.errors);
    warnings.push(...metadataResult.warnings);
  }

  return { valid: errors.length === 0, errors, warnings };
}

async function validateInstalledSkillMetadata(metadataPath: string): Promise<ValidationResult> {
  let rawMetadata: unknown;
  try {
    const content = await readFile(metadataPath);
    rawMetadata = parseYaml(content);
  } catch (err) {
    return {
      valid: false,
      errors: [`${STANDARD_FILES.METADATA_YAML}: ${getErrorMessage(err)}`],
      warnings: [],
    };
  }

  const result = validateSkillMetadata(rawMetadata);
  if (result.success) {
    return { valid: true, errors: [], warnings: [] };
  }

  return {
    valid: false,
    errors: formatZodErrors(result.error).map((e) => `${STANDARD_FILES.METADATA_YAML}: ${e}`),
    warnings: [],
  };
}

async function findPluginDirectories(pluginsDir: string): Promise<string[]> {
  const entries = await listDirectories(pluginsDir);
  const checks = await Promise.all(
    entries.map(async (name) => ({
      name,
      isPlugin: await directoryExists(path.join(pluginsDir, name, PLUGIN_MANIFEST_DIR)),
    })),
  );
  return checks.filter((check) => check.isPlugin).map((check) => check.name);
}
