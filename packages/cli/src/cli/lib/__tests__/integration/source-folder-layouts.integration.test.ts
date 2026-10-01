/**
 * What the CLI actually does with an installation laid out the new way — found, loaded, and
 * compiled from — and that an installation laid out the old way keeps behaving exactly as it
 * does today.
 *
 * R1 of the source-folder rename (`todo/plans/CLI-source-folder-rename-plan.md`) teaches the
 * CLI to READ `.agents-inc/<provider>/`. Nothing is written to the new name, nothing moves, and
 * no golden file changes. The resolver's own preference order is pinned in
 * `lib/installation/install-layout.test.ts`; this file is the other half — the readers that sit
 * on top of it, each asked the same question under both layouts.
 *
 * Every spec here has a pair: the legacy case is a CONTROL and not a leftover. A suite that
 * only proved the new folder works could not tell a resolver that reads both from one that has
 * quietly stopped reading the old name, and "the old name keeps working, read and write, in
 * place" is the ruling the whole step rests on.
 *
 * The folder names are literals. They are text on people's disks, and an assertion that
 * imported the constant the product writes would move with it and could never fail.
 */

import os from "os";
import path from "path";
import { mkdir, readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMockAgentConfig } from "../factories/agent-factories.js";
import { buildProjectConfig } from "../factories/config-factories.js";
import { writeTestAgent } from "../helpers/disk-writers.js";
import { writeTestTsConfig } from "../helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "../test-fs-utils.js";
import { compileAgentForHost, createLiquidEngine } from "../../compiler.js";
import { loadProjectConfig, loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { detectInstallation } from "../../installation/index.js";
import { loadProjectAgents } from "../../loading/loader.js";

/** The new layout, and the name every installation made before the rename still carries. */
const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const LEGACY_SOURCE_REL = ".claude-src";

/** Names that say which of two configs on one disk was the one that got read. */
const IN_THE_NEW_FOLDER = "read-from-the-new-folder";
const IN_THE_LEGACY_FOLDER = "read-from-the-legacy-folder";
const IN_THE_GLOBAL_FOLDER = "read-from-the-global-folder";

const FIXTURES_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

/** The one sub-agent whose partials the fixture tree carries, and the two files a compile needs. */
const FIXTURE_AGENT = "web-developer";
const REQUIRED_AGENT_PARTIALS = ["identity.md", "playbook.md"] as const;

/** The line only the fixture template emits, and therefore the one that says which rendered. */
const PROJECT_TEMPLATE_MARKER = "Rendered by the project's own agent template.";

/** A frontmatter key the SHIPPED template emits unconditionally and the fixture template never. */
const SHIPPED_TEMPLATE_KEY = "permissionMode:";

describe("a project's own config", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await createTempDir("cc-source-layout-config-");
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  it("is loaded from the legacy folder, exactly as it is today", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: IN_THE_LEGACY_FOLDER }),
      LEGACY_SOURCE_REL,
    );

    const loaded = await loadProjectConfigFromDir(projectDir, "claude");

    expect(loaded?.config.name).toBe(IN_THE_LEGACY_FOLDER);
    expect(loaded?.configPath).toBe(path.join(projectDir, LEGACY_SOURCE_REL, "config.ts"));
  });

  it("is loaded from the new folder", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: IN_THE_NEW_FOLDER }),
      CLAUDE_SOURCE_REL,
    );

    const loaded = await loadProjectConfigFromDir(projectDir, "claude");

    expect(loaded?.config.name).toBe(IN_THE_NEW_FOLDER);
    expect(loaded?.configPath).toBe(path.join(projectDir, ".agents-inc", "claude", "config.ts"));
  });

  it("comes from the new folder when both folders hold one", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: IN_THE_LEGACY_FOLDER }),
      LEGACY_SOURCE_REL,
    );
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: IN_THE_NEW_FOLDER }),
      CLAUDE_SOURCE_REL,
    );

    const loaded = await loadProjectConfigFromDir(projectDir, "claude");

    expect(
      loaded?.config.name,
      "the new layout wins the preference order, so a project holding both is read from it",
    ).toBe(IN_THE_NEW_FOLDER);
  });

  it("is absent when neither folder holds one", async () => {
    await mkdir(path.join(projectDir, ".agents-inc", "claude"), { recursive: true });
    await mkdir(path.join(projectDir, LEGACY_SOURCE_REL), { recursive: true });

    expect(
      await loadProjectConfigFromDir(projectDir, "claude"),
      "two empty folders are not an installation, and a missing config is a legitimate null rather than a fault",
    ).toBeNull();
  });
});

