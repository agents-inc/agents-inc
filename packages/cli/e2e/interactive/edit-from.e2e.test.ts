import path from "path";
import { writeFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import {
  cleanupTempDir,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  readTreeSnapshot,
  renderMetadataYaml,
  renderSkillMd,
  skillsPath,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createTestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, FILES, REMOVED_MARKER, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedExternalSkill,
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `edit --from <id>` with somebody at the terminal.
 *
 * The command applies a shared configuration DESTRUCTIVELY: the project is made to match the
 * payload, so a skill the previous configuration installed and this one omits is removed. The
 * removals are shown and confirmed first, and two kinds of entry are shown as KEPT instead — one
 * written here, which no shared configuration ever carried, and one this configuration NAMES that
 * the catalogue cannot place, because a destructive command removes on intent and never on its
 * own inability. A globally installed entry is neither: it IS removed, under its own heading and
 * beside a statement of who else that reaches.
 *
 * Every spec drives the real binary through a PTY, because the confirm is an Ink prompt and a
 * spawned process without one refuses (see `e2e/commands/edit-from.e2e.test.ts`).
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const APPLY_ID = "EditFromY1";

/**
 * A real public-catalogue id the E2E source does not carry, recorded in the install with no
 * files written for it. The decode skips it, so a configuration naming it asks for a skill this
 * catalogue has no way to place.
 */
const UNPLACEABLE_SKILL = "web-styling-tailwind";

describe("edit --from <id> interactive", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let prompt: InteractivePrompt | undefined;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /**
   * An installed project. Both of its skills carry fork provenance by default, so the round
   * trip owns them and nothing is excused from removal unless a spec says so.
   */
  async function takeProject(
    overrides?: Parameters<typeof ProjectBuilder.editable>[0],
  ): Promise<string> {
    const project = await ProjectBuilder.editable({
      marketplace: sourceDir,
      skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
      agents: [WEB_DEV],
      domains: ["web"],
      forkedFrom: true,
      ...overrides,
    });
    tempDirs.push(path.dirname(project.dir));
    return project.dir;
  }

  /** A configuration naming React alone — so Vitest is what applying it takes away. */
  function publishReactOnly(id: string): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
  }

  /** The same configuration, naming one more id this catalogue has no way to place. */
  function publishReactAndUnplaceable(id: string): void {
    store.publish(
      id,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
          [UNPLACEABLE_SKILL]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
    );
  }

  /** Starts `edit --from <id>` in a real terminal, against the stub store. */
  function launch(id: string, projectDir: string): InteractivePrompt {
    return new InteractivePrompt(["edit", "--from", id], projectDir, {
      env: { AGENTS_INC_API_URL: store.url },
    });
  }

  describe("approving the removals", () => {
    it("shows what applying takes away before it takes it", async () => {
      const projectDir = await takeProject();
      publishReactOnly(APPLY_ID);

      prompt = launch(APPLY_ID, projectDir);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_PREVIEW, TIMEOUTS.WIZARD_LOAD);

      const output = prompt.getOutput();
      // Named, not counted: the id is the only thing a user can weigh a yes against.
      expect(output).toContain(E2E_SKILL.vitest.display);
      expect(output).toContain(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM);
      // The plan precedes every mutation, so the skill it names is still on disk while it is
      // being named. A preview printed after the delete is a report, not a confirm.
      expect(await listFiles(skillsPath(projectDir))).toContain(E2E_SKILL.vitest.id);
    });

    it("removes the skill the configuration leaves out, from config and from disk", async () => {
      const projectDir = await takeProject();
      publishReactOnly(APPLY_ID);

      prompt = launch(APPLY_ID, projectDir);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
      // Both surfaces, because either alone can look right while the other lies: a config entry
      // for a deleted directory, or a directory nothing declares.
      const config = await loadConfigOrFail(projectDir);
      expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
      expect(await listFiles(skillsPath(projectDir))).toStrictEqual([E2E_SKILL.react.id]);
    });
  });

  describe("declining them", () => {
    it("cancels, and leaves the installation byte-identical", async () => {
      const projectDir = await takeProject();
      publishReactOnly(APPLY_ID);
      const before = await readTreeSnapshot(projectDir);

      prompt = launch(APPLY_ID, projectDir);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      await prompt.deny();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode).toBe(EXIT_CODES.CANCELLED);
      // Not "the skill survived" — nothing at all moved. A decline that rewrote config.ts or
      // recompiled an agent would still be a change the user refused.
      expect(await readTreeSnapshot(projectDir)).toStrictEqual(before);
    });
  });

  describe("a removal that reaches past this project", () => {
    it("shows a global removal under its own heading, and removes it", async () => {
      const projectDir = await takeProject({
        skills: [E2E_SKILL.react.id],
        globalSkills: [E2E_SKILL.vitest.id],
      });
      publishReactOnly(APPLY_ID);

      prompt = launch(APPLY_ID, projectDir);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      const planned = prompt.getOutput();
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
      // Its own section, because it is its own kind of removal: this one is not undone by
      // re-running the command here, and it is not this project's alone to have made.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_SKILLS_HEADING);
      expect(planned).toContain(E2E_SKILL.vitest.id);
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_REACH);
      // Nothing else is registered against this home, so the statement says exactly that
      // rather than naming a list it does not have.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_GLOBAL_REACH_ALONE);
      const config = await loadConfigOrFail(projectDir);
      expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
    });
  });

  describe("what it discloses instead of removing", () => {
    it("keeps a skill written here, which the round trip never carried", async () => {
      const projectDir = await takeProject();
      // The one difference that decides ownership: a directory the CLI wrote carries
      // `forkedFrom`, and one a person wrote carries none. `edit --ui` drops this skill from the
      // payload for exactly that reason, so the payload made no statement about it.
      await writeFile(
        path.join(skillsPath(projectDir), E2E_SKILL.vitest.id, FILES.METADATA_YAML),
        renderMetadataYaml({
          displayName: E2E_SKILL.vitest.display,
          category: "web-testing",
          slug: E2E_SKILL.vitest.slug,
          cliDescription: "Written by hand, not installed",
          usageGuidance: "Use when testing authored-here skills",
          contentHash: "authored1",
        }),
      );
      publishReactOnly(APPLY_ID);

      prompt = launch(APPLY_ID, projectDir);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      const planned = prompt.getOutput();
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_KEPT_AUTHORED);
      // Both surfaces again, and this is the one the ruling is about: the user's own work
      // survives a destructive apply that never mentioned it.
      expect(await listFiles(skillsPath(projectDir))).toStrictEqual(
        [E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort(),
      );
      const config = await loadConfigOrFail(projectDir);
      expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual(
        [E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort(),
      );
    });

    it("keeps a skill it names that this catalogue cannot place", async () => {
      // The install records an id this source does not carry and wrote no files for, so the
      // decode skips it — while the payload NAMES it, which is what makes the skip this
      // catalogue's limit rather than an instruction to delete anything.
      const projectDir = await takeProject({ unresolvableSkills: [UNPLACEABLE_SKILL] });
      publishReactAndUnplaceable(APPLY_ID);

      prompt = launch(APPLY_ID, projectDir);
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
      const planned = prompt.getOutput();
      await prompt.confirm();
      const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

      expect(exitCode, `apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
      // Disclosed with the remedy, because a line that only says it stayed leaves the user with
      // a configuration that silently did less than it said.
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_KEPT_UNPLACEABLE);
      expect(planned).toContain(UNPLACEABLE_SKILL);
      expect(planned).toContain(STEP_TEXT.SHARED_CONFIG_KEPT_UNPLACEABLE_REMEDY);

      // The run still removes what the configuration really left out, so this is a rewrite the
      // kept entry has to survive rather than a no-change pass that could not have lost it.
      expect(
        prompt.getOutput(),
        "a skill this run merely failed to place must never be reported as removed",
      ).not.toContain(`${REMOVED_MARKER} ${UNPLACEABLE_SKILL}`);
      const config = await loadConfigOrFail(projectDir);
      expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual(
        [E2E_SKILL.react.id, UNPLACEABLE_SKILL].sort(),
      );
      expect(await listFiles(skillsPath(projectDir))).toStrictEqual([E2E_SKILL.react.id]);
    });
  });

  /**
   * The re-apply, which is the whole reason the collision guard carves anything out at all.
   *
   * `edit --from` applies destructively over an existing install, so a skill a shared
   * configuration CARRIED is met again on the next apply — seated in the matrix by the local-skill
   * merge, and standing on disk at the id the payload is about to write. Refusing either would
   * make a shared configuration installable exactly once, and until this leg landed the carve-out
   * that prevents it was held by a unit spec alone.
   *
   * Installed by `init --from` rather than by a fixture: the provenance the guard reads is
   * `forkedFrom.path`, which only the real installer writes, and a fixture told to stamp it
   * agrees with whatever the installer does.
   */
  describe("re-applying a configuration that carries its own skill", () => {
    const CARRIED_ID = "external-web-tooling-brainstorming";
    const CARRIED_CATEGORY = "web-tooling";
    const CARRIED_REPO = "obra/superpowers";
    const CARRIED_ID_FIRST = "CarriedApply1";

    /** The same configuration both times: one catalogue skill, and one it brings with it. */
    function publishCarrying(id: string, body: string): void {
      store.publish(
        id,
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [CARRIED_ID]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          external: {
            [CARRIED_ID]: buildSeedExternalSkill({
              categoryId: CARRIED_CATEGORY,
              repo: CARRIED_REPO,
              files: { [FILES.SKILL_MD]: renderSkillMd("brainstorming", body) },
            }),
          },
          agents: { [WEB_DEV]: { scope: "project" } },
        }),
      );
    }

    it(
      "writes the carried skill again rather than refusing its own previous apply",
      { timeout: TIMEOUTS.INTERACTIVE },
      async () => {
        const env = await createTestEnvironment({ permissions: false });
        tempDirs.push(env.tempDir);
        const project = { dir: env.projectDir, globalHome: env.fakeHome };
        publishCarrying(CARRIED_ID_FIRST, "Structured brainstorming");
        const installed = await runInitFrom(store, CARRIED_ID_FIRST, project, sourceDir);
        expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);

        // The same id, re-served with the skill's bytes revised — which is what a sharer who
        // edited their own skill and re-shared produces, and the only way to tell a second write
        // from a seat that quietly did nothing.
        publishCarrying(CARRIED_ID_FIRST, "Revised upstream brainstorming");

        prompt = new InteractivePrompt(["edit", "--from", CARRIED_ID_FIRST], project.dir, {
          env: { AGENTS_INC_API_URL: store.url, HOME: project.globalHome },
        });
        await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);
        await prompt.confirm();
        const exitCode = await prompt.waitForExit(TIMEOUTS.EXIT_WAIT);

        expect(exitCode, `re-apply failed: ${prompt.getOutput()}`).toBe(EXIT_CODES.SUCCESS);
        // Both surfaces: a config entry for a directory nothing wrote, and a directory nothing
        // declares, are each half of the same lie.
        const config = await loadConfigOrFail(project.dir);
        expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual(
          [E2E_SKILL.react.id, CARRIED_ID].sort(),
        );
        expect(await listFiles(skillsPath(project.dir))).toStrictEqual(
          [E2E_SKILL.react.id, CARRIED_ID].sort(),
        );

        const carriedDir = path.join(skillsPath(project.dir), CARRIED_ID);
        expect(await readTestFile(path.join(carriedDir, FILES.SKILL_MD))).toContain(
          "Revised upstream brainstorming",
        );
        // And the provenance the guard reads is still there afterwards, or the apply after this
        // one refuses what this one allowed.
        expect(await readTestFile(path.join(carriedDir, FILES.METADATA_YAML))).toContain(
          `path: ${buildSeedExternalSkill().path}`,
        );
      },
    );
  });
});
