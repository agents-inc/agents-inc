import path from "path";
import { fileURLToPath } from "url";
import { createJiti } from "jiti";
import { fileExists } from "../../utils/fs";
import { verbose } from "../../utils/logger";
import { getErrorMessage } from "../../utils/errors";
import { formatZodIssues } from "../schemas";
import type { z } from "zod";

/** Resolve agents-inc/config to the source config-exports.ts so jiti can load it in dev. */
const CONFIG_EXPORTS_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../config-exports.ts",
);

/**
 * Loads a TypeScript config file using jiti.
 * Returns null when the file does not exist.
 * Throws on validation failure or malformed/broken files.
 *
 * @param configPath - Absolute path to the .ts config file
 * @param schema - Optional Zod schema; when provided, T is inferred from it
 */
export async function loadConfig<T>(configPath: string, schema?: z.ZodType<T>): Promise<T | null> {
  if (!(await fileExists(configPath))) {
    verbose(`Config not found at ${configPath}`);
    return null;
  }

  let raw: unknown;
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

    raw = await jiti.import(configPath, { default: true });
  } catch (error) {
    throw new Error(`Failed to load config from '${configPath}': ${getErrorMessage(error)}`, {
      cause: error,
    });
  }

  // Empty or whitespace-only files produce an empty module object with no default export.
  // Treat this the same as a missing file rather than returning a confusing empty object.
  if (raw == null || (typeof raw === "object" && Object.keys(raw as object).length === 0)) {
    verbose(`Config at ${configPath} has no default export`);
    return null;
  }

  if (schema) {
    const result = schema.safeParse(raw);
    if (!result.success) {
      throw new Error(
        `Config validation failed at '${configPath}': ${formatZodIssues(result.error.issues)}`,
      );
    }
    return result.data;
  }

  // Boundary cast: jiti returns unknown, caller provides expected type
  return raw as T;
}
