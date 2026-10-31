import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  cleanupTempDir,
  createTempDir,
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readTestFile,
  readTreeSnapshot,
  skillsPath,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  runEditUi,
  runInitFrom,
  runShare,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, FILES, PUBLIC_MARKETPLACE_NAME, STEP_TEXT } from "../pages/constants.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import {
  UPSTREAM_SKILL_NAME,
  buildSeedExternalSkill,
  buildSeedPayload,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import { renderSkillMd } from "../../src/cli/lib/__tests__/content-generators.js";

import type { ProjectHandle } from "../fixtures/project-handle.js";
import type { SeedSkill } from "@workspace/matrix/seed";

/**
 * `share` shares plugins only: while any skill it would send is ejected, it names them, posts
 * nothing and exits non-zero, including skills inherited from HOME. `edit --ui` still opens those
 * installations, and each refusal has its allowed operation beside it.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** Non-exclusive, for the reason `init-from-external-skills.e2e.test.ts` gives. */
const EXTERNAL_ID = "external-web-tooling-brainstorming";
const EXTERNAL_NAME = "Brainstorming";
const EXTERNAL_REPO = "obra/superpowers";
const EXTERNAL_PATH = "skills/brainstorming";
const EXTERNAL_FILES = {
  [FILES.SKILL_MD]: renderSkillMd(UPSTREAM_SKILL_NAME, "Structured brainstorming"),
  "reference/prompts.md": "# Prompts\n",
};

function externalEntry() {
  return buildSeedExternalSkill({
    displayName: EXTERNAL_NAME,
    categoryId: "web-tooling",
    repo: EXTERNAL_REPO,
    path: EXTERNAL_PATH,
    files: EXTERNAL_FILES,
  });
}

type PostedPayload = {
  skills: Record<string, SeedSkill>;
  external?: Record<string, { repo: string; path: string }>;
};