describe("a project that inherits from the global", () => {
  let tempDir: string;
  let projectDir: string;
  let fakeHome: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-source-layout-scopes-");
    projectDir = path.join(tempDir, "project");
    fakeHome = path.join(tempDir, "home");
    await mkdir(projectDir, { recursive: true });
    await mkdir(fakeHome, { recursive: true });
    vi.spyOn(os, "homedir").mockReturnValue(fakeHome);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupTempDir(tempDir);
  });

  it("falls back to a global on the new layout when it has no config of its own", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({ name: IN_THE_GLOBAL_FOLDER }),
      CLAUDE_SOURCE_REL,
    );

    const loaded = await loadProjectConfig(projectDir);

    expect(loaded?.config.name).toBe(IN_THE_GLOBAL_FOLDER);
    expect(loaded?.configPath).toBe(path.join(fakeHome, ".agents-inc", "claude", "config.ts"));
  });

  it("falls back to a global on the legacy layout, exactly as it does today", async () => {
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({ name: IN_THE_GLOBAL_FOLDER }),
      LEGACY_SOURCE_REL,
    );

    const loaded = await loadProjectConfig(projectDir);

    expect(loaded?.config.name).toBe(IN_THE_GLOBAL_FOLDER);
    expect(loaded?.configPath).toBe(path.join(fakeHome, LEGACY_SOURCE_REL, "config.ts"));
  });

  it("reads its own new-layout config over a global on the legacy layout", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: IN_THE_NEW_FOLDER }),
      CLAUDE_SOURCE_REL,
    );
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({ name: IN_THE_GLOBAL_FOLDER }),
      LEGACY_SOURCE_REL,
    );

    const loaded = await loadProjectConfig(projectDir);

    expect(loaded?.config.name).toBe(IN_THE_NEW_FOLDER);
  });

  it("reads its own legacy-layout config over a global on the new layout", async () => {
    await writeTestTsConfig(
      projectDir,
      buildProjectConfig({ name: IN_THE_LEGACY_FOLDER }),
      LEGACY_SOURCE_REL,
    );
    await writeTestTsConfig(
      fakeHome,
      buildProjectConfig({ name: IN_THE_GLOBAL_FOLDER }),
      CLAUDE_SOURCE_REL,
    );

    const loaded = await loadProjectConfig(projectDir);

    expect(
      loaded?.config.name,
      "a project standing on the old name is still its own installation — the global does not take it over",
    ).toBe(IN_THE_LEGACY_FOLDER);
  });
});

describe("detectInstallation", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await createTempDir("cc-source-layout-detect-");
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  it("finds an installation in the new folder", async () => {
    await writeTestTsConfig(projectDir, buildProjectConfig(), CLAUDE_SOURCE_REL);

    const found = await detectInstallation(projectDir);

    expect(found?.configPath).toBe(path.join(projectDir, ".agents-inc", "claude", "config.ts"));
    expect(found?.projectDir).toBe(projectDir);
  });

  it("finds an installation in the legacy folder, exactly as it does today", async () => {
    await writeTestTsConfig(projectDir, buildProjectConfig(), LEGACY_SOURCE_REL);

    const found = await detectInstallation(projectDir);

    expect(found?.configPath).toBe(path.join(projectDir, LEGACY_SOURCE_REL, "config.ts"));
    expect(found?.projectDir).toBe(projectDir);
  });
});

describe("the agents a project keeps of its own", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await createTempDir("cc-source-layout-agents-");
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  it("are loaded from the new folder", async () => {
    await writeTestAgent(path.join(projectDir, ".agents-inc", "claude", "agents"), "my-agent");

    expect(Object.keys(await loadProjectAgents(projectDir))).toStrictEqual(["my-agent"]);
  });

  it("are loaded from the legacy folder, exactly as they are today", async () => {
    await writeTestAgent(path.join(projectDir, LEGACY_SOURCE_REL, "agents"), "my-agent");

    expect(Object.keys(await loadProjectAgents(projectDir))).toStrictEqual(["my-agent"]);
  });
});

describe("a project's own agent template", () => {
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await createTempDir("cc-source-layout-templates-");
    await copyFixtureAgentPartials(projectDir);
  });

  afterEach(async () => {
    await cleanupTempDir(projectDir);
  });

  it("is the one that renders when it sits in the new folder", async () => {
    await installTemplateOverride(projectDir, [".agents-inc", "claude"]);

    expect(await compileFixtureAgent(projectDir)).toContain(PROJECT_TEMPLATE_MARKER);
  });

  it("is the one that renders when it sits in the legacy folder, as it is today", async () => {
    await installTemplateOverride(projectDir, [LEGACY_SOURCE_REL]);

    expect(await compileFixtureAgent(projectDir)).toContain(PROJECT_TEMPLATE_MARKER);
  });

  it("leaves the shipped template rendering when the project has none", async () => {
    const compiled = await compileFixtureAgent(projectDir);

    expect(
      compiled,
      "without this the two specs above would hold for a compile that always renders the fixture",
    ).toContain(SHIPPED_TEMPLATE_KEY);
    expect(compiled).not.toContain(PROJECT_TEMPLATE_MARKER);
  });
});

/** The partials `compileAgentForHost` requires, put where it reads them from. */
async function copyFixtureAgentPartials(projectDir: string): Promise<void> {
  const agentDir = path.join(projectDir, "src", "agents", FIXTURE_AGENT);
  await mkdir(agentDir, { recursive: true });

  for (const file of REQUIRED_AGENT_PARTIALS) {
    const content = await readFile(
      path.join(FIXTURES_ROOT, "agents", FIXTURE_AGENT, file),
      "utf-8",
    );
    await writeFile(path.join(agentDir, file), content);
  }
}

/** Puts the fixture template where a project's own override lives, under the given source folder. */
async function installTemplateOverride(
  projectDir: string,
  sourceFolder: readonly string[],
): Promise<void> {
  const templatesDir = path.join(projectDir, ...sourceFolder, "agents", "_templates");
  await mkdir(templatesDir, { recursive: true });
  const template = await readFile(
    path.join(FIXTURES_ROOT, "agents", "_templates", "agent.liquid"),
    "utf-8",
  );
  await writeFile(path.join(templatesDir, "agent.liquid"), template);
}

async function compileFixtureAgent(projectDir: string): Promise<string> {
  const engine = await createLiquidEngine(projectDir);
  return compileAgentForHost(
    "claude",
    FIXTURE_AGENT,
    createMockAgentConfig(FIXTURE_AGENT),
    projectDir,
    engine,
  );
}
