import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import {
  E2E_AGENT,
  E2E_BUILTIN_AGENT,
  E2E_SKILL,
  e2eSkillId,
} from "../fixtures/expected-values.js";
import { InteractivePrompt } from "../fixtures/interactive-prompt.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import {
  agentsPath,
  cleanupFixture,
  cleanupTempDir,
  createLocalSkillIn,
  createTempDir,
  flattenCliOutput,
  listFiles,
  loadConfigOrFail,
  readTreeSnapshot,
  renderUnparseableMetadataYaml,
  skillsPath,
} from "../helpers/test-utils.js";
import { EXIT_CODES, FILES, SOURCE_PATHS, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";

/**
 * `init --from` and `edit --from` print the marketplace load's warnings, cause above effect; an
 * unparseable metadata.yaml stands for the class. The clean marketplace is the control: the capture
 * also holds narration that must not be replayed. Observed red against the unfixed build: both
 * `--from` runs printed the effect and not the cause, while the clean control, the installed files
 * and the declined apply were green and must stay so.
 */

const BROKEN_SKILL_ID = e2eSkillId("web-broken-metadata");

const BROKEN_FILE = `${BROKEN_SKILL_ID}/${FILES.METADATA_YAML}`;

/** The effect the cause explains. */
const EFFECT = `${STEP_TEXT.CATALOG_DOES_NOT_KNOW} ${BROKEN_SKILL_ID}`;

const WEB_DEV = E2E_AGENT["web-developer"].name;
const API_DEV = E2E_AGENT["api-developer"].name;
const WEB_TESTER = E2E_BUILTIN_AGENT["web-tester"].name;

async function shipSkillWithUnparseableMetadata(sourceDir: string): Promise<void> {
  await createLocalSkillIn(path.join(sourceDir, SOURCE_PATHS.SKILLS_DIR), BROKEN_SKILL_ID, {
    description: "Shipped with a broken metadata.yaml",
    metadata: renderUnparseableMetadataYaml(),
  });
}

describe("--from runs say what the marketplace load raised", () => {
  let broken: E2ESource;
  let clean: E2ESource;
  let store: SeedConfigStore;
  let tempDir: string | undefined;
  let prompt: InteractivePrompt | undefined;

  beforeAll(async () => {
    broken = await createE2ESource();
    await shipSkillWithUnparseableMetadata(broken.sourceDir);
    clean = await createE2ESource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(broken);
    await cleanupFixture(clean);
  });

  afterEach(async () => {
    await prompt?.destroy();
    prompt = undefined;
    store.reset();
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "init --from names why a skill the marketplace ships was skipped, above the skip",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      store.publish(
        "Broken01",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: {
            [E2E_SKILL.react.id]: ejectedGlobalSkill(),
            [BROKEN_SKILL_ID]: ejectedGlobalSkill(),
          },
        }),
      );

      const { exitCode, output, stderr } = await runInitFrom(
        store,
        "Broken01",
        { dir: tempDir },
        broken.sourceDir,
      );

      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      const said = flattenCliOutput(stderr);
      expect(said, "the effect is said today, so the cause has something to explain").toContain(
        EFFECT,
      );
      expect(said, "the load names the file it could not read").toContain(BROKEN_FILE);
      expect(said, "and what is wrong with it").toContain(
        STEP_TEXT.MARKETPLACE_METADATA_UNPARSEABLE,
      );
      expect(
        said.indexOf(BROKEN_FILE),
        "the cause is said above the skip it explains",
      ).toBeLessThan(said.indexOf(EFFECT));

      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
      expect((await loadConfigOrFail(tempDir)).skills.map((skill) => skill.id)).toStrictEqual([
        E2E_SKILL.react.id,
      ]);
      expect(await listFiles(skillsPath(tempDir))).toStrictEqual([E2E_SKILL.react.id]);
    },
  );

  it(
    "init --from installs the sub-agents that skill named without it, naming those it alone brought",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      store.publish(
        "Broken03",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: {
            [E2E_SKILL.react.id]: ejectedGlobalSkill(),
            [BROKEN_SKILL_ID]: ejectedGlobalSkill({
              assignments: { [WEB_DEV]: "lazy", [API_DEV]: "lazy", [WEB_TESTER]: "lazy" },
            }),
          },
          agents: {
            [WEB_DEV]: { scope: "global" },
            [API_DEV]: { scope: "global" },
            [WEB_TESTER]: { scope: "global" },
          },
        }),
      );

      const { exitCode, output, stderr } = await runInitFrom(
        store,
        "Broken03",
        { dir: tempDir },
        broken.sourceDir,
      );

      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      expect(
        flattenCliOutput(stderr),
        "web-developer carries React too, so only the other two are named under the skipped skill",
      ).toContain(
        `${EFFECT} sub-agent(s) installed without ${BROKEN_SKILL_ID}, ${STEP_TEXT.INSTALLED_WITHOUT_THE_SKILL} ${API_DEV}, ${WEB_TESTER}`,
      );
      expect(
        (await loadConfigOrFail(tempDir)).agents.map((agent) => agent.name).sort(),
        "a sub-agent never depends on a skill loading",
      ).toStrictEqual([API_DEV, WEB_DEV, WEB_TESTER].sort());
      expect(await listFiles(agentsPath(tempDir))).toStrictEqual(
        [`${API_DEV}.md`, `${WEB_DEV}.md`, `${WEB_TESTER}.md`].sort(),
      );
    },
  );

  it(
    "init --from installs the sub-agents empty when no skill loads, with the warning",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      store.publish(
        "Broken04",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: {
            [BROKEN_SKILL_ID]: ejectedGlobalSkill({
              assignments: { [WEB_DEV]: "lazy", [API_DEV]: "preloaded" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "global" }, [API_DEV]: { scope: "global" } },
        }),
      );

      const { exitCode, output, stderr } = await runInitFrom(
        store,
        "Broken04",
        { dir: tempDir },
        broken.sourceDir,
      );

      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      expect(flattenCliOutput(stderr)).toContain(
        `${EFFECT} sub-agent(s) installed without ${BROKEN_SKILL_ID}, ${STEP_TEXT.INSTALLED_WITHOUT_THE_SKILL} ${WEB_DEV}, ${API_DEV}`,
      );
      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
      const config = await loadConfigOrFail(tempDir);
      expect({
        skills: config.skills,
        agents: config.agents.map((agent) => agent.name).sort(),
      }).toStrictEqual({ skills: [], agents: [API_DEV, WEB_DEV].sort() });
      expect(await listFiles(agentsPath(tempDir))).toStrictEqual(
        [`${API_DEV}.md`, `${WEB_DEV}.md`].sort(),
      );
    },
  );

  it(
    "edit --from names it too, before asking to apply",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      const project = await ProjectBuilder.editable({
        marketplace: broken.sourceDir,
        skills: [E2E_SKILL.react.id, E2E_SKILL.vitest.id],
        agents: [WEB_DEV],
        domains: ["web"],
        forkedFrom: true,
      });
      tempDir = path.dirname(project.dir);
      store.publish(
        "Broken02",
        buildSeedPayload({
          skills: {
            [E2E_SKILL.react.id]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
            [BROKEN_SKILL_ID]: buildSeedSkill({
              scope: "project",
              assignments: { [WEB_DEV]: "lazy" },
            }),
          },
          agents: { [WEB_DEV]: { scope: "project" } },
        }),
      );
      const before = await readTreeSnapshot(project.dir);

      prompt = new InteractivePrompt(["edit", "--from", "Broken02"], project.dir, {
        env: { AGENTS_INC_API_URL: store.url },
      });
      await prompt.waitForText(STEP_TEXT.SHARED_CONFIG_APPLY_CONFIRM, TIMEOUTS.WIZARD_LOAD);

      const said = flattenCliOutput(prompt.getOutput());
      expect(said, "the effect is said today, so the cause has something to explain").toContain(
        EFFECT,
      );
      expect(said, "the load names the file it could not read").toContain(BROKEN_FILE);
      expect(said, "and what is wrong with it").toContain(
        STEP_TEXT.MARKETPLACE_METADATA_UNPARSEABLE,
      );

      await prompt.deny();
      expect(await prompt.waitForExit(TIMEOUTS.EXIT_WAIT)).toBe(EXIT_CODES.CANCELLED);
      expect(await readTreeSnapshot(project.dir), "a declined apply changes nothing").toStrictEqual(
        before,
      );
    },
  );

  it(
    "init --from says nothing more when the marketplace loads cleanly",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      store.publish(
        "Clean001",
        buildSeedPayload({
          v: PINNED_WIRE_VERSION,
          skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        }),
      );

      const { exitCode, output, stderr } = await runInitFrom(
        store,
        "Clean001",
        { dir: tempDir },
        clean.sourceDir,
      );

      expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
      expect(output).toContain(STEP_TEXT.INIT_SUCCESS);
      expect(
        stderr,
        "only what the load warned is said — never the startup band's own narration",
      ).not.toContain(STEP_TEXT.LOADED);
      expect(stderr).not.toContain(STEP_TEXT.MARKETPLACE_METADATA_UNPARSEABLE);
    },
  );
});
