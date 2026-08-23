/**
 * The reader for the model fields a Liquid template looks up on `agent`.
 *
 * `agent.liquid` read `agent.permission_mode` and `agent.disallowed_tools` while `AgentConfig`
 * has always spelled them `permissionMode` and `disallowedTools`, so neither field reached a
 * compiled sub-agent. Nothing reported it: the engine runs with `strictVariables: false`, so a
 * lookup matching no property resolves to `undefined` in silence, a Liquid template is a string
 * `tsc` never opens, and ESLint does not lint `.liquid` at all. The two fields failed
 * differently and both failed quietly — `disallowedTools` lost its whole line, while
 * `permissionMode` kept emitting its key behind a `default:` filter and lost only its value, so
 * a spec asserting the KEY was green throughout.
 *
 * Splitting the question in two is what makes it answerable, exactly as
 * `handed-out-invocations.ts` splits "does this command exist". This module reads the
 * template and says which fields it asks for; the gate beside it holds that reading against a
 * value the compiler has already proved carries every property of `AgentConfig`.
 *
 * **What it does NOT cover, deliberately.** Only lookups rooted at `agent` are extracted. The
 * template's top-level context keys (`identity`, `preloadedSkillIds`, …) share the same silent
 * failure, but they are bare identifiers in a language whose `{% for %}` introduces bare
 * identifiers of its own, so a scan for them cannot tell a context key from a loop variable
 * without interpreting the template. A gate that guessed would report on `skillId`.
 */

/**
 * A lookup on the `agent` object, capturing the FIRST segment only.
 *
 * `agent.disallowedTools.size` asks the model for `disallowedTools`; `size` is Liquid's own
 * pseudo-property on the value that comes back, and is no part of any TypeScript type. Capturing
 * both would report a field the model is not supposed to have.
 */
const AGENT_LOOKUP = /\bagent\.([A-Za-z_][A-Za-z0-9_]*)/g;

/** Every field `template` looks up on `agent`, deduplicated and sorted. */
export function agentFieldsReadBy(template: string): string[] {
  const named = [...template.matchAll(AGENT_LOOKUP)].map((match) => match[1]);
  return [...new Set(named)].filter((field) => field !== undefined).sort();
}
