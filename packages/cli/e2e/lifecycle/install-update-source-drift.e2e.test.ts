import path from "path";
import { appendFile } from "fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI, type CLIResult } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  configTsPath,
  readCompiledAgents,
  readTestFile,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `update` on a real ejected install whose source moved on changes nothing (SKILL.md, metadata,
 * config.ts and compiled agents byte-identical) and says the copies are the user's.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const SEED_CONFIG_ID = "Drift001";
const SOURCE_EDIT_MARKER = "## Section added to the source after installation";

const PINNED_TO_PROJECT = { scope: "project" } as const;

describe("update against the source an ejected skill was really installed from", () => {
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;
  let env: TestEnvironment;

  let updateRun: CLIResult;
  let configBefore: string;
  let configAfter: string;
  let metadataBefore: string;
  let metadataAfter: string;
  let installedSkillMdBefore: string;
  let installedSkillMdAfter: string;
  let sourceSkillMdAfterEdit: string;
  let agentsBefore: Record<string, string>;
  let agentsAfter: Record<string, string>;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
    env = await createTestEnvironment({ permissions: false });

    const project = { dir: env.projectDir, globalHome: env.fakeHome };
    const installedSkillDir = path.join(skillsPath(env.projectDir), E2E_SKILL.react.id);
    const metadataPath = path.join(installedSkillDir, FILES.METADATA_YAML);
    const installedSkillMdPath = path.join(installedSkillDir, FILES.SKILL_MD);
    const sourceSkillMdPath = path.join(
      sourceDir,
      SOURCE_PATHS.SKILLS_DIR,
      E2E_SKILL.react.id,
      FILES.SKILL_MD,
    );

    store.publish(
      SEED_CONFIG_ID,
      buildSeedPayload({
        skills: {
          [E2E_SKILL.react.id]: buildSeedSkill({
            scope: "project",
            assignments: { [WEB_DEV]: "lazy" },
          }),
        },
        agents: { [WEB_DEV]: PINNED_TO_PROJECT },
      }),
    );

    const install = await runInitFrom(store, SEED_CONFIG_ID, project, sourceDir);
    expect(install.exitCode, `install failed: ${install.output}`).toBe(EXIT_CODES.SUCCESS);

    configBefore = await readTestFile(configTsPath(env.projectDir));
    metadataBefore = await readTestFile(metadataPath);
    installedSkillMdBefore = await readTestFile(installedSkillMdPath);
    agentsBefore = await readCompiledAgents(env.projectDir);

    await appendFile(sourceSkillMdPath, `\n\n${SOURCE_EDIT_MARKER}\n`);
    sourceSkillMdAfterEdit = await readTestFile(sourceSkillMdPath);

    updateRun = await CLI.run(["update"], project);

    configAfter = await readTestFile(configTsPath(env.projectDir));
    metadataAfter = await readTestFile(metadataPath);
    installedSkillMdAfter = await readTestFile(installedSkillMdPath);
    agentsAfter = await readCompiledAgents(env.projectDir);
  }, TIMEOUTS.LIFECYCLE);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
    await cleanupTempDir(env.tempDir);
  });

  it("tells the user the ejected copy is theirs, and exits successfully", () => {
    expect(updateRun.exitCode, `update failed: ${updateRun.output}`).toBe(EXIT_CODES.SUCCESS);
    expect(
      updateRun.output,
      "the one line about ejected skills is what this command owes the user",
    ).toContain(STEP_TEXT.UPDATE_EJECTED_OWNED);
    expect(
      updateRun.output,
      "an eject-only install names no marketplace, and that is not a failure",
    ).toContain(STEP_TEXT.UPDATE_NO_MARKETPLACES);
  });

  it("leaves the installed skill, its metadata, the config and the agents byte-identical", () => {
    // Proof the source moved on, so a command that copied it across shows in the next assertion.
    expect(
      sourceSkillMdAfterEdit,
      "the source edit must have landed, or nothing was at risk",
    ).toContain(SOURCE_EDIT_MARKER);
    expect(
      installedSkillMdAfter,
      "the ejected SKILL.md is the user's copy — an update must not carry the source edit into it",
    ).toBe(installedSkillMdBefore);
    expect(installedSkillMdAfter).not.toContain(SOURCE_EDIT_MARKER);
    expect(metadataAfter, "the recorded provenance describes an untouched file").toBe(
      metadataBefore,
    );
    expect(configAfter, "update declares nothing, so it writes no config").toBe(configBefore);
    expect(
      Object.keys(agentsBefore).length,
      "the install must have compiled an agent",
    ).toBeGreaterThan(0);
    expect(agentsAfter, "subagents point at skills, so a refresh recompiles nothing").toStrictEqual(
      agentsBefore,
    );
  });
});
