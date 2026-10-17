import path from "path";
import { isRecord } from "../utils/type-guards.js";
import { parse as parseYaml } from "yaml";
import { z } from "zod";
import { glob, readFile, fileExists, directoryExists } from "../utils/fs";
import {
  DIRS,
  MARKETPLACE_JSON,
  PLUGIN_MANIFEST_DIR,
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
import { ConfigDefaultExportError, loadConfig, loadSourceRepoConfig } from "./configuration";
import type { MatrixHealthIssue } from "./matrix";
import { matrixHealthIssues } from "./matrix/matrix-health-check";
import {
  loadSkillsMatrixFromSource,
  MarketplaceManifestRequiredError,
} from "./loading/source-loader";
import { MarketplaceNameRefusedError } from "./loading/source-fetcher";
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
 * `"author"` when the marketplace IS the directory the command ran in, else `"consumer"`. It
 * changes one finding: a dangling rule slug is the author's to fix and a consumer's to ignore.
 */
export type MarketplaceReader = "author" | "consumer";

/** True when `dir` carries a skills tree, at `src/skills/` or where its source config points. */
export async function isSourceRepo(dir: string): Promise<boolean> {
  // Aborts on an unreadable config; `doctor` catches it via `safeCheck`.
  const sourceConfig = await loadSourceRepoConfig(dir);
  return directoryExists(path.join(dir, sourceConfig?.skillsDir ?? SKILLS_DIR_PATH));
}

export function isSnakeCase(key: string): boolean {
  return /[a-z]_[a-z]/.test(key);
}

/** Non-object input yields no issues. */
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

/** A warning, not an error: the loader still registers the skill by its id. */
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

/** Reports that the check could not run when the id cannot be read. */
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

/** `reader` sets how loud findings are; default `"author"`, as under-reporting is worse. */
export async function validateSource(
  sourcePath: string,
  reader: MarketplaceReader = "author",
): Promise<SourceValidationResult> {
  const resolvedPath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(sourcePath);

  if (!(await directoryExists(resolvedPath))) {
    return buildResult(
      [{ severity: "error", file: resolvedPath, message: "Marketplace directory does not exist" }],
      0,
    );
  }

  // Aborts on an unreadable config; `validateOneSource` turns it into an issue.
  const sourceProjectConfig = await loadSourceRepoConfig(resolvedPath);
  const skillsDirRelPath = sourceProjectConfig?.skillsDir ?? SKILLS_DIR_PATH;
  const skillsDir = path.join(resolvedPath, skillsDirRelPath);

  if (!(await directoryExists(skillsDir))) {
    return buildResult(
      [{ severity: "error", file: skillsDir, message: "Skills directory does not exist" }],
      0,
    );
  }

  const skillMdFiles = await glob(`**/${STANDARD_FILES.SKILL_MD}`, skillsDir);
  const metadataFiles = await glob(`**/${STANDARD_FILES.METADATA_YAML}`, skillsDir);

  const skillMdDirs = new Set(skillMdFiles.map((f) => path.dirname(f)));
  const metadataDirs = new Set(metadataFiles.map((f) => path.dirname(f)));

  const pairIssues = validateSkillFilePairs(skillMdDirs, metadataDirs, skillsDir);

  // Pair violations were reported above; validate only complete pairs.
  const validMetadataFiles = metadataFiles.filter((f) => skillMdDirs.has(path.dirname(f)));
  const skillIssues = await validateSkillsInTurn(skillsDir, skillsDirRelPath, validMetadataFiles);

  const crossReferenceIssues = await checkCrossReferences(resolvedPath, reader);

  // Optional source-repo targets, in parallel: stacks, agents, config/*.ts exports.
  const extraIssues = await Promise.all([
    validateStacks(resolvedPath),
    validateAgents(resolvedPath),
    validateConfigFiles(resolvedPath),
  ]);

  return buildResult(
    [...pairIssues, ...skillIssues, ...crossReferenceIssues, ...extraIssues.flat()],
    validMetadataFiles.length,
  );
}

async function validateSkillsInTurn(
  skillsDir: string,
  skillsDirRelPath: string,
  metadataFiles: string[],
): Promise<SourceValidationIssue[]> {
  const issues: SourceValidationIssue[] = [];
  for (const metadataFile of metadataFiles) {
    issues.push(...(await validateOneSkill(skillsDir, skillsDirRelPath, metadataFile)));
  }
  return issues;
}

/** Named once so both YAML-reading phases word the failure alike. */
function yamlParseFailure(error: unknown): string {
  return `Failed to parse YAML: ${getErrorMessage(error)}`;
}

/** An unparseable file reports that and stops: every later check reads the parsed value. */
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
    return [{ severity: "error", file: relPath, message: yamlParseFailure(error) }];
  }

  return [
    ...checkSnakeCaseKeys(rawMetadata, relPath),
    ...checkMetadataSchema(rawMetadata, relPath),
    // Independent of metadata validity — the id lives in SKILL.md frontmatter
    ...(await checkSkillDirName(skillsDir, skillsDirRelPath, path.dirname(metadataFile))),
  ];
}

