import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { render } from "ink-testing-library";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CLAUDE_DIR, STANDARD_FILES } from "../consts.js";
import { buildProjectConfig } from "./__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "./__tests__/helpers/config-io.js";
import { useFakeHome } from "./__tests__/helpers/isolated-home.js";
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
 * Settings Claude Code writes for itself, on its own release schedule; the CLI must not judge them.
 */
const CLAUDE_CODE_OWN_SETTINGS = {
  model: "opusplan",
  statusLine: { type: "command", command: "npx ccstatusline@latest" },
  effortLevel: "high",
  attributionSettings: { coAuthoredBy: false },
};

/** Allows what agents need but denies one tool other than Bash: nothing to warn about. */
const PERMISSIONS_DENYING_WRITE = {
  permissions: { allow: ["Read(*)"], deny: ["Write(*)"] },
};

/** Not JSON, as a hand edit can leave the file. */
const MALFORMED_SETTINGS = "{ not json";

/** Where a Codex installation's config sits under a project; a literal, as a person types it. */
const CODEX_INSTALLATION_FOLDER = ".agents-inc/codex";

const BASH_DENIED = "⚠ Bash is denied in permissions.";
const NO_ALLOW_RULES = "⚠ No allow rules configured. Agents will prompt for each tool use.";

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
 * settings.json is Claude Code's: nothing in it is warned about, but `permissions` is still read.
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
    // The deny reaching the notice proves the permissions block was parsed.
    expect(result, "a Bash deny must still render the permission warning").not.toBeNull();
  });
});

/** What a person running the command sees for each state of the settings files. */
describe("checkPermissions notices", () => {
  let projectDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    projectDir = await createTempDir();
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  useFakeHome(() => projectDir);

  async function shown(): Promise<string | undefined> {
    const notice = await checkPermissions(projectDir);
    if (notice === null) throw new Error("expected a notice, and checkPermissions advised nothing");
    const { lastFrame, unmount } = render(notice);
    const frame = lastFrame();
    unmount();
    return frame;
  }

  it("asks for a permissions block in the settings file when none is configured", async () => {
    expect(await shown()).toMatchInlineSnapshot(`
      "╭──────────────────────────────────────────────────────────────────────────────────────────────────╮
      │                                                                                                  │
      │ Permission Notice                                                                                │
      │ No permissions configured in .claude/settings.json                                               │
      │ Agents will prompt for approval on each tool use.                                                │
      │                                                                                                  │
      │ For autonomous operation, add to .claude/settings.json:                                          │
      │                                                                                                  │
      │ {                                                                                                │
      │   "permissions": {                                                                               │
      │     "allow": [                                                                                   │
      │       "Read(*)",                                                                                 │
      │       "Bash(git *)",                                                                             │
      │       "Bash(bun *)"                                                                              │
      │     ]                                                                                            │
      │   }                                                                                              │
      │ }                                                                                                │
      │                                                                                                  │
      ╰──────────────────────────────────────────────────────────────────────────────────────────────────╯"
    `);
  });

  it("reads a malformed settings file as having no permissions, and says it skipped it", async () => {
    const settingsPath = path.join(projectDir, CLAUDE_DIR, STANDARD_FILES.SETTINGS_JSON);
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(settingsPath, MALFORMED_SETTINGS);

    expect(await shown()).toContain("No permissions configured in .claude/settings.json");
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      `Malformed settings file at '${settingsPath}' — skipping`,
    );
  });

  it("takes the permissions of settings.local.json over those of settings.json", async () => {
    await writeSettingsFile(projectDir, PERMISSIONS_WITH_ALLOWS);
    await writeSettingsFile(
      projectDir,
      PERMISSIONS_DENYING_BASH,
      STANDARD_FILES.SETTINGS_LOCAL_JSON,
    );

    expect(await shown()).toContain(BASH_DENIED);
  });

  it("falls back to settings.json when settings.local.json configures no permissions", async () => {
    await writeSettingsFile(projectDir, PERMISSIONS_DENYING_BASH);
    await writeSettingsFile(
      projectDir,
      CLAUDE_CODE_OWN_SETTINGS,
      STANDARD_FILES.SETTINGS_LOCAL_JSON,
    );

    expect(await shown()).toContain(BASH_DENIED);
  });

  it.each(["Bash(*)", "Bash"])(
    "warns about Bash denied as %s, and only about that",
    async (rule) => {
      await writeSettingsFile(projectDir, { permissions: { allow: ["Read(*)"], deny: [rule] } });

      const frame = await shown();

      expect(frame).toContain(
        "⚠ Bash is denied in permissions. Some agents require Bash for git, testing, and build commands.",
      );
      expect(frame).not.toContain(NO_ALLOW_RULES);
    },
  );

  it("warns about Bash denied among other denied tools", async () => {
    await writeSettingsFile(projectDir, {
      permissions: { allow: ["Read(*)"], deny: ["Write(*)", "Bash(*)"] },
    });

    expect(await shown()).toContain(BASH_DENIED);
  });

  it("says nothing about a denied tool other than Bash", async () => {
    await writeSettingsFile(projectDir, PERMISSIONS_DENYING_WRITE);

    expect(await checkPermissions(projectDir)).toBeNull();
  });

  it.each([
    ["an empty allow list", { permissions: { allow: [] } }],
    ["no allow list", { permissions: { deny: ["Write(*)"] } }],
  ])("warns about %s, and only about that", async (_case, settings) => {
    await writeSettingsFile(projectDir, settings);

    const frame = await shown();

    expect(frame).toContain(NO_ALLOW_RULES);
    expect(frame).not.toContain(BASH_DENIED);
  });

  it("advises nothing for a project whose installation is Codex's", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: "codex-project" }),
      CODEX_INSTALLATION_FOLDER,
    );

    expect(await checkPermissions(projectDir)).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });
});
