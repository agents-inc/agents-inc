/**
 * `config.ts` texts that exist and cannot be loaded. No product writer emits them, so write them
 * through `writeCorruptConfig` or `writeRawTestConfig`, never via the product's own writer.
 */

import { renderConfigTs } from "../content-generators.js";

/** A `config.ts` no TypeScript parser reads, so the loader throws while evaluating it. */
export function renderUnparseableConfigTs(): string {
  return "export default {{{ not valid typescript";
}

/** Parses, so the loader refuses the missing default export rather than the syntax. */
export function renderConfigTsWithoutDefaultExport(config: Record<string, unknown>): string {
  return `const config = ${JSON.stringify(config, null, 2)};\n`;
}

/**
 * Loads, but `skills` is a string, so the refusal is the schema's. `marketplace` asks whether a
 * settings-only reader still takes it from a file the loader refuses.
 */
export function renderSchemaViolatingConfigTs(marketplace?: string): string {
  return renderConfigTs({
    name: "schema-violation-fixture",
    ...(marketplace !== undefined && { marketplace }),
    skills: "nope",
    agents: [],
  });
}

/** Only `field` is wrong, so a refusal can only be about it. */
export function renderConfigTsWithAgentField(field: "model" | "codexModel", value: string): string {
  return renderConfigTs({
    name: "agent-field-fixture",
    skills: [],
    agents: [{ name: "web-developer", scope: "project", [field]: value }],
  });
}
