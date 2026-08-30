/**
 * Locates a marker, throwing when it is absent. A raw `indexOf` returning -1
 * would make the callers below slice from the end of the string and hand back
 * a plausible-looking fragment, so `not.toContain` assertions would pass
 * vacuously. A test that cannot find its section must fail, loudly.
 */
function requireMarkerIndex(text: string, marker: string, description: string, from = 0): number {
  const index = text.indexOf(marker, from);
  if (index === -1) {
    throw new Error(`Marker "${marker}" not found in ${description}.`);
  }
  return index;
}

/**
 * Slice a named `const <name>: ...` block out of generated config.ts source.
 * Returns the text from the declaration to the end of its statement.
 *
 * The end is the BLANK LINE the writer puts between declarations, not the
 * closing bracket. Both of the closing brackets this used to key on stopped
 * being markers on 2026-08-26, when the emitted pair became a fixed point of
 * prettier under `semi: false`: `];` and `};` are no longer in the file at all,
 * and an array short enough to sit on one line — a single skill, a single
 * sub-agent — has no closing line to find either.
 */
export function extractNamedSection(source: string, name: "skills" | "agents" | "stack"): string {
  const start = requireMarkerIndex(source, `const ${name}:`, "config source");
  const blankLine = source.indexOf("\n\n", start);
  const section = (
    blankLine === -1 ? source.slice(start) : source.slice(start, blankLine)
  ).trimEnd();

  // The guard the end marker used to be: a section that does not close is one
  // this reader has run past, and every caller's `not.toContain` would pass
  // vacuously on the fragment rather than fail.
  const closer = name === "stack" ? "}" : "]";
  if (!section.endsWith(closer)) {
    throw new Error(`The "${name}" section does not close with "${closer}": ${section}`);
  }

  return section;
}

/**
 * Split a section into its `// global` and `// project` scope halves.
 * `global` runs from the `// global` marker up to `// project`; `project`
 * runs from `// project` to the end of the section.
 *
 * Both markers are emitted only when that scope has entries, so calling this
 * on a single-scope section is a test authoring error and throws.
 */
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
