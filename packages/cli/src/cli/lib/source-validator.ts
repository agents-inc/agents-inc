import path from "path";
import { isRecord } from "../utils/type-guards.js";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { glob, readFile, fileExists, directoryExists } from "../utils/fs";
import {
  DIRS,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  STACKS_FILE_PATH,
  STANDARD_FILES,
} from "../consts";
import {
  agentYamlGenerationSchema,
  metadataValidationSchema,
  splitMetadataValidationIssues,
  validateSkillMetadata,
  skillCategoriesFileSchema,
  skillRulesFileSchema,
  stackConfigValidationSchema,
  stacksConfigSchema,
} from "./schemas";
import { parseFrontmatter } from "./loading/loader";
import { loadConfig, loadProjectSourceConfig } from "./configuration";
import { checkMatrixHealth } from "./matrix";
import { loadSkillsMatrixFromSource } from "./loading/source-loader";
import { matrix } from "./matrix/matrix-provider";
import { getErrorMessage } from "../utils/errors";
import { formatZodErrors } from "./schema-validator";

export type SourceValidationIssue = {
  severity: "error" | "warning";
  file: string;
  message: string;
};

export type SourceValidationResult = {
  issues: SourceValidationIssue[];
  skillCount: number;
  errorCount: number;
  warningCount: number;
};

/**
 * True when `dir` is itself a skills source repository — it carries the skills tree
 * `validateSource` walks, at `src/skills/` or wherever its own source config points.
 * A marketplace author's checkout answers yes; a consumer project answers no.
 */
export async function isSourceRepo(dir: string): Promise<boolean> {
  const sourceConfig = await loadProjectSourceConfig(dir);
  return directoryExists(path.join(dir, sourceConfig?.skillsDir ?? SKILLS_DIR_PATH));
}

/** Checks if a key uses snake_case (has underscore between lowercase letters) */
export function isSnakeCase(key: string): boolean {
  return /[a-z]_[a-z]/.test(key);
}

/**
 * Checks top-level keys for snake_case usage (camelCase is the convention).
 * Non-object input yields no issues.
 */
export function checkSnakeCaseKeys(rawMetadata: unknown, relPath: string): SourceValidationIssue[] {
  if (!isRecord(rawMetadata)) return [];

  return Object.keys(rawMetadata)
    .filter(isSnakeCase)
    .map((key) => ({
      severity: "error" as const,
      file: relPath,
      message: `Key '${key}' uses snake_case — use camelCase instead`,
    }));
}

/**
 * Warns when a skill directory's name does not equal the skill's machine id
 * (SKILL.md frontmatter `name`) — the key the loader registers the skill under.
 * Warning, not error: the loader still loads the skill by its id, but the
 * directory no longer signals which skill it contains.
 */
export function checkDirNameMatchesSkillId(
  skillId: string,
  relPath: string,
  dirName: string,
): SourceValidationIssue[] {
  if (skillId === dirName) return [];
  return [
    {
      severity: "warning",
      file: relPath,
      message: `Directory name '${dirName}' does not match skill id '${skillId}'`,
    },
  ];
}

/**
 * Reads a skill directory's SKILL.md frontmatter and checks the directory name
 * against the skill's machine id. When the id cannot be read (unreadable file or
 * missing/invalid frontmatter), reports that the check could not run.
 */
async function checkSkillDirName(
  skillsDir: string,
  skillsDirRelPath: string,
  skillDir: string,
): Promise<SourceValidationIssue[]> {
  const dirName = path.basename(skillDir);
  const skillMdRelPath = path.join(skillsDirRelPath, skillDir, STANDARD_FILES.SKILL_MD);

  try {
    const content = await readFile(path.join(skillsDir, skillDir, STANDARD_FILES.SKILL_MD));
    const frontmatter = parseFrontmatter(content, skillMdRelPath);

    if (frontmatter === null) {
      return [
        {
          severity: "warning",
          file: skillMdRelPath,
          message: `Cannot verify directory name '${dirName}': missing or invalid ${STANDARD_FILES.SKILL_MD} frontmatter`,
        },
      ];
    }

    return checkDirNameMatchesSkillId(frontmatter.name, skillMdRelPath, dirName);
  } catch (error) {
    return [
      {
        severity: "warning",
        file: skillMdRelPath,
        message: `Cannot verify directory name '${dirName}': ${getErrorMessage(error)}`,
      },
    ];
  }
}

