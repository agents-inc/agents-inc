import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { writeFile } from "fs/promises";
import { z } from "zod";
import { loadConfig } from "../config-loader";
import { createTempDir, cleanupTempDir } from "../../__tests__/test-fs-utils";
import { STANDARD_FILES } from "../../../consts";
import { renderConfigTs } from "../../__tests__/content-generators";
import { renderUnparseableConfigTs } from "../../__tests__/factories/unloadable-config-factories";
import { silenceConsole } from "../../__tests__/helpers/silence-console";
import { setVerbose } from "../../../utils/logger";
import { defaultStacks } from "../default-stacks";

let tempDir: string;

beforeEach(async () => {
  tempDir = await createTempDir("config-loader-");
});

afterEach(async () => {
  await cleanupTempDir(tempDir);
});

describe("loadConfig", () => {
  it("returns null for nonexistent file", async () => {
    const result = await loadConfig(path.join(tempDir, "nonexistent.ts"));
    expect(result).toBeNull();
  });

  it("loads a valid config file with default export", async () => {
    const configPath = path.join(tempDir, STANDARD_FILES.CONFIG_TS);
    await writeFile(
      configPath,
      `export default { name: "my-project", agents: ["web-developer"], skills: [] };`,
    );
    const result = await loadConfig<{ name: string }>(configPath);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("my-project");
  });

  it("throws for malformed file with syntax error", async () => {
    const configPath = path.join(tempDir, "bad-syntax.ts");
    await writeFile(configPath, `export default {{{{{ broken syntax`);
    await expect(loadConfig(configPath)).rejects.toThrow("Failed to load config from");
  });

  it("throws when Zod schema rejects the data", async () => {
    const configPath = path.join(tempDir, "invalid-schema.ts");
    await writeFile(configPath, `export default { count: 42 };`);

    const schema = z.object({ name: z.string() });
    await expect(loadConfig(configPath, schema)).rejects.toThrow("Config validation failed at");
  });

  it("returns validated data when Zod schema accepts", async () => {
    const configPath = path.join(tempDir, "valid-schema.ts");
    await writeFile(
      configPath,
      `export default { name: "validated", agents: ["web-developer"], skills: [] };`,
    );

    const schema = z.object({
      name: z.string(),
      agents: z.array(z.string()),
      skills: z.array(z.string()),
    });
    const result = await loadConfig<{ name: string; agents: string[]; skills: string[] }>(
      configPath,
      schema,
    );
    expect(result).not.toBeNull();
    expect(result!.name).toBe("validated");
  });

  it("names the missing default export instead of validating the module namespace", async () => {
    const configPath = path.join(tempDir, "named-only.ts");
    await writeFile(configPath, `export const skillRules = { version: "1.0.0" };\n`);

    const schema = z.object({ version: z.string() });

    await expect(loadConfig(configPath, schema)).rejects.toThrow(
      `Config at '${configPath}' has no default export`,
    );
  });

  it("names the missing default export even when no schema is supplied", async () => {
    const configPath = path.join(tempDir, "named-only-no-schema.ts");
    await writeFile(configPath, `export const stacks = {};\n`);

    await expect(loadConfig(configPath)).rejects.toThrow("has no default export");
  });

  it("loads a module whose export is assigned to module.exports", async () => {
    const configPath = path.join(tempDir, "commonjs-config.ts");
    await writeFile(configPath, `module.exports = { name: "from-module-exports" };\n`);

    const result = await loadConfig<{ name: string }>(configPath);

    expect(result).toStrictEqual({ name: "from-module-exports" });
  });

  it("returns null for empty file (zero bytes)", async () => {
    const configPath = path.join(tempDir, STANDARD_FILES.CONFIG_TS);
    await writeFile(configPath, "");
    const result = await loadConfig(configPath);
    expect(result).toBeNull();
  });

  it("returns null for whitespace-only file", async () => {
    const configPath = path.join(tempDir, STANDARD_FILES.CONFIG_TS);
    await writeFile(configPath, "   \n\n  \n");
    const result = await loadConfig(configPath);
    expect(result).toBeNull();
  });

  it("handles config that uses defineConfig identity function", async () => {
    const helperPath = path.join(tempDir, "helper.ts");
    await writeFile(
      helperPath,
      `export function defineConfig<const T>(config: T): T { return config; }`,
    );

    const configPath = path.join(tempDir, "with-define.ts");
    await writeFile(
      configPath,
      [
        `import { defineConfig } from "./helper";`,
        `export default defineConfig({ name: "defined", agents: [], skills: [] });`,
      ].join("\n"),
    );
    const result = await loadConfig<{ name: string }>(configPath);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("defined");
  });
});

describe("loadConfig, further", () => {
  const configPath = () => path.join(tempDir, STANDARD_FILES.CONFIG_TS);

  it("reads a default export that is a number as that number, not as nothing", async () => {
    await writeFile(configPath(), "export default 42;\n");

    expect(await loadConfig(configPath())).toBe(42);
  });

  it("resolves the agents-inc/config import a written config carries", async () => {
    await writeFile(
      configPath(),
      [
        `import { defineConfig } from "agents-inc/config";`,
        `export default defineConfig({ name: "aliased", agents: [], skills: [] });`,
      ].join("\n"),
    );

    expect(await loadConfig(configPath())).toStrictEqual({
      name: "aliased",
      agents: [],
      skills: [],
    });
  });

  it("resolves defaultStacks, which only the agents-inc/config entry exports", async () => {
    await writeFile(
      configPath(),
      [
        `import { defaultStacks } from "agents-inc/config";`,
        `export default { stacks: defaultStacks };`,
      ].join("\n"),
    );

    expect(await loadConfig(configPath())).toStrictEqual({ stacks: defaultStacks });
  });

  it("reads a rewritten config afresh rather than from a cache", async () => {
    await writeFile(configPath(), renderConfigTs({ name: "first" }));
    await loadConfig(configPath());
    await writeFile(configPath(), renderConfigTs({ name: "second" }));

    expect(await loadConfig(configPath())).toStrictEqual({ name: "second" });
  });

  it("names each refusal by its class and carries the loader's own error as the cause", async () => {
    await writeFile(configPath(), renderConfigTs({ count: 42 }));
    await expect(loadConfig(configPath(), z.object({ name: z.string() }))).rejects.toMatchObject({
      name: "ConfigSchemaError",
    });

    await writeFile(configPath(), "export const stacks = {};\n");
    await expect(loadConfig(configPath())).rejects.toMatchObject({
      name: "ConfigDefaultExportError",
    });

    await writeFile(configPath(), renderUnparseableConfigTs());
    await expect(loadConfig(configPath())).rejects.toMatchObject({ cause: expect.any(Error) });
  });

  describe("verbose", () => {
    const consoleSpies = silenceConsole(["log"]);

    beforeEach(() => setVerbose(true));
    afterEach(() => setVerbose(false));

    it("says where it found no config, and which config exports nothing", async () => {
      await loadConfig(configPath());
      expect(consoleSpies.log).toHaveBeenCalledWith(`  Config not found at ${configPath()}`);

      await writeFile(configPath(), "");
      await loadConfig(configPath());
      expect(consoleSpies.log).toHaveBeenCalledWith(`  Config at ${configPath()} exports nothing`);
    });
  });
});