function checkMetadataSchema(rawMetadata: unknown, relPath: string): SourceValidationIssue[] {
  const result = validateSkillMetadata(rawMetadata);
  if (result.success) return [];

  const { errors, warnings } = splitMetadataValidationIssues(result.error, rawMetadata);
  return [
    ...errors.map((message) => ({ severity: "error" as const, file: relPath, message })),
    ...warnings.map((message) => ({ severity: "warning" as const, file: relPath, message })),
  ];
}

/** As a reader types it: the file `doctor` tells them to open. */
const MARKETPLACE_MANIFEST_PATH = path.join(PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON);

/** Keyed on the whole reader union, so a new reader does not compile until someone decides. */
const MANIFEST_REQUIRED_SEVERITY = {
  author: "warning",
  consumer: "error",
} as const satisfies Record<MarketplaceReader, SourceValidationIssue["severity"]>;

/** Files the load's health findings without saying them again. */
async function checkCrossReferences(
  resolvedPath: string,
  reader: MarketplaceReader,
): Promise<SourceValidationIssue[]> {
  try {
    await loadSkillsMatrixFromSource({ sourceFlag: resolvedPath, skipExtraSources: true });
    return matrixHealthIssues(matrix).map((healthIssue) =>
      toSourceIssue(healthIssue, resolvedPath, reader),
    );
  } catch (error) {
    return [matrixLoadFailure(error, reader)];
  }
}

/**
 * No valid manifest: the manifest's finding, at the reader's severity. A refused name: this
 * marketplace's error, since nothing installs. Anything else: a warning. Read off the throw's type.
 */
function matrixLoadFailure(error: unknown, reader: MarketplaceReader): SourceValidationIssue {
  if (error instanceof MarketplaceManifestRequiredError) {
    return {
      severity: MANIFEST_REQUIRED_SEVERITY[reader],
      file: MARKETPLACE_MANIFEST_PATH,
      message: getErrorMessage(error),
    };
  }

  if (error instanceof MarketplaceNameRefusedError) {
    return {
      severity: "error",
      file: MARKETPLACE_MANIFEST_PATH,
      message: getErrorMessage(error),
    };
  }

  return {
    severity: "warning",
    file: SKILL_CATEGORIES_PATH,
    message: `Cross-reference validation skipped: failed to load categories/rules: ${getErrorMessage(error)}`,
  };
}

/** This CLI's own file: the marketplace holds no copy of the verdicts. */
const SKILL_AUDIT_PATH = "src/cli/lib/configuration/skill-audit.ts";

