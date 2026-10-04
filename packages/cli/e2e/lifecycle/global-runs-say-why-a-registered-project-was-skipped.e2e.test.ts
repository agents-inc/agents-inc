import path from "path";
import { realpathSync } from "fs";
import { chmod, mkdir } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { CLI, type CLIResult } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  compactCliOutput,
  configTsPath,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  flattenCliOutput,
  FORKED_FROM_METADATA,
  readTreeSnapshot,
  sourceFolderIn,
  writeProjectConfig,
  writeProjectConfigIn,
  type FixtureProjectConfig,
  type FixtureStackAgentConfig,
  type TreeSnapshotEntry,
} from "../helpers/test-utils.js";
import { DIRS, E2E_MARKETPLACE_NAME, EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { sa } from "../../src/cli/lib/__tests__/factories/skill-factories.js";
import {
  buildSkillConfig,
  buildSkillConfigs,
} from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import type { AgentName } from "../../src/cli/types/index.js";

/**
 * A run at the home directory that fans a global change out to every registered project, over the
 * projects it cannot rewrite for a reason other than an unreadable `config.ts`: a registered path
 * with nothing installed at it any more, a project on the other provider, and one whose rewrite
 * fails. Each gets its own line saying which and why. `uninstall` keeps its own sentence — "its
 * config may still reference the uninstalled global content" — only for the project where that is
 * true: its config is there and was not pruned. A healthy project beside them is reached and not
 * named, so a line printed for every project reads as wrong.
 *
 * The rewrite is made to fail by a read-only `config.ts`. A run as root writes it anyway, and the
 * failure line's assertion is what would report that rather than the spec passing quietly.
 */

const API_DEV = E2E_AGENT["api-developer"].name;
const WEB_DEV = E2E_AGENT["web-developer"].name;

/** Denies the write bit on a file whose directory stays writable, so cleanup can still remove it. */
const READ_ONLY_FILE = 0o444;

/** The global installation's own sub-agent stack. */
const globalStack = {
  [API_DEV]: { "web-testing": [sa(E2E_SKILL.vitest.id, true)] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** A registered project's own sub-agent stack. */
const projectStack = {
  [WEB_DEV]: { "web-framework": [sa(E2E_SKILL.react.id, true)] },
} satisfies Partial<Record<AgentName, FixtureStackAgentConfig>>;

/** One global installation and every project registered against it, by registered path. */
type Fixture = {
  home: string;
  /** Registered, with nothing left at the path. */
  gone: string;
  /** A Codex installation, registered under this Claude one. */
  codex: string;
  /** A Claude project whose `config.ts` cannot be written. */
  readOnly: string;
  healthy: string;
};

/** The one line a global run owes for a project it skipped, saying why. */
function skipLine(projectPath: string, why: string): string {
  return compactCliOutput(`${STEP_TEXT.SKIPPED_REGISTERED_PROJECT} ${projectPath}: ${why}`);
}

/** `uninstall`'s own sentence about a project, which is true only where its config was left as it was. */
function uninstallsOwnLine(projectPath: string): string {
  return compactCliOutput(`${STEP_TEXT.UNINSTALL_PROJECT_SKIPPED} ${projectPath}`);
}

describe("a run at the home directory over registered projects it cannot rewrite", () => {
  let sourceDir: string;
  let sourceTempDir: string;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ({ sourceDir, tempDir: sourceTempDir } = await createE2ESource());
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await cleanupTempDir(sourceTempDir);
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** A Claude project as a project write leaves it: its own row, plus the global one. */
  function claudeProjectConfig(name: string): FixtureProjectConfig {
    return buildProjectConfig({
      name,
      marketplace: sourceDir,
      marketplaceName: E2E_MARKETPLACE_NAME,
      skills: [
        buildSkillConfig(E2E_SKILL.react.id, { scope: "project" }),
        buildSkillConfig(E2E_SKILL.vitest.id, { scope: "global" }),
      ],
      agents: [
        ...buildAgentConfigs([WEB_DEV], { scope: "project" }),
        ...buildAgentConfigs([API_DEV], { scope: "global" }),
      ],
      selectedDomains: ["web"],
      stack: projectStack,
    });
  }

  /** One folder of the installation, by the real path a registration records. */
  async function installationFolder(tempDir: string, name: string): Promise<string> {
    const dir = path.join(tempDir, name);
    await mkdir(path.join(dir, DIRS.CLAUDE, DIRS.AGENTS), { recursive: true });
    await createPermissionsFile(dir);
    return realpathSync(dir);
  }

  async function claudeProject(tempDir: string, name: string): Promise<string> {
    const dir = await installationFolder(tempDir, name);
    await writeProjectConfig(dir, claudeProjectConfig(name));
    await createLocalSkill(dir, E2E_SKILL.react.id, {
      description: "Project-owned skill",
      metadata: FORKED_FROM_METADATA,
    });
    return dir;
  }

  async function takeInstallation(): Promise<Fixture> {
    const tempDir = await createTempDir();
    tempDirs.push(tempDir);

    const home = await installationFolder(tempDir, "home");
    const gone = path.join(realpathSync(tempDir), "deleted-project");
    const codex = await installationFolder(tempDir, "codex-project");
    const readOnly = await claudeProject(tempDir, "read-only-project");
    const healthy = await claudeProject(tempDir, "healthy-project");

    await writeProjectConfig(
      home,
      buildProjectConfig({
        name: "global-install",
        marketplace: sourceDir,
        marketplaceName: E2E_MARKETPLACE_NAME,
        skills: [buildSkillConfig(E2E_SKILL.vitest.id, { scope: "global" })],
        agents: buildAgentConfigs([API_DEV], { scope: "global" }),
        selectedDomains: ["web"],
        stack: globalStack,
        projects: [gone, codex, readOnly, healthy],
      }),
    );
    await createLocalSkill(home, E2E_SKILL.vitest.id, {
      description: "Globally installed skill",
      metadata: FORKED_FROM_METADATA,
    });

    await writeProjectConfigIn(
      codex,
      DIRS.SOURCE_CODEX,
      buildProjectConfig({
        name: "codex-project",
        marketplace: sourceDir,
        skills: buildSkillConfigs([E2E_SKILL.react.id], { scope: "project", origin: "eject" }),
        agents: [],
      }),
    );

    await chmod(configTsPath(readOnly), READ_ONLY_FILE);

    return { home, gone, codex, readOnly, healthy };
  }

  /** What the run must leave as it found it: the other provider's folder, and the unwritable one. */
  async function untouchedFolders(fixture: Fixture): Promise<Record<string, TreeSnapshotEntry>[]> {
    return Promise.all([
      readTreeSnapshot(path.join(fixture.codex, DIRS.SOURCE_CODEX)),
      readTreeSnapshot(sourceFolderIn(fixture.readOnly)),
    ]);
  }

  describe("compile", () => {
    let fixture: Fixture;
    let run: CLIResult;
    let before: Record<string, TreeSnapshotEntry>[];

    beforeAll(async () => {
      fixture = await takeInstallation();
      before = await untouchedFolders(fixture);
      run = await CLI.run(["compile"], { dir: fixture.home }, { env: { HOME: fixture.home } });
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    it("finishes", () => {
      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
    });

    it("names each project it skipped, and why", () => {
      const said = compactCliOutput(run.output);
      expect(said).toContain(skipLine(fixture.gone, STEP_TEXT.REGISTERED_PROJECT_GONE));
      expect(said).toContain(skipLine(fixture.codex, STEP_TEXT.REGISTERED_PROJECT_OTHER_PROVIDER));
      expect(said).toContain(
        skipLine(fixture.readOnly, STEP_TEXT.REGISTERED_PROJECT_UPDATE_FAILED),
      );
    });

    it("does not warn in uninstall's words, since nothing was uninstalled", () => {
      expect(flattenCliOutput(run.output)).not.toContain(STEP_TEXT.UNINSTALL_PROJECT_SKIPPED);
    });

    it("names no project it reached", () => {
      const said = compactCliOutput(run.output);
      expect(said, "the fan-out still reached it").toContain(
        compactCliOutput(STEP_TEXT.PROPAGATED_RECOMPILE_ONE),
      );
      expect(said).not.toContain(
        compactCliOutput(`${STEP_TEXT.SKIPPED_REGISTERED_PROJECT} ${fixture.healthy}:`),
      );
    });

    it("leaves the projects it skipped byte-identical", async () => {
      expect(await untouchedFolders(fixture)).toStrictEqual(before);
    });
  });

  describe("uninstall", () => {
    let fixture: Fixture;
    let run: CLIResult;
    let before: Record<string, TreeSnapshotEntry>[];

    beforeAll(async () => {
      fixture = await takeInstallation();
      before = await untouchedFolders(fixture);
      run = await CLI.run(
        ["uninstall", "--yes"],
        { dir: fixture.home },
        { env: { HOME: fixture.home } },
      );
    }, TIMEOUTS.EXTENDED_LIFECYCLE);

    it("finishes, and prunes the project it reached", () => {
      expect(run.exitCode, run.output).toBe(EXIT_CODES.SUCCESS);
      expect(run.output).toContain(STEP_TEXT.UNINSTALL_PROJECTS_UPDATED_ONE);
    });

    it("names the projects holding nothing of this installation, and why", () => {
      const said = compactCliOutput(run.output);
      expect(said).toContain(skipLine(fixture.gone, STEP_TEXT.REGISTERED_PROJECT_GONE));
      expect(said).toContain(skipLine(fixture.codex, STEP_TEXT.REGISTERED_PROJECT_OTHER_PROVIDER));
    });

    it("does not say they may still reference what it removed", () => {
      const said = compactCliOutput(run.output);
      expect(said, "nothing is installed there").not.toContain(uninstallsOwnLine(fixture.gone));
      expect(said, "another provider's config holds none of it").not.toContain(
        uninstallsOwnLine(fixture.codex),
      );
    });

    it("keeps its own sentence for the project whose config it could not prune", () => {
      expect(compactCliOutput(run.output)).toContain(uninstallsOwnLine(fixture.readOnly));
    });

    it("leaves the projects it skipped byte-identical", async () => {
      expect(await untouchedFolders(fixture)).toStrictEqual(before);
    });
  });
});
