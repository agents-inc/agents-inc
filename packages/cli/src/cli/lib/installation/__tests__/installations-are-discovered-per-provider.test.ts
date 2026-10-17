/**
 * One installation is one provider: a root holding both folders holds two installations. Folder
 * names are literals so the assertions cannot move with the product's constants.
 */

import os from "os";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { detectInstallations } from "../index.js";

const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

// A consuming repository's own gate state under `.agents-inc/`, which is not an installation.
const GATE_STATE_FILE = "baseline.json";
const GATE_STATE_DIR = "attempts";

describe("detectInstallations", () => {
  let home: string;
  let project: string;

  beforeEach(async () => {
    home = await createTempDir("cc-detect-installations-");
    project = path.join(home, "project");
    await mkdir(project, { recursive: true });
    vi.spyOn(os, "homedir").mockReturnValue(home);
  });

  afterEach(async () => {
    vi.mocked(os.homedir).mockRestore();
    await cleanupTempDir(home);
  });

  async function plantConfig(root: string, folder: string): Promise<void> {
    await writeTestTsConfig(root, buildProjectConfig(), folder);
  }

  function configAt(root: string, folder: string): string {
    return path.join(root, ...folder.split("/"), "config.ts");
  }

  describe("both providers, across both scopes", () => {
    it("reads Codex off a project standing under a Claude global", async () => {
      await plantConfig(home, CLAUDE_SOURCE_REL);
      await plantConfig(project, CODEX_SOURCE_REL);

      expect(await detectInstallations(project)).toStrictEqual([
        { provider: "claude", scope: "global", configPath: configAt(home, CLAUDE_SOURCE_REL) },
        { provider: "codex", scope: "project", configPath: configAt(project, CODEX_SOURCE_REL) },
      ]);
    });

    it("reads Claude off a project standing under a Codex global", async () => {
      await plantConfig(home, CODEX_SOURCE_REL);
      await plantConfig(project, CLAUDE_SOURCE_REL);

      expect(await detectInstallations(project)).toStrictEqual([
        { provider: "codex", scope: "global", configPath: configAt(home, CODEX_SOURCE_REL) },
        { provider: "claude", scope: "project", configPath: configAt(project, CLAUDE_SOURCE_REL) },
      ]);
    });
  });

  describe("a root holding neither", () => {
    it("answers nothing for a project and a home with no source folder at all", async () => {
      expect(await detectInstallations(project)).toStrictEqual([]);
    });

    it("answers nothing for a parent folder holding only another program's state", async () => {
      await mkdir(path.join(project, ".agents-inc", GATE_STATE_DIR), { recursive: true });
      await writeFile(path.join(project, ".agents-inc", GATE_STATE_FILE), "{}");

      expect(
        await detectInstallations(project),
        "a subfolder of `.agents-inc/` is an installation only when it is named as a provider — everything else belongs to whoever put it there",
      ).toStrictEqual([]);
    });
  });

  describe("a root holding both", () => {
    it("answers two installations, each of exactly one provider", async () => {
      await plantConfig(project, CLAUDE_SOURCE_REL);
      await plantConfig(project, CODEX_SOURCE_REL);

      expect(
        await detectInstallations(project),
        "a root holding two provider folders holds two installations — collapsing them to one is how every command silently acts on the Claude half",
      ).toStrictEqual([
        { provider: "claude", scope: "project", configPath: configAt(project, CLAUDE_SOURCE_REL) },
        { provider: "codex", scope: "project", configPath: configAt(project, CODEX_SOURCE_REL) },
      ]);
    });

    // Control for the spec above.
    it("answers one installation for a root holding one provider folder", async () => {
      await plantConfig(project, CLAUDE_SOURCE_REL);

      expect(await detectInstallations(project)).toStrictEqual([
        { provider: "claude", scope: "project", configPath: configAt(project, CLAUDE_SOURCE_REL) },
      ]);
    });
  });

  describe("run from the home directory", () => {
    it("reports the one installation once, as the global one", async () => {
      await plantConfig(home, CLAUDE_SOURCE_REL);

      expect(
        await detectInstallations(home),
        "at the home root the project scope and the global scope are one directory, and counting it twice invents an installation",
      ).toStrictEqual([
        { provider: "claude", scope: "global", configPath: configAt(home, CLAUDE_SOURCE_REL) },
      ]);
    });
  });

  describe("the order installations are answered in", () => {
    it("is global before project, and within a scope the provider roster's own order", async () => {
      await plantConfig(home, CLAUDE_SOURCE_REL);
      await plantConfig(home, CODEX_SOURCE_REL);
      await plantConfig(project, CLAUDE_SOURCE_REL);
      await plantConfig(project, CODEX_SOURCE_REL);

      expect(
        (await detectInstallations(project)).map(
          (installation) => `${installation.provider}@${installation.scope}`,
        ),
      ).toStrictEqual(["claude@global", "codex@global", "claude@project", "codex@project"]);
    });
  });
});
