import path from "path";
import { flatMap, groupBy, mapValues, partition, pipe, unique, uniqueBy } from "remeda";
import { getErrorMessage } from "../../utils/errors";
import { verbose, warn } from "../../utils/logger";
import { hasSkill, matrix } from "../matrix/matrix-provider";
import type {
  AgentName,
  SkillAssignment,
  SkillId,
  SkillReference,
  Stack,
  StackAgentConfig,
  Category,
} from "../../types";
import { stacksConfigSchema } from "../schemas";
import { typedEntries } from "../../utils/typed-object";
import { isSkillAssignment } from "../../utils/type-guards";
import { LOCAL_PSEUDO_CATEGORY, STACKS_FILE_PATH } from "../../consts";
import { loadConfig } from "../configuration/config-loader";
import { offersBuiltInStacks } from "../configuration/config";
import { defaultStacks } from "../configuration/default-stacks";

const stacksCache = new Map<string, Stack[]>();

/**
 * Normalizes a raw agent config (from Zod-parsed config) to StackAgentConfig.
 * Converts bare strings to `{ id, preloaded: false }` and wraps single values in arrays.
 * Used by both loadStacks() and loadProjectConfig() to handle all 3 config formats:
 *   1. bare string: `framework: "web-framework-react"`
 *   2. single object: `framework: { id: "web-framework-react", preloaded: true }`
 *   3. array: `methodology: [{ id: ..., preloaded: true }, { id: ... }]`
 */
export function normalizeAgentConfig(agentConfig: Record<string, unknown>): StackAgentConfig {
  // Boundary casts: Zod-parsed config has loose types (bare strings, objects, arrays)
  // that are normalized to typed SkillAssignment[] values
  return mapValues(agentConfig, (value) => {
    const items = Array.isArray(value) ? value : [value];
    return items.map((item): SkillAssignment => {
      if (typeof item === "string") return { id: item as SkillId, preloaded: false };
      if (isSkillAssignment(item)) return item;
      warn(`Malformed skill assignment in stack data: ${JSON.stringify(item)}`);
      return item as SkillAssignment;
    });
  });
}

/**
 * Where the live catalog says a skill's entry belongs, or `undefined` when it
 * has nothing to say: an id the matrix does not carry (local, marketplace, or
 * withdrawn) and a skill in the `local` pseudo-category both leave the key the
 * config already spells as the only word available.
 */
function liveCategoryOf(skillId: SkillId): Category | undefined {
  const category = matrix.skills[skillId]?.category;
  if (category === undefined || category === LOCAL_PSEUDO_CATEGORY) return undefined;
  // TypeScript narrows CategoryPath to Category after excluding "local"
  return category;
}

type PlacedAssignment = {
  storedCategory: Category;
  liveCategory: Category;
  assignment: SkillAssignment;
};

function placeAssignments(agentConfig: StackAgentConfig): PlacedAssignment[] {
  return typedEntries<Category, SkillAssignment[]>(agentConfig).flatMap(
    ([storedCategory, assignments]) =>
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
      (assignments ?? []).map((assignment) => ({
        storedCategory,
        liveCategory: liveCategoryOf(assignment.id) ?? storedCategory,
        assignment,
      })),
  );
}

/**
 * One agent's saved stack re-keyed under each skill's live category.
 *
 * A persisted `stack` block names the category each skill sat in when it was
 * written, and every consumer downstream — the generator's preservation
 * lookup, the load-state lookup, the compiled agent's usage line — asks the
 * live catalog. When a release moves a skill between categories the two stop
 * agreeing, and a saved entry nobody can find is a saved entry nobody keeps.
 * Re-keying here is what keeps the question answerable: the category is where
 * an entry is STORED, the id is which skill it names, and only the id is
 * identity.
 *
 * A skill already under its live category wins any collision with a stale
 * duplicate of itself — it is the current word for that pair, and one skill
 * may appear once per agent.
 */
function rekeyToLiveCategories(agentConfig: StackAgentConfig): StackAgentConfig {
  const [settled, moved] = partition(
    placeAssignments(agentConfig),
    (placed) => placed.liveCategory === placed.storedCategory,
  );

  if (moved.length > 0) {
    verbose(
      `Re-keyed stack entries to their live category: ` +
        moved
          .map((p) => `${p.assignment.id} (${p.storedCategory} -> ${p.liveCategory})`)
          .join(", "),
    );
  }

  return mapValues(
    groupBy([...settled, ...moved], (placed) => placed.liveCategory),
    (placed) =>
      uniqueBy(
        placed.map((p) => p.assignment),
        (assignment) => assignment.id,
      ),
  );
}

/**
 * Normalizes a raw stack record (agent -> raw category config) to the typed form.
 * Applies normalizeAgentConfig to each agent entry, then re-keys the result to
 * the live catalog (see {@link rekeyToLiveCategories}).
 *
 * This is the PERSISTED-CONFIG boundary — `loadProjectConfigFromDir` and the
 * config gate's writer entry. A source's `stacks.ts` deliberately does not pass
 * through here: its category key is the author's heading for the agent prompt,
 * shipped alongside the catalog it references, so there is no drift to
 * reconcile and nothing to overrule.
 */
