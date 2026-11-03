import os from "os";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { filesATakeBackMayEmpty, removeIfHoldingNothing } from "../host-files-left-empty.js";
import { CODEX_HOME_VAR } from "../../installation/install-layout.js";
import { cleanupTempDir, createTempDir, fileExists } from "../../__tests__/test-fs-utils.js";

describe("the files a refused run's take-back may delete", () => {
  const HOME = "/home/someone";
  const PROJECT = path.join(HOME, "a-project");
  const CODEX_HOME = "/elsewhere/codex-home";

  beforeEach(() => {
    vi.spyOn(os, "homedir").mockReturnValue(HOME);
    vi.stubEnv(CODEX_HOME_VAR, CODEX_HOME);
  });

  afterEach(() => {
    vi.mocked(os.homedir).mockRestore();
    vi.unstubAllEnvs();
  });

  it("names the project's settings, the home's settings, and Claude's marketplace and plugin registries on Claude", () => {
    expect(
      filesATakeBackMayEmpty("claude", PROJECT),
      "Claude's plugin uninstall and marketplace remove leave each of these holding nothing",
    ).toStrictEqual([
      path.join(PROJECT, ".claude", "settings.json"),
      path.join(HOME, ".claude", "settings.json"),
      path.join(HOME, ".claude", "plugins", "known_marketplaces.json"),
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
    ]);
  });

  it("names the home's settings once where the project is the home", () => {
    expect(filesATakeBackMayEmpty("claude", HOME)).toStrictEqual([
      path.join(HOME, ".claude", "settings.json"),
      path.join(HOME, ".claude", "plugins", "known_marketplaces.json"),
      path.join(HOME, ".claude", "plugins", "installed_plugins.json"),
    ]);
  });

  it("names Codex's config.toml in $CODEX_HOME on Codex, which its marketplace remove can leave with nothing in it", () => {
    expect(filesATakeBackMayEmpty("codex", PROJECT)).toStrictEqual([
      path.join(CODEX_HOME, "config.toml"),
    ]);
  });
});

describe("a file a take-back may delete", () => {
  let tempDir: string;
  let file: string;

  beforeEach(async () => {
    tempDir = await createTempDir("take-back-files-");
    file = path.join(tempDir, ".claude", "settings.json");
    await mkdir(path.dirname(file), { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  it.each([
    { holding: "the empty plugin list", content: '{"enabledPlugins": {}}' },
    { holding: "the empty marketplace list", content: '{"extraKnownMarketplaces": {}}' },
    { holding: "an empty registry", content: "{}" },
    {
      holding: "both lists, empty",
      content: '{"enabledPlugins": {}, "extraKnownMarketplaces": {}}',
    },
  ])("is deleted holding $holding", async ({ content }) => {
    await writeFile(file, content);

    await removeIfHoldingNothing(file);

    expect(await fileExists(file), "a file holding nothing but empty objects goes").toBe(false);
  });

  it.each([
    { holding: "a plugin", content: '{"enabledPlugins": {"web-framework-react@acme": true}}' },
    {
      holding: "a setting beside the empty list",
      content: '{"enabledPlugins": {}, "model": "opus"}',
    },
    { holding: "an empty array", content: "[]" },
    { holding: "text that is not JSON", content: "not json" },
  ])("is kept holding $holding", async ({ content }) => {
    await writeFile(file, content);

    await removeIfHoldingNothing(file);

    expect(await fileExists(file), "a file holding anything else is the user's").toBe(true);
  });

  it("leaves a missing file missing", async () => {
    await removeIfHoldingNothing(file);

    expect(await fileExists(file)).toBe(false);
  });
});

describe("a host file beside the settings that a take-back may delete", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("take-back-host-files-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  async function holding(relative: string, content: string): Promise<string> {
    const file = path.join(tempDir, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
    return file;
  }

  const REGISTRY = path.join(".claude", "plugins", "installed_plugins.json");
  const CODEX_CONFIG = path.join(".codex", "config.toml");

  it.each([
    {
      holding: "Claude's plugin registry with no plugin in it",
      relative: REGISTRY,
      content: '{\n  "version": 2,\n  "plugins": {}\n}',
    },
    { holding: "Codex's config.toml with nothing in it", relative: CODEX_CONFIG, content: "" },
  ])("is deleted, being $holding", async ({ relative, content }) => {
    const file = await holding(relative, content);

    await removeIfHoldingNothing(file);

    expect(await fileExists(file), "a file holding nothing goes").toBe(false);
  });

  it.each([
    {
      holding: "Claude's plugin registry holding a plugin",
      relative: REGISTRY,
      content: JSON.stringify({
        version: 2,
        plugins: { "web-framework-react@acme": [{ scope: "user", version: "1.0.0" }] },
      }),
    },
    {
      holding: "Codex's config.toml holding a setting",
      relative: CODEX_CONFIG,
      content: 'model_reasoning_effort = "high"\n',
    },
    {
      holding: "Codex's config.toml holding a marketplace",
      relative: CODEX_CONFIG,
      content: '[marketplaces.acme]\nsource_type = "local"\nsource = "/somewhere/acme"\n',
    },
  ])("is kept, being $holding", async ({ relative, content }) => {
    const file = await holding(relative, content);

    await removeIfHoldingNothing(file);

    expect(await fileExists(file), "a file holding anything is the user's").toBe(true);
  });
});
