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

/** Denies the tool most agents need, so a parsed block renders a notice this test can see. */
const PERMISSIONS_DENYING_BASH = {
  permissions: { allow: ["Read(*)"], deny: ["Bash(*)"] },
};

/**
 * Settings Claude Code writes for itself. The CLI has no list of these to be complete against —
 * Claude Code adds keys on its own release schedule — which is exactly why it must not judge them.
 */
const CLAUDE_CODE_OWN_SETTINGS = {
  model: "opusplan",
  statusLine: { type: "command", command: "npx ccstatusline@latest" },
  effortLevel: "high",
  attributionSettings: { coAuthoredBy: false },
};

async function writeSettingsFile(
  projectDir: string,
  settings: Record<string, unknown>,
  fileName: string = STANDARD_FILES.SETTINGS_JSON,
) {
  const claudeDir = path.join(projectDir, CLAUDE_DIR);
  await mkdir(claudeDir, { recursive: true });
  await writeFile(path.join(claudeDir, fileName), JSON.stringify(settings));
}

/**
 * settings.json belongs to Claude Code; this CLI reads one key out of it (`permissions`) and owns
 * nothing else in the file. So no field in it — known, unknown, or invented next release — is
 * something this CLI may warn about. What it must still do is read the permissions block out of
 * whatever else the file happens to carry.
 */
describe("checkPermissions settings-file field handling", () => {
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

  it("does not warn about a settings field it has never heard of", async () => {
    await writeSettingsFile(projectDir, {
      ...PERMISSIONS_WITH_ALLOWS,
      someUnknownField: true,
    });

    const result = await checkPermissions(projectDir);

    expect(warn).not.toHaveBeenCalled();
    expect(result, "a field the CLI does not own must not turn into a notice either").toBeNull();
  });

  it("does not warn about an unfamiliar field sitting alongside familiar ones", async () => {
    await writeSettingsFile(projectDir, {
      ...PERMISSIONS_WITH_ALLOWS,
      extraKnownMarketplaces: {},
      someUnknownField: true,
    });

    await checkPermissions(projectDir);

    expect(warn).not.toHaveBeenCalled();
  });

  it("says nothing about the settings Claude Code writes for itself, and still reads permissions", async () => {
    await writeSettingsFile(projectDir, {
      ...PERMISSIONS_WITH_ALLOWS,
      ...CLAUDE_CODE_OWN_SETTINGS,
    });

    const result = await checkPermissions(projectDir);

    expect(warn).not.toHaveBeenCalled();
    // Null is the "permissions were read and they are fine" outcome — a file whose permissions
    // went unread renders the "No permissions configured" notice instead.
    expect(result, "allow rules with no restrictive deny must render no notice").toBeNull();
  });

  it("says nothing about them in settings.local.json either, and reads that file's permissions", async () => {
    await writeSettingsFile(
      projectDir,
      { ...PERMISSIONS_DENYING_BASH, ...CLAUDE_CODE_OWN_SETTINGS },
      STANDARD_FILES.SETTINGS_LOCAL_JSON,
    );

    const result = await checkPermissions(projectDir);

    expect(warn).not.toHaveBeenCalled();
    // The local file is read first, and its deny reached the notice: positive proof the
    // permissions block was parsed out of a file full of keys this CLI ignores.
    expect(result, "a Bash deny must still render the permission warning").not.toBeNull();
  });
});
