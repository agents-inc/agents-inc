/**
 * Reads a compiled agent's preloads, dynamic skills and top-level section order. The renderings
 * are asymmetric: a plugin-mode preload reads `id:id`, while a dynamic skill's heading is the bare
 * id in both modes and only its `Invoke:` line carries the ref.
 */

import { extractFrontmatter } from "../../../utils/frontmatter.js";
import { elementAt } from "./element-at.js";

export type CompiledAgentDynamicEntry = {
  id: string;
  invokeRef: string;
};

export type CompiledAgentSections = {
  frontmatter: Record<string, unknown> | null;
  preloadedRefs: string[];
  dynamicEntries: CompiledAgentDynamicEntry[];
  /** Each as the raw line that opens it. */
  sectionOrder: string[];
};

const FRONTMATTER_BLOCK = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;
const LINE_BREAK = /\r?\n/;

const PROTOCOL_OPENS = "<skill_activation_protocol>";
const PROTOCOL_CLOSES = "</skill_activation_protocol>";

const SKILL_HEADING = /^### (.+)$/;
const INVOKE_REF = /^- Invoke: `skill: "(.*)"`$/;

const SECTION_OPENS = /^<[a-z][a-z0-9_-]*>$/;
const SECTION_CLOSES = /^<\/[a-z][a-z0-9_-]*>$/;
const TOP_LEVEL_HEADING = /^#{1,2} \S/;
const CODE_FENCE = /^(?:```|~~~)/;

export function parseCompiledAgentSections(content: string): CompiledAgentSections {
  const frontmatter = parsedFrontmatterOf(content);
  const body = bodyOf(content);

  return {
    frontmatter,
    preloadedRefs: preloadedRefsIn(frontmatter),
    dynamicEntries: dynamicEntriesIn(body),
    sectionOrder: topLevelSectionsIn(body),
  };
}

// `replace`, not `split`: the body is full of `---` rules.
function bodyOf(content: string): string {
  return content.replace(FRONTMATTER_BLOCK, "");
}

function parsedFrontmatterOf(content: string): Record<string, unknown> | null {
  const parsed = extractFrontmatter(content);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  // Boundary cast: YAML yields `unknown`; the guards above rule out non-records.
  return parsed as Record<string, unknown>;
}

function preloadedRefsIn(frontmatter: Record<string, unknown> | null): string[] {
  const skills = frontmatter?.skills;
  return Array.isArray(skills) ? skills.map(String) : [];
}

// Pairs each heading with its `Invoke:` line so prose headings and demonstrated calls in an
// overriding template are not reported as skills.
function dynamicEntriesIn(body: string): CompiledAgentDynamicEntry[] {
  const protocol = activationProtocolIn(body);
  if (protocol === null) return [];

  const entries: CompiledAgentDynamicEntry[] = [];
  let heading = "";

  for (const line of protocol.split(LINE_BREAK)) {
    const headingMatch = SKILL_HEADING.exec(line);
    if (headingMatch) {
      heading = elementAt(headingMatch, 1);
      continue;
    }
    const invokeMatch = INVOKE_REF.exec(line);
    if (invokeMatch) entries.push({ id: heading, invokeRef: elementAt(invokeMatch, 1) });
  }

  return entries;
}

/** `null` when the agent renders `<skills_note>` instead. */
function activationProtocolIn(body: string): string | null {
  const opensAt = body.indexOf(PROTOCOL_OPENS);
  if (opensAt === -1) return null;

  const closesAt = body.indexOf(PROTOCOL_CLOSES, opensAt);
  return closesAt === -1 ? body.slice(opensAt) : body.slice(opensAt, closesAt);
}

// A lone XML tag line or an h1/h2 heading, outside fences and at depth 0. Exact only when the
// body's tags balance: an unclosed tag hides every section after it.
function topLevelSectionsIn(body: string): string[] {
  const sections: string[] = [];
  let depth = 0;
  let fenced = false;

  for (const line of body.split(LINE_BREAK)) {
    if (CODE_FENCE.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;

    if (SECTION_OPENS.test(line)) {
      if (depth === 0) sections.push(line);
      depth++;
      continue;
    }
    if (SECTION_CLOSES.test(line)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0 && TOP_LEVEL_HEADING.test(line)) sections.push(line);
  }

  return sections;
}
