/**
 * `--provider` against the disk, at the one function every path builder reads the answer from.
 *
 * **Two questions the folder cannot answer, and this is what answers them.** A greenfield
 * `init --from <id> --provider codex` has no folder to read — that is the flag's whole purpose
 * (D15) — and a scope holding `.agents-inc/claude/` beside `.agents-inc/codex/` has two answers,
 * which `providerInUse` resolves by roster order. A command that acted on the roster's first
 * answer would act on a user's other installation with nothing on screen saying so.
 *
 * **Each case is paired with the one it is not, in this file.** A choice that won everywhere would
 * satisfy every positive assertion below exactly as well as a correct one, and would silently take
 * every run away from the folder it is standing in — so the same two arrangements are asserted
 * with no choice made, and the disk's answers are what they always were.
 *
 * **The reset is the file's own hazard, stated rather than trusted.** The choice is process state,
 * and a spec that set one and did not clear it would leak it into every later spec in this worker
 * — where `providerInUse` is read by most of the suite. `afterEach` clears it, and the
 * disk-answers-for-itself cases are what would redden if it ever stopped.
 *
 * The folder names are literals, for the reason `install-layout.test.ts` states: they are text on
 * people's disks, and an assertion importing the constant the product joins would move with it and
 * could never fail.
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

/** The new layout, per provider, as it is written on disk and shown to a user. */
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

  /** Plants a loadable installation in `folder`, the way an install leaves one. */
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
