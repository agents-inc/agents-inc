// Paths keep their directory prefix: the directory is part of what the template asked for.
const RENDER_TAG = /\{%-?\s*render\s+["']([^"']+)["']/g;

export function partialsRenderedBy(template: string): string[] {
  const named = [...template.matchAll(RENDER_TAG)].map((match) => match[1]);
  return [...new Set(named)].filter((partial) => partial !== undefined);
}
