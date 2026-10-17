/**
 * A `--provider` choice beats the folder, each case paired with the same arrangement and no choice.
 * The choice is process state, so `afterEach` must clear it.
 */

import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { getInstalledConfigPath } from "../install-base-dir.js";
import {
  chooseProviderForThisRun,
  forgetTheProviderChosenForThisRun,
  providerInUse,
} from "../install-layout.js";

const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

describe("the provider a run was told", () => {
  let root: string;

  beforeEach(async () => {
    root = await createTempDir("cc-provider-chosen-");
  });

  afterEach(async () => {
    forgetTheProviderChosenForThisRun();
    await cleanupTempDir(root);
  });

  async function plantInstallation(folder: string): Promise<void> {
    await writeTestTsConfig(root, buildProjectConfig(), folder);
  }

  describe("on a root with nothing installed, which is what --from --provider creates", () => {
    it("answers the provider it was told", () => {
      chooseProviderForThisRun("codex");

      expect(
        providerInUse(root),
        "a greenfield install has no folder to read, so a flag that lost to the disk here could never create a Codex installation at all",
      ).toBe("codex");
    });

    it("answers claude with no choice made, which is what the flag is beating", () => {
      expect(providerInUse(root)).toBe("claude");
    });

    it("reaches the Codex config at the path builder every command reads through", () => {
      chooseProviderForThisRun("codex");

      expect(
        getInstalledConfigPath(root),
        "an answer only `providerInUse`'s own callers see is not one a command acts on",
      ).toBe(path.join(root, ".agents-inc", "codex", "config.ts"));
    });
  });

  describe("on a root holding an installation of each provider", () => {
    beforeEach(async () => {
      await plantInstallation(CLAUDE_SOURCE_REL);
      await plantInstallation(CODEX_SOURCE_REL);
    });

    it("picks the one it was told rather than the roster's first", () => {
      chooseProviderForThisRun("codex");

      expect(providerInUse(root)).toBe("codex");
    });

    it("picks the other one just as readily, so the flag SELECTS rather than means Codex", () => {
      chooseProviderForThisRun("claude");

      expect(providerInUse(root)).toBe("claude");
    });

    it("falls to roster order with no choice made, which is the ambiguity the refusal is about", () => {
      expect(providerInUse(root)).toBe("claude");
    });
  });
});
