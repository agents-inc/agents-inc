import path from "path";
import { fileURLToPath } from "url";
import { mkdir, writeFile, readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { createJiti } from "jiti";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts";
import { renderConfigTs } from "../content-generators";
import { VALID_PACKAGE_JSON_FILE } from "../mock-data/mock-source-files.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Resolve agents-inc/config to the source config-exports.ts so jiti can load it in dev. */
const CONFIG_EXPORTS_PATH = path.resolve(__dirname, "../../../config-exports.ts");

export async function readTestYaml<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  // Boundary cast: YAML parse returns `unknown`, caller provides expected type
  return parseYaml(content) as T;
}

/** Reads and JSON-parses a file. Throws on missing file; caller provides the type. */
export async function readTestJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  // Boundary cast: JSON.parse returns `any`, caller provides expected type
  return JSON.parse(content) as T;
}

/**
 * Load a config file using jiti. Handles defineConfig(), satisfies, and plain exports.
 */
export async function readTestTsConfig<T>(filePath: string): Promise<T> {
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    interopDefault: true,
    // Both spellings, matching config-loader.ts: `@agents-inc/cli/config` is the name the CLI
    // published under until 0.150.0, kept so a config hand-written against it still loads. See
    // config-loader.ts for the full reason, and REPO-24 in todo/repo.md for removing it.
    alias: {
      "agents-inc/config": CONFIG_EXPORTS_PATH,
      "@agents-inc/cli/config": CONFIG_EXPORTS_PATH,
    },
  });
  // Boundary cast: jiti returns unknown, caller provides expected type
  const result = await jiti.import(filePath, { default: true });
  return result as T;
}

/**
 * Writes a config file with the given object into the given subdirectory
 * (defaults to CLAUDE_SRC_DIR). Returns the absolute path of the written config.ts.
 */
export async function writeTestTsConfig(
  projectDir: string,
  config: Record<string, unknown>,
  configSubdir: string = CLAUDE_SRC_DIR,
): Promise<string> {
  const configDir = path.join(projectDir, configSubdir);
  await mkdir(configDir, { recursive: true });
  const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
  await writeFile(configPath, renderConfigTs(config));
  return configPath;
}

/**
 * Writes `source` verbatim as the project's `config.ts` — the raw-text sibling of
 * {@link writeTestTsConfig}, for the corruption cases a config object cannot express (a
 * syntax error, a missing default export, a shape the loader schema rejects). Returns the
 * absolute path of the written file.
 */
export async function writeCorruptTestConfig(projectDir: string, source: string): Promise<string> {
  const configDir = path.join(projectDir, CLAUDE_SRC_DIR);
  await mkdir(configDir, { recursive: true });
  const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
  await writeFile(configPath, source);
  return configPath;
}

/**
 * Writes a package.json at the given directory.
 *
 * Used by `build marketplace` tests (unit + E2E) which read marketplace
 * identity (name, version, description, author) from package.json at the cwd.
 * Accepts overrides to vary individual fields for negative-case tests.
 */
export async function writeTestPackageJson(
  dir: string,
  overrides: Partial<typeof VALID_PACKAGE_JSON_FILE> = {},
): Promise<void> {
  const pkg = { ...VALID_PACKAGE_JSON_FILE, ...overrides };
  await writeFile(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
}
