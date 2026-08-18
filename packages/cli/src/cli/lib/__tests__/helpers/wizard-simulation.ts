import type {
  AgentName,
  Category,
  Domain,
  DomainSelections,
  MergedSkillsMatrix,
  ProjectConfig,
  SkillAssignment,
  SkillConfig,
  SkillId,
  SkillScope,
} from "../../../types";
import { resolveSelectedSkillIds, type WizardResultV2 } from "../../../components/wizard/wizard";
import { useWizardStore } from "../../../stores/wizard-store";
import { validateSelection } from "../../matrix";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../../consts";

/**
 * The three config shapes a fixture builds, with their skill ids widened to `string`.
 *
 * `SkillId` is the PUBLIC catalogue's generated union. A fixture that installs from
 * a fixture MARKETPLACE records ids in that marketplace's namespace (`e2eSkillId`
 * in e2e/helpers/create-e2e-source.ts), so no such id is a member of it. The file
 * these shapes produce on disk is the one production writes; only the union the
 * fixture is checked against is the wrong one, and per CLAUDE.md a fabricated id
 * widens rather than casting itself into a union it is not in.
 *
 * They live beside `buildSkillConfig` because that is the lowest factory that has
 * to name one, and both the unit factories and the E2E fixtures build on it.
 */
export type FixtureSkillConfig = Omit<SkillConfig, "id"> & { id: string };

export type FixtureSkillAssignment = Omit<SkillAssignment, "id"> & { id: string };

export type FixtureStackAgentConfig = Partial<Record<Category, FixtureSkillAssignment[]>>;

export type FixtureProjectConfig = Omit<ProjectConfig, "skills" | "stack"> & {
  skills: FixtureSkillConfig[];
  stack?: Partial<Record<AgentName, FixtureStackAgentConfig>>;
};

/**
 * The scope every config factory writes when its caller names none.
 *
 * This is the factories' OWN choice, not a mirror of any product default. It says "an installed
 * entry that this test has nothing to say about lives in the project" — the shape the overwhelming
 * majority of specs arrange — and it is paired with the `origin: "eject"` default below for the
 * same reason.
 *
 * It is deliberately NOT `DEFAULT_SELECTION_OPTIONS.scope` from `@workspace/matrix`, which is
 * `global`: that constant answers "what does an untouched *pick* do?", a question about a fresh
 * selection rather than about a saved config row. A spec asserting what an untouched pick produces
 * must name its scope explicitly rather than lean on this.
 */
export const FACTORY_DEFAULT_SCOPE: SkillScope = "project";

/**
 * Build a single SkillConfig from an id with default scope and origin.
 *
 * Generic over the id rather than fixed to `SkillId` for the reason
 * `createMockSkillAssignment` gives: a catalogue literal still yields a
 * `SkillConfig`, while a marketplace-namespaced fixture id — not a member of the
 * generated union — yields the same shape with `id: string`, and no cast.
 */
export function buildSkillConfig<Id extends string>(
  id: Id,
  overrides?: Partial<Omit<SkillConfig, "id">>,
): Omit<SkillConfig, "id"> & { id: Id } {
  return {
    id,
    scope: overrides?.scope ?? FACTORY_DEFAULT_SCOPE,
    origin: overrides?.origin ?? "eject",
    ...(overrides?.excluded !== undefined && { excluded: overrides.excluded }),
  };
}

/** Build a SkillConfig array from skill IDs with default scope and origin */
export function buildSkillConfigs<Id extends string>(
  skillIds: readonly Id[],
  overrides?: Partial<Omit<SkillConfig, "id">>,
): Array<Omit<SkillConfig, "id"> & { id: Id }> {
  return skillIds.map((id) => buildSkillConfig(id, overrides));
}

/**
 * Simulates a user selecting specific skills via the wizard store.
 *
 * Sets up domainSelections as if the user toggled each skill in the build step,
 * using the matrix to look up the correct domain and category per skill.
 */
export function simulateSkillSelections(
  skillIds: SkillId[],
  matrix: MergedSkillsMatrix,
  selectedDomains: string[],
): void {
  const domainSelections = skillIds.reduce<DomainSelections>((acc, skillId) => {
    const skill = matrix.skills[skillId];
    if (!skill) return acc;
    // Boundary cast: skill.category is a Category at runtime
    const category = skill.category as Category;
    const domain = matrix.categories[category]?.domain;
    if (!domain) return acc;
    const domainObj = acc[domain] ?? {};
    const subcatList = domainObj[category] ?? [];
    if (subcatList.includes(skillId)) return acc;
    return {
      ...acc,
      [domain]: { ...domainObj, [category]: [...subcatList, skillId] },
    };
  }, {});

  useWizardStore.setState({
    domainSelections,
    selectedDomains: selectedDomains as Domain[],
    approach: "scratch",
    step: "confirm",
  });
}

/**
 * Replicates `handleComplete` from wizard.tsx for the "customize" path.
 *
 * Given the wizard store state (after simulated user selections), this builds
 * the same WizardResultV2 that the real wizard produces, delegating skill-id
 * resolution to the wizard's own `resolveSelectedSkillIds` (stack defaults or
 * per-domain selections), then running validation. Requires the matrix
 * provider to be initialized (as the real wizard does).
 */
export function buildWizardResultFromStore(overrides?: Partial<WizardResultV2>): WizardResultV2 {
  const store = useWizardStore.getState();

  const allSkills = resolveSelectedSkillIds(store);

  const validation = validateSelection(allSkills);

  // Auto-scope skills to match agent scope when every agent is global — this mirrors
  // a home-dir install where both sides of the stack equation live at global scope.
  // Without alignment, the stack mutator correctly rejects the scope mismatch and
  // integration tests that simulate home installs end up with empty stacks.
  // Tests that verify cross-scope mismatch behavior must pass skills explicitly via
  // `skillConfigs` rather than relying on this synthesis path.
  const allAgentsGlobal =
    store.agentConfigs.length > 0 && store.agentConfigs.every((ac) => ac.scope === "global");
  const synthesizedSkills = allAgentsGlobal
    ? buildSkillConfigs(allSkills, { scope: "global", origin: DEFAULT_PUBLIC_SOURCE_NAME })
    : buildSkillConfigs(allSkills);

  return {
    skills: store.skillConfigs.length > 0 ? store.skillConfigs : synthesizedSkills,
    selectedAgents: store.selectedAgents,
    agentConfigs: store.agentConfigs,
    selectedStackId: store.selectedStackId,
    domainSelections: store.domainSelections,
    selectedDomains: store.selectedDomains,
    unresolvableSkillIds: store.unresolvableSkillIds,
    cancelled: false,
    validation,
    ...overrides,
  };
}

/**
 * Extracts skill IDs from a stack assignment value, which may be:
 * - A bare string (e.g., "web-framework-react")
 * - An object with .id (e.g., { id: "web-framework-react", preloaded: true })
 * - An array of strings or objects
 */
export function extractSkillIdsFromAssignment(assignment: unknown): string[] {
  if (typeof assignment === "string") {
    return [assignment];
  }
  if (Array.isArray(assignment)) {
    return assignment.flatMap((item) => extractSkillIdsFromAssignment(item));
  }
  if (typeof assignment === "object" && assignment !== null && "id" in assignment) {
    return [String((assignment as { id: string }).id)];
  }
  return [];
}