/**
 * Finds missing SKILL.md / metadata.yaml pairs (pure function, no I/O).
 *
 * Returns issues for:
 * - Directories with SKILL.md but no metadata.yaml
 * - Directories with metadata.yaml but no SKILL.md
 */
export function validateSkillFilePairs(
  skillMdDirs: Set<string>,
  metadataDirs: Set<string>,
  skillsDir: string,
): SourceValidationIssue[] {
  const missingMetadata = [...skillMdDirs]
    .filter((dir) => !metadataDirs.has(dir))
    .map((dir) => ({
      severity: "error" as const,
      file: path.join(skillsDir, dir),
      message: `Missing ${STANDARD_FILES.METADATA_YAML} — skill directory has ${STANDARD_FILES.SKILL_MD} but no metadata`,
    }));

  const missingSkillMd = [...metadataDirs]
    .filter((dir) => !skillMdDirs.has(dir))
    .map((dir) => ({
      severity: "error" as const,
      file: path.join(skillsDir, dir),
      message: `Missing ${STANDARD_FILES.SKILL_MD} — skill directory has ${STANDARD_FILES.METADATA_YAML} but no SKILL.md`,
    }));

  return [...missingMetadata, ...missingSkillMd];
}

/**
 * Validates a skills source repository for metadata correctness.
 *
 * Checks:
 * 1. Every metadata.yaml against the strict validation schema
 *    (over-length cliDescription is downgraded to a warning)
 * 2. Directory name equals the skill's machine id (SKILL.md frontmatter name)
 * 3. Cross-references resolve to existing skill IDs (via checkMatrixHealth)
 * 4. camelCase key convention (no snake_case)
 * 5. Every skill directory has both SKILL.md and metadata.yaml
 */
export async function validateSource(sourcePath: string): Promise<SourceValidationResult> {
  const issues: SourceValidationIssue[] = [];

  const resolvedPath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(sourcePath);

  if (!(await directoryExists(resolvedPath))) {
    issues.push({
      severity: "error",
      file: resolvedPath,
      message: "Source directory does not exist",
    });
    return buildResult(issues, 0);
  }

  const sourceProjectConfig = await loadProjectSourceConfig(resolvedPath);
  const skillsDirRelPath = sourceProjectConfig?.skillsDir ?? SKILLS_DIR_PATH;
  const skillsDir = path.join(resolvedPath, skillsDirRelPath);

  if (!(await directoryExists(skillsDir))) {
    issues.push({
      severity: "error",
      file: skillsDir,
      message: "Skills directory does not exist",
    });
    return buildResult(issues, 0);
  }

  // Phase 1: Check every skill directory has both SKILL.md and metadata.yaml
  const skillMdFiles = await glob(`**/${STANDARD_FILES.SKILL_MD}`, skillsDir);
  const metadataFiles = await glob(`**/${STANDARD_FILES.METADATA_YAML}`, skillsDir);

  const skillMdDirs = new Set(skillMdFiles.map((f) => path.dirname(f)));
  const metadataDirs = new Set(metadataFiles.map((f) => path.dirname(f)));

  issues.push(...validateSkillFilePairs(skillMdDirs, metadataDirs, skillsDir));

  // Phase 2: Validate each metadata.yaml against strict schema and conventions.
  // Pair violations were already reported by phase 1 — validate only complete pairs.
  const validMetadataFiles = metadataFiles.filter((f) => skillMdDirs.has(path.dirname(f)));
  for (const metadataFile of validMetadataFiles) {
    issues.push(...(await validateOneSkill(skillsDir, skillsDirRelPath, metadataFile)));
  }

  // Phase 3: Cross-reference validation via matrix health check
  issues.push(...(await checkCrossReferences(resolvedPath)));

  // Phases 4–6: optional source-repo targets — run in parallel
  // Phase 4: stack skill metadata + stack configs
  // Phase 5: agent metadata
  // Phase 6: config/*.ts runtime exports
  const extraIssues = await Promise.all([
    validateStacks(resolvedPath),
    validateAgents(resolvedPath),
    validateConfigFiles(resolvedPath),
  ]);
  issues.push(...extraIssues.flat());

  return buildResult(issues, validMetadataFiles.length);
}

