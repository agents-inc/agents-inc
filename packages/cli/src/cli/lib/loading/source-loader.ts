import os from "os";
import { partition, unique } from "remeda";
import path from "path";
import {
  EJECT_SOURCE,
  MARKETPLACE_JSON,
  PROJECT_ROOT,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  SKILLS_DIR_PATH,
  LOCAL_PSEUDO_CATEGORY,
  STANDARD_FILES,
  type Provider,
} from "../../consts";
import { defaultCategories } from "../configuration/default-categories";
import { defaultStacks } from "../configuration/default-stacks";
import { isHomeDirectory } from "../installation/is-home-directory";
import { LOCAL_DEFAULTS, METADATA_KEYS } from "../metadata-keys";
import type {
  AgentName,
  CategoryDefinition,
  CategoryMap,
  CategoryPath,
  Domain,
  ExtractedSkillMetadata,
  MergedSkillsMatrix,
  ResolvedSkill,
  ResolvedStack,
  SkillAssignment,
  SkillConfig,
  SkillId,
  SkillRulesConfig,
  SkillScope,
  Stack,
  StackAgentConfig,
  Category,
} from "../../types";
import { getErrorMessage } from "../../utils/errors";
import { fileExists } from "../../utils/fs";
import { sayingEachWarningOnce, verbose, warn } from "../../utils/logger";
import { marketplaceManifestMissing, marketplaceManifestUnreadable } from "../../utils/messages";
import { isAgentName } from "../../utils/type-guards";
import { typedEntries, typedFromEntries, typedKeys, typedValues } from "../../utils/typed-object";
import {
  isDefaultSource,
  isLocalSource,
  isPublicCatalogueCheckout,
  loadGlobalSourceConfig,
  loadSourceRepoConfig,
  offersBuiltInStacks,
  resolveSource,
  type ResolvedConfig,
  type SourceCaller,
} from "../configuration";
import { discoverLocalSkills, type LocalSkillDiscoveryResult } from "../skills";
import {
  checkMatrixHealth,
  claimSlug,
  extractAllSkills,
  loadSkillCategories,
  loadSkillRules,
  mergeMatrixWithSkills,
  relationshipsForSource,
} from "../matrix";
import { validateLoadedMarketplaceName } from "../marketplace-generator";
import {
  fetchFromSource,
  fetchMarketplace,
  MarketplaceManifestAbsentError,
  MarketplaceNameRefusedError,
} from "./source-fetcher";
import { loadSkillsFromAllSources, marketplaceSource } from "./multi-source-loader";
import { loadStacks, resolveAgentConfigToSkills } from "../stacks";
import { initializeMatrix, matrix as currentMatrix } from "../matrix/matrix-provider";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";

/** `"fetch"` refuses a non-default marketplace without a valid manifest; `"upkeep"` goes on. */
type SourceLoadPurpose = "fetch" | "upkeep";

type SourceLoadOptions = {
  /** Defaults to `"fetch"`. */
  purpose?: SourceLoadPurpose;
  /** Defaults to `"stored"`, so the environment rung is never reached by omission. */
  caller?: SourceCaller;
  sourceFlag?: string;
  projectDir?: string;
  /** Whose config and copied-in skills are read, where a scope holds two installations. */
  provider?: Provider;
  devMode?: boolean;
  skipExtraSources?: boolean;
  /** For the default source, skips the clone so the load stays offline; `sourcePath` is empty. */
  matrixOnly?: boolean;
};

export type SourceLoadResult = {
  matrix: MergedSkillsMatrix;
  sourceConfig: ResolvedConfig;
  sourcePath: string;
  isLocal: boolean;
  /** The marketplace could not be reached, so `sourcePath` is its cached copy, of unknown age. */
  unreachable: boolean;
  marketplace?: string;
  /** The only skills `sourcePath` has files for; the matrix also holds local and global ones. */
  marketplaceSkillIds: ReadonlySet<SkillId>;
};

/** A marketplace's catalogue as read, before anything on this machine joins its matrix. */
type CatalogueRead = Omit<SourceLoadResult, "marketplaceSkillIds">;

