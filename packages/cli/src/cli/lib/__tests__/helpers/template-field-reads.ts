// Liquid runs with `strictVariables: false`, so a misspelt `agent.*` lookup renders empty silently.
// Only `agent.*` is read: bare context keys can't be told from `{% for %}` loop variables.

// First segment only: in `agent.disallowedTools.size`, `size` is Liquid's pseudo-property.
const AGENT_LOOKUP = /\bagent\.([A-Za-z_][A-Za-z0-9_]*)/g;

export function agentFieldsReadBy(template: string): string[] {
  const named = [...template.matchAll(AGENT_LOOKUP)].map((match) => match[1]);
  return [...new Set(named)].filter((field) => field !== undefined).sort();
}
