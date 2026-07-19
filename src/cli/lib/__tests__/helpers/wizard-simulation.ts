import type {
  Category,
  Domain,
  DomainSelections,
  MergedSkillsMatrix,
  SkillConfig,
  SkillId,
} from "../../../types";
import { resolveSelectedSkillIds, type WizardResultV2 } from "../../../components/wizard/wizard";
import { useWizardStore } from "../../../stores/wizard-store";
import { validateSelection } from "../../matrix";

/** Build a SkillConfig array from skill IDs with default scope and source */
export function buildSkillConfigs(
  skillIds: SkillId[],
  overrides?: Partial<Omit<SkillConfig, "id">>,
): SkillConfig[] {
  return skillIds.map((id) => ({
    id,
    scope: overrides?.scope ?? "project",
    source: overrides?.source ?? "eject",
    ...(overrides?.excluded !== undefined && { excluded: overrides.excluded }),
  }));
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
    ? buildSkillConfigs(allSkills, { scope: "global", source: "agents-inc" })
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