/** Says each warning once per run: a global change reloads the same files per project. */
export function loadSkillsMatrixFromSource(
  options: SourceLoadOptions = {},
): Promise<SourceLoadResult> {
  return sayingEachWarningOnce(() => loadCatalogue(options));
}

async function loadCatalogue(options: SourceLoadOptions): Promise<SourceLoadResult> {
  const {
    purpose = "fetch",
    caller = "stored",
    sourceFlag,
    projectDir,
    provider,
    devMode = false,
    matrixOnly = false,
  } = options;

  // Aborts on an unreadable config: every skill resolves against the marketplace named here.
  const sourceConfig = await resolveSource({ caller, flag: sourceFlag, projectDir, provider });
  const { source } = sourceConfig;

  verbose(`Loading skills from source: ${source}`);

  const catalogue = await resolveBaseResult(sourceConfig, { purpose, devMode, matrixOnly });

  const resolvedProjectDir = projectDir || process.cwd();

  // Read before any local merge, after which a skill's provenance is no longer legible.
  const result: SourceLoadResult = {
    ...catalogue,
    marketplaceSkillIds: new Set(typedKeys<SkillId>(catalogue.matrix.skills)),
  };

  result.matrix = await mergeLocalSkills(result.matrix, resolvedProjectDir, provider);
  await seatGlobalInstallationSkills(result.matrix, source, purpose);

  if (!options.skipExtraSources) {
    await loadSkillsFromAllSources(
      result.matrix,
      sourceConfig,
      resolvedProjectDir,
      result.marketplace,
      idsOutsideMarketplace(result.matrix, result.marketplaceSkillIds),
    );
  }

  checkMatrixHealth(result.matrix);
  initializeMatrix(result.matrix);

  return result;
}

/**
 * Seats the global installation's plugin skills this catalogue lacks, from the marketplace that
 * installation was made from (a plugin leaves no local copy to merge). Seated entries carry no
 * relationships: they are shown and compiled, never picked against.
 */
async function seatGlobalInstallationSkills(
  matrix: MergedSkillsMatrix,
  loadedSource: string,
  purpose: SourceLoadPurpose,
): Promise<void> {
  const uncarried = await globalPluginSkillsUncarried(matrix);
  if (uncarried.length === 0) return;

  const globalCatalogue = await loadGlobalInstallationCatalogue(loadedSource, purpose);
  if (globalCatalogue === null) return;

  for (const id of uncarried) seatFromCatalogue(matrix, globalCatalogue, id);
}

/** Degrades on an unreadable global config: its skills simply stay unseated. */
async function globalPluginSkillsUncarried(matrix: MergedSkillsMatrix): Promise<SkillId[]> {
  try {
    const globalConfig = await loadGlobalSourceConfig();
    return (globalConfig?.skills ?? [])
      .filter(isActivePlugin)
      .filter((skill) => matrix.skills[skill.id] === undefined)
      .map((skill) => skill.id);
  } catch (error) {
    verbose(`Global installation's skills not seated — ${getErrorMessage(error)}`);
    return [];
  }
}

/** An entry still configured, installed as a marketplace's plugin rather than ejected. */
function isActivePlugin(skill: SkillConfig): boolean {
  return !skill.excluded && skill.origin !== EJECT_SOURCE;
}

/**
 * Null when it is the one already loaded, or when it cannot load (the skills then stay unseated).
 */
async function loadGlobalInstallationCatalogue(
  loadedSource: string,
  purpose: SourceLoadPurpose,
): Promise<CatalogueRead | null> {
  try {
    const globalSourceConfig = await resolveSource({ caller: "stored", projectDir: os.homedir() });
    if (globalSourceConfig.source === loadedSource) return null;
    return await resolveBaseResult(globalSourceConfig, {
      purpose,
      devMode: false,
      matrixOnly: true,
    });
  } catch (error) {
    verbose(`Global installation's marketplace not loaded — ${getErrorMessage(error)}`);
    return null;
  }
}

