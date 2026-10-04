/**
 * What a run finds when it asks the disk which installations are there.
 *
 * Step C2 of `todo/plans/CLI-codex-provider-plan.md` adds `detectInstallations(cwd)`, answering
 * `{provider, scope, configPath}` per installation. It is the surface every command reads the
 * provider off, and the reason it exists is that the folder is the only record of one: there is
 * no `provider` field in `config.ts` and nothing in the payload carries it, so discovery reading
 * the folder is the whole of "the provider is derivable after the install".
 *
 * **One installation is exactly one provider, and a root holding two folders holds TWO of them.**
 * That is the owner's ruling — *"every installation is only one of them and you can have multiple
 * installations on your machine"* — read through the layout the rename gave it: `.agents-inc/` is
 * a parent, not an installation, and `.agents-inc/claude/` beside `.agents-inc/codex/` is a pair
 * of single-provider installations rather than one mixed one. So the answer is a LIST, nothing in
 * it is mixed, and a root holding both is never collapsed into whichever the preference order
 * happens to reach first.
 *
 * What each spec below is for, because three of them look alike and fail differently:
 *
 * - **both providers across both scopes** — the shape the rulings make possible and the CLI has
 *   never had to answer: a Codex project under a Claude global, and the mirror of it. Failing
 *   here means the provider is being taken from the run rather than from each scope's own folder.
 * - **a root holding neither** — an empty answer, and specifically an empty answer over a parent
 *   folder another program keeps state in. `.agents-inc/` holds a consuming repository's own gate
 *   files, and reading a subfolder of it as a provider would invent an installation out of them.
 * - **a root holding both** — two entries, each single-provider. This is the one that reddens if
 *   discovery keeps the defaulting behaviour: today every path builder under a two-folder root
 *   answers Claude and says nothing, which is the plan's Risk 8.
 * - **run from the home directory** — the two scopes are one directory there, and an installation
 *   counted twice is a second installation that does not exist.
 *
 * The folder names are literals here for the reason `install-layout.test.ts` states: they are
 * text on people's disks, and an assertion importing the constant the product writes would move
 * with it and could never fail.
 */

import os from "os";
import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildProjectConfig } from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { detectInstallations } from "../index.js";

/** The new layout, per provider, as it is written on disk and shown to a user. */
const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

/**
 * What the hand gate of a consuming repository keeps under `.agents-inc/`, and therefore the
 * state discovery must not read as an installation. Taken from the benchmark repository's own
 * gate, where this hazard is real rather than imagined.
 */
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

  /** Writes a real config.ts into `folder` under `root`, so the installation is a loadable one. */
  async function plantConfig(root: string, folder: string): Promise<void> {
    await writeTestTsConfig(root, buildProjectConfig(), folder);
  }

  /** The config file of `provider`'s installation under `root`, as discovery should name it. */
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

    /**
     * The control the spec above needs. Without it an answer that always named both providers
     * would satisfy it, and would report a Codex installation on every Claude-only machine.
     */
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
    /**
     * Pinned in its own spec, so a deliberate change to the order reddens one assertion rather
     * than every one above it — and so the specs above are read as being about WHICH
     * installations are found rather than about their sequence.
     */
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
