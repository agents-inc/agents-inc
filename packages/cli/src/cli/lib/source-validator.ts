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
import { ConfigDefaultExportError, loadConfig, loadProjectSourceConfig } from "./configuration";
import { checkMatrixHealth, type MatrixHealthIssue } from "./matrix";
import { loadSkillsMatrixFromSource } from "./loading/source-loader";
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
 * Who this report is for, relative to the marketplace it is about.
 *
 * You are the `"author"` of the marketplace being validated when it IS the directory the command
 * ran in; a marketplace anywhere else — fetched, or on disk at another path — is one you are only
 * a `"consumer"` of. Not "is there a marketplace under the cwd": that says nothing about the OTHER
 * marketplace a config may point at, and the severity turns on the per-marketplace question.
 *
 * It changes one finding. A slug a marketplace's rules dangle is a typo its author can fix and
 * wants the run to fail on, and it is a defect a consumer cannot touch in a file they cannot open
 * — while every skill still installs and still resolves. Whether the reader holds push rights is
 * not knowable here and is not the test: a checkout under your cursor is a file you can edit.
 */
export type MarketplaceReader = "author" | "consumer";

/**
 * True when `dir` is itself a skills source repository — it carries the skills tree
 * `validateSource` walks, at `src/skills/` or wherever its own source config points.
 * A marketplace author's checkout answers yes; a consumer project answers no.
 */
