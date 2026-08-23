import os from "os";
import { unique } from "remeda";
import path from "path";
import {
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
  ExtractedSkillMetadata,
  MergedSkillsMatrix,
  ResolvedSkill,
  ResolvedStack,
  SkillAssignment,
  SkillId,
  SkillScope,
  Stack,
  Category,
} from "../../types";
import { getErrorMessage } from "../../utils/errors";
import { fileExists } from "../../utils/fs";
import { verbose, warn } from "../../utils/logger";
import { isAgentName } from "../../utils/type-guards";
import { typedEntries, typedFromEntries, typedKeys, typedValues } from "../../utils/typed-object";
import {
  isDefaultSource,
  isLocalSource,
  isPublicCatalogueCheckout,
  loadProjectSourceConfig,
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
import {
  fetchFromSource,
  fetchMarketplace,
  MarketplaceManifestAbsentError,
  MarketplaceNameRefusedError,
} from "./source-fetcher";
import { loadSkillsFromAllSources } from "./multi-source-loader";
import { loadStacks, resolveAgentConfigToSkills } from "../stacks";
import { initializeMatrix, matrix as currentMatrix } from "../matrix/matrix-provider";
import { BUILT_IN_MATRIX } from "../../types/generated/matrix";

export type SourceLoadOptions = {
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
};

export async function loadSkillsMatrixFromSource(
  options: SourceLoadOptions = {},
): Promise<SourceLoadResult> {
  const {
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

  const result = await resolveBaseResult(source, sourceConfig, devMode, matrixOnly);

  const resolvedProjectDir = projectDir || process.cwd();

  // Everything the marketplace itself carries, read before any local skill is merged on
  // top: past this point a skill's provenance is no longer legible from the matrix, and
  // an id the merge INTRODUCES is one nothing but the copy on disk backs.
  const marketplaceSkillIds = new Set(typedKeys<SkillId>(result.matrix.skills));

  // Load global local skills first, then project local skills — project wins on conflict
  const homeDir = os.homedir();
  if (!isHomeDirectory(resolvedProjectDir)) {
    result.matrix = await mergeDiscoveredLocalSkills(result.matrix, homeDir, "global");
  }
  result.matrix = await mergeDiscoveredLocalSkills(result.matrix, resolvedProjectDir, "project");

  if (!options.skipExtraSources) {
    await loadSkillsFromAllSources(
      result.matrix,
      sourceConfig,
      resolvedProjectDir,
      result.marketplace,
      idsOutsideMarketplace(result.matrix, marketplaceSkillIds),
    );
  }

  checkMatrixHealth(result.matrix);
  initializeMatrix(result.matrix);

  return result;
}

/**
 * Skills the merged matrix holds that the marketplace never offered — the local merge's
 * own additions. Eject is the only install any of them can have, so they are the ids the
 * tagging pass must leave a marketplace entry off.
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
      idToSlug: { ...BUILT_IN_MATRIX.slugMap.idToSlug },
    },
  };
}

/**
 * Resolves the base matrix for the configured source: the pre-computed
 * BUILT_IN_MATRIX for the default source, otherwise a local or remote load.
 */
async function resolveBaseResult(
  source: string,
  sourceConfig: SourceLoadResult["sourceConfig"],
  devMode: boolean,
  matrixOnly: boolean,
): Promise<SourceLoadResult> {
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

  const isLocal = isLocalSource(source) || devMode === true;
  return isLocal ? loadFromLocal(source, sourceConfig) : loadFromRemote(source, sourceConfig);
}

type MarketplaceLabels = Pick<SourceLoadResult, "marketplace">;

/**
 * Which state a marketplace's manifest is in, as far as naming the marketplace goes.
 *
 * Four states rather than two because the failures are not one event: a marketplace with
 * no manifest is an ordinary local directory, one whose manifest is there and unreadable
 * is a broken publication that can still be installed from, and one that publishes under
 * a name Claude Code registers no plugin under can be installed from at all. Collapsing
 * the first two reported every schema violation in that file as an absent file, and a
 * reader who checked found it exactly where the message said it was not; collapsing the
 * last two turned the rule `build marketplace` refuses to publish under into a warning
 * printed above a green tick. `doctor`'s `ConfigState` splits its own the same way and
 * for the same reason.
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

/** The label a config already recorded, which outlives a manifest this load could not name. */
function configuredLabel(sourceConfig: ResolvedConfig): MarketplaceLabels {
  return sourceConfig.marketplace === undefined ? {} : { marketplace: sourceConfig.marketplace };
}

/**
 * Resolves the marketplace name from the source's
 * `.claude-plugin/marketplace.json`. A `marketplace` already recorded in the
 * project config wins; sources this load cannot name keep whatever the config had
 * (possibly nothing) and are labelled by their source name.
 *
 * This is where each {@link ManifestState} says whether it ABORTS or DEGRADES, and the
 * two answers are not interchangeable. A manifest that cannot be READ leaves a
 * marketplace whose skills still install, so the load carries on under a label the
 * config or the ref supplies. A manifest that names the marketplace something Claude
 * Code registers no plugin under leaves nothing installable at all, so it ABORTS —
 * carrying on labelled the marketplace by its ref, installed under a name nobody chose,
 * and let `doctor` print a green tick directly beneath its own warning about that file.
 */
async function resolveMarketplaceLabels(
  source: string,
  sourceConfig: ResolvedConfig,
): Promise<MarketplaceLabels> {
  const state = await readManifestState(source);

  switch (state.kind) {
    case "named": {
      const marketplace = sourceConfig.marketplace ?? state.name;
      verbose(`Using marketplace name from ${MARKETPLACE_JSON}: ${marketplace}`);
      return { marketplace };
    }
    case "absent":
      verbose(`Marketplace has no ${MARKETPLACE_JSON} — using its ref as the label`);
      return configuredLabel(sourceConfig);
    case "refused":
      throw new MarketplaceNameRefusedError(state.reason);
    case "unreadable":
      warn(
        `Marketplace has a ${MARKETPLACE_JSON} this CLI cannot read, so its ref is the label instead:\n${state.reason}`,
      );
      return configuredLabel(sourceConfig);
    default: {
      const exhaustive: never = state;
      return exhaustive;
    }
  }
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
): Promise<SourceLoadResult> {
  // Resolved through `fetchFromSource` — the same call `loadFromRemote` makes — rather
  // than joined here, so a path the user named and the CLI cannot read is REFUSED with
  // the loader's own message. Reading it directly returned an empty matrix instead, and
  // `init`/`edit` went on to mount a wizard over nothing the user asked for.
  const skillsPath = isLocalSource(source) ? (await fetchFromSource(source)).path : PROJECT_ROOT;

  verbose(`Loading skills from local path: ${skillsPath}`);

  const mergedMatrix = await loadAndMergeFromBasePath(skillsPath, source);
  const labels = await resolveMarketplaceLabels(skillsPath, sourceConfig);

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
): Promise<SourceLoadResult> {
  verbose(`Fetching skills from remote source: ${source}`);

  const fetchResult = await fetchFromSource(source);

  verbose(`Fetched to: ${fetchResult.path}`);

  const mergedMatrix = await loadAndMergeFromBasePath(fetchResult.path, source);
  const labels = await resolveMarketplaceLabels(source, sourceConfig);

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
  const sourceProjectConfig = await loadProjectSourceConfig(basePath);

  const skillsDirRelPath = sourceProjectConfig?.skillsDir ?? SKILLS_DIR_PATH;
  const stacksRelFile = sourceProjectConfig?.stacksFile;

  // Load source categories and rules (if they exist)
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

  // Collect explicit domain definitions from agent metadata.yaml files
  const agents = await loadAllAgents(basePath);
  const agentDefinedDomains = typedFromEntries(
    typedEntries<AgentName, AgentDefinition>(agents).flatMap(([agentId, agentDef]) =>
      agentDef.domain ? [[agentId, agentDef.domain] as const] : [],
    ),
  );
  const domainCount = typedKeys(agentDefinedDomains).length;
  if (domainCount > 0) {
    mergedMatrix.agentDefinedDomains = agentDefinedDomains;
    verbose(`Loaded ${domainCount} agent domain definition(s)`);
  }

  return mergedMatrix;
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

  // First-seen order across agents, matching the historical seen-Set accumulation
  const allSkillIds = unique(
    agentConfigs.flatMap(({ agentConfig }) =>
      resolveAgentConfigToSkills(agentConfig).map((ref) => ref.id),
    ),
  );

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
    const slug = existingSkill?.slug ?? metadata.slug;
    const displayName = existingSkill?.displayName ?? metadata.displayName;

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

    const resolvedSkill: ResolvedSkill = {
      id: metadata.id,
      slug,
      displayName,
      description: metadata.description,
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

    matrix.skills[metadata.id] = resolvedSkill;

    // Completes the map over the matrix this merge is building: the skill went
    // into `matrix.skills` and the slug map stayed as the source left it, so every
    // slug a user had written themselves resolved to nothing.
    claimSlug(matrix.slugMap, slug, metadata.id);

    // Ensure the skill's category exists in matrix.categories so that
    // config-types generation can discover its domain and category.
    // Skip "local" — it is a pseudo-category, not a real Category union member.
    if (category !== LOCAL_PSEUDO_CATEGORY && !matrix.categories[category]) {
      matrix.categories[category] = {
        id: category,
        displayName: category,
        description: `Local skill category`,
        domain: metadata.domain,
        exclusive: false,
        required: false,
        order: 0,
      };
      verbose(`Added local category: ${category} (domain: ${metadata.domain})`);
    }

    verbose(`Added local skill: ${metadata.id} (category: ${category})`);
  }

  return matrix;
}