/** The file the defect is in, as `doctor` shows it; exhaustive, so new kinds must choose. */
function fileHoldingDefect(finding: MatrixHealthIssue["finding"]): string {
  switch (finding) {
    case "category-missing-domain":
    case "skill-unknown-category":
      return SKILL_CATEGORIES_PATH;
    case "skill-unresolved-relation-ref":
    case "rule-unresolved-slug":
      return SKILL_RULES_PATH;
    case "audit-verdict-contradiction":
    case "skill-unaudited":
      return SKILL_AUDIT_PATH;
    default: {
      const exhaustive: never = finding;
      return exhaustive;
    }
  }
}

/** Only a marketplace's own dangling rule slug moves with the reader; the file never does. */
function toSourceIssue(
  healthIssue: MatrixHealthIssue,
  marketplacePath: string,
  reader: MarketplaceReader,
): SourceValidationIssue {
  const file = fileHoldingDefect(healthIssue.finding);

  if (reader === "consumer" && healthIssue.finding === "rule-unresolved-slug") {
    return {
      severity: "warning",
      file,
      message: consumedMarketplaceMessage(marketplacePath, healthIssue.details),
    };
  }

  return {
    severity: healthIssue.severity,
    file,
    message: healthIssue.details,
  };
}

/** Leads with the marketplace and says there is nothing here for the reader to fix. */
function consumedMarketplaceMessage(marketplacePath: string, details: string): string {
  return `Marketplace '${marketplacePath}': ${details}. Nothing to fix here — the rule is that marketplace's, not this project's`;
}

/** Skips silently when src/stacks/ does not exist. */
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

/** Against compilation's input schema (compiling writes no YAML); skips a missing src/agents/. */
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

/** Runtime-loads each config/*.ts and validates its default export; absent files are skipped. */
async function validateConfigFiles(resolvedPath: string): Promise<SourceValidationIssue[]> {
  const results = await Promise.all([
    validateTsConfig(resolvedPath, SKILL_CATEGORIES_PATH, skillCategoriesFileSchema),
    validateTsConfig(resolvedPath, SKILL_RULES_PATH, skillRulesFileSchema),
    validateTsConfig(resolvedPath, STACKS_FILE_PATH, stacksConfigSchema),
  ]);
  return results.flat();
}

/** One kind of YAML file a source may carry: where it lives, and the schema each must satisfy. */
type YamlFileScan = {
  baseDir: string;
  /** `baseDir` in the project-relative form issues report. */
  relBaseDir: string;
  pattern: string;
  schema: z.ZodType<unknown>;
};

async function validateYamlFiles(scan: YamlFileScan): Promise<SourceValidationIssue[]> {
  const issues: SourceValidationIssue[] = [];
  const files = await glob(scan.pattern, scan.baseDir);

  for (const relFile of files) {
    issues.push(...(await validateYamlFile(scan, relFile)));
  }
  return issues;
}

async function validateYamlFile(
  scan: YamlFileScan,
  relFile: string,
): Promise<SourceValidationIssue[]> {
  const displayPath = path.join(scan.relBaseDir, relFile);

  let parsed: unknown;
  try {
    parsed = parseYaml(await readFile(path.join(scan.baseDir, relFile)));
  } catch (error) {
    return [{ severity: "error", file: displayPath, message: yamlParseFailure(error) }];
  }

  const result = scan.schema.safeParse(parsed);
  if (result.success) return [];

  return formatZodErrors(result.error).map((message) => ({
    severity: "error" as const,
    file: displayPath,
    message,
  }));
}

/** `null` (exported nothing) and named-only exports are reported apart, since the fixes differ. */
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
      return [{ severity: "error", file: relConfigPath, message: "Config is empty" }];
    }
    return [];
  } catch (error) {
    if (error instanceof ConfigDefaultExportError) {
      return [{ severity: "error", file: relConfigPath, message: "Config has no default export" }];
    }
    return [
      { severity: "error", file: relConfigPath, message: formatLoadError(relConfigPath, error) },
    ];
  }
}

/** References the relative config path, not the absolute one loadConfig embeds. */
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
