import { readFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeProjectPartial } from "../index.js";
import { loadProjectSourceConfig } from "../../configuration/config.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { createTempDir, cleanupTempDir } from "../../__tests__/test-fs-utils.js";
import {
  readTestTsConfig,
  writeRawTestConfig,
  writeTestTsConfig,
} from "../../__tests__/helpers/config-io.js";
import { sa } from "../../__tests__/factories/skill-factories.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { getProjectConfigPath } from "../../installation/install-base-dir.js";
import type { ProjectConfig } from "../../../types/index.js";

/**
 * `writeProjectPartial` is the gate's entry for a scalar-sized change to a
 * PROJECT's config: a partial goes in, the required fields are filled, the
 * config half is written. It replaced `saveSourceToProjectConfig`, whose suite
 * this is — every case below pins a contract the callers still depend on
 * (required-field filling, name invention, generated file shape), and none of
 * them had another home.
 *
 * The home-directory refusal is asserted in the enforcement guard
 * (`lib/__tests__/config-gate-enforcement.test.ts`), beside the other guards.
 */
describe("writeProjectPartial", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-write-project-partial-test-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /**
   * Records the marketplace ref the way every caller does: read what is on disk, overlay
   * the ref, hand the partial over (see `recordSource` in `eject.ts`).
   */
  async function saveSource(dir: string, source: string, fallbackName: string): Promise<void> {
    const existing = (await loadProjectSourceConfig(dir)) ?? {};
    await writeProjectPartial(dir, { ...existing, marketplace: source }, { fallbackName });
  }

  it("creates config file with source when no config exists", async () => {
    await saveSource(tempDir, "github:my-org/skills", "my-project");

    const configPath = getProjectConfigPath(tempDir, "claude");
    const config = await readTestTsConfig<Record<string, unknown>>(configPath);

    expect(config).toStrictEqual({
      name: "my-project",
      skills: [],
      agents: [],
      marketplace: "github:my-org/skills",
    });
  });

  it("creates the source folder if it does not exist", async () => {
    await saveSource(tempDir, "github:test/repo", "test-project");

    const configPath = getProjectConfigPath(tempDir, "claude");
    const content = await readFile(configPath, "utf-8");

    expect(content).toContain("export default");
    expect(content).toContain("import type { ProjectConfig } from './config-types'");
    expect(content).toContain("satisfies ProjectConfig");
  });

  it("preserves existing config fields when adding source", async () => {
    // Deliberately partial — no `skills` — because filling a missing required field is part of
    // what the write below is held to.
    await writeTestTsConfig(tempDir, {
      name: "my-project",
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      author: "@vince",
    });

    await saveSource(tempDir, "github:new/source", "fallback-name");

    const configPath = getProjectConfigPath(tempDir, "claude");
    const config = await readTestTsConfig<Record<string, unknown>>(configPath);

    expect(config).toStrictEqual({
      name: "my-project",
      agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
      author: "@vince",
      skills: [],
      marketplace: "github:new/source",
    });
  });

  it("overwrites existing source value", async () => {
    // Deliberately partial — no `skills`, no `agents` — for the reason the spec above gives.
    await writeTestTsConfig(tempDir, {
      marketplace: "github:old/source",
      name: "project",
    });

    await saveSource(tempDir, "github:new/source", "fallback-name");

    const configPath = getProjectConfigPath(tempDir, "claude");
    const config = await readTestTsConfig<Record<string, unknown>>(configPath);

    expect(config).toStrictEqual({
      name: "project",
      skills: [],
      agents: [],
      marketplace: "github:new/source",
    });
  });

  /**
   * The `?? {}` in `saveSource` is a fallback for a config that is not THERE, and it used to catch
   * a config that is there and unreadable as well — so a scalar-sized change to a corrupt config
   * replaced the whole file with a two-field one under an invented name, and reported success. It
   * refuses now (owner ruling 2026-08-20): a file nobody can read is not a file to overwrite.
   *
   * The control this refusal is meaningless without is "preserves existing config fields when
   * adding source" above: a config on disk that loads is overlaid rather than refused, so the guard
   * is scoped to unreadable rather than to "anything already on disk".
   */
  it("refuses to overwrite a config file it cannot read, rather than inventing a fresh one", async () => {
    const corruptSource = "invalid typescript content {{";
    const configPath = await writeRawTestConfig(tempDir, corruptSource);

    await expect(saveSource(tempDir, "github:my-org/skills", "recovered-project")).rejects.toThrow(
      configPath,
    );

    expect(
      await readFile(configPath, "utf-8"),
      "the user's file is still theirs — a refusal that had already written is not a refusal",
    ).toBe(corruptSource);
  });

  it("refuses to overwrite a config file that is there and declares nothing", async () => {
    // The raw writer is used only because no config object renders to zero bytes.
    const configPath = await writeRawTestConfig(tempDir, "");

    await expect(saveSource(tempDir, "github:my-org/skills", "empty-project")).rejects.toThrow(
      configPath,
    );

    expect(
      await readFile(configPath, "utf-8"),
      "an empty file is still there, so it is not the absence `?? {}` stands in for",
    ).toBe("");
  });

  it("throws when the partial has no name and no fallback is offered", async () => {
    await expect(writeProjectPartial(tempDir, { marketplace: "github:x/y" })).rejects.toThrow(
      "no project config found",
    );
  });

  /**
   * The round trip every scalar caller performs: read the config with
   * the LENIENT loader, overlay one scalar, write it back through this entry.
   *
   * The writer compacts an exclusive category to its BARE value on the way out
   * (`web-framework: "web-framework-react"`, no array), and the lenient loader
   * hands that bare form straight back because it does not normalize. Re-emitting
   * it drops the category: `compactCategories` keeps only values that are
   * non-empty arrays.
   *
   * `web-framework` is exclusive in the matrix and `web-testing` is not, so a
   * dropped exclusive category shows up as one missing KEY rather than as a stack
   * that vanished wholesale — which is what makes the failure legible.
   *
   * The full loader reads the result, because that is what every consumer
   * downstream of a config file actually sees: `SkillAssignment[]` for every
   * category, bare form or not.
   */
  describe("a lenient-load / re-emit round trip", () => {
    const STACK_WITH_EXCLUSIVE_CATEGORY: NonNullable<ProjectConfig["stack"]> = {
      "web-developer": {
        "web-framework": [sa("web-framework-react")],
        "web-testing": [sa("web-testing-vitest")],
      },
    };

    async function loadFullOrFail(dir: string): Promise<ProjectConfig> {
      const loaded = await loadProjectConfigFromDir(dir, "claude");
      if (!loaded) throw new Error(`config.ts must exist and be loadable at ${dir}`);
      return loaded.config;
    }

    it("preserves an exclusive stack category", async () => {
      await writeProjectPartial(
        tempDir,
        buildProjectConfig({
          name: "stack-project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
          stack: STACK_WITH_EXCLUSIVE_CATEGORY,
        }),
      );

      // Pre-condition: the file on disk carries the compact bare form, which is
      // the input the bug needs. Without this the spec could pass on a config
      // that never exercised the compaction at all.
      expect(
        await readFile(getProjectConfigPath(tempDir, "claude"), "utf-8"),
        "the writer must emit the exclusive category in its bare form",
      ).toMatch(/'web-framework':\s*'web-framework-react'/);

      await saveSource(tempDir, "github:my-org/skills", "stack-project");

      expect(
        (await loadFullOrFail(tempDir)).stack?.["web-developer"],
        "a re-emit must not drop the exclusive category",
      ).toStrictEqual(STACK_WITH_EXCLUSIVE_CATEGORY["web-developer"]);
    });

    it("preserves an exclusive stack category carrying a preloaded assignment", async () => {
      const preloadedStack: NonNullable<ProjectConfig["stack"]> = {
        "web-developer": { "web-framework": [sa("web-framework-react", true)] },
      };

      await writeProjectPartial(
        tempDir,
        buildProjectConfig({
          name: "preloaded-stack-project",
          skills: [],
          agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
          stack: preloadedStack,
        }),
      );

      await saveSource(tempDir, "github:my-org/skills", "preloaded-stack-project");

      expect(
        (await loadFullOrFail(tempDir)).stack?.["web-developer"],
        "a preloaded exclusive assignment is compacted to a bare OBJECT, and must survive too",
      ).toStrictEqual(preloadedStack["web-developer"]);
    });
  });
});
