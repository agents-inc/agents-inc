import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import os from "os";
import path from "path";
import { mkdir, rm, writeFile } from "fs/promises";

import { loadSkillsMatrixFromSource } from "./source-loader";
import { createTempDir, cleanupTempDir } from "../__tests__/test-fs-utils";
import {
  createTestSource,
  cleanupTestSource,
  inTestMarketplace,
  TEST_MARKETPLACE_NAME,
  type TestDirs,
  type TestSkill,
  type TestStack,
} from "../__tests__/fixtures/create-test-source";
import { createTestSkill } from "../__tests__/factories/skill-factories.js";
import { buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../__tests__/helpers/config-io.js";
import { silenceConsole } from "../__tests__/helpers/silence-console.js";
import { useFakeHome } from "../__tests__/helpers/isolated-home.js";
import { firstElement } from "../__tests__/helpers/element-at.js";
import { DEFAULT_TEST_SKILLS, COMPILE_LOCAL_SKILL } from "../__tests__/mock-data/mock-skills";
import { setVerbose } from "../../utils/logger";
import {
  CLAUDE_DIR,
  SKILL_CATEGORIES_PATH,
  SKILL_RULES_PATH,
  STANDARD_DIRS,
  STANDARD_FILES,
} from "../../consts";
import { defaultCategories } from "../configuration/default-categories";
import { defaultStacks } from "../configuration/default-stacks";
import { matrix as currentMatrix } from "../matrix/matrix-provider";
import { SOURCE_ENV_VAR } from "../configuration/config";

/** In its own namespace: a custom marketplace shipping a catalogue id is refused whole. */
const SOURCE_SKILLS = inTestMarketplace(DEFAULT_TEST_SKILLS);

const SOURCE_REACT_ID = firstElement(SOURCE_SKILLS).id;

const ONE_AGENT_STACK: TestStack = {
  id: "reports-test-stack",
  name: "Reports Test Stack",
  description: "A stack for the load's report",
  agents: { "web-developer": { "web-framework": SOURCE_REACT_ID } },
};

/** A skill the user wrote, in a category no marketplace declares. */
const LOCAL_SKILL: TestSkill = { ...COMPILE_LOCAL_SKILL, category: "web-house-conventions" };

/** The public catalogue's own package, which is what lends a checkout the built-in stacks. */
const PUBLIC_CATALOGUE_PACKAGE = "@agents-inc/skills";

const BUILT_IN_CATEGORY_COUNT = Object.keys(defaultCategories).length;

/** What `loadSkillsMatrixFromSource` says on the verbose channel while it loads. */
describe("the report a marketplace load gives", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let fakeHome: string;
  let savedHome: string | undefined;
  let dirs: TestDirs | undefined;

  beforeEach(async () => {
    fakeHome = await createTempDir("cc-loader-reports-home-");
    savedHome = process.env.HOME;
    process.env.HOME = fakeHome;
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
    delete process.env[SOURCE_ENV_VAR];
    setVerbose(true);
  });

  afterEach(async () => {
    setVerbose(false);
    vi.mocked(os.homedir).mockRestore();
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    await cleanupTestSource(dirs);
    dirs = undefined;
    await cleanupTempDir(fakeHome);
  });

  function said(line: string): void {
    expect(consoleSpies.log).toHaveBeenCalledWith(`  ${line}`);
  }

  function neverSaid(line: string): void {
    expect(consoleSpies.log).not.toHaveBeenCalledWith(`  ${line}`);
  }

  it("names each step of a local marketplace load, from the source to the local skills", async () => {
    dirs = await createTestSource({
      skills: SOURCE_SKILLS,
      stacks: [ONE_AGENT_STACK],
      localSkills: [LOCAL_SKILL],
    });
    const { sourceDir, projectDir } = dirs;

    await loadSkillsMatrixFromSource({ sourceFlag: sourceDir, projectDir, skipExtraSources: true });

    said(`Loading skills from source: ${sourceDir}`);
    said(`Loading skills from local path: ${sourceDir}`);
    expect(consoleSpies.log).toHaveBeenCalledWith(
      expect.stringContaining(
        `  Loaded source categories: ${path.join(sourceDir, SKILL_CATEGORIES_PATH)} (`,
      ),
    );
    said(`Loaded source rules: ${path.join(sourceDir, SKILL_RULES_PATH)}`);
    said(`Matrix merged: CLI (${BUILT_IN_CATEGORY_COUNT} categories) + source`);
    said(`Skills from source: ${path.join(sourceDir, "src", STANDARD_DIRS.SKILLS)}`);
    said(`Using marketplace name from marketplace.json: ${TEST_MARKETPLACE_NAME}`);
    said("Offering the 1 stacks the source ships");
    said(`Stack '${ONE_AGENT_STACK.id}' has 1 skills from 1 agents`);
    said(
      `Found 1 project local skill(s) in ${path.join(projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS)}`,
    );
    said(`Added local skill: ${LOCAL_SKILL.id} (category: ${LOCAL_SKILL.category})`);
    said(`Added local category: ${LOCAL_SKILL.category} (domain: ${LOCAL_SKILL.domain})`);
  });

  it("leaves the matrix it hands on holding the local skills merged after the catalogue", async () => {
    dirs = await createTestSource({ skills: SOURCE_SKILLS, localSkills: [LOCAL_SKILL] });

    await loadSkillsMatrixFromSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
      skipExtraSources: true,
    });

    expect(Object.keys(currentMatrix.skills)).toContain(LOCAL_SKILL.id);
  });

  it("calls a marketplace with no taxonomy files the CLI's matrix alone", async () => {
    dirs = await createTestSource({ skills: SOURCE_SKILLS });
    await rm(path.join(dirs.sourceDir, SKILL_CATEGORIES_PATH));
    await rm(path.join(dirs.sourceDir, SKILL_RULES_PATH));

    await loadSkillsMatrixFromSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
      skipExtraSources: true,
    });

    said("Matrix from CLI only (source has no categories/rules files)");
    neverSaid(`Matrix merged: CLI (${BUILT_IN_CATEGORY_COUNT} categories) + source`);
    neverSaid(`Loaded source rules: ${path.join(dirs.sourceDir, SKILL_RULES_PATH)}`);
  });

  it("calls a marketplace with categories and no rules merged, and loads no rules", async () => {
    dirs = await createTestSource({ skills: SOURCE_SKILLS });
    await rm(path.join(dirs.sourceDir, SKILL_RULES_PATH));

    await loadSkillsMatrixFromSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
      skipExtraSources: true,
    });

    said(`Matrix merged: CLI (${BUILT_IN_CATEGORY_COUNT} categories) + source`);
    neverSaid(`Loaded source rules: ${path.join(dirs.sourceDir, SKILL_RULES_PATH)}`);
  });

  it("says a custom marketplace that ships no stacks is offered none", async () => {
    dirs = await createTestSource({ skills: SOURCE_SKILLS });

    await loadSkillsMatrixFromSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
      skipExtraSources: true,
    });

    said(
      `Marketplace '${dirs.sourceDir}' ships no stacks, and gets no built-in stand-in — offering none`,
    );
  });

  it("says a checkout of the public catalogue that ships no stacks is offered the built-in ones", async () => {
    dirs = await createTestSource({
      skills: [createTestSkill("web-framework-react", "Published as the catalogue's own")],
    });
    await writeFile(
      path.join(dirs.sourceDir, STANDARD_FILES.PACKAGE_JSON),
      JSON.stringify({ name: PUBLIC_CATALOGUE_PACKAGE, version: "1.0.0" }),
    );

    await loadSkillsMatrixFromSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
      skipExtraSources: true,
    });

    said(
      `The public catalogue ships no stacks — offering the ${defaultStacks.length} built-in stacks`,
    );
  });

  it("says an upkeep load without a manifest keeps the label its config recorded", async () => {
    dirs = await createTestSource({ skills: SOURCE_SKILLS, unbuilt: true });
    await writeTestTsConfig(
      dirs.projectDir,
      buildProjectConfig({ marketplace: dirs.sourceDir, marketplaceName: TEST_MARKETPLACE_NAME }),
    );

    await loadSkillsMatrixFromSource({
      projectDir: dirs.projectDir,
      purpose: "upkeep",
      skipExtraSources: true,
    });

    said(
      `'${dirs.sourceDir}' has no usable marketplace.json; keeping the label its config recorded`,
    );
  });

  it("says nothing about a local skills directory with nothing in it", async () => {
    dirs = await createTestSource({ skills: SOURCE_SKILLS });
    const localSkillsDir = path.join(dirs.projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);
    await mkdir(localSkillsDir, { recursive: true });

    await loadSkillsMatrixFromSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
      skipExtraSources: true,
    });

    neverSaid(`Found 0 project local skill(s) in ${localSkillsDir}`);
  });

  it("tags each loaded skill with its marketplace unless the extra sources are skipped", async () => {
    dirs = await createTestSource({ skills: SOURCE_SKILLS });

    const skipped = await loadSkillsMatrixFromSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
      skipExtraSources: true,
    });
    const tagged = await loadSkillsMatrixFromSource({
      sourceFlag: dirs.sourceDir,
      projectDir: dirs.projectDir,
    });

    expect(Object.values(skipped.matrix.skills)[0]?.availableSources).toBeUndefined();
    expect(Object.values(tagged.matrix.skills)[0]?.availableSources).toStrictEqual([
      { name: TEST_MARKETPLACE_NAME, type: "private", installed: false, primary: true },
    ]);
  });
});

