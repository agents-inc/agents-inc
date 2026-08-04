import path from "path";
import { realpathSync } from "fs";
import { describe, it, expect, afterAll, beforeAll, afterEach } from "vitest";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  fileExists,
  readTestFile,
  runCLI,
  writeProjectConfig,
  writeConfigTypes,
  configTsPath,
  configTypesTsPath,
  loadConfigOrFail,
  createLocalSkill,
  writeAgentFile,
  skillsPath,
  renderMetadataYaml,
  FORKED_FROM_METADATA,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import "../matchers/setup.js";

/**
 * A GLOBAL uninstall must propagate to registered projects: before this fix,
 * deleting the global install left every registered project's config.ts with
 * dangling CLI-inlined `scope: "global"` rows (skills, agents, selectedAgents
 * entries, stack refs) pointing at content that no longer exists.
 *
 * The uninstall now prunes those inlined global entries from each reachable
 * registered project and regenerates its config-types.ts (standalone form —
 * the global config-types.ts it imported from is gone), while leaving
 * project-scoped entries and files strictly untouched. Unreachable project
 * dirs are warned about and skipped; the uninstall itself never aborts.
 */
describe("global uninstall propagates to registered projects", () => {
  let tempDir: string;
  let sourceDir: string;
  let sourceTempDir: string;

  beforeAll(async () => {
    await ensureBinaryExists();
    const source = await createE2ESource();
    sourceDir = source.sourceDir;
    sourceTempDir = source.tempDir;
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (sourceTempDir) await cleanupTempDir(sourceTempDir);
  });

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("prunes inlined global entries from a registered project, preserves project content, and doctor passes", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");
    const ghostDir = path.join(tempDir, "ghost-project");

    // --- Project installation: one project-scoped skill/agent plus the
    // CLI-inlined snapshot of the global install (skills, agents,
    // selectedAgents, and a stack ref to the global skill).
    await writeProjectConfig(projectDir, {
      name: "project-test",
      skills: [
        { id: E2E_SKILL.vitest.id, scope: "project", source: "eject" },
        { id: E2E_SKILL.react.id, scope: "global", source: "eject" },
      ],
      agents: [
        { name: E2E_AGENT["api-developer"].name, scope: "project" },
        { name: E2E_AGENT["web-developer"].name, scope: "global" },
      ],
      domains: ["web"],
      selectedAgents: [E2E_AGENT["web-developer"].name, E2E_AGENT["api-developer"].name],
      stack: {
        [E2E_AGENT["api-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
          "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: true }],
        },
      },
    });
    await writeConfigTypes(projectDir);
    await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
      description: "Project-scoped skill that must survive the global uninstall",
      metadata: renderMetadataYaml({ contentHash: "hash-project-vitest" }),
    });
    await writeAgentFile(projectDir, E2E_AGENT["api-developer"].name, { frontmatter: true });

    // --- Global installation at the fake HOME, registering the project (as a
    // realpath, matching registerProjectPath) plus a ghost path whose dir was
    // deleted — the uninstall must warn about it and continue.
    const realProjectDir = realpathSync(projectDir);
    await writeProjectConfig(globalHome, {
      name: "global-test",
      skills: [{ id: E2E_SKILL.react.id, scope: "global", source: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      domains: ["web"],
      selectedAgents: [E2E_AGENT["web-developer"].name],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
        },
      },
      projects: [realProjectDir, ghostDir],
    });
    await writeConfigTypes(globalHome);
    await createLocalSkill(globalHome, E2E_SKILL.react.id, {
      description: "Global skill removed by the uninstall",
      metadata: FORKED_FROM_METADATA,
    });
    await writeAgentFile(globalHome, E2E_AGENT["web-developer"].name, { frontmatter: true });

    // Snapshot the project-scoped skill content — it must be byte-preserved. The
    // project's compiled agent is a DERIVED artifact, not content: it was built
    // from the global rows this uninstall prunes, so the prune owes it a
    // recompile and it is asserted on separately below.
    const projectSkillMdPath = path.join(
      skillsPath(projectDir),
      E2E_SKILL.vitest.id,
      FILES.SKILL_MD,
    );
    const projectSkillMetaPath = path.join(
      skillsPath(projectDir),
      E2E_SKILL.vitest.id,
      FILES.METADATA_YAML,
    );
    const skillMdBefore = await readTestFile(projectSkillMdPath);
    const skillMetaBefore = await readTestFile(projectSkillMetaPath);

    // --- Global uninstall from the fake HOME.
    const { exitCode, stdout, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: globalHome },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // Summary line: exactly one registered project was updated, and the ghost
    // path produced a warning instead of aborting the uninstall.
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_PROJECTS_UPDATED_ONE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_PROJECT_SKIPPED);
    expect(output).toContain(ghostDir);

    // The global manifest is gone.
    expect(await fileExists(configTsPath(globalHome))).toBe(false);
    expect(await fileExists(configTypesTsPath(globalHome))).toBe(false);

    // Project config.ts: every inlined global row is pruned; project-scoped
    // entries survive with identical values.
    const projectConfig = await loadConfigOrFail(projectDir);
    expect(projectConfig.skills).toStrictEqual([
      { id: E2E_SKILL.vitest.id, scope: "project", source: "eject" },
    ]);
    expect(projectConfig.agents).toStrictEqual([
      { name: E2E_AGENT["api-developer"].name, scope: "project" },
    ]);
    expect(projectConfig.selectedAgents).toStrictEqual([E2E_AGENT["api-developer"].name]);
    expect(projectConfig.stack).toStrictEqual({
      [E2E_AGENT["api-developer"].name]: {
        "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: true }],
      },
    });

    // Raw text carries no global-scoped remnants at all — no removed skill id,
    // no removed agent name, no `scope: "global"` rows.
    const rawConfig = await readTestFile(configTsPath(projectDir));
    expect(rawConfig).not.toContain(E2E_SKILL.react.id);
    expect(rawConfig).not.toContain(E2E_AGENT["web-developer"].name);
    expect(rawConfig).not.toContain('"global"');

    // config-types.ts was regenerated in standalone form: the seeded stub is
    // replaced, the project's own skill is in the union, and nothing imports
    // from the deleted global config-types.ts.
    const rawTypes = await readTestFile(configTypesTsPath(projectDir));
    expect(rawTypes).toContain(`"${E2E_SKILL.vitest.id}"`);
    expect(rawTypes).not.toContain("GlobalSkillId");
    expect(rawTypes).not.toContain("export type SkillId = string");

    // Project-scoped skill content is byte-preserved.
    expect(await readTestFile(projectSkillMdPath)).toBe(skillMdBefore);
    expect(await readTestFile(projectSkillMetaPath)).toBe(skillMetaBefore);

    // The project's own agent survives the prune and still preloads the skill it
    // owns — recompiled from the pruned config rather than left naming removed
    // global content.
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: [E2E_SKILL.vitest.id],
      notContains: [E2E_SKILL.react.id],
    });

    // Doctor passes in the project afterwards — no dangling references remain.
    const doctor = await CLI.run(["doctor"], { dir: projectDir }, { env: { HOME: globalHome } });
    expect(doctor.exitCode).toBe(EXIT_CODES.SUCCESS);
  });

  /**
   * Pruning the config is only half the job. The registered project's compiled
   * `.claude/agents/*.md` were built from the global rows this uninstall just
   * removed, so leaving them untouched hands the user agents that preload a
   * skill whose files were deleted along with the global install.
   *
   * The test above deliberately cannot cover this: its project agent is a
   * hand-written stub that never referenced the global skill, which is why it
   * can assert byte-preservation. Here the agent is produced by a real
   * `compile` while the global skill is still installed, so it genuinely
   * preloads it.
   *
   * CURRENTLY RED. `uninstall` calls `pruneGlobalEntriesFromRegisteredProjects`
   * and reports `result.updated.length`, but never recompiles the projects that
   * result names — so the compiled agent still preloads the pruned skill and no
   * recompile summary is printed.
   */
  it("recompiles a registered project's agents so they stop preloading the pruned global skill", async () => {
    tempDir = await createTempDir();
    const globalHome = path.join(tempDir, "global-home");
    const projectDir = path.join(tempDir, "project");

    // --- Project installation: a PROJECT-scoped api-developer whose stack
    // preloads BOTH its own project skill and the inherited global one.
    await writeProjectConfig(projectDir, {
      name: "project-recompile",
      skills: [
        { id: E2E_SKILL.vitest.id, scope: "project", source: "eject" },
        { id: E2E_SKILL.react.id, scope: "global", source: "eject" },
      ],
      agents: [{ name: E2E_AGENT["api-developer"].name, scope: "project" }],
      domains: ["web"],
      selectedAgents: [E2E_AGENT["api-developer"].name],
      stack: {
        [E2E_AGENT["api-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
          "web-testing": [{ id: E2E_SKILL.vitest.id, preloaded: true }],
        },
      },
    });
    await writeConfigTypes(projectDir);
    await createLocalSkill(projectDir, E2E_SKILL.vitest.id, {
      description: "Project-scoped skill that must survive the global uninstall",
      metadata: renderMetadataYaml({ contentHash: "hash-project-vitest" }),
    });

    // --- Global installation at the fake HOME, registering the project.
    await writeProjectConfig(globalHome, {
      name: "global-recompile",
      skills: [{ id: E2E_SKILL.react.id, scope: "global", source: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      domains: ["web"],
      selectedAgents: [E2E_AGENT["web-developer"].name],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
        },
      },
      projects: [realpathSync(projectDir)],
    });
    await writeConfigTypes(globalHome);
    await createLocalSkill(globalHome, E2E_SKILL.react.id, {
      description: "Global skill removed by the uninstall",
      metadata: FORKED_FROM_METADATA,
    });

    // A real compile produces the stale artifact the uninstall has to invalidate.
    const compiled = await runCLI(["compile", "--source", sourceDir], projectDir, {
      env: { HOME: globalHome },
    });
    expect(compiled.exitCode, `project compile must succeed: ${compiled.combined}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
    });

    const { exitCode, stdout, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir: globalHome },
      { env: { HOME: globalHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    // Proof the propagation half ran: the config prune landed.
    expect(stdout).toContain(STEP_TEXT.UNINSTALL_PROJECTS_UPDATED_ONE);
    const projectConfig = await loadConfigOrFail(projectDir);
    expect(projectConfig.skills).toStrictEqual([
      { id: E2E_SKILL.vitest.id, scope: "project", source: "eject" },
    ]);

    // The compiled agents follow the prune — the pruned skill is gone from the
    // .md, and the project's own skill survives it.
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["api-developer"].name, {
      contains: [E2E_SKILL.vitest.id],
      notContains: [E2E_SKILL.react.id],
    });

    expect(
      output,
      "the uninstall must report recompiling the registered projects it pruned",
    ).toContain(STEP_TEXT.PROPAGATED_RECOMPILE);
  });
});
