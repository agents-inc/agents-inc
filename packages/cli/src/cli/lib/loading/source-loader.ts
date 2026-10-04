import os from "os";
import { unique } from "remeda";
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
} from "../../consts";
import { defaultCategories } from "../configuration/default-categories";
import { defaultStacks } from "../configuration/default-stacks";
import { isHomeDirectory } from "../installation/is-home-directory";
import { LOCAL_DEFAULTS, METADATA_KEYS } from "../metadata-keys";
import type {
  AgentDefinition,
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
  Category,
} from "../../types";
import { getErrorMessage } from "../../utils/errors";
import { fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
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
import { loadAllAgents } from "./loader";
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

/**
 * What a load reads the marketplace for, which decides whether a marketplace other than the
 * default public catalogue without a valid manifest stops it (owner ruling 2026-10-02).
 *
 * - `"fetch"`: a command that takes from the marketplace — installs, edits, searches or ejects
 *   from it. Refused, naming the builds that write the manifest.
 * - `"upkeep"`: a load that only keeps an installation that already exists in step with a change
 *   made elsewhere — a global uninstall pruning the projects registered under it, a global change
 *   fanned out to them. Everything it touches is already installed, so it goes on: "if I want to
 *   uninstall something, I don't care if it's broken, I just want it gone".
 */
export type SourceLoadPurpose = "fetch" | "upkeep";

export type SourceLoadOptions = {
  /** What the load is for — see {@link SourceLoadPurpose}. Defaults to `"fetch"`. */
  purpose?: SourceLoadPurpose;
  /**
   * Whether this load may reach the init-time source rungs — see {@link SourceCaller}.
   * Defaults to `"stored"`: the ambient environment can only be reached by a caller that
   * names itself `init`, so no path arrives there by omission.
   */
  caller?: SourceCaller;
  sourceFlag?: string;
  projectDir?: string;
  devMode?: boolean;
  /** Skip loading skills from extra sources (multi-source). Only needed for wizard UI tagging. */
  skipExtraSources?: boolean;
  /**
   * The caller only needs the matrix, not skill files on disk. For the default
   * source this skips the `fetchFromSource` clone (the matrix is the pre-computed
   * BUILT_IN_MATRIX anyway) so the load stays offline; `sourcePath` comes back
   * empty. Sources that must be read from disk to build the matrix (local paths,
   * custom remotes) are unaffected.
   */
  matrixOnly?: boolean;
};

export type SourceLoadResult = {
  matrix: MergedSkillsMatrix;
  sourceConfig: ResolvedConfig;
  sourcePath: string;
  isLocal: boolean;
  marketplace?: string;
  /**
   * The skills the loaded marketplace itself carries, which are the only ones `sourcePath` holds
   * files for. The matrix holds more: local skills merged in from `.claude/skills`, and the global
   * installation's plugin skills seated from the marketplace that installation was made from.
   */
  marketplaceSkillIds: ReadonlySet<SkillId>;
};

/** A marketplace's catalogue as read, before anything on this machine joins its matrix. */
type CatalogueRead = Omit<SourceLoadResult, "marketplaceSkillIds">;

export async function loadSkillsMatrixFromSource(
  options: SourceLoadOptions = {},
): Promise<SourceLoadResult> {
  const {
    purpose = "fetch",
    caller = "stored",
    sourceFlag,
    projectDir,
    devMode = false,
    matrixOnly = false,
  } = options;

  // ABORT on an unreadable config. Every skill this returns is resolved against the marketplace
  // named here, so a run that got past this rung on a config it could not read would install from
  // a marketplace nobody chose — which is the whole of what the refusal exists to stop.
  const sourceConfig = await resolveSource({ caller, flag: sourceFlag, projectDir });
  const { source } = sourceConfig;

  verbose(`Loading skills from source: ${source}`);

  const catalogue = await resolveBaseResult(sourceConfig, { purpose, devMode, matrixOnly });

  const resolvedProjectDir = projectDir || process.cwd();

  // Everything the marketplace itself carries, read before any local skill is merged on
  // top: past this point a skill's provenance is no longer legible from the matrix, and
  // an id the merge INTRODUCES is one nothing but the copy on disk backs.
  const result: SourceLoadResult = {
    ...catalogue,
    marketplaceSkillIds: new Set(typedKeys<SkillId>(catalogue.matrix.skills)),
  };

  // Load global local skills first, then project local skills — project wins on conflict
  const homeDir = os.homedir();
  if (!isHomeDirectory(resolvedProjectDir)) {
    result.matrix = await mergeDiscoveredLocalSkills(result.matrix, homeDir, "global");
  }
  result.matrix = await mergeDiscoveredLocalSkills(result.matrix, resolvedProjectDir, "project");
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
 * Seats the global installation's plugin skills this catalogue does not carry, as the marketplace
 * that installation was made from describes them.
 *
 * A global installation from one marketplace under a project from another is a supported layout,
 * and every session in that project inherits the global entries — shown locked in the wizard,
 * compiled into the global sub-agents. An ejected global skill already reaches this matrix through
 * the global local-skill merge, from its copy under `~/.claude/skills`. A plugin leaves no such
 * copy: Claude's plugin cache holds the skill's SKILL.md and none of the catalogue's metadata. So a
 * load of the project's marketplace held no entry for it, and a project setup dropped it — the
 * wizard called it missing and listed it as removed, and the global sub-agent recompiled in the
 * same run lost the usage sentence its own catalogue states.
 *
 * The other marketplace is read only when the global installation names a skill this one lacks,
 * so a project on the global's own marketplace loads nothing more. A seated entry keeps none of
 * its relationships: they name skills of a catalogue this session does not offer, and the entry
 * is here to be shown and compiled, never picked against.
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

/**
 * The global installation's plugin skills this matrix holds no entry for.
 *
 * DEGRADE on an unreadable global config: every command that needs it readable has refused it
 * before loading, and `doctor` and `uninstall`, which run without it, must still run — so its
 * skills simply stay unseated, as they were before this pass existed.
 */
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
 * The catalogue of the marketplace the global installation was made from, or null when that is
 * the one already loaded — whatever it lacks the global's own marketplace lacks too — or when it
 * cannot be loaded, which leaves the skills unseated rather than failing a project command over
 * another installation's marketplace.
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

/**
 * A category the matrix does not define arrives with the skill placed in it, or the wizard has no
 * screen to place that skill on. `local` is never defined, as {@link ensureCategoryDefined} says.
 */
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
 * Skills the merged matrix holds that the marketplace never offered — the local merge's own
 * additions, and the global installation's skills seated from its own marketplace. This
 * marketplace can install none of them, so they are the ids the tagging pass must leave its
 * entry off.
 */
function idsOutsideMarketplace(
  matrix: MergedSkillsMatrix,
  marketplaceSkillIds: ReadonlySet<SkillId>,
): ReadonlySet<SkillId> {
  return new Set(typedKeys<SkillId>(matrix.skills).filter((id) => !marketplaceSkillIds.has(id)));
}

/**
 * The shipped catalogue, in a copy this load may write into. Every collection the
 * local-skill merge writes to is copied: `BUILT_IN_MATRIX` is a module constant,
 * so a shared reference would leave one project's local skill in the catalogue
 * every later load reads.
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

/** What {@link resolveBaseResult} needs of the caller's options, with their defaults applied. */
type BaseLoadOptions = Required<Pick<SourceLoadOptions, "purpose" | "devMode" | "matrixOnly">>;

/**
 * Resolves the base matrix for the configured source: the pre-computed
 * BUILT_IN_MATRIX for the default source, otherwise a local or remote load.
 */
async function resolveBaseResult(
  sourceConfig: ResolvedConfig,
  { purpose, devMode, matrixOnly }: BaseLoadOptions,
): Promise<CatalogueRead> {
  refuseReservedRecordedName(sourceConfig);
  const { source } = sourceConfig;
  if (isDefaultSource(source) && !devMode) {
    // Default source: use pre-computed BUILT_IN_MATRIX instead of loading from disk.
    // Still resolve sourcePath via fetchFromSource so skill files can be read
    // (e.g. for eject-mode copy) — unless the caller declared matrixOnly, in
    // which case the fetch (a network clone on a cold cache) is skipped entirely.
    // The fetch is cached, so no network call if the clone already exists.
    const sourcePath = matrixOnly ? "" : (await fetchFromSource(source)).path;
    return {
      matrix: copyOfBuiltInMatrix(),
      sourceConfig,
      sourcePath,
      isLocal: false,
      ...(sourceConfig.marketplace !== undefined && { marketplace: sourceConfig.marketplace }),
    };
  }

  const isLocal = isLocalSource(source) || devMode;
  return isLocal
    ? loadFromLocal(source, sourceConfig, purpose)
    : loadFromRemote(source, sourceConfig, purpose);
}

/**
 * The way out of a reserved name an installation recorded. The manifest is not where it came from,
 * so renaming the marketplace is no way out: the file to correct is the config that recorded it.
 */
function recordedNameWayOut(configPath: string): string {
  return `set this installation up again, or correct the marketplaceName it recorded in '${configPath}'`;
}

/**
 * Refuses a load labelled by a reserved name the installation's config recorded, as a manifest
 * carrying it is refused. The recorded name outranks the manifest's — so an install made before
 * the name was reserved, or a config edited by hand, would otherwise carry it past the manifest's
 * check, and every plugin installed under `eject` would be recorded as an ejected copy.
 */
function refuseReservedRecordedName({ marketplace, marketplaceRecordedIn }: ResolvedConfig): void {
  if (marketplace === undefined) return;
  const reservedName = validateLoadedMarketplaceName(
    marketplace,
    recordedNameWayOut(marketplaceRecordedIn),
  );
  if (reservedName) throw new MarketplaceNameRefusedError(reservedName);
}

type MarketplaceLabels = Pick<SourceLoadResult, "marketplace">;

/**
 * Which state a marketplace's manifest is in, as far as naming the marketplace goes.
 *
 * Four states rather than two because the failures are not one event, even where they end
 * the same way. A marketplace with no manifest has not been built; one whose manifest is
 * there and unreadable was built, or edited, into a file the reader rejects, and its
 * refusal has to carry the reader's reason — collapsing the two reported every schema
 * violation in that file as an absent file, and a reader who checked found it exactly
 * where the message said it was not. A manifest naming the marketplace something Claude
 * Code registers no plugin under is refused under a type of its own. `doctor`'s
 * `ConfigState` splits its own the same way and for the same reason.
 */
type ManifestState =
  | { kind: "absent" }
  | { kind: "refused"; reason: string }
  | { kind: "unreadable"; reason: string }
  | { kind: "named"; name: string };

/**
 * {@link ManifestState} for one marketplace. Which failure it was is read off the throw's
 * TYPE rather than its text: `fetchMarketplace` is the only thing that can tell a file it
 * never found from one it found and refused, and a refused NAME from every other refusal,
 * so it says which and nothing here matches on a sentence.
 */
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

/**
 * Thrown when a marketplace other than the default public catalogue publishes no valid
 * `.claude-plugin/marketplace.json`: it has none, or one that does not parse, or one the
 * schema refuses.
 *
 * A type rather than a sentence for the reason the fetcher's own manifest errors are types:
 * `doctor` files this finding against the manifest at a severity that turns on who is
 * reading — the author of an unbuilt repository is one build from the fix, and a consumer
 * cannot load the marketplace at all — so it has to be told apart from a load that merely
 * failed without matching on the message.
 */
export class MarketplaceManifestRequiredError extends Error {}

/** A manifest this load could not name the marketplace from. */
type ManifestUnusable = Extract<ManifestState, { kind: "absent" | "unreadable" }>;

/**
 * Resolves the marketplace name from the source's `.claude-plugin/marketplace.json`.
 * A `marketplace` already recorded in the project config wins.
 *
 * Every state but `named` ABORTS a `"fetch"` of a marketplace other than the default public
 * catalogue (owner ruling, 2026-10-02: "Why not just make it a requirement?"). Carrying on past
 * an absent or unreadable manifest labelled every skill `agents-inc` and left the only failure
 * to a Plugin install, after Confirm. A manifest naming the marketplace something Claude
 * Code registers no plugin under keeps its own type, because nothing in that marketplace is
 * installable whoever reads it.
 */
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

/**
 * A load that may go on without a usable manifest keeps the label its config recorded. Every
 * other load is refused, naming what is wrong with the file and the builds that write it.
 */
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

/**
 * The two loads a missing or unreadable manifest does not stop: any load of the default public
 * catalogue, whose name is the CLI's own and which dev mode reads from `PROJECT_ROOT`, which ships
 * none; and an `"upkeep"` load, which touches nothing that is not already installed.
 */
function goesOnWithoutManifest(source: string, purpose: SourceLoadPurpose): boolean {
  return isDefaultSource(source) || purpose === "upkeep";
}

/** The label a config already recorded, which outlives a manifest this load could not name. */
function configuredLabel(sourceConfig: ResolvedConfig): MarketplaceLabels {
  return sourceConfig.marketplace === undefined ? {} : { marketplace: sourceConfig.marketplace };
}

/** Merges any discovered local skills for `dir` into the matrix, logging the find. */
async function mergeDiscoveredLocalSkills(
  matrix: MergedSkillsMatrix,
  dir: string,
  label: SkillScope,
): Promise<MergedSkillsMatrix> {
  const discovered = await discoverLocalSkills(dir);
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
  // Resolved through `fetchFromSource` — the same call `loadFromRemote` makes — rather
  // than joined here, so a path the user named and the CLI cannot read is REFUSED with
  // the loader's own message. Reading it directly returned an empty matrix instead, and
  // `init`/`edit` went on to mount a wizard over nothing the user asked for.
  const skillsPath = isLocalSource(source) ? (await fetchFromSource(source)).path : PROJECT_ROOT;

  verbose(`Loading skills from local path: ${skillsPath}`);

  const mergedMatrix = await loadAndMergeFromBasePath(skillsPath, source);
  const labels = await resolveMarketplaceLabels(skillsPath, sourceConfig, purpose);

  return {
    matrix: mergedMatrix,
    sourceConfig,
    sourcePath: skillsPath,
    isLocal: true,
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
    ...labels,
  };
}

/**
 * The matrix a marketplace on disk describes — its own skills, its own
 * categories and stacks, and the built-in relationship rules narrowed to the
 * slugs it actually ships.
 *
 * This is the load an AUTHOR's command makes, and it is deliberately not
 * {@link loadSkillsMatrixFromSource}: that one merges the invoking machine's
 * `~/.claude/skills` and the project's own into the result, which is right for
 * an install and wrong for anything published — a catalogue carrying the
 * author's private skills offers consumers skills that exist on one machine.
 * The local merge lives one layer up, in the install path alone.
 *
 * A marketplace's base path is also the only word anything has for WHICH
 * marketplace it is, so it stands as the source string too.
 */
export async function loadMarketplaceMatrix(marketplaceDir: string): Promise<MergedSkillsMatrix> {
  const matrix = await loadAndMergeFromBasePath(marketplaceDir, marketplaceDir);
  return { ...matrix, categories: categoriesTheseSkillsAreIn(matrix) };
}

/**
 * The categories a marketplace's own skills are in, and nothing else.
 *
 * {@link loadAndMergeFromBasePath} merges the built-in taxonomy underneath the
 * marketplace's own, so a skill sitting in a built-in category resolves to that
 * category's real definition rather than the humanized stand-in
 * `synthesizeCategory` writes. Right for the merge and wrong for the artefact: a
 * published catalogue cannot claim categories the marketplace ships nothing in,
 * and 102 of them arrived that way — beside a `skills` and a `suggestedStacks`
 * that were the marketplace's own.
 *
 * Membership is read off the SKILLS rather than off the marketplace's own
 * `skill-categories.ts`, because the two disagree in both directions: a skill may
 * sit in a category its author never declared, and a declared category may hold
 * nothing. Narrowing by what is declared would leave a consumer holding a skill
 * whose category the catalogue does not define, which is this bug with the sides
 * swapped.
 */
function categoriesTheseSkillsAreIn(matrix: MergedSkillsMatrix): CategoryMap {
  const occupied = new Set<CategoryPath>(typedValues(matrix.skills).map((skill) => skill.category));

  return typedFromEntries(
    typedEntries<Category, CategoryDefinition>(matrix.categories).filter(([id]) =>
      occupied.has(id),
    ),
  );
}

/**
 * Builds the matrix for a source read from disk, from the files under
 * `basePath`. `source` is the source string that base path stands for — the
 * loader's only word for WHICH marketplace it is reading, and one of the two
 * things {@link resolveOfferedStacks} decides the built-in catalogue's fate on.
 */
async function loadAndMergeFromBasePath(
  basePath: string,
  source: string,
): Promise<MergedSkillsMatrix> {
  // ABORT on an unreadable config. This file is where a marketplace declares which directories
  // its skills and stacks live in, so falling back to the defaults would walk a tree the
  // marketplace says is somewhere else and report the catalogue as empty.
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

  // Assigned unconditionally: a source offering no stacks is a matrix carrying
  // none, which is the whole of what the wizard needs to skip the stack step.
  const stacks = await resolveOfferedStacks(basePath, stacksRelFile, source);
  mergedMatrix.suggestedStacks = stacks.map((stack) => convertStackToResolvedStack(stack));

  const agentDefinedDomains = domainsDeclaredBy(await loadAllAgents(basePath));
  const domainCount = typedKeys(agentDefinedDomains).length;
  if (domainCount > 0) {
    mergedMatrix.agentDefinedDomains = agentDefinedDomains;
    verbose(`Loaded ${domainCount} agent domain definition(s)`);
  }

  return mergedMatrix;
}

/** What a source declares about its skills' taxonomy, beside the CLI's own. */
type SourceTaxonomy = {
  /** The CLI's built-in categories, with the source's own layered over them where it has any. */
  categories: CategoryMap;
  /** The source's own relationship rules, for {@link relationshipsForSource} to merge. */
  sourceRules: SkillRulesConfig | undefined;
};

/**
 * Reads a source's categories file and rules file, either of which it may leave out. Its
 * categories are layered over the CLI's built-in ones; its rules come back as they are, and
 * undefined when it ships none.
 */
async function loadSourceTaxonomy(basePath: string): Promise<SourceTaxonomy> {
  const sourceCategoriesPath = path.join(basePath, SKILL_CATEGORIES_PATH);
  const sourceRulesPath = path.join(basePath, SKILL_RULES_PATH);
  const hasSourceCategories = await fileExists(sourceCategoriesPath);
  const hasSourceRules = await fileExists(sourceRulesPath);

  const sourceCategories = hasSourceCategories
    ? await loadSkillCategories(sourceCategoriesPath)
    : undefined;
  if (sourceCategories) {
    verbose(
      `Loaded source categories: ${sourceCategoriesPath} (${typedKeys(sourceCategories).length} categories)`,
    );
  }
  const categories: CategoryMap = sourceCategories
    ? { ...defaultCategories, ...sourceCategories }
    : defaultCategories;

  const sourceRules = hasSourceRules ? await loadSkillRules(sourceRulesPath) : undefined;
  if (sourceRules) {
    verbose(`Loaded source rules: ${sourceRulesPath}`);
  }

  if (hasSourceCategories || hasSourceRules) {
    verbose(`Matrix merged: CLI (${typedKeys(defaultCategories).length} categories) + source`);
  } else {
    verbose(`Matrix from CLI only (source has no categories/rules files)`);
  }

  return { categories, sourceRules };
}

/** The domain each agent's own metadata.yaml declares, for the agents that declare one. */
function domainsDeclaredBy(
  agents: Partial<Record<AgentName, AgentDefinition>>,
): Partial<Record<AgentName, Domain>> {
  return typedFromEntries(
    typedEntries<AgentName, AgentDefinition>(agents).flatMap(([agentId, agentDef]) =>
      agentDef.domain ? [[agentId, agentDef.domain] as const] : [],
    ),
  );
}

/** Every skill id the shipped catalogue owns — the ids no other marketplace may take. */
const CATALOGUE_SKILL_IDS: ReadonlySet<SkillId> = new Set(typedKeys(BUILT_IN_MATRIX.skills));

/** How many colliding ids a refusal lists before summarising the rest. */
const MAX_REPORTED_COLLISIONS = 10;

/**
 * Refuses a marketplace shipping skill ids the public catalogue already owns.
 *
 * A skill id is the directory the skill installs into, and Claude reads
 * `~/.claude` and `./.claude` together, so two marketplaces naming one id means
 * one silently shadows the other. `build marketplace` refuses those ids at author
 * time; this is what catches a marketplace that skipped that build, was
 * hand-edited, or is lying — nothing a source ships is unforgeable, so the
 * consumer's own load has to ask the question again.
 *
 * The SOURCE is refused, not the colliding skills: dropping them would hand the
 * user a marketplace quietly missing the skills they chose it for, leave the
 * catalogue's own copies standing in under those ids, and tell the author
 * nothing. One loud refusal naming the fix beats a partial load that hides it.
 */
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

/**
 * The stacks a source offers the wizard: the ones it ships, or — for the public
 * catalogue alone — the CLI's built-in catalogue standing in when it ships none.
 *
 * A custom marketplace gets no such stand-in. Handing it one meant offering a
 * catalogue of stacks written against a different catalogue of skills, under a
 * name the user never asked for, with most of each stack silently dropped for
 * naming ids the chosen source does not carry. A marketplace ships its own
 * stacks or offers none, and none means a wizard with no stack step rather than
 * one showing somebody else's list.
 */
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

/**
 * A stack's sub-agents split by whether the CLI declares one.
 *
 * The keys are read as the STRINGS a stack file spells: `typedKeys` types them `AgentName` because
 * `Stack["agents"]` is keyed by it, but they arrive from a marketplace's own `config/stacks.ts` and
 * nothing between that file and here narrows them — so the membership test below is a real
 * question rather than a formality, and the widening is what lets it be asked.
 *
 * Narrowed with `isAgentName` and deliberately NOT cast. Only the CLI's own `src/agents/` declares
 * a sub-agent a compile pass can honour — that directory is the whole of the roster (owner ruling
 * 2026-08-21) and is what `AGENT_NAMES` is generated from — so this is the union's own membership
 * test rather than a second list to keep in step.
 */
function declaredAgentsIn(stack: Stack): { declared: AgentName[]; undeclared: string[] } {
  const named: string[] = typedKeys<AgentName>(stack.agents);
  return {
    declared: named.filter(isAgentName),
    undeclared: named.filter((name) => !isAgentName(name)),
  };
}

/**
 * What a stack naming a sub-agent the CLI does not ship is told to the user.
 *
 * The stack is DROPPED FROM rather than refused, and that posture is deliberate. A stack is a
 * suggestion the wizard offers, not an install contract, so refusing it would take every
 * sub-agent in it — the valid ones included — over one typo in a marketplace the user may not
 * own. It is also the posture the rest of this conversion already takes: `resolveStackAgentSkills`
 * drops a skill id the matrix does not carry, and one function answering the same question two
 * ways is worse than either answer. Contrast `refuseCatalogueCollisions` above, which refuses
 * the whole source because a colliding id is UNSAFE — two marketplaces silently shadowing each
 * other on disk — where an undeclared sub-agent is merely uncompilable.
 *
 * What the drop must not be is SILENT, which is what it was: the wizard narrowed these names
 * out of its own grid and told nobody. `warn()` is buffered during a source load and painted as
 * the wizard's startup band, so this reaches the user rather than a stderr the first repaint
 * scrolls away. The stack is named because a marketplace ships many, and the sub-agents are
 * named rather than counted because only the name says what to fix.
 */
function undeclaredAgentsWarning(stack: Stack, undeclared: readonly string[]): string {
  const named = undeclared.map((name) => `'${name}'`).join(", ");
  return (
    `Stack '${stack.id}' names ${undeclared.length} sub-agent(s) this CLI does not define: ` +
    `${named}. Left out of the stack — a sub-agent must be one the CLI ships.`
  );
}

/**
 * What a stack naming a skill the catalogue does not carry is told to the user.
 *
 * The skill counterpart of {@link undeclaredAgentsWarning}, and it exists for the same reason: a
 * marketplace's `config/stacks.ts` is authored by hand against a catalogue that moves, so a stack
 * outliving one of its own skills is an ordinary authoring mistake rather than a corrupt file.
 */
function withdrawnSkillsWarning(stack: Stack, withdrawn: readonly string[]): string {
  const named = withdrawn.map((id) => `'${id}'`).join(", ");
  return (
    `Stack '${stack.id}' names ${withdrawn.length} skill(s) this marketplace's catalogue does ` +
    `not carry: ${named}. Left out of the stack — selecting it would install nothing.`
  );
}

// Stack values are already skill IDs — no alias resolution needed
export function convertStackToResolvedStack(stack: Stack): ResolvedStack {
  const { declared, undeclared } = declaredAgentsIn(stack);
  if (undeclared.length > 0) warn(undeclaredAgentsWarning(stack, undeclared));

  const agentConfigs = declared.flatMap((agentId) => {
    const agentConfig = stack.agents[agentId];
    return agentConfig ? [{ agentId, agentConfig }] : [];
  });

  const skills = typedFromEntries(
    agentConfigs.map(
      ({ agentId, agentConfig }) => [agentId, resolveStackAgentSkills(agentConfig)] as const,
    ),
  );

  // First-seen order across agents, matching the historical seen-Set accumulation — and filtered
  // against the matrix by the SAME question `resolveStackAgentSkills` asks above. The two used to
  // disagree: the per-category map kept only ids the catalogue carried while this list kept every
  // id the file named, and this is the one that reaches a user. `wizard.tsx` returns it verbatim
  // as the selection when a stack is picked, and the editor's read-model counts and lists it — so
  // a stack outliving one of its own skills selected an id nothing could resolve, and the mismatch
  // surfaced only once somebody picked that stack.
  const named = unique(
    agentConfigs.flatMap(({ agentConfig }) =>
      resolveAgentConfigToSkills(agentConfig).map((ref) => ref.id),
    ),
  );
  const allSkillIds = named.filter((id) => id in currentMatrix.skills);
  const withdrawn = named.filter((id) => !(id in currentMatrix.skills));
  if (withdrawn.length > 0) warn(withdrawnSkillsWarning(stack, withdrawn));

  verbose(
    `Stack '${stack.id}' has ${allSkillIds.length} skills from ${agentConfigs.length} agents`,
  );

  return {
    id: stack.id,
    name: stack.name,
    description: stack.description,
    skills,
    allSkillIds,
    philosophy: stack.philosophy || "",
  };
}

/** Per-category skill ids for one stack agent, keeping only ids present in the current matrix. */
function resolveStackAgentSkills(
  agentConfig: Partial<Record<Category, SkillAssignment[]>>,
): Partial<Record<Category, SkillId[]>> {
  const byCategory = typedEntries<Category, SkillAssignment[]>(agentConfig)
    .map(([category, assignments]) => ({
      category,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      validIds: (assignments ?? []).filter((a) => a.id in currentMatrix.skills).map((a) => a.id),
    }))
    .filter(({ validIds }) => validIds.length > 0);
  return typedFromEntries(
    byCategory.map(({ category, validIds }) => [category, validIds] as const),
  );
}

/**
 * Whether this matrix carries a definition for the category. `local` never is
 * one — it is the trapdoor a skill wears when it belongs to no category at all.
 */
function declaresCategory(matrix: MergedSkillsMatrix, category: CategoryPath): boolean {
  return category !== LOCAL_PSEUDO_CATEGORY && matrix.categories[category] !== undefined;
}

/**
 * Why a custom skill was dropped, and which file places it.
 *
 * The categories on offer are deliberately not listed: they are the whole
 * catalogue's, and a refusal that prints a hundred names is one nobody reads.
 * Whatever the user picked the category in renders them already.
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

    // If overwriting an existing remote skill, inherit its category unconditionally.
    // Otherwise, use whatever the local skill declared in its metadata.yaml.
    const category = existingSkill?.category ?? metadata.category;

    // A custom skill is PLACED in the taxonomy — its category is picked from the
    // ones that exist, never invented — so one naming a category nothing declares
    // means no pick happened. Synthesizing a definition for it is what let a
    // fabricated category read as a real placement while the skill sat in a tab
    // nothing draws. Local skills that claim no `custom` flag keep the old
    // behaviour below; narrowing that is matrix hygiene, not this rule.
    if (metadata.custom === true && !declaresCategory(matrix, category)) {
      warn(undeclaredCategoryRefusal(metadata, category));
      continue;
    }

    const resolvedSkill = toLocalResolvedSkill(metadata, existingSkill, category);
    matrix.skills[metadata.id] = resolvedSkill;

    // Completes the map over the matrix this merge is building: the skill went
    // into `matrix.skills` and the slug map stayed as the source left it, so every
    // slug a user had written themselves resolved to nothing.
    claimSlug(matrix.slugMap, resolvedSkill.slug, metadata.id);

    ensureCategoryDefined(matrix, category, metadata.domain);

    verbose(`Added local skill: ${metadata.id} (category: ${category})`);
  }

  return matrix;
}

/**
 * A local skill as the matrix holds it. One that overrides a skill the source already carries
 * inherits that skill's slug, display name and relationships; one new to the matrix takes its
 * slug and display name from its own metadata and relates to nothing. The category arrives
 * already resolved, because the caller needs it first to refuse a custom skill placed nowhere.
 */
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
 * Gives a local skill's category a definition in the matrix when it has none, so config-types
 * generation can discover its domain and category. Unlike the custom-skill refusal above, this
 * never judges the category: a non-custom local skill may name one nothing declares, and gets a
 * synthesized definition here.
 */
function ensureCategoryDefined(
  matrix: MergedSkillsMatrix,
  category: CategoryPath,
  domain: Domain,
): void {
  // `local` is a pseudo-category, not a real Category union member, so it is never defined.
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
