import path from "path";
import { readFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import {
  agentsPath,
  createTempDir,
  cleanupTempDir,
  configTsPath,
  listFiles,
  loadConfigOrFail,
  readAgentEntriesFor,
  skillsPath,
} from "../helpers/test-utils.js";
import { expectNoSourceFolder } from "../assertions/source-folder-assertions.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { compactCliOutput, flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSeedPayload } from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * `init --from <id>` end to end: wire contract and command plumbing. What a payload becomes on disk
 * is in `init-from-scenarios-*`.
 */

describe("init --from <id>", () => {
  let tempDir: string;
  let sourceDir: string;
  let e2eSourceTempDir: string;
  let store: SeedConfigStore;

  beforeAll(async () => {
    ({ sourceDir, tempDir: e2eSourceTempDir } = await createE2ESource());
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(e2eSourceTempDir);
  });

  afterEach(async () => {
    store.reset();
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = "";
    }
  });

  const runInit = (id: string) => runInitFrom(store, id, { dir: tempDir }, sourceDir);

  it("installs a shared configuration without the wizard", async () => {
    tempDir = await createTempDir();
    store.publish(
      "Ab3xY9_Q",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: {
          [E2E_SKILL.react.id]: ejectedGlobalSkill(),
          [E2E_SKILL.vitest.id]: ejectedGlobalSkill({
            assignments: { [E2E_AGENT["web-developer"].name]: "preloaded" },
          }),
        },
      }),
    );

    const { exitCode, output } = await runInit("Ab3xY9_Q");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // No wizard: this must work over a pipe and in CI.
    expect(output).toContain("Fetching configuration Ab3xY9_Q");
    expect(output).toContain("Installing 2 skill(s)");

    // Structural: `toContain` cannot say which skill carries which scope.
    const config = await loadConfigOrFail(tempDir);
    expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual(
      [E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort(),
    );
    expect(await readAgentEntriesFor(tempDir, E2E_AGENT["web-developer"].name)).toStrictEqual(
      buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
    );
    await expect({ dir: tempDir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      exactSkills: [E2E_SKILL.vitest.id],
    });
  });

  it("installs from the marketplace the payload names, with no flag to say so", async () => {
    tempDir = await createTempDir();
    store.publish(
      "Market01",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        marketplace: sourceDir,
      }),
    );

    // Not `runInit`, which always passes `--marketplace`: the ref on the wire must reach the loader
    // on its own.
    const { exitCode, output } = await CLI.run(
      ["init", "--from", "Market01"],
      { dir: tempDir },
      { env: { AGENTS_INC_API_URL: store.url } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("Installing 1 skill(s)");

    const config = await loadConfigOrFail(tempDir);
    expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
    // Recorded: every later command here reads it.
    expect(config.marketplace).toBe(sourceDir);
    // The skill exists only in the named source, so its presence shows the ref chose the catalogue.
    expect(await listFiles(skillsPath(tempDir))).toContain(E2E_SKILL.react.id);
  });

  it("refuses a marketplace the payload wrote across lines before installing, naming it on one line", async () => {
    tempDir = await createTempDir();
    store.publish(
      "MarketLF",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        marketplace: `${sourceDir}\nNothing is removed.`,
      }),
    );

    const { exitCode, output } = await CLI.run(
      ["init", "--from", "MarketLF"],
      { dir: tempDir },
      { env: { AGENTS_INC_API_URL: store.url } },
    );

    expect(exitCode, output).toBe(EXIT_CODES.ERROR);
    // Compacted: the refusal wraps at the width, and a long path breaks mid-word.
    expect(compactCliOutput(output)).toContain(
      compactCliOutput(
        `The marketplace contains invalid characters: "${sourceDir} Nothing is removed."`,
      ),
    );
    await expectNoSourceFolder(tempDir, "a marketplace written across lines is refused first");
  });

  it("lets an explicit marketplace outrank the one the payload names", async () => {
    tempDir = await createTempDir();
    // A ref that resolves to nothing, so only the flag's can succeed.
    store.publish(
      "Market02",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        marketplace: path.join(tempDir, "no-such-marketplace"),
      }),
    );

    // The flag is about this install; the payload's ref only records the sharer's source.
    const { exitCode } = await runInit("Market02");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    const config = await loadConfigOrFail(tempDir);
    expect(config.marketplace).toBe(sourceDir);
    expect(await listFiles(skillsPath(tempDir))).toContain(E2E_SKILL.react.id);
  });

  it("identifies itself as the CLI, so installs are distinguishable from share-link opens", async () => {
    tempDir = await createTempDir();
    store.publish(
      "UAcheck1",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
      }),
    );

    await runInit("UAcheck1");

    expect(store.requests).toHaveLength(1);
    expect(firstElement(store.requests).url).toBe("/configs/UAcheck1");
    expect(firstElement(store.requests).userAgent).toBe("agents-inc-cli");
  });

  it("skips ids this catalog does not know, by name, and installs the rest", async () => {
    tempDir = await createTempDir();
    store.publish(
      "Mixed001",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: {
          [E2E_SKILL.react.id]: ejectedGlobalSkill(),
          "web-framework-does-not-exist": ejectedGlobalSkill(),
        },
      }),
    );

    const { exitCode, output } = await runInit("Mixed001");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(output)).toContain("web-framework-does-not-exist");
    expect(output).toContain("Installing 1 skill(s)");

    const config = await readFile(configTsPath(tempDir), "utf8");
    expect(config).toContain(E2E_SKILL.react.id);
    expect(config).not.toContain("web-framework-does-not-exist");
  });

  it("reports an unknown id without writing anything", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await runInit("NoSuchId");

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain("No configuration found for id 'NoSuchId'");
    // The fetch fails before the pipeline starts.
    await expectNoSourceFolder(
      tempDir,
      "the fetch fails before the pipeline starts, so nothing was installed",
    );
  });

  it("refuses a payload that does not match the contract", async () => {
    tempDir = await createTempDir();
    // One field broken, so the refusal can only be about it.
    store.publish("BadShape", { ...buildSeedPayload({ v: PINNED_WIRE_VERSION }), skills: "nope" });

    const { exitCode, output } = await runInit("BadShape");

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(
      "is not in a format this version of the CLI can install",
    );
  });

  it("refuses a payload from the previous contract version rather than migrating it", async () => {
    tempDir = await createTempDir();
    // v1 carried model/effort per skill; pre-1.0 fails loudly rather than migrating.
    store.publish("OldWire1", {
      v: 1,
      matrixVersion: "1.0.0",
      stackId: null,
      skills: {
        [E2E_SKILL.react.id]: {
          model: "sonnet",
          effort: "medium",
          install: "eject",
          scope: "project",
          assignments: { "web-developer": "lazy" },
        },
      },
    });

    const { exitCode, output } = await runInit("OldWire1");

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(
      "is not in a format this version of the CLI can install",
    );
    // Older ids meet newer CLIs in bulk after a version bump, so the remedy, re-sharing, must be
    // named.
    expect(flattenCliOutput(output)).toContain("re-share the configuration");
    await expectNoSourceFolder(
      tempDir,
      "an id minted before a version bump is refused before anything is installed",
    );
  });

  it("applies a sub-agent's model and effort to both the compiled agent and the config", async () => {
    tempDir = await createTempDir();
    store.publish(
      "Tuned001",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        agents: { [E2E_AGENT["web-developer"].name]: { model: "haiku", effort: "xhigh" } },
      }),
    );

    const { exitCode } = await runInit("Tuned001");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    await expect({ dir: tempDir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      model: "haiku",
      effort: "xhigh",
    });
    // No scope named, so the sub-agent takes the shared default.
    expect(await readAgentEntriesFor(tempDir, E2E_AGENT["web-developer"].name)).toStrictEqual(
      buildAgentConfigs([E2E_AGENT["web-developer"].name], {
        scope: "global",
        model: "haiku",
        effort: "xhigh",
      }),
    );
  });

  it("carries a model this catalog only learned about with the new contract", async () => {
    tempDir = await createTempDir();
    store.publish(
      "Fable001",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        agents: { [E2E_AGENT["web-developer"].name]: { model: "fable" } },
      }),
    );

    const { exitCode } = await runInit("Fable001");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    await expect({ dir: tempDir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      model: "fable",
    });
  });

  it("installs a sub-agent switched on with no skills of its own", async () => {
    tempDir = await createTempDir();
    store.publish(
      "Bare0001",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
        agents: { [E2E_AGENT["api-developer"].name]: { on: true } },
      }),
    );

    const { exitCode } = await runInit("Bare0001");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // A bare agent travels only in the `agents` map, and `on: true` names no scope.
    expect(await readAgentEntriesFor(tempDir, E2E_AGENT["api-developer"].name)).toStrictEqual(
      buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "global" }),
    );
    await expect({ dir: tempDir }).toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
  });

  it("errors when nothing in the payload is installable", async () => {
    tempDir = await createTempDir();
    store.publish(
      "AllUnknown",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { "totally-unknown-skill": ejectedGlobalSkill({ assignments: {} }) },
      }),
    );

    const { exitCode, output } = await runInit("AllUnknown");

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(STEP_TEXT.SHARED_CONFIG_NOTHING_INSTALLABLE);
    await expectNoSourceFolder(tempDir, "a configuration with nothing to install writes nothing");
  });

  it("installs the sub-agents a skill this catalog does not know names, though nothing else installs", async () => {
    tempDir = await createTempDir();
    store.publish(
      "AllUnkAg",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { "totally-unknown-skill": ejectedGlobalSkill() },
      }),
    );

    const { exitCode, output } = await runInit("AllUnkAg");

    expect(exitCode, `init --from output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(output)).not.toContain(STEP_TEXT.SHARED_CONFIG_NOTHING_INSTALLABLE);
    const config = await loadConfigOrFail(tempDir);
    expect({ skills: config.skills, agents: config.agents }).toStrictEqual({
      skills: [],
      agents: buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
    });
    await expect({ dir: tempDir }).toHaveCompiledAgent(E2E_AGENT["web-developer"].name);
  });

  it("refuses an existing installation rather than showing the dashboard", async () => {
    tempDir = await createTempDir();
    store.publish(
      "First001",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
      }),
    );
    store.publish(
      "Second02",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.hono.id]: ejectedGlobalSkill() },
      }),
    );

    const first = await runInit("First001");
    expect(first.exitCode, `first install failed: ${first.output}`).toBe(EXIT_CODES.SUCCESS);

    const configBefore = await readFile(configTsPath(tempDir), "utf8");
    const skillsBefore = await listFiles(skillsPath(tempDir));
    const agentsBefore = await listFiles(agentsPath(tempDir));

    // `--from` is greenfield-only: an existing installation is refused naming `uninstall`.
    const second = await runInit("Second02");

    expect(second.exitCode).toBe(EXIT_CODES.ERROR);
    expect(second.output).not.toContain(STEP_TEXT.DASHBOARD);
    const said = flattenCliOutput(second.output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_EXISTING_INSTALL);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_UNINSTALL_HINT);

    expect(await readFile(configTsPath(tempDir), "utf8")).toBe(configBefore);
    expect(await listFiles(skillsPath(tempDir))).toStrictEqual(skillsBefore);
    expect(await listFiles(agentsPath(tempDir))).toStrictEqual(agentsBefore);
    expect(configBefore).not.toContain(E2E_SKILL.hono.id);
  });

  it("names edit --from <id> as the way to apply the id to an existing installation", async () => {
    tempDir = await createTempDir();
    store.publish(
      "First003",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [E2E_SKILL.react.id]: ejectedGlobalSkill() },
      }),
    );
    const first = await runInit("First003");
    expect(first.exitCode, `first install failed: ${first.output}`).toBe(EXIT_CODES.SUCCESS);

    const appliedId = "Second04";
    const second = await runInit(appliedId);

    expect(second.exitCode).toBe(EXIT_CODES.ERROR);
    const said = flattenCliOutput(second.output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_EXISTING_INSTALL);
    expect(said, "the refusal must name the command that applies this id here").toContain(
      `edit --from ${appliedId}`,
    );
  });
});
