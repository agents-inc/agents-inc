/**
 * Reads one compiled agent's text back into the decisions `agent.liquid` made about it:
 * what it preloads, what it activates dynamically, and the order it rendered its
 * top-level sections in.
 *
 * **The two skill renderings are not symmetrical, and that is why this module exists**
 * rather than a `toContain` at each call site. A preload is emitted as `pluginRef ?? id`,
 * so in plugin mode it reads `id:id`. A dynamic skill's `### ` HEADING is the bare id in
 * plugin and eject mode alike, and only its `Invoke:` line carries the ref. An assertion
 * keyed on the ref form alone therefore reads one of the four lines a skill can occupy,
 * and a substring scan over the body reads a fifth thing entirely — an id sitting inside
 * a longer id, or inside prose.
 *
 * Frontmatter is parsed by {@link extractFrontmatter}, the reader production uses, so a
 * ref form YAML would treat as a mapping cannot be read here as a string.
 */

import { extractFrontmatter } from "../../../utils/frontmatter.js";
import { elementAt } from "./element-at.js";

/** One entry of the activation protocol's skill list, as the two lines that name it render. */
export type CompiledAgentDynamicEntry = {
  /** The `### ` heading, which is the BARE id in plugin and eject mode alike. */
  id: string;
  /** The `Invoke:` line's ref — `id:id` in plugin mode, the bare id in eject mode. */
  invokeRef: string;
};

/** What one compiled agent's text says about its own composition. */
export type CompiledAgentSections = {
  /** The parsed YAML frontmatter, or `null` when the text carries none. */
  frontmatter: Record<string, unknown> | null;
  /** The frontmatter preload list in rendered order, each in the ref form it carries. */
  preloadedRefs: string[];
  /** The activation protocol's entries in rendered order; empty when the section is absent. */
  dynamicEntries: CompiledAgentDynamicEntry[];
  /** Top-level sections in rendered order, each as the raw line that opens it. */
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

/** Reads one compiled agent's frontmatter, skill partition and section order. */
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

/**
 * Everything after the frontmatter block.
 *
 * `replace` rather than `split`: a compiled body is full of `---` horizontal rules,
 * `split` cuts on every one of them, and taking the second element then hands back the
 * first kilobyte of a 40KB file — an absence assertion over which passes for free.
 */
function bodyOf(content: string): string {
  return content.replace(FRONTMATTER_BLOCK, "");
}

function parsedFrontmatterOf(content: string): Record<string, unknown> | null {
  const parsed = extractFrontmatter(content);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  // Boundary cast: extractFrontmatter answers `unknown` because YAML can hold any shape.
  // The three guards above have ruled out everything a keyed read would be unsound on.
  return parsed as Record<string, unknown>;
}

function preloadedRefsIn(frontmatter: Record<string, unknown> | null): string[] {
  const skills = frontmatter?.skills;
  return Array.isArray(skills) ? skills.map(String) : [];
}

/**
 * The protocol's entries, each paired heading-to-`Invoke:` line rather than scanned for.
 *
 * Pairing is what keeps a protocol's own prose out of the answer — a `### ` heading that names
 * no skill, or a fenced `skill: "[skill-id]"` demonstrating the call, each of which a bare scan
 * for that shape reports as a skill. The shipped template's preamble carries neither since it
 * was slimmed on 2026-09-03; the retired one carried both, and a project overriding
 * `agent.liquid` from its own `.claude-src/agents/_templates/` may carry them again.
 */
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

/** The activation protocol block, or `null` when the agent renders `<skills_note>` instead. */
function activationProtocolIn(body: string): string | null {
  const opensAt = body.indexOf(PROTOCOL_OPENS);
  if (opensAt === -1) return null;

  const closesAt = body.indexOf(PROTOCOL_CLOSES, opensAt);
  return closesAt === -1 ? body.slice(opensAt) : body.slice(opensAt, closesAt);
}

/**
 * Every section the body opens at the top level, as the raw line that opens it — an XML
 * tag alone on its line, or a level-one or level-two markdown heading.
 *
 * Depth is tracked so `<skill_activation_protocol>` is not reported alongside the
 * `<system-reminder>` it renders inside, and fenced code is skipped because an agent's prose
 * demonstrates both tag and heading syntax inside fences. An UNCLOSED tag in prose leaves the
 * depth raised and hides the sections after it, so this reading is exact only for a body whose
 * tags balance — true of a rendered template, not of every agent's hand-written prose.
 *
 * The character classes admit `-` for `<system-reminder>`, the one hyphenated tag a compiled
 * agent carries and the last section of every one of them.
 */
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
