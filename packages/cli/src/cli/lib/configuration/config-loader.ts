import path from "path";
import { fileURLToPath } from "url";
import { createJiti } from "jiti";
import { fileExists } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { isRecord } from "../../utils/type-guards";
import { formatZodIssues } from "../schemas";
import type { z } from "zod";

/** Resolve agents-inc/config to the source config-exports.ts so jiti can load it in dev. */
const CONFIG_EXPORTS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../config-exports.ts",
);

/** The config evaluated but the schema refused its shape; never report this as "no config". */
export class ConfigSchemaError extends Error {
  constructor(
    readonly configPath: string,
    readonly issues: string,
  ) {
    super(`Config validation failed at '${configPath}': ${issues}`);
    this.name = "ConfigSchemaError";
  }
}

/** The config evaluated but exports only named bindings, so its contents are not at fault. */
export class ConfigDefaultExportError extends Error {
  constructor(readonly configPath: string) {
    super(`Config at '${configPath}' has no default export`);
    this.name = "ConfigDefaultExportError";
  }
}

/** The config did not evaluate: a syntax error, an unresolved import, or a throw while it ran. */
export class ConfigEvaluationError extends Error {
  constructor(
    readonly configPath: string,
    reason: string,
    options: ErrorOptions,
  ) {
    super(configLoadFailure(configPath, reason), options);
    this.name = "ConfigEvaluationError";
  }
}

/**
 * Tells `export const x = {}` (named exports) from CommonJS `module.exports = { x }` (the default).
 */
const ES_MODULE_MARKER = "__esModule";

/**
 * The default export, or the namespace when there is none; imported whole to tell the two apart.
 */
function unwrapDefaultExport(namespace: unknown): unknown {
  if (isRecord(namespace) && "default" in namespace) return namespace.default;
  return namespace;
}

function declaresNoDefaultExport(namespace: unknown): boolean {
  return isRecord(namespace) && ES_MODULE_MARKER in namespace && !("default" in namespace);
}

/** Why a reader that found the file rejects one `loadConfig` answers `null` for. */
export const NO_VALID_DEFAULT_EXPORT = "the file has no valid default export";

export function configLoadFailure(configPath: string, reason: string): string {
  return `Failed to load config from '${configPath}': ${reason}`;
}

/** Nothing was exported: an empty file, `export {}`, or a default of `undefined` or no keys. */
function exportsNothing(value: unknown): boolean {
  return value == null || (typeof value === "object" && Object.keys(value).length === 0);
}

/** Null when absent or exporting nothing; throws for named-only exports, refusals and breakage. */
export async function loadConfig<T>(configPath: string, schema?: z.ZodType<T>): Promise<T | null> {
  if (!(await fileExists(configPath))) {
    verbose(`Config not found at ${configPath}`);
    return null;
  }

  const namespace = await importConfigModule(configPath);
  const raw = unwrapDefaultExport(namespace);

  // An empty file reads as missing, asked before the export question since it declares no exports.
  if (exportsNothing(raw)) {
    verbose(`Config at ${configPath} exports nothing`);
    return null;
  }

  if (declaresNoDefaultExport(namespace)) {
    throw new ConfigDefaultExportError(configPath);
  }

  // Boundary cast: jiti returns unknown, caller provides expected type
  if (!schema) return raw as T;

  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ConfigSchemaError(configPath, formatZodIssues(result.error.issues));
  }
  return result.data;
}

/** A fresh engine and no module cache: one run writes a config and reads it back several times. */
async function importConfigModule(configPath: string): Promise<unknown> {
  try {
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      interopDefault: true,
      alias: { "agents-inc/config": CONFIG_EXPORTS_PATH },
    });
    return await jiti.import(configPath);
  } catch (error) {
    throw new ConfigEvaluationError(configPath, getErrorMessage(error), { cause: error });
  }
}