export function normalizeStackRecord(
  rawStack: Record<string, Record<string, unknown>>,
): Record<string, StackAgentConfig> {
  return mapValues(rawStack, (agentConfig) =>
    rekeyToLiveCategories(normalizeAgentConfig(agentConfig)),
  );
}

export async function loadStacks(configDir: string, stacksFile?: string): Promise<Stack[]> {
  const resolvedStacksFile = stacksFile ?? STACKS_FILE_PATH;
  const cacheKey = `${configDir}:${resolvedStacksFile}`;
  const cached = stacksCache.get(cacheKey);
  if (cached) return cached;

  const stacksPath = path.join(configDir, resolvedStacksFile);

  try {
    const raw = await loadConfig(stacksPath, stacksConfigSchema);

    if (raw == null) {
      verbose(`No stacks file found at ${stacksPath}`);
      return [];
    }

    // Normalize: all values to SkillAssignment[] so StackAgentConfig is always SkillAssignment[]
    // Boundary casts: Zod stacksConfigSchema outputs loose Record types;
    // narrowing to Stack["agents"] after normalization guarantees SkillAssignment[] values
    const stacks: Stack[] = raw.stacks.map((stack) => ({
      ...stack,
      agents: mapValues(
        stack.agents as Partial<Record<AgentName, Record<string, unknown>>>,
        (agentConfig) => normalizeAgentConfig(agentConfig),
      ),
    }));

    stacksCache.set(cacheKey, stacks);
    verbose(`Loaded ${stacks.length} stacks from ${stacksPath}`);

    return stacks;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    throw new Error(`Failed to load stacks from '${stacksPath}': ${errorMessage}`, {
      cause: error,
    });
  }
}

/**
 * One stack by id, scoped the way the wizard's stack step is.
 *
 * The source's own stacks answer first. The CLI's built-in catalogue stands in
 * only for the public catalogue — the same rule `resolveOfferedStacks` applies to
 * the list the wizard offers, read from the same {@link offersBuiltInStacks} so
 * the two cannot answer differently. They are a pair: that one decides what is
 * OFFERED and this one resolves what was PICKED, so a rule they disagree on
 * offers a stack and then refuses to install it.
 *
 * Under any other source a built-in id names a stack that source does not have,
 * and answering with one would install stacks written against a different
 * catalogue of skills, under a name the user never asked for. Null is the honest
 * answer there; the callers name the id they asked for.
 */
export async function loadStackById(
  stackId: string,
  configDir: string,
  source: string,
): Promise<Stack | null> {
  const stacks = await loadStacks(configDir);
  const stack = stacks.find((s) => s.id === stackId);

  if (stack) {
    verbose(`Found stack: ${stack.name} (${stackId})`);
    return stack;
  }

  if (!(await offersBuiltInStacks(configDir, source))) {
    verbose(
      `Marketplace '${source}' does not ship stack '${stackId}', and gets no built-in stand-in`,
    );
    return null;
  }

  const defaultStack = defaultStacks.find((s) => s.id === stackId) ?? null;
  if (defaultStack) {
    verbose(`Found default stack: ${defaultStack.name} (${stackId})`);
  } else {
    verbose(`Stack '${stackId}' not found in the default marketplace or the built-ins`);
  }
  return defaultStack;
}

/**
 * What a null from {@link loadStackById} means, said once.
 *
 * Both callers turn that null into a failure, and both have to name the id they
 * asked for and the source they asked — a stack that cannot be found is only
 * actionable if the message says which stack and where it was looked for. One
 * definition so the two surfaces cannot describe the same rule differently.
 */
export function stackNotOfferedMessage(stackId: string, source: string): string {
  return (
    `Stack '${stackId}' is not a stack the source '${source}' offers. ` +
    `A marketplace ships its own stacks; the CLI's built-in ones belong to the default ` +
    `public marketplace alone.`
  );
}

// Converts a StackAgentConfig (category -> SkillAssignment[]) to an array of SkillReferences.
// Values are already normalized to SkillAssignment[] by loadStacks().
export function resolveAgentConfigToSkills(agentConfig: StackAgentConfig): SkillReference[] {
  return typedEntries<Category, SkillAssignment[]>(agentConfig).flatMap(([category, assignments]) =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- typedEntries/Object.entries launders the `| undefined` a Partial<Record> admits out of its result type, so this guard reads as dead while still covering an explicitly-undefined slot
    (assignments ?? []).map((assignment): SkillReference => {
      if (!hasSkill(assignment.id)) {
        warn(
          `Skill '${assignment.id}' for category '${category}' not found in matrix. It may be a custom or local skill.`,
          { suppressInTest: true },
        );
      }
      return {
        id: assignment.id,
        usage: `when working with ${category}`,
        preloaded: assignment.preloaded ?? false,
      };
    }),
  );
}

/** Extracts all unique skill IDs from a stack config (agent -> category -> SkillAssignment[]). */
export function getStackSkillIds(stack: Record<string, StackAgentConfig>): SkillId[] {
  return pipe(
    Object.values(stack),
    flatMap(resolveAgentConfigToSkills),
    (refs) => refs.map((r) => r.id),
    unique(),
  );
}
