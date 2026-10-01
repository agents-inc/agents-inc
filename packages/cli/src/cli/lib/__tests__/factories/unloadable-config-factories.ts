/**
 * The `config.ts` texts a loader has to refuse — each a file that EXISTS and cannot be loaded,
 * which the loader reports as `ConfigLoadError` rather than as a missing file.
 *
 * The config-side counterpart of `renderUnparseableMetadataYaml()` in `content-generators.ts`: an
 * error-path fixture asks for the breakage BY NAME rather than hand-rolling a broken string per
 * spec. Every renderer here produces text no product writer emits, so none of them may be written
 * through a fixture writer that goes via the product's own writer — `writeCorruptConfig` in
 * `e2e/helpers/test-utils.ts` and `writeRawTestConfig` in `helpers/config-io.ts` are the doors.
 */

import { renderConfigTs } from "../content-generators.js";

/** A `config.ts` no TypeScript parser reads, so the loader throws while evaluating it. */
export function renderUnparseableConfigTs(): string {
  return "export default {{{ not valid typescript";
}

/**
 * `config` as a well-formed module that declares it and exports nothing — the file a user leaves
 * behind by deleting its `export default` line. It parses, so what the loader refuses is the
 * missing default export rather than the syntax.
 */
export function renderConfigTsWithoutDefaultExport(config: Record<string, unknown>): string {
  return `const config = ${JSON.stringify(config, null, 2)};\n`;
}

/**
 * A `config.ts` that loads and whose shape the loader schema rejects: `skills` is a string where
 * the schema requires an array. Everything else about it is valid, so the refusal can only be the
 * schema's.
 */
export function renderSchemaViolatingConfigTs(): string {
  return renderConfigTs({ name: "schema-violation-fixture", skills: "nope", agents: [] });
}
