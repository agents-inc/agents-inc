import path from "path";
import { fileURLToPath } from "url";
import { mkdir, writeFile, readFile } from "fs/promises";
import { parse as parseYaml } from "yaml";
import { createJiti } from "jiti";
import { STANDARD_FILES } from "../../../consts";
import { sourceFolderInUse } from "../../installation/install-layout";
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
    // Matching config-loader.ts, which resolves the one public specifier a hand-written config
    // can import real data from.
    alias: { "agents-inc/config": CONFIG_EXPORTS_PATH },
  });
  // Boundary cast: jiti returns unknown, caller provides expected type
  const result = await jiti.import(filePath, { default: true });
  return result as T;
}

/**
 * Writes a config file with the given object into the given subdirectory.
 *
 * The default is the folder `projectDir` is ON — `sourceFolderInUse`'s answer, which is the legacy
 * name for a directory already holding one and the folder this release installs into for every
 * other. A fixture whose subject IS one of the two layouts passes `configSubdir` outright; that is
 * how `install-layout.test.ts` plants each rung of the preference order.
 *
 * Returns the absolute path of the written config.ts.
 */
export async function writeTestTsConfig(
  projectDir: string,
  config: Record<string, unknown>,
  configSubdir: string = sourceFolderInUse(projectDir, "claude").relName,
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
 * syntax error, a missing default export, a shape the loader schema rejects) and for the one
 * config no object renders: an EMPTY file. Returns the absolute path of the
 * written file. _Named `writeCorruptTestConfig` until 2026-09-26, which made the empty-file caller
 * read as testing corruption._
 *
 * `configSubdir` defaults to the folder `projectDir` is ON, as {@link writeTestTsConfig}'s does. It
 * is a parameter for a fixture whose subject IS one folder, and for the one reader that reads a
 * DIFFERENT file: a marketplace source repo declares its layout at `<dir>/.agents-inc/config.ts`,
 * with no provider folder, so a fixture for it cannot be written where an installation's config
 * goes.
 */
export async function writeRawTestConfig(
  projectDir: string,
  source: string,
  configSubdir?: string,
): Promise<string> {
  const configDir =
    configSubdir === undefined
      ? sourceFolderInUse(projectDir, "claude").dir
      : path.join(projectDir, configSubdir);
  await mkdir(configDir, { recursive: true });
  const configPath = path.join(configDir, STANDARD_FILES.CONFIG_TS);
  await writeFile(configPath, source);
  return configPath;
}

/**
 * The overrides `writeTestPackageJson` accepts. `author` is declared rather than
 * inferred from {@link VALID_PACKAGE_JSON_FILE}: npm and `build marketplace`'s own
 * `packageJsonSchema` both accept the object form, and inferring the field from one
 * string-form example narrows it to `string`, which is what three specs were paying
 * for with an `as unknown as string` cast on the exact input they exist to prove.
 */
type TestPackageJsonOverrides = Partial<
  Omit<typeof VALID_PACKAGE_JSON_FILE, "author"> & {
    author: string | { name: string; email?: string; url?: string };
  }
>;

/**
 * Writes a package.json at the given directory.
 *
 * Used by `build marketplace` tests (unit + E2E) which read marketplace
 * identity (name, version, description, author) from package.json at the cwd.
 * Accepts overrides to vary individual fields for negative-case tests.
 */
export async function writeTestPackageJson(
  dir: string,
  overrides: TestPackageJsonOverrides = {},
): Promise<void> {
  const pkg = { ...VALID_PACKAGE_JSON_FILE, ...overrides };
  await writeFile(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
}
