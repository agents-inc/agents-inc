import { isRecord } from "../../utils/type-guards.js";
import path from "path";
import fg from "fast-glob";
import { getErrorMessage } from "../../utils/errors";
import {
  fileExists,
  readFile,
  readFileSafe,
  directoryExists,
  listDirectories,
} from "../../utils/fs";
import type { ValidationResult } from "../../types";
import { validResult, invalidResult, mergeValidationResults } from "../validation-result";
import { extractFrontmatter } from "../../utils/frontmatter";
import { log } from "../../utils/logger";
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

const PLUGIN_DIR = PLUGIN_MANIFEST_DIR;
const PLUGIN_MANIFEST = STANDARD_FILES.PLUGIN_JSON;
const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

function isKebabCase(str: string): boolean {
  return KEBAB_CASE_PATTERN.test(str);
}

function isValidSemver(str: string): boolean {
  return SEMVER_REGEX.test(str);
}

export async function validatePluginStructure(pluginPath: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!(await directoryExists(pluginPath))) {
    return invalidResult(`Plugin directory does not exist: ${pluginPath}`);
  }

  const pluginDir = path.join(pluginPath, PLUGIN_DIR);
  if (!(await directoryExists(pluginDir))) {
    errors.push(`Missing ${PLUGIN_DIR}/ directory`);
  }

  const manifestPath = path.join(pluginDir, PLUGIN_MANIFEST);
  if (!(await fileExists(manifestPath))) {
    errors.push(`Missing ${PLUGIN_DIR}/${PLUGIN_MANIFEST}`);
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

  if (!(await fileExists(manifestPath))) {
    return invalidResult(`Manifest file not found: ${manifestPath}`);
  }

  let manifest: Record<string, unknown>;
  try {
    const content = await readFileSafe(manifestPath, MAX_PLUGIN_FILE_SIZE);
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) return invalidResult(`${PLUGIN_MANIFEST} must contain a JSON object`);
    manifest = parsed;
  } catch (err) {
    return invalidResult(`Invalid JSON in ${PLUGIN_MANIFEST}: ${getErrorMessage(err)}`);
  }

  const result = pluginManifestValidationSchema.safeParse(manifest);

  if (!result.success) {
    errors.push(...formatZodErrors(result.error));
  }

  if (manifest.name && typeof manifest.name === "string") {
    if (!isKebabCase(manifest.name)) {
      errors.push(`name must be kebab-case: "${manifest.name}"`);
    }
  }

  if (manifest.version && typeof manifest.version === "string") {
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

  if (manifest.skills && typeof manifest.skills === "string") {
    const skillsPath = path.join(pluginDir, manifest.skills);
    if (!(await directoryExists(skillsPath))) {
      errors.push(`Skills path does not exist: ${manifest.skills}`);
    }
  }

  if (manifest.agents && typeof manifest.agents === "string") {
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

  if (fm.name && typeof fm.name === "string") {
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

async function validatePluginSkillFiles(
  pluginPath: string,
  skillsRelPath: string,
): Promise<ValidationResult> {
  const skillsDir = path.join(pluginPath, skillsRelPath);
  if (!(await directoryExists(skillsDir))) return validResult();

  const files = await fg(`**/${STANDARD_FILES.SKILL_MD}`, { cwd: skillsDir, absolute: true });
  if (files.length === 0) {
    return {
      valid: true,
      errors: [],
      warnings: [`Skills directory exists but contains no SKILL.md files: ${skillsRelPath}`],
    };
  }

  const results = await Promise.all(
    files.map(async (f) =>
      prefixResult(await validateSkillFrontmatter(f), path.relative(pluginPath, f)),
    ),
  );
  return mergeValidationResults(results);
}

async function validatePluginAgentFiles(
  pluginPath: string,
  agentsRelPath: string,
): Promise<ValidationResult> {
  const agentsDir = path.join(pluginPath, agentsRelPath);
  if (!(await directoryExists(agentsDir))) return validResult();

  const files = await fg("*.md", { cwd: agentsDir, absolute: true });
  if (files.length === 0) {
    return {
      valid: true,
      errors: [],
      warnings: [`Agents directory exists but contains no .md files: ${agentsRelPath}`],
    };
  }

  const results = await Promise.all(
    files.map(async (f) =>
      prefixResult(await validateAgentFrontmatter(f), path.relative(pluginPath, f)),
    ),
  );
  return mergeValidationResults(results);
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
  const manifestResult = await validatePluginManifest(manifestPath);
  const manifest = await loadManifestForValidation(manifestPath);

  const skillsResult =
    manifest?.skills && typeof manifest.skills === "string"
      ? await validatePluginSkillFiles(pluginPath, manifest.skills)
      : validResult();

  const agentsResult =
    manifest?.agents && typeof manifest.agents === "string"
      ? await validatePluginAgentFiles(pluginPath, manifest.agents)
      : validResult();

  return mergeValidationResults([structureResult, manifestResult, skillsResult, agentsResult]);
}

export async function validateAllPlugins(pluginsDir: string): Promise<{
  valid: boolean;
  results: Array<{ name: string; result: ValidationResult }>;
  summary: {
    total: number;
    valid: number;
    invalid: number;
    withWarnings: number;
  };
}> {
  const results: Array<{ name: string; result: ValidationResult }> = [];

  if (!(await directoryExists(pluginsDir))) {
    return {
      valid: false,
      results: [
        {
          name: pluginsDir,
          result: invalidResult(`Directory does not exist: ${pluginsDir}`),
        },
      ],
      summary: { total: 0, valid: 0, invalid: 1, withWarnings: 0 },
    };
  }

  const allDirs = await listDirectories(pluginsDir);
  const dirChecks = await Promise.all(
    allDirs.map(async (dirName) => ({
      dirName,
      isPlugin: await directoryExists(path.join(pluginsDir, dirName, PLUGIN_DIR)),
    })),
  );
  const pluginDirs = dirChecks.filter((c) => c.isPlugin).map((c) => c.dirName);

  if (pluginDirs.length === 0) {
    return {
      valid: false,
      results: [
        {
          name: pluginsDir,
          result: invalidResult(
            `No plugins found in directory: ${pluginsDir}. Plugins must contain a ${PLUGIN_DIR}/ directory.`,
          ),
        },
      ],
      summary: { total: 0, valid: 0, invalid: 1, withWarnings: 0 },
    };
  }

  for (const pluginName of pluginDirs) {
    const pluginPath = path.join(pluginsDir, pluginName);
    const result = await validatePlugin(pluginPath);
    results.push({ name: pluginName, result });
  }

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

export function printPluginValidationResult(name: string, result: ValidationResult): void {
  const status = result.valid ? "\u2713" : "\u2717";

  if (result.valid && result.warnings.length === 0) {
    return;
  }

  log(`\n  ${status} ${name}`);

  if (result.errors.length > 0) {
    log("    Errors:");
    result.errors.forEach((e) => log(`      - ${e}`));
  }

  if (result.warnings.length > 0) {
    log("    Warnings:");
    result.warnings.forEach((w) => log(`      - ${w}`));
  }
}
