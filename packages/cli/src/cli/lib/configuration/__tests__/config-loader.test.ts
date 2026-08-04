import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "path";
import { writeFile } from "fs/promises";
import { z } from "zod";
import { loadConfig } from "../config-loader";
import { createTempDir, cleanupTempDir } from "../../__tests__/test-fs-utils";
import { STANDARD_FILES } from "../../../consts";

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
    // Write a helper module that the config imports
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
