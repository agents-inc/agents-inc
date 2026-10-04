import { mkdir, symlink, writeFile } from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderAgentMd, renderSkillMd } from "../content-generators.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils.js";
import { normalizeInstallTree, readInstallTree, type InstallTree } from "./golden-tree.js";

const HOME = "/tmp/ai-e2e-AbC123/fake-home";
const PROJECT = "/tmp/ai-e2e-AbC123/fake-home/project";
const SOURCE = "/tmp/agents-inc-e2e-shared-fixtures/plain";
const CLI_VERSION = "0.164.0";

const CONTEXT = {
  roots: { home: [HOME], project: [PROJECT], source: [SOURCE] },
  cliVersion: CLI_VERSION,
};

/** A tree holding one file, which is all most of the normalisation cases need. */
function treeOf(file: string, content: string): InstallTree {
  return { files: { [file]: content }, emptyDirectories: [] };
}

describe("normalizeInstallTree", () => {
  it("writes each machine-specific root as its placeholder, wherever a file names it", () => {
    const config = `marketplace: '${SOURCE}',\nprojects: ['${HOME}/other', '${SOURCE}'],\n`;

    expect(
      normalizeInstallTree(treeOf(".agents-inc/claude/config.ts", config), CONTEXT),
    ).toStrictEqual(
      treeOf(
        ".agents-inc/claude/config.ts",
        "marketplace: '<source>',\nprojects: ['<home>/other', '<source>'],\n",
      ),
    );
  });

  it("writes a root nested inside another as its own placeholder rather than as a path under the outer one", () => {
    const registry = `"projectPath": "${PROJECT}", "installPath": "${HOME}/.claude/plugins"`;

    expect(normalizeInstallTree(treeOf("installed_plugins.json", registry), CONTEXT)).toStrictEqual(
      treeOf(
        "installed_plugins.json",
        `"projectPath": "<project>", "installPath": "<home>/.claude/plugins"`,
      ),
    );
  });

  it("writes the CLI version as a placeholder in the compiled-by line and nowhere else", () => {
    const agent = renderAgentMd("web-developer", undefined, {
      body: `<system-reminder>\nCompiled by ${CLI_VERSION}.\n</system-reminder>`,
    });
    const manifest = `{ "name": "a-plugin", "version": "${CLI_VERSION}" }`;
    const tree = {
      files: { ".claude/agents/web-developer.md": agent, "plugin.json": manifest },
      emptyDirectories: [],
    };

    expect(normalizeInstallTree(tree, CONTEXT)).toStrictEqual({
      files: {
        ".claude/agents/web-developer.md": renderAgentMd("web-developer", undefined, {
          body: "<system-reminder>\nCompiled by <cli-version>.\n</system-reminder>",
        }),
        "plugin.json": manifest,
      },
      emptyDirectories: [],
    });
  });

  it("leaves a compiled-by line naming a DIFFERENT version as it is, so a wrong version still differs", () => {
    const agent = "<system-reminder>\nCompiled by 0.163.9.\n</system-reminder>\n";

    expect(normalizeInstallTree(treeOf("agent.md", agent), CONTEXT)).toStrictEqual(
      treeOf("agent.md", agent),
    );
  });

  it("writes every spelling of one root as that root's placeholder", () => {
    const resolvedHome = "/private/tmp/ai-e2e-AbC123/fake-home";
    const config = `projects: ['${HOME}/app', '${resolvedHome}/app'],`;

    expect(
      normalizeInstallTree(treeOf("config.ts", config), {
        ...CONTEXT,
        roots: { ...CONTEXT.roots, home: [HOME, resolvedHome] },
      }),
    ).toStrictEqual(treeOf("config.ts", "projects: ['<home>/app', '<home>/app'],"));
  });

  it("writes a machine timestamp as a placeholder", () => {
    const registry = `"installedAt": "2026-09-19T19:39:25.919Z", "lastUpdated": "2026-09-19T19:39:29.855Z"`;

    expect(normalizeInstallTree(treeOf("installed_plugins.json", registry), CONTEXT)).toStrictEqual(
      treeOf(
        "installed_plugins.json",
        `"installedAt": "<timestamp>", "lastUpdated": "<timestamp>"`,
      ),
    );
  });

  it("writes the date a YAML date field was stamped with as a placeholder, and leaves every other date alone", () => {
    const metadata =
      "cliDescription: Released 2026-01-01\nforkedFrom:\n  skillId: web-framework-react\n  date: 2026-09-19\n";

    expect(normalizeInstallTree(treeOf("metadata.yaml", metadata), CONTEXT)).toStrictEqual(
      treeOf(
        "metadata.yaml",
        "cliDescription: Released 2026-01-01\nforkedFrom:\n  skillId: web-framework-react\n  date: <date>\n",
      ),
    );
  });

  it("leaves a file naming nothing volatile byte-identical", () => {
    const skill = renderSkillMd("web-framework-react", "React");

    expect(normalizeInstallTree(treeOf("SKILL.md", skill), CONTEXT)).toStrictEqual(
      treeOf("SKILL.md", skill),
    );
  });

  it("orders files and empty directories by path, so the serialised tree is the same however it was read", () => {
    const tree = {
      files: { "b.txt": "b", "a/z.txt": "z", "a/a.txt": "a" },
      emptyDirectories: ["z-empty", "a-empty"],
    };

    const normalized = normalizeInstallTree(tree, CONTEXT);

    expect(Object.keys(normalized.files)).toStrictEqual(["a/a.txt", "a/z.txt", "b.txt"]);
    expect(normalized.emptyDirectories).toStrictEqual(["a-empty", "z-empty"]);
  });
});

describe("readInstallTree", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir("golden-tree-");
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  it("reads every file by its path under the root, and names the directories holding nothing", async () => {
    await mkdir(path.join(root, ".claude", "agents"), { recursive: true });
    await mkdir(path.join(root, ".claude", "plugins", "marketplaces"), { recursive: true });
    await writeFile(path.join(root, ".claude", "agents", "web-developer.md"), "agent body\n");
    await writeFile(path.join(root, "top.txt"), "top\n");

    expect(await readInstallTree(root)).toStrictEqual({
      files: { ".claude/agents/web-developer.md": "agent body\n", "top.txt": "top\n" },
      emptyDirectories: [".claude/plugins/marketplaces"],
    });
  });

  it("leaves out a skipped file, and a skipped directory with everything under it", async () => {
    await mkdir(path.join(root, ".claude", "backups", "nested"), { recursive: true });
    await writeFile(path.join(root, ".claude", "backups", "nested", "backup.1789846765371"), "x");
    await writeFile(path.join(root, ".claude", ".claude.json"), "{}");
    await writeFile(path.join(root, ".claude", "settings.json"), "{}");

    expect(
      await readInstallTree(root, { skip: [".claude/backups", ".claude/.claude.json"] }),
    ).toStrictEqual({ files: { ".claude/settings.json": "{}" }, emptyDirectories: [] });
  });

  it("refuses a tree holding a symbolic link rather than reading through it or dropping it", async () => {
    await writeFile(path.join(root, "target.txt"), "target\n");
    await symlink(path.join(root, "target.txt"), path.join(root, "link.txt"));

    await expect(readInstallTree(root)).rejects.toThrow("link.txt");
  });
});
