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
import { buildSkillConfig } from "../../__tests__/helpers/wizard-simulation.js";
import { CLAUDE_SRC_DIR } from "../../../consts.js";
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

  /**
   * A directory carrying a real `.claude-src/config.ts`, named by the same normalization the
   * registrar applies. `registerProjectPath` drops a registration whose config file is gone, so
   * a bare `mkdir` would be filtered out of `projects[]` before any assertion could see it.
   */
  async function makeRegisteredProject(name: string): Promise<string> {
    const dir = path.join(tempDir, name);
    await writeTestTsConfig(dir, buildProjectConfig({ name }), CLAUDE_SRC_DIR);
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

      // The standing rule, and the default for every caller but one: a project install adds
      // what it brought and removes nothing, because it never asked anybody about the machine.
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

      // The additive twin of the `"all"` spec below, and the half the roster assertion above
      // cannot carry: a merge that took the SESSION as the side that wins produces the same two
      // rosters — the sets are a union either way — while every scalar and every list the
      // session is silent about comes from the session instead. `projects[]` is the one that
      // costs something, because the fan-out walks it: `otherProjectDir` stops being visited and
      // nothing anywhere says a project was deregistered.
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

      // A machine with no global installation yet is the one case where every global row in the
      // session is new, so a resolution reporting no data change here is reporting the opposite
      // of what it did. `changed` cannot carry this: registering the project sets it either way.
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

      // An excluded row says this installation does not have that skill, so writing it upward
      // installs on the whole machine the one thing the project asked to be without.
      //
      // Two layers hold this and only the inner one is pinned here. The outer is
      // `splitConfigByScope`, whose global partition is `isActiveAt(entry, "global")` — so no
      // split the product builds today carries a row like these, and
      // `local-installer.test.ts` > "never writes a tombstone into the global config" is the
      // pin at that reachable layer. This one states the contract of the boundary itself: an
      // excluded row is not an install, whoever hands one in.
      expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual([REACT, VITEST].sort());
      expect(config.agents.map((agent) => agent.name).sort()).toStrictEqual(
        [WEB_DEV, API_DEV].sort(),
      );
    });

    /**
     * A session's split carries its whole domain selection, project half included, so a project
     * that picked an API skill for itself named `api` on the global half too. The global config's
     * domains are the global install's: a domain joins them only with a global skill from it.
     */
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

    it("reports the data change on a first authoritative write too", async () => {
      const { globalDataChanged } = await resolveEffectiveGlobalConfig(
        sessionGlobalSplit(),
        undefined,
        projectDir,
        "all",
      );

      // The spec above reads `changed`, which registering the project sets on its own, so it
      // holds for a resolution that reported the global rows as no news at all. The two
      // resolutions answer this separately and each needs its own pin.
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

      // Two flags, and the whole reason there are two. Registering a project must be WRITTEN —
      // an unregistered project is one the fan-out never visits again — but it is not a change
      // to what the global installation HOLDS, and reporting it as one recompiles every other
      // project on the machine for a run that installed nothing.
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

      // The sweep is the only thing that ever shortens this list on an install path, and the
      // list is what the fan-out walks: every stale entry is a directory each later global
      // write tries to reach, fails on, and reports as skipped. Nothing here is a global data
      // change, so `changed` is the only flag that can carry the rewrite.
      expect(config.projects?.sort()).toStrictEqual([projectDir, otherProjectDir].sort());
      expect(changed).toBe(true);
    });
  });
});
