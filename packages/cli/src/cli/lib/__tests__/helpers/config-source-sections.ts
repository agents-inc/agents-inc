// Throws rather than returning -1, which would hand callers a fragment that passes `not.toContain`.
function requireMarkerIndex(text: string, marker: string, description: string, from = 0): number {
  const index = text.indexOf(marker, from);
  if (index === -1) {
    throw new Error(`Marker "${marker}" not found in ${description}.`);
  }
  return index;
}

/** Ends at the blank line between declarations; the emitted source carries no `];` or `};`. */
export function extractNamedSection(source: string, name: "skills" | "agents" | "stack"): string {
  const start = requireMarkerIndex(source, `const ${name}:`, "config source");
  const blankLine = source.indexOf("\n\n", start);
  const section = (
    blankLine === -1 ? source.slice(start) : source.slice(start, blankLine)
  ).trimEnd();

  // A section that does not close is one this reader ran past.
  const closer = name === "stack" ? "}" : "]";
  if (!section.endsWith(closer)) {
    throw new Error(`The "${name}" section does not close with "${closer}": ${section}`);
  }

  return section;
}

/** Throws on a single-scope section: each marker is emitted only when its scope has entries. */
export function extractScopeSections(section: string): {
  global: string;
  project: string;
} {
  const globalStart = requireMarkerIndex(section, "// global", "the section");
  const projectStart = requireMarkerIndex(section, "// project", "the section");

  return {
    global: section.slice(globalStart, projectStart),
    project: section.slice(projectStart),
  };
}
