/**
 * The reader for the partials a Liquid template pulls in.
 *
 * The sibling question to `template-field-reads.ts`, failing the same silent way and for the
 * same four reasons: `tsc` never opens a `.liquid` file, ESLint does not lint one, the engine
 * runs with `strictVariables: false`, and a partial that stops being rendered leaves no trace in
 * the output — the compiled sub-agent is simply shorter. A `{% render %}` tag deleted in a merge
 * and a partial added to the directory and never wired are the same observation from either end,
 * and nothing in the tree could see either.
 *
 * The path is returned exactly as the tag writes it, `methodologies/` prefix included. Stripping
 * it here would make a tag repointed at another directory unreadable to the gate — the directory
 * is part of what the template asked for, not decoration on the name.
 */

/**
 * Reads the partial path out of a `{% render "…" %}` tag.
 *
 * `-?` covers Liquid's whitespace-control form (`{%- render … -%}`), which `agent.liquid` does
 * not use today and which is one edit away from being used. Either quote style is accepted for
 * the same reason.
 */
const RENDER_TAG = /\{%-?\s*render\s+["']([^"']+)["']/g;

/** Every partial `template` renders, in tag order and named once each. */
export function partialsRenderedBy(template: string): string[] {
  const named = [...template.matchAll(RENDER_TAG)].map((match) => match[1]);
  return [...new Set(named)].filter((partial) => partial !== undefined);
}
