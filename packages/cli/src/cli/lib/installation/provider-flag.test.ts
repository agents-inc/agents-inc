import path from "path";
import { mkdir, realpath } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ambiguityFinding,
  otherInstallationsInThisScope,
  providerFlag,
  providerNamedBy,
  providerNamedIn,
  providerNeedsAConfigurationToInstall,
  providersInPlay,
  refuseAnAmbiguousInstallation,
} from "./provider-flag";
import { forgetTheProviderChosenForThisRun, providerInUse } from "./install-layout";
import { buildProjectConfig } from "../__tests__/factories/config-factories";
import { writeTestTsConfig } from "../__tests__/helpers/config-io";
import { useFakeHome } from "../__tests__/helpers/isolated-home";
import { cleanupTempDir, createTempDir } from "../__tests__/test-fs-utils";

/** Literals: a test reading the folders off the product would move with them. */
const CLAUDE_FOLDER = ".agents-inc/claude";
const CODEX_FOLDER = ".agents-inc/codex";

const SUBJECT = "edit";

/** Throws, so a refusal that should not happen fails the spec where it happened. */
function refusalMustNotHappen(message: string): never {
  throw new Error(`refused unexpectedly: ${message}`);
}

describe("--provider", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-provider-flag-");
  });

  afterEach(async () => {
    forgetTheProviderChosenForThisRun();
    await cleanupTempDir(tempDir);
  });

  const home = useFakeHome(() => tempDir);

  async function scopeHolding(dir: string, folders: readonly string[]): Promise<string> {
    await mkdir(dir, { recursive: true });
    for (const folder of folders) {
      await writeTestTsConfig(dir, buildProjectConfig({ name: "installation" }), folder);
    }
    return realpath(dir);
  }

  it("offers every provider by name, as one placeholder", () => {
    expect(providerFlag()).toMatchObject({
      description: "Which provider's installation this run is about",
      helpValue: "<claude|codex>",
      options: ["claude", "codex"],
    });
  });

  it("narrows a value oclif accepted to its provider, and an absent one to nothing", () => {
    expect(providerNamedBy(undefined)).toBeUndefined();
    expect(providerNamedBy("claude")).toBe("claude");
    expect(providerNamedBy("codex")).toBe("codex");
  });

  it.each([
    { argv: ["--from", "abc", "--provider", "codex"], named: "codex" },
    { argv: ["--provider=codex", "--from", "abc"], named: "codex" },
    { argv: ["--from", "abc", "--provider", "claude"], named: "claude" },
    { argv: ["--from", "abc"], named: undefined },
    { argv: ["--from", "abc", "--", "--provider", "codex"], named: undefined },
    { argv: ["--provider", "gemini"], named: undefined },
    { argv: ["--provider"], named: undefined },
  ] as const)("reads $argv, ahead of oclif's parse, as naming $named", ({ argv, named }) => {
    expect(providerNamedIn(argv)).toBe(named);
  });

  it("explains that --provider needs a configuration to create an installation from", () => {
    expect(providerNeedsAConfigurationToInstall()).toBe(
      "--provider names which installation to create and needs the configuration to create it from, so it is only meaningful beside --from. Build one at http://localhost:5173/editor, then run 'npx agents-inc init --from <id> --provider <provider>'.",
    );
  });

  describe("a project holding both providers' installations", () => {
    let project: string;

    beforeEach(async () => {
      project = await scopeHolding(path.join(tempDir, "project"), [CLAUDE_FOLDER, CODEX_FOLDER]);
    });

    it("refuses an acting command with no --provider, naming both and changing nothing", async () => {
      const onAmbiguous = vi.fn((message: string): never => {
        throw new Error(message);
      });

      await expect(
        refuseAnAmbiguousInstallation(project, SUBJECT, undefined, onAmbiguous),
      ).rejects.toThrow(
        `${project} holds 2 installations — claude and codex — so edit cannot tell which one you mean. Name it with --provider <claude|codex>. Nothing has been changed.`,
      );
    });

    it("commits the run to the provider it was given instead of refusing", async () => {
      await refuseAnAmbiguousInstallation(project, SUBJECT, "codex", refusalMustNotHappen);

      expect(providerInUse(project)).toBe("codex");
    });

    it("reports the ambiguity to doctor without refusing", async () => {
      expect(await ambiguityFinding(project)).toBe(
        `${project} holds 2 installations — claude and codex — so every command that acts on one cannot tell which one you mean. Name it with --provider <claude|codex>. Nothing has been changed.`,
      );
    });

    it("reads both as in play, in roster order, without refusing", async () => {
      expect(await providersInPlay(project)).toStrictEqual(["claude", "codex"]);
    });

    it("tells list which other installation the scope holds", async () => {
      expect(await otherInstallationsInThisScope(project)).toBe(
        `${project} holds 2 installations — claude and codex — and this is the claude one. Show another with --provider <claude|codex>.`,
      );
    });
  });

  describe("a project holding one installation", () => {
    let project: string;

    beforeEach(async () => {
      project = await scopeHolding(path.join(tempDir, "project"), [CLAUDE_FOLDER]);
    });

    it("lets an acting command through without a flag", async () => {
      await expect(
        refuseAnAmbiguousInstallation(project, SUBJECT, undefined, refusalMustNotHappen),
      ).resolves.toBeUndefined();
    });

    it("has nothing to report to doctor or list", async () => {
      expect(await ambiguityFinding(project)).toBeNull();
      expect(await otherInstallationsInThisScope(project)).toBeNull();
    });

    it("reads that one as the only installation in play", async () => {
      expect(await providersInPlay(project)).toStrictEqual(["claude"]);
    });
  });

  it("judges a project with no installation by the global ones", async () => {
    await scopeHolding(home.dir, [CLAUDE_FOLDER, CODEX_FOLDER]);
    const bare = await scopeHolding(path.join(tempDir, "bare"), []);

    expect(await ambiguityFinding(bare)).toBe(
      `${await realpath(home.dir)} holds 2 installations — claude and codex — so every command that acts on one cannot tell which one you mean. Name it with --provider <claude|codex>. Nothing has been changed.`,
    );
  });

  it("reads a project with no installation as the global ones in play", async () => {
    await scopeHolding(home.dir, [CLAUDE_FOLDER, CODEX_FOLDER]);
    const bare = await scopeHolding(path.join(tempDir, "bare"), []);

    expect(await providersInPlay(bare)).toStrictEqual(["claude", "codex"]);
  });

  it("judges a project by its own installation even when the global scope holds two", async () => {
    await scopeHolding(home.dir, [CLAUDE_FOLDER, CODEX_FOLDER]);
    const project = await scopeHolding(path.join(tempDir, "project"), [CODEX_FOLDER]);

    expect(await ambiguityFinding(project)).toBeNull();
  });
});
