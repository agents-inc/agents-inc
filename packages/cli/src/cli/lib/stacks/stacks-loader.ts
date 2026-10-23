import path from "path";
import { flatMap, groupBy, mapValues, partition, pipe, unique, uniqueBy } from "remeda";
import { getErrorMessage } from "../../utils/errors";
import { verbose, warn } from "../../utils/logger";
import { inertLine } from "../../utils/string";
import { matrix } from "../matrix/matrix-provider";
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
 * Accepts a bare string, a single `{ id, preloaded }` object, or an array of either; a bare string
 * becomes `preloaded: false`.
 */
export function normalizeAgentConfig(agentConfig: Record<string, unknown>): StackAgentConfig {
  // Boundary casts: Zod-parsed config is loose until normalized here.
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

/** `undefined` for an id the matrix lacks or a skill in the `local` pseudo-category. */
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
      (assignments ?? []).map((assignment) => ({
        storedCategory,
        liveCategory: liveCategoryOf(assignment.id) ?? storedCategory,
        assignment,
      })),
  );
}

/**
 * Re-keys a saved stack under each skill's live category, since only the id is identity. A skill
 * already under its live category wins a collision with a stale duplicate of itself.
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

/** The persisted-config boundary; a source's `stacks.ts` skips it, its keys being its own. */
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

    // Boundary casts: the schema outputs loose records; normalization makes SkillAssignment[].
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

/** Built-in stacks stand in for the public catalogue only, as `resolveOfferedStacks` offers. */
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

  const defaultStack = defaultStacks.find((s) => s.id === stackId);
  if (!defaultStack) {
    verbose(`Stack '${stackId}' not found in the default marketplace or the built-ins`);
    return null;
  }

  verbose(`Found default stack: ${defaultStack.name} (${stackId})`);
  return defaultStack;
}

/** One wording for both callers that turn a null from `loadStackById` into a failure. */
export function stackNotOfferedMessage(stackId: string, source: string): string {
  return (
    `Stack '${inertLine(stackId)}' is not a stack the source '${source}' offers. ` +
    `A marketplace ships its own stacks; the CLI's built-in ones belong to the default ` +
    `public marketplace alone.`
  );
}

/** Exported so every surface writes the fallback word for word; the editor preview mirrors it. */
export function defaultUsageGuidance(category: string): string {
  return `Use when working with ${category}.`;
}

/** The skill's own `usageGuidance`, or the category fallback when it has none or it is blank. */
function statedUsageFor(skillId: SkillId, category: Category): string {
  const stated = matrix.skills[skillId]?.usageGuidance;
  return stated !== undefined && stated.trim() !== "" ? stated : defaultUsageGuidance(category);
}

export function resolveAgentConfigToSkills(agentConfig: StackAgentConfig): SkillReference[] {
  return typedEntries<Category, SkillAssignment[]>(agentConfig).flatMap(([category, assignments]) =>
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Object.entries drops the `| undefined` a Partial<Record> admits
    (assignments ?? []).map((assignment): SkillReference => ({
      id: assignment.id,
      usage: statedUsageFor(assignment.id, category),
      preloaded: assignment.preloaded ?? false,
    })),
  );
}

export function getStackSkillIds(stack: Record<string, StackAgentConfig>): SkillId[] {
  return pipe(
    Object.values(stack),
    flatMap(resolveAgentConfigToSkills),
    (refs) => refs.map((r) => r.id),
    unique(),
  );
}
