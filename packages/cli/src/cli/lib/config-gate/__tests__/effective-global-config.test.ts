import path from "path";
import { mkdir, realpath, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveEffectiveGlobalConfig } from "../propagate.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { renderConfigTs } from "../../__tests__/content-generators.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { buildSkillConfig } from "../../__tests__/helpers/wizard-simulation.js";
import { CLAUDE_SRC_DIR, STANDARD_FILES } from "../../../consts.js";
import type { ProjectConfig } from "../../../types/index.js";

/**
 * Which global config a PROJECT-context write commits — the file at the OTHER scope, which the
 * project's own write is the only thing that touches from here.
 *
 * The default is additive and always has been: a project install adds what it brought and never
 * takes away, because a project has no business deciding for the machine on its own initiative.
 * `edit --from` is the one caller that is not acting on its own initiative — it states a whole
 * roster, shows what applying it takes away, names every other project the removal reaches, and
 * asks. So it hands the word `"all"` down, and the global config is made to MATCH the session
 * rather than merely absorb it.
 *
 * This is the second of the two halves that have to agree. `reconcileSharedConfig` decides what
 * reaches the removal DIFF, which deletes files; this decides what reaches the global config ROW.
 * Loosening one alone leaves a config declaring a skill whose directory is gone, or a directory
 * nothing declares.
 */

const REACT = "web-framework-react";
const VITEST = "web-testing-vitest";
const WEB_DEV = "web-developer";
const API_DEV = "api-developer";
const GLOBAL_NAME = "global-install";
const MARKETPLACE_REF = "github:acme/skills";

describe("resolveEffectiveGlobalConfig", () => {
  let tempDir: string;
  let projectDir: string;
  let otherProjectDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-effective-global-");
    projectDir = await makeRegisteredProject("project");
    otherProjectDir = await makeRegisteredProject("other-project");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /**
   * A directory carrying a real `.claude-src/config.ts`, named by the same normalization the
   * registrar applies. `registerProjectPath` drops a registration whose config file is gone, so
   * a bare `mkdir` would be filtered out of `projects[]` before any assertion could see it.
   */
  async function makeRegisteredProject(name: string): Promise<string> {
    const dir = path.join(tempDir, name);
    await mkdir(path.join(dir, CLAUDE_SRC_DIR), { recursive: true });
    await writeFile(
      path.join(dir, CLAUDE_SRC_DIR, STANDARD_FILES.CONFIG_TS),
      renderConfigTs(buildProjectConfig({ name })),
    );
    return realpath(dir);
  }

  /** The global config on disk: two skills at global scope, both projects registered. */
  function installedGlobal(): ProjectConfig {
    return buildProjectConfig({
      name: GLOBAL_NAME,
      marketplace: MARKETPLACE_REF,
      skills: [
        buildSkillConfig(REACT, { scope: "global" }),
        buildSkillConfig(VITEST, { scope: "global" }),
      ],
      agents: buildAgentConfigs([WEB_DEV, API_DEV], { scope: "global" }),
      projects: [projectDir, otherProjectDir],
    });
  }

  /** The global half of this session's split: React alone, on one sub-agent. */
  function sessionGlobalSplit(): ProjectConfig {
    return buildProjectConfig({
      name: GLOBAL_NAME,
      skills: [buildSkillConfig(REACT, { scope: "global" })],
      agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
    });
  }

  describe("without a word from the session", () => {
    it("leaves a global entry the session omits in place", async () => {
      const { config } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        installedGlobal(),
        projectDir,
      );

      // The standing rule, and the default for every caller but one: a project install adds
      // what it brought and removes nothing, because it never asked anybody about the machine.
      expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual([REACT, VITEST].sort());
      expect(config.agents.map((agent) => agent.name).sort()).toStrictEqual(
        [WEB_DEV, API_DEV].sort(),
      );
    });
  });

  describe("when the session owns every scope", () => {
    it("removes a global skill the session left out", async () => {
      const { config } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        installedGlobal(),
        projectDir,
        "all",
      );

      // The row half of the ruling. Without it the removal diff deletes
      // `~/.claude/skills/<id>` while `~/.claude-src/config.ts` goes on declaring the skill.
      expect(config.skills.map((skill) => skill.id)).toStrictEqual([REACT]);
    });

    it("removes a global sub-agent the session left out", async () => {
      const { config } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        installedGlobal(),
        projectDir,
        "all",
      );

      expect(config.agents.map((agent) => agent.name)).toStrictEqual([WEB_DEV]);
    });

    it("reports the change, so the write and the fan-out actually happen", async () => {
      const { changed, globalDataChanged } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        installedGlobal(),
        projectDir,
        "all",
      );

      // `changed` gates the write and `globalDataChanged` is what classification reads. A
      // removal reported as a no-op is a global config nobody rewrites and registered projects
      // nobody recompiles — the blast radius silently not happening.
      expect(changed).toBe(true);
      expect(globalDataChanged).toBe(true);
    });

    it("keeps the global installation's identity and its registration list", async () => {
      const { config } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        installedGlobal(),
        projectDir,
        "all",
      );

      // A project's split says nothing about who the global installation is or which projects
      // read it. Letting the session's roster answer those would deregister every other project
      // as a side effect of removing one skill — and propagation reads exactly that list.
      expect(config.name).toBe(GLOBAL_NAME);
      expect(config.marketplace).toBe(MARKETPLACE_REF);
      expect(config.projects?.sort()).toStrictEqual([projectDir, otherProjectDir].sort());
    });

    it("removes every global entry when the session names none", async () => {
      const emptySplit = buildProjectConfig({ name: GLOBAL_NAME, skills: [], agents: [] });

      const { config, changed } = await resolveEffectiveGlobalConfig(
        emptySplit,
        installedGlobal(),
        projectDir,
        "all",
      );

      // A configuration that installs nothing globally is a real configuration, and the
      // "nothing to add" shortcut is exactly where an authoritative session would otherwise
      // silently become a no-op.
      expect(config.skills).toStrictEqual([]);
      expect(config.agents).toStrictEqual([]);
      expect(changed).toBe(true);
    });

    it("reports no data change when it leaves the global config as it stands", async () => {
      const installed = installedGlobal();

      const { globalDataChanged } = await resolveEffectiveGlobalConfig(
        buildProjectConfig({
          name: GLOBAL_NAME,
          skills: installed.skills,
          agents: installed.agents,
        }),
        installed,
        projectDir,
        "all",
      );

      // Authority is permission to remove, not an instruction to rewrite: a session that
      // matches what is already there must classify as T4 and fan nothing out.
      expect(globalDataChanged).toBe(false);
    });

    it("writes the whole split where there is no global config yet", async () => {
      const { config, changed } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        undefined,
        projectDir,
        "all",
      );

      expect(config.skills.map((skill) => skill.id)).toStrictEqual([REACT]);
      expect(changed).toBe(true);
    });
  });
});
