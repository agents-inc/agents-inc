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

/**
 * Thrown when a config file evaluated cleanly but the schema refused its SHAPE.
 *
 * Named apart from the generic load failure because the two mean different things to a caller:
 * a file that cannot be evaluated says only that something is broken, while a refused shape has
 * said exactly what is wrong with a file the user still owns. A loader may reasonably report the
 * first as "no config"; reporting the second that way is how a config carrying a stale key ends
 * up silently repointing an install at the default marketplace.
 */
export class ConfigSchemaError extends Error {
  constructor(
    readonly configPath: string,
    readonly issues: string,
  ) {
    super(`Config validation failed at '${configPath}': ${issues}`);
    this.name = "ConfigSchemaError";
  }
}

/**
 * Thrown when a config file evaluated cleanly and exported bindings, none of which is the default
 * one every config in this project is read out of.
 *
 * Distinct from {@link ConfigSchemaError} because the two fault different lines of the file. A
 * refused shape names a field the author can go and correct; a module that exports
 * `export const skillRules = {...}` has nothing wrong with its contents at all, and validating
 * the module NAMESPACE against the schema is what told such an author their `version` was missing
 * from a file they can see it in.
 */
export class ConfigDefaultExportError extends Error {
  constructor(readonly configPath: string) {
    super(`Config at '${configPath}' has no default export`);
    this.name = "ConfigDefaultExportError";
  }
}

/**
 * The marker every ES module jiti transpiles carries, and a CommonJS one does not. It is the only
 * thing separating `export const x = {}` — a namespace whose keys are named exports — from
 * `module.exports = { x: {} }`, whose keys ARE the default export: both arrive here as a plain
 * object with no `default` key.
 */
const ES_MODULE_MARKER = "__esModule";

/**
 * The default export, or the namespace when there is none — jiti documents `import(id, { default:
 * true })` as exactly this, and the namespace is imported whole here because the option throws the
 * distinction away and {@link ConfigDefaultExportError} is made of it.
 */
function unwrapDefaultExport(namespace: unknown): unknown {
  if (isRecord(namespace) && namespace.default !== undefined) return namespace.default;
  return namespace;
}

/** An ES module that exports bindings, none of them the default one. */
function declaresNoDefaultExport(namespace: unknown): boolean {
  return isRecord(namespace) && ES_MODULE_MARKER in namespace && !("default" in namespace);
}

/** Nothing was exported: an empty file, `export {}`, or a default export with no keys. */
function exportsNothing(value: unknown): boolean {
  return value == null || (typeof value === "object" && Object.keys(value).length === 0);
}

/**
 * Loads a TypeScript config file using jiti.
 * Returns null when the file does not exist, and when it exists but exports nothing.
 * Throws {@link ConfigDefaultExportError} for a module whose exports are all named,
 * {@link ConfigSchemaError} on validation failure, and a plain Error for a malformed/broken file.
 *
 * @param configPath - Absolute path to the .ts config file
 * @param schema - Optional Zod schema; when provided, T is inferred from it
 */
export async function loadConfig<T>(configPath: string, schema?: z.ZodType<T>): Promise<T | null> {
  if (!(await fileExists(configPath))) {
    verbose(`Config not found at ${configPath}`);
    return null;
  }

  let namespace: unknown;
  try {
    const jiti = createJiti(import.meta.url, {
      moduleCache: false,
      interopDefault: true,
      // Both spellings on purpose. `@agents-inc/cli/config` is the package name the CLI published
      // under until 0.150.0, and a config hand-written against the documentation of the day imports
      // it — but nothing answers to that name in node_modules now that the CLI ships as
      // `agents-inc`, so dropping the key would stop such a config loading on upgrade. Removing it
      // once nobody is on the old package: REPO-24 in todo/repo.md.
      alias: {
        "agents-inc/config": CONFIG_EXPORTS_PATH,
        "@agents-inc/cli/config": CONFIG_EXPORTS_PATH,
      },
    });

    namespace = await jiti.import(configPath);
  } catch (error) {
    throw new Error(`Failed to load config from '${configPath}': ${getErrorMessage(error)}`, {
      cause: error,
    });
  }

  const raw = unwrapDefaultExport(namespace);

  // Empty or whitespace-only files produce an empty module object. Treat this the same as a
  // missing file rather than returning a confusing empty object — and ask it BEFORE the export
  // question, because such a file declares no exports of any kind to have opinions about.
  if (exportsNothing(raw)) {
    verbose(`Config at ${configPath} exports nothing`);
    return null;
  }

  if (declaresNoDefaultExport(namespace)) {
    throw new ConfigDefaultExportError(configPath);
  }

  if (schema) {
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new ConfigSchemaError(configPath, formatZodIssues(result.error.issues));
    }
    return result.data;
  }

  // Boundary cast: jiti returns unknown, caller provides expected type
  return raw as T;
}
