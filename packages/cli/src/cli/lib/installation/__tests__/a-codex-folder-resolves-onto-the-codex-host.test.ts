/**
 * A root whose source folder says Codex resolves onto Codex, and one that says Claude still
 * resolves onto Claude.
 *
 * **This file replaces `a-provider-with-no-host-is-refused-by-name.test.ts`, whose subject C4
 * deleted.** That spec pinned C2's interim refusal — *"until the Codex host exists, discovery
 * refuses a present `.agents-inc/codex/` by name"* — which existed for the window in which the
 * folder could answer `codex` while every path built under that answer was Claude's: `compile`
 * reading `.agents-inc/codex/` and writing `.md` sub-agents into `.claude/agents/`, with nothing
 * able to report it. C4 closes that window by building the host, so `refuseAProviderWithNoHost`
 * and the `PROVIDERS_WITH_A_HOST` roster beside it are gone. The refusal was not relaxed to keep a
 * test green; it was removed with the reason it existed for, and what stands here is the claim that
 * replaced it. The three control cases are carried over unchanged, because a positive answer on
 * its own cannot tell a resolver that reads the folder from one that answers `codex` for every
 * root.
 *
 * **What is still refused, and is a different thing:** a Codex CONFIGURATION asking for a placement
 * Codex does not offer. That is `hosts/offered-placements.ts`'s refusal, it is about a config's
 * contents rather than a folder's name, and it has its own pairings in
 * `hosts/__tests__/the-codex-host-offers-three-placements.test.ts`.
 *
 * The folder names are literals throughout. They are text on people's disks, and an assertion that
 * imported the constant the product joins would move with it and could never fail — the rule
 * `install-layout.test.ts` states for the same two names.
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

/** The new layout, per provider, as it is written on disk and shown to a user. */
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

  /** Plants a loadable installation in `folder`, the way `init --provider codex` leaves one. */
  async function plantInstallation(folder: string): Promise<void> {
    await writeTestTsConfig(root, buildProjectConfig(), folder);
  }

  /** Plants a folder that holds content but no config — the half-built state rung 3 reaches. */
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
