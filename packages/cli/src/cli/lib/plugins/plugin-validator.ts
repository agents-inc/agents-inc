import { isRecord } from "../../utils/type-guards.js";
import path from "path";
import { getErrorMessage } from "../../utils/errors";
import {
  fileExists,
  glob,
  readFile,
  readFileSafe,
  directoryExists,
  listDirectories,
} from "../../utils/fs";
import type { ValidationResult } from "../../types";
import { validResult, invalidResult, mergeValidationResults } from "../validation-result";
import { extractFrontmatter } from "../../utils/frontmatter";
import { formatZodErrors } from "../schema-validator";
import {
  pluginManifestValidationSchema,
  skillFrontmatterValidationSchema,
  agentFrontmatterValidationSchema,
} from "../schemas";
import {
  KEBAB_CASE_PATTERN,
  MAX_PLUGIN_FILE_SIZE,
  PLUGIN_MANIFEST_DIR,
  STANDARD_FILES,
} from "../../consts";
import { getPluginManifestPath } from "./plugin-finder";
import { agentCodec } from "../installation/install-layout";

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function isKebabCase(str: string): boolean {
  return KEBAB_CASE_PATTERN.test(str);
}

function isValidSemver(str: string): boolean {
  return SEMVER_REGEX.test(str);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

async function validatePluginStructure(pluginPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(await directoryExists(pluginPath))) {
    return invalidResult(`Plugin directory does not exist: ${pluginPath}`);
  }

  const pluginDir = path.join(pluginPath, PLUGIN_MANIFEST_DIR);
  if (!(await directoryExists(pluginDir))) {
    errors.push(`Missing ${PLUGIN_MANIFEST_DIR}/ directory`);
  }

  const manifestPath = path.join(pluginDir, STANDARD_FILES.PLUGIN_JSON);
  if (!(await fileExists(manifestPath))) {
    errors.push(`Missing ${PLUGIN_MANIFEST_DIR}/${STANDARD_FILES.PLUGIN_JSON}`);
  }

  const readmePath = path.join(pluginPath, STANDARD_FILES.README_MD);
  if (!(await fileExists(readmePath))) {
    warnings.push("Missing README.md (recommended for documentation)");
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function validatePluginManifest(manifestPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  let manifest: Record<string, unknown>;
  try {
    const content = await readFileSafe(manifestPath, MAX_PLUGIN_FILE_SIZE);
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
      return invalidResult(`${STANDARD_FILES.PLUGIN_JSON} must contain a JSON object`);
    }
    manifest = parsed;
  } catch (err) {
    return invalidResult(`Invalid JSON in ${STANDARD_FILES.PLUGIN_JSON}: ${getErrorMessage(err)}`);
  }

  const result = pluginManifestValidationSchema.safeParse(manifest);

  if (!result.success) {
    errors.push(...formatZodErrors(result.error));
  }

  if (isNonEmptyString(manifest.name)) {
    if (!isKebabCase(manifest.name)) {
      errors.push(`name must be kebab-case: "${manifest.name}"`);
    }
  }

  if (isNonEmptyString(manifest.version)) {
    if (!isValidSemver(manifest.version)) {
      errors.push(
        `version "${manifest.version}" is not valid semver (expected: major.minor.patch)`,
      );
    }
  }

  if (!manifest.description) {
    warnings.push("Missing description field (recommended for discoverability)");
  }

  const pluginDir = path.dirname(path.dirname(manifestPath));

  if (isNonEmptyString(manifest.skills)) {
    const skillsPath = path.join(pluginDir, manifest.skills);
    if (!(await directoryExists(skillsPath))) {
      errors.push(`Skills path does not exist: ${manifest.skills}`);
    }
  }

  if (isNonEmptyString(manifest.agents)) {
    const agentsPath = path.join(pluginDir, manifest.agents);
    if (!(await directoryExists(agentsPath))) {
      errors.push(`Agents path does not exist: ${manifest.agents}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function validateSkillFrontmatter(skillPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(await fileExists(skillPath))) {
    return invalidResult(`Skill file not found: ${skillPath}`);
  }

  const content = await readFile(skillPath);
  const frontmatter = extractFrontmatter(content);

  if (frontmatter === null) {
    return invalidResult("Missing or invalid YAML frontmatter");
  }

  const result = skillFrontmatterValidationSchema.safeParse(frontmatter);

  if (!result.success) {
    errors.push(...formatZodErrors(result.error));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export async function validateAgentFrontmatter(agentPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(await fileExists(agentPath))) {
    return invalidResult(`Agent file not found: ${agentPath}`);
  }

  const content = await readFile(agentPath);
  const frontmatter = extractFrontmatter(content);

  if (frontmatter === null) {
    return invalidResult("Missing or invalid YAML frontmatter");
  }

  const result = agentFrontmatterValidationSchema.safeParse(frontmatter);

  if (!result.success) {
    errors.push(...formatZodErrors(result.error));
  }

  // Boundary cast: parsed YAML frontmatter, narrowed for field access.
  const fm = frontmatter as Record<string, unknown>;

  if (isNonEmptyString(fm.name)) {
    if (!isKebabCase(fm.name)) {
      errors.push(`name must be kebab-case: "${fm.name}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function prefixResult(result: ValidationResult, prefix: string): ValidationResult {
  return {
    valid: result.valid,
    errors: result.valid ? [] : result.errors.map((e) => `${prefix}: ${e}`),
    warnings: result.warnings.map((w) => `${prefix}: ${w}`),
  };
}

/** Each file's result is named by its path in the plugin. */
async function validateEachFile(
  pluginPath: string,
  scannedDir: string,
  files: string[],
  validate: (filePath: string) => Promise<ValidationResult>,
): Promise<ValidationResult> {
  const results = await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(scannedDir, file);
      return prefixResult(await validate(filePath), path.relative(pluginPath, filePath));
    }),
  );
  return mergeValidationResults(results);
}

async function validatePluginSkillFiles(
  pluginPath: string,
  skillsRelPath: string,
): Promise<ValidationResult> {
  const skillsDir = path.join(pluginPath, skillsRelPath);
  if (!(await directoryExists(skillsDir))) return validResult();

  const files = await glob(`**/${STANDARD_FILES.SKILL_MD}`, skillsDir);
  if (files.length === 0) {
    return {
      valid: true,
      errors: [],
      warnings: [`Skills directory exists but contains no SKILL.md files: ${skillsRelPath}`],
    };
  }

  return validateEachFile(pluginPath, skillsDir, files, validateSkillFrontmatter);
}

async function validatePluginAgentFiles(
  pluginPath: string,
  agentsRelPath: string,
): Promise<ValidationResult> {
  const agentsDir = path.join(pluginPath, agentsRelPath);
  if (!(await directoryExists(agentsDir))) return validResult();

  const files = await glob(agentCodec("claude").listGlob, agentsDir);
  if (files.length === 0) {
    return {
      valid: true,
      errors: [],
      warnings: [`Agents directory exists but contains no .md files: ${agentsRelPath}`],
    };
  }

  return validateEachFile(pluginPath, agentsDir, files, validateAgentFrontmatter);
}

async function loadManifestForValidation(
  manifestPath: string,
): Promise<Record<string, unknown> | null> {
  try {
    const content = await readFileSafe(manifestPath, MAX_PLUGIN_FILE_SIZE);
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function validatePlugin(pluginPath: string): Promise<ValidationResult> {
  const structureResult = await validatePluginStructure(pluginPath);
  if (!structureResult.valid) return structureResult;

  const manifestPath = getPluginManifestPath(pluginPath);
  const [manifestResult, manifest] = await Promise.all([
    validatePluginManifest(manifestPath),
    loadManifestForValidation(manifestPath),
  ]);
  const skillsResult = await validateDeclaredDir(
    pluginPath,
    manifest?.skills,
    validatePluginSkillFiles,
  );
  const agentsResult = await validateDeclaredDir(
    pluginPath,
    manifest?.agents,
    validatePluginAgentFiles,
  );

  return mergeValidationResults([structureResult, manifestResult, skillsResult, agentsResult]);
}

/** A manifest field naming no directory leaves nothing to validate. */
async function validateDeclaredDir(
  pluginPath: string,
  declaredRelPath: unknown,
  validate: (pluginPath: string, relPath: string) => Promise<ValidationResult>,
): Promise<ValidationResult> {
  if (!isNonEmptyString(declaredRelPath)) return validResult();
  return validate(pluginPath, declaredRelPath);
}

type NamedPluginValidation = { name: string; result: ValidationResult };

type PluginsDirValidation = {
  valid: boolean;
  results: NamedPluginValidation[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    withWarnings: number;
  };
};

export async function validateAllPlugins(pluginsDir: string): Promise<PluginsDirValidation> {
  if (!(await directoryExists(pluginsDir))) {
    return refusedPluginsDir(pluginsDir, `Directory does not exist: ${pluginsDir}`);
  }

  const pluginDirs = await listPluginDirNames(pluginsDir);
  if (pluginDirs.length === 0) {
    return refusedPluginsDir(
      pluginsDir,
      `No plugins found in directory: ${pluginsDir}. Plugins must contain a ${PLUGIN_MANIFEST_DIR}/ directory.`,
    );
  }

  const results = await validateEachPlugin(pluginsDir, pluginDirs);
  return summarizePluginValidations(results);
}

/** The directory itself stands as the one invalid result: nothing inside it was validated. */
function refusedPluginsDir(pluginsDir: string, message: string): PluginsDirValidation {
  return {
    valid: false,
    results: [{ name: pluginsDir, result: invalidResult(message) }],
    summary: { total: 0, valid: 0, invalid: 1, withWarnings: 0 },
  };
}

/** Direct children carrying a plugin manifest directory, in listing order. */
export async function listPluginDirNames(pluginsDir: string): Promise<string[]> {
  const allDirs = await listDirectories(pluginsDir);
  const dirChecks = await Promise.all(
    allDirs.map(async (dirName) => ({
      dirName,
      isPlugin: await directoryExists(path.join(pluginsDir, dirName, PLUGIN_MANIFEST_DIR)),
    })),
  );
  return dirChecks.filter((c) => c.isPlugin).map((c) => c.dirName);
}

async function validateEachPlugin(
  pluginsDir: string,
  pluginDirs: string[],
): Promise<NamedPluginValidation[]> {
  const results: NamedPluginValidation[] = [];
  for (const pluginName of pluginDirs) {
    const result = await validatePlugin(path.join(pluginsDir, pluginName));
    results.push({ name: pluginName, result });
  }
  return results;
}

function summarizePluginValidations(results: NamedPluginValidation[]): PluginsDirValidation {
  const validCount = results.filter((r) => r.result.valid).length;
  const summary = {
    total: results.length,
    valid: validCount,
    invalid: results.length - validCount,
    withWarnings: results.filter((r) => r.result.warnings.length > 0).length,
  };

  return {
    valid: summary.invalid === 0,
    results,
    summary,
  };
}
