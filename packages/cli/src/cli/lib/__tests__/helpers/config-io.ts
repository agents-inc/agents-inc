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

/** Resolves `agents-inc/config` to source so jiti can load it in dev. */
const CONFIG_EXPORTS_PATH = path.resolve(__dirname, "../../../config-exports.ts");

export async function readTestYaml<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  // Boundary cast: YAML yields `unknown`; caller supplies the type.
  return parseYaml(content) as T;
}

export async function readTestJson<T>(filePath: string): Promise<T> {
  const content = await readFile(filePath, "utf-8");
  // Boundary cast: JSON.parse yields `any`; caller supplies the type.
  return JSON.parse(content) as T;
}

export async function readTestTsConfig<T>(filePath: string): Promise<T> {
  const jiti = createJiti(import.meta.url, {
    moduleCache: false,
    interopDefault: true,
    // Matches config-loader.ts.
    alias: { "agents-inc/config": CONFIG_EXPORTS_PATH },
  });
  // Boundary cast: jiti yields `unknown`; caller supplies the type.
  const result = await jiti.import(filePath, { default: true });
  return result as T;
}

/** `configSubdir` defaults to the folder `projectDir` is on, per `sourceFolderInUse`. */
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

/** Writes `source` verbatim, for configs no object renders (syntax errors, an empty file). */
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

/** `author` is declared because the object form is valid too; inference would narrow it. */
type TestPackageJsonOverrides = Partial<
  Omit<typeof VALID_PACKAGE_JSON_FILE, "author"> & {
    author: string | { name: string; email?: string; url?: string };
  }
>;

export async function writeTestPackageJson(
  dir: string,
  overrides: TestPackageJsonOverrides = {},
): Promise<void> {
  const pkg = { ...VALID_PACKAGE_JSON_FILE, ...overrides };
  await writeFile(path.join(dir, "package.json"), JSON.stringify(pkg, null, 2));
}
