import path from "path";
import { mapValues, pipe, flatMap, unique } from "remeda";
import { getErrorMessage } from "../../utils/errors";
import { verbose, warn } from "../../utils/logger";
import { hasSkill } from "../matrix/matrix-provider";
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
import { typedEntries, typedKeys } from "../../utils/typed-object";
import { isSkillAssignment } from "../../utils/type-guards";
import { STACKS_FILE_PATH } from "../../consts";
import { loadConfig } from "../configuration/config-loader";
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
  }) as StackAgentConfig;
}

/**
 * Normalizes a raw stack record (agent -> raw category config) to the typed form.
 * Applies normalizeAgentConfig to each agent entry.
 */
export function normalizeStackRecord(
  rawStack: Record<string, Record<string, unknown>>,
): Record<string, StackAgentConfig> {
  return mapValues(rawStack, (agentConfig) => normalizeAgentConfig(agentConfig));
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
        (agentConfig) => normalizeAgentConfig(agentConfig as Record<string, unknown>),
      ) as Stack["agents"],
    }));

    stacksCache.set(cacheKey, stacks);
    verbose(`Loaded ${stacks.length} stacks from ${stacksPath}`);

    return stacks;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    throw new Error(`Failed to load stacks from '${stacksPath}': ${errorMessage}`);
  }
}

export async function loadStackById(stackId: string, configDir: string): Promise<Stack | null> {
  const stacks = await loadStacks(configDir);
  const stack = stacks.find((s) => s.id === stackId);

  if (stack) {
    verbose(`Found stack: ${stack.name} (${stackId})`);
    return stack;
  }

  // Fall back to CLI's built-in default stacks
  const defaultStack = defaultStacks.find((s) => s.id === stackId) ?? null;
  if (defaultStack) {
    verbose(`Found default stack: ${defaultStack.name} (${stackId})`);
  } else {
    verbose(`Stack '${stackId}' not found in source or defaults`);
  }
  return defaultStack;
}

// Converts a StackAgentConfig (category -> SkillAssignment[]) to an array of SkillReferences.
// Values are already normalized to SkillAssignment[] by loadStacks().
export function resolveAgentConfigToSkills(agentConfig: StackAgentConfig): SkillReference[] {
  return typedEntries<Category, SkillAssignment[]>(agentConfig).flatMap(([category, assignments]) =>
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

export function resolveStackSkills(stack: Stack): Record<string, SkillReference[]> {
  const result = mapValues(stack.agents, (agentConfig) =>
    agentConfig ? resolveAgentConfigToSkills(agentConfig) : [],
  );

  verbose(
    `Resolved skills for ${typedKeys<AgentName>(result).length} agents in stack '${stack.id}'`,
  );

  return result;
}
