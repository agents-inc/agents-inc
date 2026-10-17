/**
 * A root whose source folder says Codex resolves onto Codex, and one that says Claude still
 * resolves onto Claude.
 */

import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { renderAgentMd } from "../../__tests__/content-generators.js";
import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { getInstalledConfigPath } from "../install-base-dir.js";
import { providerInUse } from "../install-layout.js";

const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

describe("a root whose source folder names Codex", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir("cc-codex-folder-resolves-");
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  async function plantInstallation(folder: string): Promise<void> {
    await writeTestTsConfig(root, buildProjectConfig(), folder);
  }

  /** Content but no config: a half-built installation. */
  async function plantHalfBuiltFolder(folder: string): Promise<void> {
    const dir = path.join(root, ...folder.split("/"), "agents");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "web-developer.md"), renderAgentMd("web-developer"));
  }

  describe("resolves onto the Codex host", () => {
    it("answers codex for an installation in the Codex folder", async () => {
      await plantInstallation(CODEX_SOURCE_REL);

      expect(
        providerInUse(root),
        "the folder is the only record of a provider, so a resolver that cannot name Codex leaves the flag as the only way to reach it",
      ).toBe("codex");
    });

    it("answers codex for a half-built Codex folder, which is what a bare mkdir plus a copy leaves", async () => {
      await plantHalfBuiltFolder(CODEX_SOURCE_REL);

      expect(providerInUse(root)).toBe("codex");
    });

    it("reaches the Codex config at the path builder every command reads through", async () => {
      await plantInstallation(CODEX_SOURCE_REL);

      expect(
        getInstalledConfigPath(root),
        "an answer only `providerInUse`'s own callers see is not one a command acts on",
      ).toBe(path.join(root, ".agents-inc", "codex", "config.ts"));
    });
  });

  describe("leaves every Claude arrangement answering Claude", () => {
    it("answers the Claude installation planted under the new layout", async () => {
      await plantInstallation(CLAUDE_SOURCE_REL);

      expect(providerInUse(root)).toBe("claude");
    });

    it("answers Claude when a live Claude installation stands beside an empty Codex folder", async () => {
      await plantInstallation(CLAUDE_SOURCE_REL);
      await mkdir(path.join(root, ...CODEX_SOURCE_REL.split("/")), { recursive: true });

      expect(
        providerInUse(root),
        "an empty folder is on no rung at all, so a bare mkdir must not take the run away from the installation that is there",
      ).toBe("claude");
    });

    it("answers Claude when a live Claude installation stands beside a hand-planted Codex one", async () => {
      await plantInstallation(CLAUDE_SOURCE_REL);
      await plantInstallation(CODEX_SOURCE_REL);

      expect(
        providerInUse(root),
        "two folders are two installations and the run resolves to the Claude one by roster order; `detectInstallations` is what sees both",
      ).toBe("claude");
    });
  });
});