/**
 * One complete skill pair, judged four ways: its metadata.yaml parses, its keys are camelCase,
 * it satisfies the strict published-skill schema, and its directory is named after the id its
 * SKILL.md declares. A file nothing can be parsed out of reports that and stops — every check
 * after it reads the parsed value, so each would only restate the same fault.
 */
async function validateOneSkill(
  skillsDir: string,
  skillsDirRelPath: string,
  metadataFile: string,
): Promise<SourceValidationIssue[]> {
  const relPath = path.join(skillsDirRelPath, metadataFile);

  let rawMetadata: unknown;
  try {
    rawMetadata = parseYaml(await readFile(path.join(skillsDir, metadataFile)));
  } catch (error) {
    return [
      {
        severity: "error",
        file: relPath,
        message: `Failed to parse YAML: ${getErrorMessage(error)}`,
      },
    ];
  }

  return [
    ...checkSnakeCaseKeys(rawMetadata, relPath),
    ...checkMetadataSchema(rawMetadata, relPath),
    // Independent of metadata validity — the id lives in SKILL.md frontmatter
    ...(await checkSkillDirName(skillsDir, skillsDirRelPath, path.dirname(metadataFile))),
  ];
}

/**
 * The strict published-skill schema's verdict, as its hard errors plus the one advisory
 * (over-length cliDescription) `splitMetadataValidationIssues` separates out.
 */
function checkMetadataSchema(rawMetadata: unknown, relPath: string): SourceValidationIssue[] {
  const result = validateSkillMetadata(rawMetadata);
  if (result.success) return [];

  const { errors, warnings } = splitMetadataValidationIssues(result.error, rawMetadata);
  return [
    ...errors.map((message) => ({ severity: "error" as const, file: relPath, message })),
    ...warnings.map((message) => ({ severity: "warning" as const, file: relPath, message })),
  ];
}

/**
 * Whether every relationship the source declares resolves to a skill it actually holds.
 * A source whose categories/rules could not be loaded is a warning rather than a failure: the
 * per-skill checks above already reported what they found, and this pass simply could not run.
 */
async function checkCrossReferences(resolvedPath: string): Promise<SourceValidationIssue[]> {
  try {
    await loadSkillsMatrixFromSource({ sourceFlag: resolvedPath, skipExtraSources: true });
    return checkMatrixHealth(matrix).map((healthIssue) => ({
      severity: healthIssue.severity,
      file: SKILL_CATEGORIES_PATH,
      message: healthIssue.details,
    }));
  } catch (error) {
    return [
      {
        severity: "warning",
        file: SKILL_CATEGORIES_PATH,
        message: `Cross-reference validation skipped: failed to load categories/rules: ${getErrorMessage(error)}`,
      },
    ];
  }
}

/**
 * Validates stack-embedded skill metadata.yaml files and stack config.yaml files.
 * Skips silently when src/stacks/ does not exist.
 */
async function validateStacks(resolvedPath: string): Promise<SourceValidationIssue[]> {
  const stacksDir = path.join(resolvedPath, DIRS.stacks);
  if (!(await directoryExists(stacksDir))) return [];

  const [skillMetaIssues, configIssues] = await Promise.all([
    validateYamlFiles({
      baseDir: stacksDir,
      relBaseDir: DIRS.stacks,
      pattern: `**/skills/**/${STANDARD_FILES.METADATA_YAML}`,
      schema: metadataValidationSchema,
    }),
    validateYamlFiles({
      baseDir: stacksDir,
      relBaseDir: DIRS.stacks,
      pattern: `*/${STANDARD_FILES.CONFIG_YAML}`,
      schema: stackConfigValidationSchema,
    }),
  ]);
  return [...skillMetaIssues, ...configIssues];
}

