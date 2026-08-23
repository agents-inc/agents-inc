/**
 * Reads the `const stack` declaration of a CLI-written `config.ts` back as data, in the
 * compacted form the writer emitted it in.
 *
 * **Deliberately NOT a structural load through `loadConfigOrFail`, and that is the whole
 * reason this module exists.** Loading the file gives you the data and destroys the layout:
 * `compactAssignment` (`configuration/config-writer.ts`) writes `{ id, preloaded: false }` as
 * a bare string and `compactCategoryAssignments` drops an exclusive category's array wrapper,
 * while `normalizeAgentConfig` (`stacks/stacks-loader.ts`) expands both back on load — a bare
 * string to `{ id, preloaded: false }`, a bare value to a one-element array. An assertion
 * naming the written form (`toStrictEqual("api-framework-hono")`) is therefore only observable
 * in the `config.ts` TEXT, so a caller "fixed" onto the loader keeps passing while it has
 * stopped checking the compaction contract it was written to check.
 */

import { extractNamedSection } from "./config-source-sections.js";

/** One skill as the stack writes it: the bare id when it carries no flags, else the object. */
export type CompactedSkillAssignment = string | { id: string; preloaded?: boolean };

/**
 * A written stack — agent name to category to that category's value. The value is the bare
 * assignment when the category is exclusive (it holds at most one skill, so the array wrapper
 * carries nothing) and an array otherwise; see `compactCategoryAssignments` in
 * `configuration/config-writer.ts`.
 */
export type CompactedStack = Record<
  string,
  Record<string, CompactedSkillAssignment | CompactedSkillAssignment[]>
>;

/** The stack a `config.ts` source declares, parsed exactly as the writer laid it out. */
export function compactedStackIn(configSource: string): CompactedStack {
  const declaration = extractNamedSection(configSource, "stack");
  // Boundary: JSON embedded inside a TypeScript file, read back as data.
  return JSON.parse(objectLiteralIn(declaration)) as CompactedStack;
}

/**
 * The object literal assigned by a `const stack: … = { … };` declaration.
 *
 * Anchored on the `=` so braces in a type annotation can never be mistaken for the value, and
 * it throws rather than slicing from an `indexOf` miss — a `-1` would hand back a fragment
 * that parses to something plausible, which is the failure `config-source-sections.ts` exists
 * to refuse.
 */
function objectLiteralIn(declaration: string): string {
  const assignedAt = declaration.indexOf("=");
  const opensAt = declaration.indexOf("{", assignedAt);
  const closesAt = declaration.lastIndexOf("}");

  if (assignedAt === -1 || opensAt === -1 || closesAt < opensAt) {
    throw new Error(`No object literal is assigned in the stack declaration: ${declaration}`);
  }

  return declaration.slice(opensAt, closesAt + 1);
}
