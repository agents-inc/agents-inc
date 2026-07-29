import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CLAUDE_DIR, STANDARD_FILES } from "../consts.js";
import { createTempDir, cleanupTempDir } from "./__tests__/test-fs-utils.js";
import { checkPermissions } from "./permission-checker.js";

vi.mock("../utils/logger.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/logger.js")>()),
  warn: vi.fn(),
}));

import { warn } from "../utils/logger.js";

const PERMISSIONS_WITH_ALLOWS = {
  permissions: { allow: ["Read(*)", "Bash(git *)"] },
};

async function writeSettingsFile(projectDir: string, settings: Record<string, unknown>) {
  const claudeDir = path.join(projectDir, CLAUDE_DIR);
  await mkdir(claudeDir, { recursive: true });
  await writeFile(path.join(claudeDir, STANDARD_FILES.SETTINGS_JSON), JSON.stringify(settings));
}

describe("checkPermissions settings-file field validation", () => {
  let projectDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  it("does not warn on a settings file produced by the CLI's own plugin install", async () => {
    // claudePluginInstall writes enabledPlugins; claudePluginMarketplaceAdd writes extraKnownMarketplaces
    await writeSettingsFile(projectDir, {
      ...PERMISSIONS_WITH_ALLOWS,
      enabledPlugins: { "web-framework-react@agents-inc": true },
      extraKnownMarketplaces: {
        "agents-inc": { source: { source: "github", repo: "agents-inc/skills" } },
      },
    });

    const result = await checkPermissions(projectDir);

    expect(warn).not.toHaveBeenCalled();
    expect(result, "warning-free settings with allow rules must render no notice").toBeNull();
  });

  it("does not warn when every known Claude CLI settings field is present", async () => {
    await writeSettingsFile(projectDir, {
      ...PERMISSIONS_WITH_ALLOWS,
      enabledPlugins: {},
      extraKnownMarketplaces: {},
      env: {},
      allowedTools: [],
      customInstructions: "",
      defaultModel: "sonnet",
    });

    await checkPermissions(projectDir);

    expect(warn).not.toHaveBeenCalled();
  });

  it("warns about a genuinely unknown settings field", async () => {
    await writeSettingsFile(projectDir, {
      ...PERMISSIONS_WITH_ALLOWS,
      someUnknownField: true,
    });

    await checkPermissions(projectDir);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Unknown fields in settings file"));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("someUnknownField"));
  });

  it("does not report known fields alongside a genuinely unknown one", async () => {
    await writeSettingsFile(projectDir, {
      ...PERMISSIONS_WITH_ALLOWS,
      extraKnownMarketplaces: {},
      someUnknownField: true,
    });

    await checkPermissions(projectDir);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining("extraKnownMarketplaces"));
  });
});
