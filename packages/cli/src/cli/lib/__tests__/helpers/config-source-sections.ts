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
 * Returns the text from the declaration up to and including its closing
 * `];` (arrays) or `};` (the stack object).
 */
export function extractNamedSection(source: string, name: "skills" | "agents" | "stack"): string {
  const startMarker = `const ${name}:`;
  const endMarker = name === "stack" ? "};" : "];";

  const start = requireMarkerIndex(source, startMarker, "config source");
  const end = requireMarkerIndex(source, endMarker, `the "${name}" section`, start);

  return source.slice(start, end + endMarker.length);
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