/** The skills in `~/.claude/skills` join a project's load as global ones, and the home's as its own. */
describe("the local skills a load finds in the home directory", () => {
  const consoleSpies = silenceConsole(["log", "warn"]);
  let homeDirs: TestDirs;
  let sourceDirs: TestDirs;
  let savedHome: string | undefined;

  beforeEach(async () => {
    homeDirs = await createTestSource({ skills: SOURCE_SKILLS, localSkills: [LOCAL_SKILL] });
    sourceDirs = await createTestSource({ skills: SOURCE_SKILLS });
    savedHome = process.env.HOME;
    process.env.HOME = homeDirs.projectDir;
    vi.spyOn(os, "homedir").mockReturnValue(homeDirs.projectDir);
    delete process.env[SOURCE_ENV_VAR];
    setVerbose(true);
  });

  afterEach(async () => {
    setVerbose(false);
    vi.mocked(os.homedir).mockRestore();
    if (savedHome === undefined) delete process.env.HOME;
    else process.env.HOME = savedHome;
    await cleanupTestSource(homeDirs);
    await cleanupTestSource(sourceDirs);
  });

  it("merges them into a project's load as global local skills", async () => {
    const result = await loadSkillsMatrixFromSource({
      sourceFlag: sourceDirs.sourceDir,
      projectDir: sourceDirs.projectDir,
      skipExtraSources: true,
    });

    expect(Object.keys(result.matrix.skills)).toContain(LOCAL_SKILL.id);
    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Found 1 global local skill(s) in ${path.join(homeDirs.projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS)}`,
    );
  });

  it("reads them once, as the home's own, when the load is for the home directory", async () => {
    const homeSkillsDir = path.join(homeDirs.projectDir, CLAUDE_DIR, STANDARD_DIRS.SKILLS);

    await loadSkillsMatrixFromSource({
      sourceFlag: sourceDirs.sourceDir,
      projectDir: homeDirs.projectDir,
      skipExtraSources: true,
    });

    expect(consoleSpies.log).toHaveBeenCalledWith(
      `  Found 1 project local skill(s) in ${homeSkillsDir}`,
    );
    expect(consoleSpies.log).not.toHaveBeenCalledWith(
      `  Found 1 global local skill(s) in ${homeSkillsDir}`,
    );
  });
});

describe("the matrix a load of the public catalogue seats", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-loader-seats-");
    vi.stubEnv(SOURCE_ENV_VAR, undefined);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await cleanupTempDir(tempDir);
  });

  useFakeHome(() => tempDir);

  it("is the one the load hands back, so every reader after it sees the same catalogue", async () => {
    const result = await loadSkillsMatrixFromSource({
      projectDir: tempDir,
      skipExtraSources: true,
      matrixOnly: true,
    });

    expect(currentMatrix).toBe(result.matrix);
  });
});
