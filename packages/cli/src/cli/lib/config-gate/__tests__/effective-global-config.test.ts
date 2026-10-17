import path from "path";
import { realpath } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveEffectiveGlobalConfig } from "../propagate.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { buildSkillConfig } from "../../__tests__/helpers/skill-config-builders.js";
import type { ProjectConfig } from "../../../types/index.js";

/**
 * The global config a project write commits: additive by default; `edit --from` passes `"all"` so
 * it matches the session. Must agree with `reconcileSharedConfig`'s removal diff.
 */

const REACT = "web-framework-react";
const VITEST = "web-testing-vitest";
const HONO = "api-framework-hono";
const WEB_DEV = "web-developer";
const API_DEV = "api-developer";
const CLI_DEV = "cli-developer";
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

  /** A real config, since `registerProjectPath` drops a registration whose config is gone. */
  async function makeRegisteredProject(name: string): Promise<string> {
    const dir = path.join(tempDir, name);
    await writeTestTsConfig(dir, buildProjectConfig({ name }));
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

  /** A session that installs nothing at global scope — the `hasGlobalItems` shortcut's input. */
  function emptyGlobalSplit(): ProjectConfig {
    return buildProjectConfig({ name: GLOBAL_NAME, skills: [], agents: [] });
  }

  describe("without a word from the session", () => {
    it("leaves a global entry the session omits in place", async () => {
      const { config } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        installedGlobal(),
        projectDir,
      );

      expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual([REACT, VITEST].sort());
      expect(config.agents.map((agent) => agent.name).sort()).toStrictEqual(
        [WEB_DEV, API_DEV].sort(),
      );
    });

    it("keeps the global installation's identity and its registration list", async () => {
      const { config } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        installedGlobal(),
        projectDir,
      );

      // A merge where the session wins would give the same rosters but lose `projects[]`.
      expect(config.name).toBe(GLOBAL_NAME);
      expect(config.marketplace).toBe(MARKETPLACE_REF);
      expect(config.projects?.sort()).toStrictEqual([projectDir, otherProjectDir].sort());
    });

    it("reports the data change on a first write, so the fan-out is not skipped", async () => {
      const { config, globalDataChanged } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        undefined,
        projectDir,
      );

      // No global yet, so every global row is new; `changed` cannot show this.
      expect(config.skills.map((skill) => skill.id)).toStrictEqual([REACT]);
      expect(globalDataChanged).toBe(true);
    });

    it("refuses an excluded row as a global install", async () => {
      const splitCarryingTombstones = buildProjectConfig({
        name: GLOBAL_NAME,
        skills: [
          buildSkillConfig(REACT, { scope: "global" }),
          buildSkillConfig(HONO, { scope: "global", excluded: true }),
        ],
        agents: [
          ...buildAgentConfigs([WEB_DEV], { scope: "global" }),
          ...buildAgentConfigs([CLI_DEV], { scope: "global", excluded: true }),
        ],
      });

      const { config } = await resolveEffectiveGlobalConfig(
        splitCarryingTombstones,
        installedGlobal(),
        projectDir,
      );

      // An excluded row is not an install, whoever hands one in.
      expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual([REACT, VITEST].sort());
      expect(config.agents.map((agent) => agent.name).sort()).toStrictEqual(
        [WEB_DEV, API_DEV].sort(),
      );
    });

    /** A domain joins the global config only with a global skill from it. */
    it("keeps the global domains when the session's global skills are all installed already", async () => {
      const { config, globalDataChanged } = await resolveEffectiveGlobalConfig(
        { ...sessionGlobalSplit(), selectedDomains: ["web", "api"] },
        { ...installedGlobal(), selectedDomains: ["web"] },
        projectDir,
      );

      expect(
        config.selectedDomains,
        "a domain only the project's own skills come from is the project's",
      ).toStrictEqual(["web"]);
      expect(globalDataChanged, "nothing global arrived, so nothing global changed").toBe(false);
    });

    it("widens the global domains by the domain of a global skill that arrives, and no other", async () => {
      const { config, globalDataChanged } = await resolveEffectiveGlobalConfig(
        {
          ...sessionGlobalSplit(),
          skills: [
            buildSkillConfig(REACT, { scope: "global" }),
            buildSkillConfig(HONO, { scope: "global" }),
          ],
          selectedDomains: ["web", "api", "cli"],
        },
        { ...installedGlobal(), selectedDomains: ["web"] },
        projectDir,
      );

      expect(config.selectedDomains).toStrictEqual(["web", "api"]);
      expect(globalDataChanged).toBe(true);
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

      // Otherwise the removal diff deletes the skill's files while the config still declares it.
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

      // `changed` gates the write; `globalDataChanged` is what classification reads.
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

      // The session's split must not answer who the global is or which projects read it.
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

      // Installing nothing globally is a real configuration, not a no-op shortcut.
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

      // Authority is permission to remove: a matching session must classify as T4.
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

    it("reports the data change on a first authoritative write too", async () => {
      const { globalDataChanged } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        undefined,
        projectDir,
        "all",
      );

      // The spec above reads `changed`, which registering sets on its own; this pins the data flag.
      expect(globalDataChanged).toBe(true);
    });
  });

  describe("the project registry this write carries", () => {
    it("registers a newcomer without reporting a global data change", async () => {
      const newcomerDir = await makeRegisteredProject("newcomer");

      const { config, changed, globalDataChanged } = await resolveEffectiveGlobalConfig(
        emptyGlobalSplit(),
        installedGlobal(),
        newcomerDir,
      );

      // Registration must be written but is not a data change, or every project would recompile.
      expect(config.projects?.sort()).toStrictEqual(
        [projectDir, otherProjectDir, newcomerDir].sort(),
      );
      expect(changed).toBe(true);
      expect(globalDataChanged).toBe(false);
    });

    it("drops a registration whose project is gone", async () => {
      const removedProjectDir = path.join(tempDir, "removed-project");
      const installed = installedGlobal();

      const { config, changed } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        { ...installed, projects: [...(installed.projects ?? []), removedProjectDir] },
        projectDir,
      );

      // Only `changed` can carry the sweep's rewrite: nothing here is a data change.
      expect(config.projects?.sort()).toStrictEqual([projectDir, otherProjectDir].sort());
      expect(changed).toBe(true);
    });
  });
});