/** One global skill, as its own catalogue holds it, carried under its own marketplace's name. */
function seatFromCatalogue(
  matrix: MergedSkillsMatrix,
  catalogue: CatalogueRead,
  id: SkillId,
): void {
  const skill = catalogue.matrix.skills[id];
  // Withdrawn from its own marketplace too, so absent is the truth and the session says so.
  if (!skill) return;

  matrix.skills[id] = asSeatedGlobalSkill(skill, catalogue);
  claimSlug(matrix.slugMap, skill.slug, id);
  carryCategory(matrix, catalogue.matrix, skill.category);
}

/** The entry as a session here shows and compiles it: none of its relationships, its own name. */
function asSeatedGlobalSkill(skill: ResolvedSkill, catalogue: CatalogueRead): ResolvedSkill {
  return {
    ...skill,
    conflictsWith: [],
    requires: [],
    alternatives: [],
    discourages: [],
    availableSources: [marketplaceSource(catalogue.sourceConfig, catalogue.marketplace)],
  };
}

/** A category the matrix lacks arrives with the skill placed in it; `local` is never defined. */
function carryCategory(
  matrix: MergedSkillsMatrix,
  from: MergedSkillsMatrix,
  categoryId: CategoryPath,
): void {
  if (categoryId === LOCAL_PSEUDO_CATEGORY || matrix.categories[categoryId]) return;
  const category = from.categories[categoryId];
  if (category) matrix.categories[categoryId] = category;
}

/**
 * Merged-in skills the marketplace never offered, which the tagging pass must leave its entry off.
 */
function idsOutsideMarketplace(
  matrix: MergedSkillsMatrix,
  marketplaceSkillIds: ReadonlySet<SkillId>,
): ReadonlySet<SkillId> {
  return new Set(typedKeys<SkillId>(matrix.skills).filter((id) => !marketplaceSkillIds.has(id)));
}

/**
 * Copies every collection the local merge writes to, so `BUILT_IN_MATRIX` itself is never mutated.
 */
function copyOfBuiltInMatrix(): MergedSkillsMatrix {
  return {
    ...BUILT_IN_MATRIX,
    skills: { ...BUILT_IN_MATRIX.skills },
    categories: { ...BUILT_IN_MATRIX.categories },
    suggestedStacks: [...BUILT_IN_MATRIX.suggestedStacks],
    slugMap: {
      slugToId: { ...BUILT_IN_MATRIX.slugMap.slugToId },
    },
  };
}

type BaseLoadOptions = Required<Pick<SourceLoadOptions, "purpose" | "devMode" | "matrixOnly">>;

/** A `matrixOnly` load of the default source reads the built-in matrix and fetches nothing. */
const NOTHING_FETCHED = { path: "", unreachable: false } as const;

async function resolveBaseResult(
  sourceConfig: ResolvedConfig,
  { purpose, devMode, matrixOnly }: BaseLoadOptions,
): Promise<CatalogueRead> {
  refuseReservedRecordedName(sourceConfig);
  const { source } = sourceConfig;
  if (isDefaultSource(source) && !devMode) {
    // Default source: BUILT_IN_MATRIX, still fetching (cached) for sourcePath unless matrixOnly.
    const fetched = matrixOnly ? NOTHING_FETCHED : await fetchFromSource(source);
    return {
      matrix: copyOfBuiltInMatrix(),
      sourceConfig,
      sourcePath: fetched.path,
      isLocal: false,
      unreachable: fetched.unreachable,
      ...(sourceConfig.marketplace !== undefined && { marketplace: sourceConfig.marketplace }),
    };
  }

  const isLocal = isLocalSource(source) || devMode;
  return isLocal
    ? loadFromLocal(source, sourceConfig, purpose)
    : loadFromRemote(source, sourceConfig, purpose);
}

/** The file to correct is the config that recorded the name, not the manifest. */
function recordedNameWayOut(configPath: string): string {
  return `set this installation up again, or correct the marketplaceName it recorded in '${configPath}'`;
}

