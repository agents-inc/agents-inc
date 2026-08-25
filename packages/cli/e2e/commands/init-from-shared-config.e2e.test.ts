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
import { createE2ESource } from "../helpers/create-e2e-source.js";
import { CLI } from "../fixtures/cli.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";

/**
 * `init --from <id>` end to end: the CLI fetches a configuration shared from agentsinc.sh and
 * installs it without the wizard.
 *
 * Wire contract and command plumbing live here. What a decoded payload turns into on disk —
 * per-agent curation, preload fidelity, model/effort, install modes and scopes — lives in the
 * `init-from-scenarios-*` specs.
 */

/**
 * A payload as the web app builds it.
 *
 * The version is a literal rather than the vendored `SEED_VERSION`: these specs pin the wire
 * contract, so they have to fail while the CLI is still on the old one instead of following it.
 */
function seedPayload(
  skills: Record<string, unknown>,
  agents: Record<string, unknown> = {},
  stackId: string | null = null,
) {
  return { v: 5, matrixVersion: "1.0.0", stackId, skills, agents };
}

/** One skill row. Model and effort live on the sub-agent now, never here. */
function skillEntry(overrides: Record<string, unknown> = {}) {
  return {
    // Eject, because the E2E source is local and has no marketplace — plugin mode legitimately
    // refuses that, which is its own (correct) error rather than anything this path controls.
    install: "eject",
    // Global, because no payload in this file pins its sub-agent: every one of them rests at the
    // shared selection default, and a project-scoped skill assigned to a sub-agent resting there
    // is a pair the config model cannot express — the decode refuses it outright.
    scope: "global",
    assignments: { "web-developer": "lazy" },
    ...overrides,
  };
}

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
      seedPayload({
        [E2E_SKILL.react.id]: skillEntry(),
        [E2E_SKILL.vitest.id]: skillEntry({ assignments: { "web-developer": "preloaded" } }),
      }),
    );

    const { exitCode, output } = await runInit("Ab3xY9_Q");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // Never rendered the wizard — this has to work over a pipe and in CI.
    expect(output).toContain("Fetching configuration Ab3xY9_Q");
    expect(output).toContain("Installing 2 skill(s)");

    // Structural, like every sibling spec in this file: `toContain` on the raw
    // config text cannot say which skill carries which scope or source, and a
    // third skill appearing alongside the two would satisfy it.
    const config = await loadConfigOrFail(tempDir);
    expect(config.skills.map((skill) => skill.id).sort()).toStrictEqual(
      [E2E_SKILL.react.id, E2E_SKILL.vitest.id].sort(),
    );
    expect(await readAgentEntriesFor(tempDir, E2E_AGENT["web-developer"].name)).toStrictEqual(
      buildAgentConfigs([E2E_AGENT["web-developer"].name], { scope: "global" }),
    );
    // The preloaded/dynamic split the payload asked for reaches the compiled agent.
    await expect({ dir: tempDir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      exactSkills: [E2E_SKILL.vitest.id],
    });
  });

  it("installs from the marketplace the payload names, with no flag to say so", async () => {
    tempDir = await createTempDir();
    store.publish("Market01", {
      ...seedPayload({ [E2E_SKILL.react.id]: skillEntry() }),
      marketplace: sourceDir,
    });

    // Deliberately not `runInit`, which always passes `--marketplace`: the whole of what this
    // pins is that the ref on the wire reaches the loader on its own. Without it the walk ends
    // at the default public marketplace, which has never heard of this source's skills.
    const { exitCode, output } = await CLI.run(
      ["init", "--from", "Market01"],
      { dir: tempDir },
      { env: { AGENTS_INC_API_URL: store.url } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain("Installing 1 skill(s)");

    const config = await loadConfigOrFail(tempDir);
    expect(config.skills.map((skill) => skill.id)).toStrictEqual([E2E_SKILL.react.id]);
    // Recorded, not merely used: it is what every later command in this directory reads from.
    expect(config.marketplace).toBe(sourceDir);
    // The filesystem half — the skill only exists in the source the ref named, so its presence
    // on disk is what says the ref chose the catalogue rather than the default one.
    expect(await listFiles(skillsPath(tempDir))).toContain(E2E_SKILL.react.id);
  });

  it("lets an explicit marketplace outrank the one the payload names", async () => {
    tempDir = await createTempDir();
    // A ref that resolves to nothing, so the run can only succeed on the flag's.
    store.publish("Market02", {
      ...seedPayload({ [E2E_SKILL.react.id]: skillEntry() }),
      marketplace: path.join(tempDir, "no-such-marketplace"),
    });

    // Naming one is an instruction about THIS install; the payload's ref is a record of where
    // the sharer's skills came from, and an install may legitimately be pointed elsewhere.
    const { exitCode } = await runInit("Market02");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    const config = await loadConfigOrFail(tempDir);
    expect(config.marketplace).toBe(sourceDir);
    expect(await listFiles(skillsPath(tempDir))).toContain(E2E_SKILL.react.id);
  });

  it("identifies itself as the CLI, so installs are distinguishable from share-link opens", async () => {
    tempDir = await createTempDir();
    store.publish("UAcheck1", seedPayload({ [E2E_SKILL.react.id]: skillEntry() }));

    await runInit("UAcheck1");

    expect(store.requests).toHaveLength(1);
    expect(firstElement(store.requests).url).toBe("/configs/UAcheck1");
    expect(firstElement(store.requests).userAgent).toBe("agents-inc-cli");
  });

  it("skips ids this catalog does not know, by name, and installs the rest", async () => {
    tempDir = await createTempDir();
    store.publish(
      "Mixed001",
      seedPayload({
        [E2E_SKILL.react.id]: skillEntry(),
        "web-framework-does-not-exist": skillEntry(),
      }),
    );

    const { exitCode, output } = await runInit("Mixed001");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // Named rather than counted: a count cannot be acted on.
    expect(flattenCliOutput(output)).toContain("web-framework-does-not-exist");
    expect(output).toContain("Installing 1 skill(s)");

    const config = await readFile(path.join(tempDir, ".claude-src", "config.ts"), "utf8");
    expect(config).toContain(E2E_SKILL.react.id);
    expect(config).not.toContain("web-framework-does-not-exist");
  });

  it("reports an unknown id without writing anything", async () => {
    tempDir = await createTempDir();

    const { exitCode, output } = await runInit("NoSuchId");

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain("No configuration found for id 'NoSuchId'");
    // Nothing partially installed: the fetch fails before the pipeline starts.
    expect(await listFiles(tempDir)).not.toContain(DIRS.CLAUDE_SRC);
  });

  it("refuses a payload that does not match the contract", async () => {
    tempDir = await createTempDir();
    store.publish("BadShape", { v: 5, matrixVersion: "1.0.0", stackId: null, skills: "nope" });

    const { exitCode, output } = await runInit("BadShape");

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain(
      "is not in a format this version of the CLI can install",
    );
  });

  it("refuses a payload from the previous contract version rather than migrating it", async () => {
    tempDir = await createTempDir();
    // v1 carried model/effort per skill. Pre-1.0 policy is to fail loudly, not migrate, so an id
    // shared before the move has to be re-shared rather than silently reinterpreted.
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
    // A version bump invalidates every id minted before it, so an OLDER id meeting a newer CLI is
    // the case this refusal exists for in bulk — and the remedy for it always exists. A message
    // that only diagnoses "a newer version" sends the reader to an upgrade that cannot help.
    expect(flattenCliOutput(output)).toContain("re-share the configuration");
    expect(await listFiles(tempDir)).not.toContain(DIRS.CLAUDE_SRC);
  });

  it("applies a sub-agent's model and effort to both the compiled agent and the config", async () => {
    tempDir = await createTempDir();
    store.publish(
      "Tuned001",
      seedPayload(
        { [E2E_SKILL.react.id]: skillEntry() },
        { [E2E_AGENT["web-developer"].name]: { model: "haiku", effort: "xhigh" } },
      ),
    );

    const { exitCode } = await runInit("Tuned001");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // The compiled file is what Claude Code reads...
    await expect({ dir: tempDir }).toHaveAgentFrontmatter(E2E_AGENT["web-developer"].name, {
      model: "haiku",
      effort: "xhigh",
    });
    // ...and config.ts is what a later edit or recompile reads back. The entry names a model and an
    // effort but no scope, so the sub-agent takes the shared selection default.
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
      seedPayload(
        { [E2E_SKILL.react.id]: skillEntry() },
        { [E2E_AGENT["web-developer"].name]: { model: "fable" } },
      ),
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
      seedPayload(
        { [E2E_SKILL.react.id]: skillEntry() },
        { [E2E_AGENT["api-developer"].name]: { on: true } },
      ),
    );

    const { exitCode } = await runInit("Bare0001");

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    // A bare agent has no skill to carry it in, so the `agents` map is the only thing that can —
    // and `on: true` alone names no scope, so it lands at the shared selection default.
    expect(await readAgentEntriesFor(tempDir, E2E_AGENT["api-developer"].name)).toStrictEqual(
      buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "global" }),
    );
    await expect({ dir: tempDir }).toHaveCompiledAgent(E2E_AGENT["api-developer"].name);
  });

  it("errors when nothing in the payload is installable", async () => {
    tempDir = await createTempDir();
    store.publish("AllUnknown", seedPayload({ "totally-unknown-skill": skillEntry() }));

    const { exitCode, output } = await runInit("AllUnknown");

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain("no skills this catalog can install");
  });

  it("refuses an existing installation rather than showing the dashboard", async () => {
    tempDir = await createTempDir();
    store.publish("First001", seedPayload({ [E2E_SKILL.react.id]: skillEntry() }));
    store.publish("Second02", seedPayload({ [E2E_SKILL.hono.id]: skillEntry() }));

    const first = await runInit("First001");
    expect(first.exitCode, `first install failed: ${first.output}`).toBe(EXIT_CODES.SUCCESS);

    const configBefore = await readFile(configTsPath(tempDir), "utf8");
    const skillsBefore = await listFiles(skillsPath(tempDir));
    const agentsBefore = await listFiles(agentsPath(tempDir));

    // A bare `init` here would show the dashboard and stop. An id is still not diverted to it —
    // but it no longer installs over what it finds either: `--from` is greenfield-only, so an
    // existing installation is a refusal naming `uninstall`, not a dashboard and not a merge.
    const second = await runInit("Second02");

    expect(second.exitCode).toBe(EXIT_CODES.ERROR);
    expect(second.output).not.toContain(STEP_TEXT.DASHBOARD);
    const said = flattenCliOutput(second.output);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_EXISTING_INSTALL);
    expect(said).toContain(STEP_TEXT.SHARED_CONFIG_UNINSTALL_HINT);

    // The first install is exactly as it was, on both sides: nothing ran.
    expect(await readFile(configTsPath(tempDir), "utf8")).toBe(configBefore);
    expect(await listFiles(skillsPath(tempDir))).toStrictEqual(skillsBefore);
    expect(await listFiles(agentsPath(tempDir))).toStrictEqual(agentsBefore);
    expect(configBefore).not.toContain(E2E_SKILL.hono.id);
  });
});
