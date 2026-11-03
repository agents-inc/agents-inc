import { isRecord } from "../../utils/type-guards.js";
import path from "path";
import type { z } from "zod";
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
import {
  validResult,
  invalidResult,
  mergeValidationResults,
  resultFrom,
} from "../validation-result";
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

type ManifestRead =
  { ok: true; manifest: Record<string, unknown> } | { ok: false; refusal: ValidationResult };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

async function validatePluginStructure(pluginPath: string): Promise<ValidationResult> {
  if (!(await directoryExists(pluginPath))) {
    return invalidResult(`Plugin directory does not exist: ${pluginPath}`);
  }

  const pluginDir = path.join(pluginPath, PLUGIN_MANIFEST_DIR);
  const [hasManifestDir, hasManifest, hasReadme] = await Promise.all([
    directoryExists(pluginDir),
    fileExists(path.join(pluginDir, STANDARD_FILES.PLUGIN_JSON)),
    fileExists(path.join(pluginPath, STANDARD_FILES.README_MD)),
  ]);

  return resultFrom(
    [
      ...(hasManifestDir ? [] : [`Missing ${PLUGIN_MANIFEST_DIR}/ directory`]),
      ...(hasManifest ? [] : [`Missing ${PLUGIN_MANIFEST_DIR}/${STANDARD_FILES.PLUGIN_JSON}`]),
    ],
    hasReadme ? [] : ["Missing README.md (recommended for documentation)"],
  );
}

async function readManifestForValidation(manifestPath: string): Promise<ManifestRead> {
  try {
    const parsed: unknown = JSON.parse(await readFileSafe(manifestPath, MAX_PLUGIN_FILE_SIZE));
    if (!isRecord(parsed)) {
      return {
        ok: false,
        refusal: invalidResult(`${STANDARD_FILES.PLUGIN_JSON} must contain a JSON object`),
      };
    }
    return { ok: true, manifest: parsed };
  } catch (err) {
    return {
      ok: false,
      refusal: invalidResult(
        `Invalid JSON in ${STANDARD_FILES.PLUGIN_JSON}: ${getErrorMessage(err)}`,
      ),
    };
  }
}

async function validateManifestFields(
  manifest: Record<string, unknown>,
  pluginDir: string,
): Promise<ValidationResult> {
  const [skillsPathErrors, agentsPathErrors] = await Promise.all([
    missingDeclaredPathErrors(pluginDir, manifest.skills, "Skills"),
    missingDeclaredPathErrors(pluginDir, manifest.agents, "Agents"),
  ]);

  return resultFrom(
    [
      ...schemaErrors(pluginManifestValidationSchema, manifest),
      ...kebabNameErrors(manifest.name),
      ...semverErrors(manifest.version),
      ...skillsPathErrors,
      ...agentsPathErrors,
    ],
    manifest.description ? [] : ["Missing description field (recommended for discoverability)"],
  );
}

function schemaErrors(schema: z.ZodType, value: unknown): string[] {
  const result = schema.safeParse(value);
  return result.success ? [] : formatZodErrors(result.error);
}

function kebabNameErrors(name: unknown): string[] {
  return isNonEmptyString(name) && !KEBAB_CASE_PATTERN.test(name)
    ? [`name must be kebab-case: "${name}"`]
    : [];
}

function semverErrors(version: unknown): string[] {
  return isNonEmptyString(version) && !SEMVER_REGEX.test(version)
    ? [`version "${version}" is not valid semver (expected: major.minor.patch)`]
    : [];
}

async function missingDeclaredPathErrors(
  pluginDir: string,
  declaredRelPath: unknown,
  label: "Skills" | "Agents",
): Promise<string[]> {
  if (!isNonEmptyString(declaredRelPath)) return [];
  if (await directoryExists(path.join(pluginDir, declaredRelPath))) return [];
  return [`${label} path does not exist: ${declaredRelPath}`];
}

export async function validateSkillFrontmatter(skillPath: string): Promise<ValidationResult> {
  return validateFrontmatterFile(skillPath, "Skill", (frontmatter) =>
    schemaErrors(skillFrontmatterValidationSchema, frontmatter),
  );
}

export async function validateAgentFrontmatter(agentPath: string): Promise<ValidationResult> {
  return validateFrontmatterFile(agentPath, "Agent", (frontmatter) => [
    ...schemaErrors(agentFrontmatterValidationSchema, frontmatter),
    ...kebabNameErrors(isRecord(frontmatter) ? frontmatter.name : undefined),
  ]);
}

async function validateFrontmatterFile(
  filePath: string,
  kind: "Skill" | "Agent",
  frontmatterErrors: (frontmatter: unknown) => string[],
): Promise<ValidationResult> {
  if (!(await fileExists(filePath))) {
    return invalidResult(`${kind} file not found: ${filePath}`);
  }

  const frontmatter = extractFrontmatter(await readFile(filePath));
  if (frontmatter === null) {
    return invalidResult("Missing or invalid YAML frontmatter");
  }

  return resultFrom(frontmatterErrors(frontmatter), []);
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

type DeclaredFileScan = {
  pattern: string;
  emptyDirWarning: string;
  validate: (filePath: string) => Promise<ValidationResult>;
};

const SKILL_FILE_SCAN: DeclaredFileScan = {
  pattern: `**/${STANDARD_FILES.SKILL_MD}`,
  emptyDirWarning: "Skills directory exists but contains no SKILL.md files",
  validate: validateSkillFrontmatter,
};

const AGENT_FILE_SCAN: DeclaredFileScan = {
  pattern: agentCodec("claude").listGlob,
  emptyDirWarning: "Agents directory exists but contains no .md files",
  validate: validateAgentFrontmatter,
};

export async function validatePlugin(pluginPath: string): Promise<ValidationResult> {
  const structureResult = await validatePluginStructure(pluginPath);
  if (!structureResult.valid) return structureResult;

  const read = await readManifestForValidation(getPluginManifestPath(pluginPath));
  if (!read.ok) return mergeValidationResults([structureResult, read.refusal]);

  const contentResults = await Promise.all([
    validateManifestFields(read.manifest, pluginPath),
    validateDeclaredFiles(pluginPath, read.manifest.skills, SKILL_FILE_SCAN),
    validateDeclaredFiles(pluginPath, read.manifest.agents, AGENT_FILE_SCAN),
  ]);

  return mergeValidationResults([structureResult, ...contentResults]);
}

/** No directory named, or a missing one (the manifest's error), leaves nothing to scan. */
async function validateDeclaredFiles(
  pluginPath: string,
  declaredRelPath: unknown,
  scan: DeclaredFileScan,
): Promise<ValidationResult> {
  if (!isNonEmptyString(declaredRelPath)) return validResult();
  const scannedDir = path.join(pluginPath, declaredRelPath);
  if (!(await directoryExists(scannedDir))) return validResult();

  const files = await glob(scan.pattern, scannedDir);
  if (files.length === 0) return resultFrom([], [`${scan.emptyDirWarning}: ${declaredRelPath}`]);

  return validateEachFile(pluginPath, scannedDir, files, scan.validate);
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
  return Promise.all(
    pluginDirs.map(async (name) => ({
      name,
      result: await validatePlugin(path.join(pluginsDir, name)),
    })),
  );
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