/** The recorded name outranks the manifest's, so it is checked against the reserved list too. */
function refuseReservedRecordedName({ marketplace, marketplaceRecordedIn }: ResolvedConfig): void {
  if (marketplace === undefined) return;
  const reservedName = validateLoadedMarketplaceName(
    marketplace,
    recordedNameWayOut(marketplaceRecordedIn),
  );
  if (reservedName) throw new MarketplaceNameRefusedError(reservedName);
}

type MarketplaceLabels = Pick<SourceLoadResult, "marketplace">;

/** Absent and unreadable stay apart so a refusal can carry the reason; a refused name too. */
type ManifestState =
  | { kind: "absent" }
  | { kind: "refused"; reason: string }
  | { kind: "unreadable"; reason: string }
  | { kind: "named"; name: string };

/** Read off the throw's type, never its text. */
async function readManifestState(source: string): Promise<ManifestState> {
  try {
    const { marketplace } = await fetchMarketplace(source);
    return { kind: "named", name: marketplace.name };
  } catch (error) {
    if (error instanceof MarketplaceManifestAbsentError) return { kind: "absent" };
    if (error instanceof MarketplaceNameRefusedError) {
      return { kind: "refused", reason: getErrorMessage(error) };
    }
    return { kind: "unreadable", reason: getErrorMessage(error) };
  }
}

/** A type, so `doctor` can file it at the reader's severity without matching text. */
export class MarketplaceManifestRequiredError extends Error {}

/** A manifest this load could not name the marketplace from. */
type ManifestUnusable = Extract<ManifestState, { kind: "absent" | "unreadable" }>;