export async function isSourceRepo(dir: string): Promise<boolean> {
  // ABORT on an unreadable config, and it is caught rather than fatal at both callers: `doctor`
  // reaches this through `safeCheck`, so the throw becomes a failed row instead of an aborted
  // command, and its other caller asks only where no config file exists at all.
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
 *
 * `reader` decides how loudly one of those findings is stated — see {@link MarketplaceReader}.
 * It defaults to `"author"`, the louder verdict: a caller that names nobody has said nothing
 * about who is reading, and under-reporting to the one person who can fix the file is the worse
 * of the two ways to be wrong.
 */
export async function validateSource(
  sourcePath: string,
  reader: MarketplaceReader = "author",
): Promise<SourceValidationResult> {
  const issues: SourceValidationIssue[] = [];

  const resolvedPath = path.isAbsolute(sourcePath) ? sourcePath : path.resolve(sourcePath);

  if (!(await directoryExists(resolvedPath))) {
    issues.push({
      severity: "error",
      file: resolvedPath,
      message: "Marketplace directory does not exist",
    });
    return buildResult(issues, 0);
  }

  // ABORT on an unreadable config, caught by `validateOneSource`, which turns it into an issue
  // against this marketplace. Defaulting past it would validate whatever sits at `src/skills/` and
  // call a marketplace whose skills live elsewhere empty.
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
  issues.push(...(await checkCrossReferences(resolvedPath, reader)));

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
 * Why a YAML file could not be read, in the parser's own words. Two phases refuse the same
 * way — the skill-pair scan and the stack/agent scan — and they printed different sentences
 * for a while, one carrying the cause and one dropping it; naming the message once is what
 * stops them diverging again.
 */
function yamlParseFailure(error: unknown): string {
  return `Failed to parse YAML: ${getErrorMessage(error)}`;
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
    return [{ severity: "error", file: relPath, message: yamlParseFailure(error) }];
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
 * The manifest as a reader of the report has to type it — the location half of the row
 * `doctor` prints, and therefore the file they open.
 */
const MARKETPLACE_MANIFEST_PATH = path.join(PLUGIN_MANIFEST_DIR, MARKETPLACE_JSON);

/**
 * Whether every relationship the source declares resolves to a skill it actually holds.
 * A load that did not complete is reported by {@link matrixLoadFailure}, which decides
 * whether the failure is this marketplace's fault or merely this pass's.
 */
async function checkCrossReferences(
  resolvedPath: string,
  reader: MarketplaceReader,
): Promise<SourceValidationIssue[]> {
  try {
    await loadSkillsMatrixFromSource({ sourceFlag: resolvedPath, skipExtraSources: true });
    return checkMatrixHealth(matrix).map((healthIssue) =>
      toSourceIssue(healthIssue, resolvedPath, reader),
    );
  } catch (error) {
    return [matrixLoadFailure(error)];
  }
}

/**
 * A load this pass could not complete, as the finding a reader can act on.
 *
 * Two answers, because the two failures are not one event. A manifest naming the
 * marketplace something Claude Code registers no plugin under leaves nothing here
 * installable, so it is this marketplace's own ERROR, against the file that holds the
 * name — without it the Marketplaces row counted such a marketplace as validated and
 * printed a tick beneath `doctor`'s own warning about that same file, and a warning above
 * a tick is what a reader stops believing. Everything else leaves the marketplace
 * installable and only leaves this pass unable to run, so it stays a warning against the
 * file it was reading. Read off the throw's TYPE, so nothing here matches on a sentence.
 */
function matrixLoadFailure(error: unknown): SourceValidationIssue {
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

/**
 * The audit manifest, as a path a reader can open. It is this CLI's own file rather than anything
 * in the marketplace being validated, and it has to be: the verdict a matrix contradicts is
 * recorded there and the marketplace holds no copy of it.
 */
const SKILL_AUDIT_PATH = "src/cli/lib/configuration/skill-audit.ts";

/**
 * The file a finding's defect is written in — the one `doctor` renders as the location half of the
 * line, and therefore the one the reader opens.
 *
 * Each answer is the file the check actually reads, which is not always the file its name suggests:
 *
 * - a category and the `domain` it omits are both declared in the categories file, and a skill
 *   naming a category nothing defines is the same file short an entry (its own metadata.yaml is
 *   the other half of that fix, and the message already names the skill);
 * - every relation a resolved skill carries comes from the rules file — no metadata.yaml declares
 *   one — so an unresolved reference and the dangling slug behind it are both written there;
 * - a verdict, recorded or missing, is the audit manifest's.
 *
 * Exhaustive on purpose: a seventh finding kind will not compile until someone decides where its
 * defect lives, which is the property one path shared by all six had already lost.
 */
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

/**
 * One health finding as this reader should hear it. Every kind but one is reported at the
 * severity the health check gave it — that severity is a property of the defect. The exception
 * is the slug a marketplace's own rules dangle, which is a property of the defect AND of who is
 * looking: a typo the author can fix, and a file the consumer cannot open.
 *
 * The reader moves the severity and the wording; it never moves the file, because which file holds
 * the defect is not a fact about who is reading.
 */
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

/**
 * The same finding, addressed to someone who did not write the rule. It leads with the
 * marketplace because that is the part the slug alone does not tell them, and it says outright
 * that there is nothing here to fix — a warning that sends a reader hunting through their own
 * project for a typo in a file they do not own is worse than no warning at all.
 */
function consumedMarketplaceMessage(marketplacePath: string, details: string): string {
  return `Marketplace '${marketplacePath}': ${details}. Nothing to fix here — the rule is that marketplace's, not this project's`;
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
 * Validates each hand-authored agent `metadata.yaml` under `DIRS.agents` against
 * `agentYamlGenerationSchema` — compilation's INPUT schema rather than an output one, since
 * compiling an agent writes one `.md` file and no YAML at all. Skips silently when src/agents/
 * does not exist.
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
    } catch (error) {
      issues.push({ severity: "error", file: displayPath, message: yamlParseFailure(error) });
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
 * The two ways a file can say nothing are reported apart, because the author's next move differs
 * and they used to arrive wearing each other's words. A `null` is a file that exported nothing at
 * all; a module that exported only named bindings raises {@link ConfigDefaultExportError}, which
 * is the one this file's own config files get wrong — `export const skillRules = {...}` reads to
 * `loadConfig` as a namespace, and validating THAT against the schema reports whichever field the
 * schema names first as missing from a file the author can see it in.
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