describe("share refuses ejected skills", () => {
  let store: SeedConfigStore;
  const tempDirs: string[] = [];

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    await Promise.all(tempDirs.splice(0).map(cleanupTempDir));
  });

  /** Its own HOME, so its own scope. */
  async function takeTempDir(): Promise<string> {
    const dir = await createTempDir();
    tempDirs.push(dir);
    return dir;
  }

  async function takeEnvironment(): Promise<TestEnvironment> {
    const env = await createTestEnvironment({ permissions: false });
    tempDirs.push(env.tempDir);
    return env;
  }

  async function installFrom(id: string, payload: unknown, project: ProjectHandle): Promise<void> {
    store.publish(id, payload);
    const installed = await runInitFrom(store, id, project, E2E_SOURCE.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    store.reset();
  }

  function postedPayload(): PostedPayload {
    return JSON.parse(firstElement(store.requests.filter((r) => r.method === "POST")).body);
  }

  it("refuses an installation holding ejected skills, naming each, and posts nothing", async () => {
    const origin = await takeTempDir();
    await installFrom(
      "Eject001",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: {
          [E2E_SKILL.react.id]: ejectedGlobalSkill(),
          [E2E_SKILL.vitest.id]: ejectedGlobalSkill(),
        },
      }),
      { dir: origin },
    );
    const before = await readTreeSnapshot(origin);

    const { exitCode, output } = await runShare(store, { dir: origin });
    const said = flattenCliOutput(output);

    expect(exitCode, `share must refuse an installation of ejected skills, and said: ${said}`).toBe(
      EXIT_CODES.ERROR,
    );
    // Named as the install recorded them: share seats no catalogue that knows them.
    expect(said).toContain(
      `${STEP_TEXT.SHARE_EJECTED_SKILLS_REFUSED}: ${E2E_SKILL.react.display} ${E2E_SKILL.vitest.display} ${STEP_TEXT.SHARE_ONLY_PLUGINS}`,
    );
    // Refused locally, so no store write is spent.
    expect(store.requests).toStrictEqual([]);
    expect(await readTreeSnapshot(origin)).toStrictEqual(before);
  });

  it("refuses, from a project, the ejected skills it inherits from HOME", async () => {
    // The skill rests global with its sub-agent pinned to the project, so the ejected copy is
    // HOME's.
    const env = await takeEnvironment();
    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    await installFrom(
      "Eject002",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        agents: { [WEB_DEV]: { scope: "project" } },
      }),
      project,
    );
    expect(await listFiles(skillsPath(env.fakeHome))).toStrictEqual([E2E_SKILL.react.id]);
    expect(await listFiles(skillsPath(env.projectDir))).toStrictEqual([]);
    const before = await readTreeSnapshot(env.fakeHome);

    const { exitCode, output } = await runShare(store, project);
    const said = flattenCliOutput(output);

    expect(exitCode, `share must refuse the ejected skills a project inherits: ${said}`).toBe(
      EXIT_CODES.ERROR,
    );
    expect(said).toContain(
      `${STEP_TEXT.SHARE_EJECTED_SKILLS_REFUSED}: ${E2E_SKILL.react.display} ${STEP_TEXT.SHARE_ONLY_PLUGINS}`,
    );
    expect(store.requests).toStrictEqual([]);
    // The project sits inside this HOME, so one snapshot covers both scopes.
    expect(await readTreeSnapshot(env.fakeHome)).toStrictEqual(before);
  });

  it("refuses a skill added in the editor, which is a local copy too", async () => {
    const origin = await takeTempDir();
    await installFrom(
      "Eject003",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [EXTERNAL_ID]: ejectedGlobalSkill() },
        external: { [EXTERNAL_ID]: externalEntry() },
      }),
      { dir: origin },
    );

    const { exitCode, output } = await runShare(store, { dir: origin });
    const said = flattenCliOutput(output);

    expect(exitCode, `share must refuse an editor-added skill: ${said}`).toBe(EXIT_CODES.ERROR);
    expect(said).toContain(
      `${STEP_TEXT.SHARE_EJECTED_SKILLS_REFUSED}: ${EXTERNAL_NAME} ${STEP_TEXT.SHARE_ONLY_PLUGINS}`,
    );
    expect(store.requests).toStrictEqual([]);
  });

  it("shares an installation whose skills are plugins", async () => {
    // The allowed half: the same skills as public-catalogue plugins.
    const origin = await takeTempDir();
    await writeProjectConfig(
      origin,
      buildProjectConfig({
        name: "plugin-share",
        skills: buildSkillConfigs([E2E_SKILL.react.id, E2E_SKILL.vitest.id], {
          scope: "global",
          origin: PUBLIC_MARKETPLACE_NAME,
        }),
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      }),
    );

    const shared = await runShare(store, { dir: origin });

    expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(shared.output)).not.toContain(STEP_TEXT.SHARE_EJECTED_SKILLS_REFUSED);
    expect(shared.output).toContain(firstElement(store.minted));
    expect(Object.keys(postedPayload().skills)).toStrictEqual([
      E2E_SKILL.react.id,
      E2E_SKILL.vitest.id,
    ]);
  });

  it("does not refuse a skill the user wrote themselves, which it never shares", async () => {
    // No `forkedFrom`: hand-written, outside the round trip, so neither sent nor a reason to
    // refuse.
    const project = await ProjectBuilder.editable({
      skills: [E2E_SKILL.vitest.id],
      globalSkills: [E2E_SKILL.react.id],
      globalSkillsSource: PUBLIC_MARKETPLACE_NAME,
    });
    tempDirs.push(path.dirname(project.dir));

    const shared = await runShare(store, project);

    expect(shared.exitCode, `share failed: ${shared.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(Object.keys(postedPayload().skills)).toStrictEqual([E2E_SKILL.react.id]);
  });

  it("leaves edit --ui opening an installation of ejected skills, which is how they become plugins", async () => {
    const origin = await takeTempDir();
    const skills = {
      [E2E_SKILL.react.id]: ejectedGlobalSkill(),
      [E2E_SKILL.vitest.id]: ejectedGlobalSkill(),
    };
    await installFrom("Eject004", buildSeedPayload({ v: PINNED_WIRE_VERSION, skills }), {
      dir: origin,
    });

    const opened = await runEditUi(store, { dir: origin });

    expect(opened.exitCode, `edit --ui failed: ${opened.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(opened.output)).toContain(STEP_TEXT.EDITOR_URL);
    expect(postedPayload().skills).toStrictEqual(skills);
  });

  it("leaves edit --ui carrying an editor-added skill's bytes, and the id it mints installs it", async () => {
    // The editor still needs the added skill's bytes to show it and to install it elsewhere.
    const origin = await takeTempDir();
    await installFrom(
      "Eject005",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [EXTERNAL_ID]: ejectedGlobalSkill() },
        external: { [EXTERNAL_ID]: externalEntry() },
      }),
      { dir: origin },
    );

    const opened = await runEditUi(store, { dir: origin });

    expect(opened.exitCode, `edit --ui failed: ${opened.output}`).toBe(EXIT_CODES.SUCCESS);
    const posted = postedPayload();
    expect(Object.keys(posted.external ?? {})).toStrictEqual([EXTERNAL_ID]);
    expect(posted.external?.[EXTERNAL_ID]?.repo).toBe(EXTERNAL_REPO);
    expect(posted.external?.[EXTERNAL_ID]?.path).toBe(EXTERNAL_PATH);

    const rebuilt = await takeTempDir();
    const reinstalled = await runInitFrom(
      store,
      firstElement(store.minted),
      { dir: rebuilt },
      E2E_SOURCE.sourceDir,
    );
    expect(reinstalled.exitCode, `reinstall failed: ${reinstalled.output}`).toBe(
      EXIT_CODES.SUCCESS,
    );
    expect(flattenCliOutput(reinstalled.output)).not.toContain("does not know");
    expect((await loadConfigOrFail(rebuilt)).skills).toStrictEqual(
      (await loadConfigOrFail(origin)).skills,
    );
    expect(await listFiles(skillsPath(rebuilt))).toStrictEqual([EXTERNAL_ID]);
    for (const file of [FILES.SKILL_MD, path.join("reference", "prompts.md")]) {
      expect(await readTestFile(path.join(skillsPath(rebuilt), EXTERNAL_ID, file))).toBe(
        await readTestFile(path.join(skillsPath(origin), EXTERNAL_ID, file)),
      );
    }
  });
});
