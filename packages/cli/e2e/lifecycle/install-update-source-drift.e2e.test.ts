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
  ensureBinaryExists,
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
 * What `update` does to a real ejected install when the source it came from moves on:
 * nothing at all, and it says so.
 *
 * Eject means the user owns the copy. The source gaining a section is not a reason to
 * overwrite an edited local skill, so the guarantee this pins is UNAFFECTED — the
 * installed SKILL.md, its metadata.yaml, the project's config.ts and the compiled agents
 * must all be byte-identical across the update, and the one line the command prints about
 * them must say they are the user's.
 *
 * `init --from` rather than the wizard because it is the non-interactive way to reach a
 * real install; the install itself is the same code path either way. A real install
 * matters here even though nothing is compared any more: it is what makes the fixture an
 * ejected skill the CLI itself wrote and stamped, rather than a directory a spec planted.
 *
 * The source edit lands between the install and the update, and the marker it appends is
 * the proof-of-execution counterpart to the byte comparison — an update that quietly
 * copied the source across would carry that marker into the installed copy.
 *
 * HOW THE BYTE COMPARISON WAS MUTATION-CHECKED, and why not the usual way. Reverting the
 * command in `src/` cannot turn this spec red: the pre-rewrite `update` also left this
 * skill alone, because a local skill installed under its own id shadowed the source entry
 * and classified `local-only`. The old defect and the new guarantee are the same bytes. So
 * the mutation was applied to the FIXTURE — one line appended to the INSTALLED SKILL.md
 * just before the `update` run — which turned the spec red on the ejected-SKILL.md
 * assertion and nothing else, then was removed. Do not conclude from a green run against
 * an older binary that this spec asserts nothing.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;
const SEED_CONFIG_ID = "Drift001";
const SOURCE_EDIT_MARKER = "## Section added to the source after installation";

/** A sub-agent entry that keeps its agent in the project rather than at the default scope. */
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
    await ensureBinaryExists();
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
        skills: { [E2E_SKILL.react.id]: buildSeedSkill({ assignments: { [WEB_DEV]: "lazy" } }) },
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
    // Proof of execution: the source really did move on under the installed copy, so a
    // command that copied it across would show up in the very next assertion.
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