/** A recorded `marketplace` wins. All but `named` abort a `"fetch"` of a non-default one. */
async function resolveMarketplaceLabels(
  manifestRoot: string,
  sourceConfig: ResolvedConfig,
  purpose: SourceLoadPurpose,
): Promise<MarketplaceLabels> {
  const state = await readManifestState(manifestRoot);

  switch (state.kind) {
    case "named": {
      const marketplace = sourceConfig.marketplace ?? state.name;
      verbose(`Using marketplace name from ${MARKETPLACE_JSON}: ${marketplace}`);
      return { marketplace };
    }
    case "refused":
      throw new MarketplaceNameRefusedError(state.reason);
    case "absent":
    case "unreadable":
      return labelWithoutManifest(state, sourceConfig, purpose);
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
}

/** Keeps the recorded label when the load may go on; otherwise refuses, naming the builds. */
function labelWithoutManifest(
  state: ManifestUnusable,
  sourceConfig: ResolvedConfig,
  purpose: SourceLoadPurpose,
): MarketplaceLabels {
  const { source } = sourceConfig;
  if (goesOnWithoutManifest(source, purpose)) {
    verbose(`'${source}' has no usable ${MARKETPLACE_JSON}; keeping the label its config recorded`);
    return configuredLabel(sourceConfig);
  }

  throw new MarketplaceManifestRequiredError(
    state.kind === "absent"
      ? marketplaceManifestMissing(source)
      : marketplaceManifestUnreadable(source, state.reason),
  );
}

/** The default catalogue (dev mode reads `PROJECT_ROOT`, which ships none) and `"upkeep"`. */
function goesOnWithoutManifest(source: string, purpose: SourceLoadPurpose): boolean {
  return isDefaultSource(source) || purpose === "upkeep";
}

/** The label a config already recorded, which outlives a manifest this load could not name. */
function configuredLabel(sourceConfig: ResolvedConfig): MarketplaceLabels {
  return sourceConfig.marketplace === undefined ? {} : { marketplace: sourceConfig.marketplace };
}

/**
 * Global local skills first, then the project's, so the project's win on conflict. Both are read
 * off `provider`'s installation, as a project inherits the global installation of its own provider.
 */
async function mergeLocalSkills(
  matrix: MergedSkillsMatrix,
  projectDir: string,
  provider: Provider | undefined,
): Promise<MergedSkillsMatrix> {
  const withGlobal = isHomeDirectory(projectDir)
    ? matrix
    : await mergeDiscoveredLocalSkills(matrix, os.homedir(), "global", provider);
  return mergeDiscoveredLocalSkills(withGlobal, projectDir, "project", provider);
}

/** Merges any discovered local skills for `dir` into the matrix, logging the find. */
async function mergeDiscoveredLocalSkills(
  matrix: MergedSkillsMatrix,
  dir: string,
  label: SkillScope,
  provider: Provider | undefined,
): Promise<MergedSkillsMatrix> {
  const discovered = await discoverLocalSkills(dir, provider);
  if (!discovered || discovered.skills.length === 0) return matrix;
  verbose(
    `Found ${discovered.skills.length} ${label} local skill(s) in ${discovered.localSkillsPath}`,
  );
  return mergeLocalSkillsIntoMatrix(matrix, discovered);
}

async function loadFromLocal(
  source: string,
  sourceConfig: ResolvedConfig,
  purpose: SourceLoadPurpose,
): Promise<CatalogueRead> {
  // Through `fetchFromSource`, so an unreadable named path is refused rather than read as empty.
  const skillsPath = isLocalSource(source) ? (await fetchFromSource(source)).path : PROJECT_ROOT;

  verbose(`Loading skills from local path: ${skillsPath}`);

  const mergedMatrix = await loadAndMergeFromBasePath(skillsPath, source);
  const labels = await resolveMarketplaceLabels(skillsPath, sourceConfig, purpose);

  return {
    matrix: mergedMatrix,
    sourceConfig,
    sourcePath: skillsPath,
    isLocal: true,
    unreachable: false,
    ...labels,
  };
}

async function loadFromRemote(
  source: string,
  sourceConfig: ResolvedConfig,
  purpose: SourceLoadPurpose,
): Promise<CatalogueRead> {
  verbose(`Fetching skills from remote source: ${source}`);

  const fetchResult = await fetchFromSource(source);

  verbose(`Fetched to: ${fetchResult.path}`);

  const mergedMatrix = await loadAndMergeFromBasePath(fetchResult.path, source);
  const labels = await resolveMarketplaceLabels(source, sourceConfig, purpose);

  return {
    matrix: mergedMatrix,
    sourceConfig,
    sourcePath: fetchResult.path,
    isLocal: false,
    unreachable: fetchResult.unreachable,
    ...labels,
  };
}

/** An author's load: no local merge, or the catalogue would carry one machine's skills. */
export async function loadMarketplaceMatrix(marketplaceDir: string): Promise<MergedSkillsMatrix> {
  const matrix = await loadAndMergeFromBasePath(marketplaceDir, marketplaceDir);
  return { ...matrix, categories: categoriesTheseSkillsAreIn(matrix) };
}

/** Read off the skills, so the catalogue claims no category the marketplace ships nothing in. */
function categoriesTheseSkillsAreIn(matrix: MergedSkillsMatrix): CategoryMap {
  const occupied = new Set<CategoryPath>(typedValues(matrix.skills).map((skill) => skill.category));

  return typedFromEntries(
    typedEntries<Category, CategoryDefinition>(matrix.categories).filter(([id]) =>
      occupied.has(id),
    ),
  );
}

/** `source` is the string `basePath` stands for: the only word for which marketplace it is. */
async function loadAndMergeFromBasePath(
  basePath: string,
  source: string,
): Promise<MergedSkillsMatrix> {
  // Aborts on an unreadable config: it declares where the skills and stacks live.
  const sourceProjectConfig = await loadSourceRepoConfig(basePath);

  const skillsDirRelPath = sourceProjectConfig?.skillsDir ?? SKILLS_DIR_PATH;
  const stacksRelFile = sourceProjectConfig?.stacksFile;

  const { categories, sourceRules } = await loadSourceTaxonomy(basePath);

  const skillsDir = path.join(basePath, skillsDirRelPath);
  verbose(`Skills from source: ${skillsDir}`);

  const skills = await extractAllSkills(skillsDir);
  await refuseCatalogueCollisions(basePath, source, skills);

  const relationships = relationshipsForSource(skills, sourceRules);
  const mergedMatrix = mergeMatrixWithSkills(categories, relationships, skills);
  initializeMatrix(mergedMatrix);

  // Assigned unconditionally: a source offering no stacks is a matrix carrying none.
  const stacks = await resolveOfferedStacks(basePath, stacksRelFile, source);
  mergedMatrix.suggestedStacks = stacks.map((stack) => convertStackToResolvedStack(stack));

  return mergedMatrix;
}

/** What a source declares about its skills' taxonomy, beside the CLI's own. */
type SourceTaxonomy = {
  /** The CLI's built-in categories, with the source's own layered over them where it has any. */
  categories: CategoryMap;
  /** The source's own relationship rules, unmerged. */
  sourceRules: SkillRulesConfig | undefined;
};

/** Either file may be absent; categories layer over the built-ins, rules come back as they are. */
async function loadSourceTaxonomy(basePath: string): Promise<SourceTaxonomy> {
  const sourceCategories = await loadSourceCategories(basePath);
  const sourceRules = await loadSourceRules(basePath);

  if (sourceCategories !== undefined || sourceRules !== undefined) {
    verbose(`Matrix merged: CLI (${typedKeys(defaultCategories).length} categories) + source`);
  } else {
    verbose(`Matrix from CLI only (source has no categories/rules files)`);
  }

  const categories: CategoryMap = sourceCategories
    ? { ...defaultCategories, ...sourceCategories }
    : defaultCategories;
  return { categories, sourceRules };
}

/** Undefined when the source ships no categories file. */
async function loadSourceCategories(basePath: string): Promise<CategoryMap | undefined> {
  const categoriesPath = path.join(basePath, SKILL_CATEGORIES_PATH);
  if (!(await fileExists(categoriesPath))) return undefined;

  const categories = await loadSkillCategories(categoriesPath);
  verbose(
    `Loaded source categories: ${categoriesPath} (${typedKeys(categories).length} categories)`,
  );
  return categories;
}

/** Undefined when the source ships no rules file. */
async function loadSourceRules(basePath: string): Promise<SkillRulesConfig | undefined> {
  const rulesPath = path.join(basePath, SKILL_RULES_PATH);
  if (!(await fileExists(rulesPath))) return undefined;

  const rules = await loadSkillRules(rulesPath);
  verbose(`Loaded source rules: ${rulesPath}`);
  return rules;
}

/** Every skill id the shipped catalogue owns — the ids no other marketplace may take. */
const CATALOGUE_SKILL_IDS: ReadonlySet<SkillId> = new Set(typedKeys(BUILT_IN_MATRIX.skills));

/** How many colliding ids a refusal lists before summarising the rest. */
const MAX_REPORTED_COLLISIONS = 10;

/** Refuses the whole source: colliding ids would silently shadow the catalogue's on disk. */
async function refuseCatalogueCollisions(
  basePath: string,
  source: string,
  skills: ExtractedSkillMetadata[],
): Promise<void> {
  const collidingIds = skills.map((skill) => skill.id).filter((id) => CATALOGUE_SKILL_IDS.has(id));
  if (collidingIds.length === 0) return;
  if (await isPublicCatalogueCheckout(basePath)) return;

  throw new Error(catalogueCollisionError(collidingIds, source));
}

function catalogueCollisionError(collidingIds: SkillId[], source: string): string {
  const listed = collidingIds.slice(0, MAX_REPORTED_COLLISIONS).map((id) => `  ${id}`);
  const unlisted = collidingIds.length - listed.length;

  return [
    `Marketplace '${source}' ships ${collidingIds.length} skill id(s) the public catalogue ` +
      `already owns:`,
    ...listed,
    ...(unlisted > 0 ? [`  ... and ${unlisted} more`] : []),
    `A skill id is the directory the skill installs into, so these would shadow the public ` +
      `catalogue's own skills. Every id must carry its marketplace's name as a namespace — ` +
      `'<marketplace>-<id>'. Rename each skill and the 'name' in its SKILL.md, then re-run ` +
      `'build marketplace', which refuses the same ids before they are published.`,
  ].join("\n");
}

/** Built-in stacks stand in for the public catalogue only; others offer their own or none. */
async function resolveOfferedStacks(
  basePath: string,
  stacksFile: string | undefined,
  source: string,
): Promise<Stack[]> {
  const sourceStacks = await loadStacks(basePath, stacksFile);
  if (sourceStacks.length > 0) {
    verbose(`Offering the ${sourceStacks.length} stacks the source ships`);
    return sourceStacks;
  }

  if (await offersBuiltInStacks(basePath, source)) {
    verbose(
      `The public catalogue ships no stacks — offering the ${defaultStacks.length} built-in stacks`,
    );
    return defaultStacks;
  }

  verbose(`Marketplace '${source}' ships no stacks, and gets no built-in stand-in — offering none`);
  return [];
}

/** Keys arrive unnarrowed from a stacks file, so `isAgentName` is a real test, not a cast. */
function declaredAgentsIn(stack: Stack): { declared: AgentName[]; undeclared: string[] } {
  const named: string[] = typedKeys<AgentName>(stack.agents);
  return {
    declared: named.filter(isAgentName),
    undeclared: named.filter((name) => !isAgentName(name)),
  };
}

/** The stack is dropped from, not refused (it is a suggestion), but never silently. */
function undeclaredAgentsWarning(stack: Stack, undeclared: readonly string[]): string {
  const named = undeclared.map((name) => `'${name}'`).join(", ");
  return (
    `Stack '${stack.id}' names ${undeclared.length} sub-agent(s) this CLI does not define: ` +
    `${named}. Left out of the stack — a sub-agent must be one the CLI ships.`
  );
}

/** A stack outliving one of its skills is an ordinary authoring mistake, not a corrupt file. */
function withdrawnSkillsWarning(stack: Stack, withdrawn: readonly string[]): string {
  const named = withdrawn.map((id) => `'${id}'`).join(", ");
  return (
    `Stack '${stack.id}' names ${withdrawn.length} skill(s) this marketplace's catalogue does ` +
    `not carry: ${named}. Left out of the stack — selecting it would install nothing.`
  );
}

export function convertStackToResolvedStack(stack: Stack): ResolvedStack {
  const { declared, undeclared } = declaredAgentsIn(stack);
  if (undeclared.length > 0) warn(undeclaredAgentsWarning(stack, undeclared));

  const agentConfigs = agentConfigsFor(stack, declared);
  const [allSkillIds, withdrawn] = partition(namedSkillIds(agentConfigs), isInCurrentCatalogue);
  if (withdrawn.length > 0) warn(withdrawnSkillsWarning(stack, withdrawn));

  verbose(
    `Stack '${stack.id}' has ${allSkillIds.length} skills from ${agentConfigs.length} agents`,
  );

  return {
    id: stack.id,
    name: stack.name,
    description: stack.description,
    skills: skillsByAgent(agentConfigs),
    allSkillIds,
    philosophy: stack.philosophy || "",
  };
}

type StackAgentEntry = { agentId: AgentName; agentConfig: StackAgentConfig };

function agentConfigsFor(stack: Stack, declared: readonly AgentName[]): StackAgentEntry[] {
  return declared.flatMap((agentId) => {
    const agentConfig = stack.agents[agentId];
    return agentConfig ? [{ agentId, agentConfig }] : [];
  });
}

/** First-seen order. */
function namedSkillIds(agentConfigs: StackAgentEntry[]): SkillId[] {
  return unique(
    agentConfigs.flatMap(({ agentConfig }) =>
      resolveAgentConfigToSkills(agentConfig).map((ref) => ref.id),
    ),
  );
}

/** The one question a stack's skills are filtered by, for the stack and for each agent's rows. */
function isInCurrentCatalogue(id: SkillId): boolean {
  return id in currentMatrix.skills;
}

function skillsByAgent(agentConfigs: StackAgentEntry[]): ResolvedStack["skills"] {
  return typedFromEntries(
    agentConfigs.map(
      ({ agentId, agentConfig }) => [agentId, resolveStackAgentSkills(agentConfig)] as const,
    ),
  );
}

/** A category left with no carried skill is dropped. */
function resolveStackAgentSkills(
  agentConfig: Partial<Record<Category, SkillAssignment[]>>,
): Partial<Record<Category, SkillId[]>> {
  const carriedByCategory = typedEntries<Category, SkillAssignment[]>(agentConfig).map(
    ([category, assignments]) =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
      [category, (assignments ?? []).map((a) => a.id).filter(isInCurrentCatalogue)] as const,
  );
  return typedFromEntries(carriedByCategory.filter(([, ids]) => ids.length > 0));
}

/** `local` is never a defined category. */
function declaresCategory(matrix: MergedSkillsMatrix, category: CategoryPath): boolean {
  return category !== LOCAL_PSEUDO_CATEGORY && matrix.categories[category] !== undefined;
}

/**
 * Does not list the categories on offer: there are a hundred, and the picker already shows them.
 */
function undeclaredCategoryRefusal(
  metadata: ExtractedSkillMetadata,
  category: CategoryPath,
): string {
  const metadataPath = path.join(metadata.path, STANDARD_FILES.METADATA_YAML);
  return (
    `Skipping local skill '${metadata.id}': ${METADATA_KEYS.CATEGORY} '${category}' is not one this ` +
    `installation declares, so the skill belongs in no grid tab and can be given to no sub-agent. ` +
    `Set ${METADATA_KEYS.CATEGORY} in ${metadataPath} to a category that already exists — a skill ` +
    `is placed in the taxonomy, it does not extend it.`
  );
}

export function mergeLocalSkillsIntoMatrix(
  matrix: MergedSkillsMatrix,
  localResult: LocalSkillDiscoveryResult,
): MergedSkillsMatrix {
  for (const metadata of localResult.skills) {
    const existingSkill = matrix.skills[metadata.id];

    // An overriding local skill inherits the remote skill's category.
    const category = existingSkill?.category ?? metadata.category;

    // A custom skill's category must exist; synthesizing one would fake a placement.
    if (metadata.custom === true && !declaresCategory(matrix, category)) {
      warn(undeclaredCategoryRefusal(metadata, category));
      continue;
    }

    const resolvedSkill = toLocalResolvedSkill(metadata, existingSkill, category);
    matrix.skills[metadata.id] = resolvedSkill;

    // Completes the slug map over the matrix this merge is building.
    claimSlug(matrix.slugMap, resolvedSkill.slug, metadata.id);

    ensureCategoryDefined(matrix, category, metadata.domain);

    verbose(`Added local skill: ${metadata.id} (category: ${category})`);
  }

  return matrix;
}

/** An override inherits the source skill's slug, name and relations; a new one has none. */
function toLocalResolvedSkill(
  metadata: ExtractedSkillMetadata,
  existingSkill: ResolvedSkill | undefined,
  category: CategoryPath,
): ResolvedSkill {
  return {
    id: metadata.id,
    slug: existingSkill?.slug ?? metadata.slug,
    displayName: existingSkill?.displayName ?? metadata.displayName,
    description: metadata.description,
    ...(metadata.activationDescription !== undefined && {
      activationDescription: metadata.activationDescription,
    }),
    ...(metadata.usageGuidance !== undefined && { usageGuidance: metadata.usageGuidance }),

    category,

    author: LOCAL_DEFAULTS.AUTHOR,

    conflictsWith: existingSkill?.conflictsWith ?? [],
    requires: existingSkill?.requires ?? [],
    alternatives: existingSkill?.alternatives ?? [],
    discourages: existingSkill?.discourages ?? [],

    path: metadata.path,

    local: true,
    ...(metadata.localPath !== undefined && { localPath: metadata.localPath }),
    ...(metadata.custom !== undefined && { custom: metadata.custom }),
  };
}

/**
 * Synthesizes a definition so config-types generation finds the domain; never judges the category.
 */
function ensureCategoryDefined(
  matrix: MergedSkillsMatrix,
  category: CategoryPath,
  domain: Domain,
): void {
  if (category === LOCAL_PSEUDO_CATEGORY) return;
  if (matrix.categories[category]) return;

  matrix.categories[category] = {
    id: category,
    displayName: category,
    description: `Local skill category`,
    domain,
    exclusive: false,
    order: 0,
  };
  verbose(`Added local category: ${category} (domain: ${domain})`);
}