/**
 * Validates agent metadata.yaml files against the compiled agent output schema.
 * Skips silently when src/agents/ does not exist.
 */
async function validateAgents(resolvedPath: string): Promise<SourceValidationIssue[]> {
  const agentsDir = path.join(resolvedPath, DIRS.agents);
  if (!(await directoryExists(agentsDir))) return [];

  return validateYamlFiles({
    baseDir: agentsDir,
    relBaseDir: DIRS.agents,
    pattern: `**/${STANDARD_FILES.AGENT_METADATA_YAML}`,
    schema: agentYamlGenerationSchema,
  });
}

/**
 * Validates TypeScript config files (skill-categories.ts, skill-rules.ts, stacks.ts)
 * by runtime-loading them via loadConfig and validating the default export.
 * Skips silently when a file does not exist.
 */
async function validateConfigFiles(resolvedPath: string): Promise<SourceValidationIssue[]> {
  const results = await Promise.all([
    validateTsConfig(resolvedPath, SKILL_CATEGORIES_PATH, skillCategoriesFileSchema),
    validateTsConfig(resolvedPath, SKILL_RULES_PATH, skillRulesFileSchema),
    validateTsConfig(resolvedPath, STACKS_FILE_PATH, stacksConfigSchema),
  ]);
  return results.flat();
}

/**
 * Globs YAML files under baseDir and validates each against the given schema.
 * Reports parse errors, schema errors (as field-path messages), and uses relBaseDir
 * for display paths so issue locations match the project-relative form used elsewhere.
 */
async function validateYamlFiles(opts: {
  baseDir: string;
  relBaseDir: string;
  pattern: string;
  schema: z.ZodType<unknown>;
}): Promise<SourceValidationIssue[]> {
  const issues: SourceValidationIssue[] = [];
  const files = await glob(opts.pattern, opts.baseDir);

  for (const relFile of files) {
    const absPath = path.join(opts.baseDir, relFile);
    const displayPath = path.join(opts.relBaseDir, relFile);

    let parsed: unknown;
    try {
      parsed = parseYaml(await readFile(absPath));
    } catch {
      issues.push({ severity: "error", file: displayPath, message: "Failed to parse YAML" });
      continue;
    }

    const result = opts.schema.safeParse(parsed);
    if (result.success) continue;

    issues.push(
      ...formatZodErrors(result.error).map((message) => ({
        severity: "error" as const,
        file: displayPath,
        message,
      })),
    );
  }
  return issues;
}

/**
 * Runtime-loads a TypeScript config file via loadConfig and reports validation failures.
 * Absent files are not errors — only report when the file exists but fails to load or validate.
 *
 * loadConfig already unwraps the default export (via jiti's `{ default: true }` + interopDefault),
 * so a returned `null` means the module has no default export (named-only modules surface here).
 */
async function validateTsConfig(
  resolvedPath: string,
  relConfigPath: string,
  schema: z.ZodType<unknown>,
): Promise<SourceValidationIssue[]> {
  const absPath = path.join(resolvedPath, relConfigPath);
  if (!(await fileExists(absPath))) return [];

  try {
    const loaded = await loadConfig(absPath, schema);
    if (loaded === null) {
      return [{ severity: "error", file: relConfigPath, message: "Config has no default export" }];
    }
    return [];
  } catch (error) {
    return [
      { severity: "error", file: relConfigPath, message: formatLoadError(relConfigPath, error) },
    ];
  }
}

/**
 * Normalizes a loadConfig error so the message references the relative config path,
 * not the absolute path embedded by loadConfig's own template string.
 */
function formatLoadError(relConfigPath: string, error: unknown): string {
  const raw = getErrorMessage(error);
  const stripped = raw.replace(/Failed to load config from '[^']+':\s*/, "");
  return `Failed to load ${relConfigPath}: ${stripped}`;
}

function buildResult(issues: SourceValidationIssue[], skillCount: number): SourceValidationResult {
  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  return { issues, skillCount, errorCount, warningCount };
}
