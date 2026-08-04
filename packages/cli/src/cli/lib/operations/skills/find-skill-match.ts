import type { SkillComparisonResult } from "../../skills/index.js";

export type SkillMatchResult = {
  match: SkillComparisonResult | null;
  similar: string[];
};

/**
 * Finds a skill by exact ID, partial name, or directory name.
 * Falls back to fuzzy matching and returns similar suggestions.
 */
export function findSkillMatch(
  skillName: string,
  results: SkillComparisonResult[],
): SkillMatchResult {
  // Exact match by ID
  const exact = results.find((r) => r.id === skillName);
  if (exact) return { match: exact, similar: [] };

  // Partial match (without author suffix)
  const partial = results.find((r) => {
    const nameWithoutAuthor = r.id.replace(/\s*\(@\w+\)$/, "").toLowerCase();
    return nameWithoutAuthor === skillName.toLowerCase();
  });
  if (partial) return { match: partial, similar: [] };

  // Match by directory name
  const byDir = results.find((r) => r.dirName.toLowerCase() === skillName.toLowerCase());
  if (byDir) return { match: byDir, similar: [] };

  // No match — find similar suggestions
  const lowered = skillName.toLowerCase();
  const similar = results
    .filter((r) => {
      const name = r.id.toLowerCase();
      const dir = r.dirName.toLowerCase();
      return (
        name.includes(lowered) || dir.includes(lowered) || lowered.includes(name.split(" ")[0])
      );
    })
    .map((r) => r.id)
    .slice(0, 3);

  return { match: null, similar };
}
