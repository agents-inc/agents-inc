import path from "path";
import { readFile } from "fs/promises";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";

import "../matchers/setup.js";
import {
  createTempDir,
  cleanupTempDir,
  ensureBinaryExists,
  listFiles,
  readAgentEntriesFor,
} from "../helpers/test-utils.js";
import { createE2ESource } from "../helpers/create-e2e-source.js";
import {
  flattenCliOutput,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES } from "../pages/constants.js";
import { buildAgentConfigs } from "../../src/cli/lib/__tests__/factories/config-factories.js";

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
  return { v: 3, matrixVersion: "1.0.0", stackId, skills, agents };
}

/** One skill row. Model and effort live on the sub-agent now, never here. */
function skillEntry(overrides: Record<string, unknown> = {}) {
  return {
    // Eject, because the E2E source is local and has no marketplace — plugin mode legitimately
    // refuses that, which is its own (correct) error rather than anything this path controls.
    install: "eject",
    scope: "project",
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
    await ensureBinaryExists();
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

    const config = await readFile(path.join(tempDir, ".claude-src", "config.ts"), "utf8");
    expect(config).toContain(E2E_SKILL.react.id);
    expect(config).toContain(E2E_SKILL.vitest.id);
    expect(config).toContain("web-developer");
  });

  it("identifies itself as the CLI, so installs are distinguishable from share-link opens", async () => {
    tempDir = await createTempDir();
    store.publish("UAcheck1", seedPayload({ [E2E_SKILL.react.id]: skillEntry() }));

    await runInit("UAcheck1");

    expect(store.requests).toHaveLength(1);
    expect(store.requests[0].url).toBe("/configs/UAcheck1");
    expect(store.requests[0].userAgent).toBe("agents-inc-cli");
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
    expect(await listFiles(tempDir)).not.toContain(".claude-src");
  });

  it("refuses a payload that does not match the contract", async () => {
    tempDir = await createTempDir();
    store.publish("BadShape", { v: 3, matrixVersion: "1.0.0", stackId: null, skills: "nope" });

    const { exitCode, output } = await runInit("BadShape");

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(flattenCliOutput(output)).toContain("does not match the expected format");
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
    expect(flattenCliOutput(output)).toContain("does not match the expected format");
    expect(await listFiles(tempDir)).not.toContain(".claude-src");
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
    // ...and config.ts is what a later edit or recompile reads back.
    expect(await readAgentEntriesFor(tempDir, E2E_AGENT["web-developer"].name)).toStrictEqual(
      buildAgentConfigs([E2E_AGENT["web-developer"].name], {
        scope: "project",
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
    // A bare agent has no skill to carry it in, so the `agents` map is the only thing that can.
    expect(await readAgentEntriesFor(tempDir, E2E_AGENT["api-developer"].name)).toStrictEqual(
      buildAgentConfigs([E2E_AGENT["api-developer"].name], { scope: "project" }),
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

  it("overrides an existing installation rather than showing the dashboard", async () => {
    tempDir = await createTempDir();
    store.publish("First001", seedPayload({ [E2E_SKILL.react.id]: skillEntry() }));
    store.publish("Second02", seedPayload({ [E2E_SKILL.hono.id]: skillEntry() }));

    const first = await runInit("First001");
    expect(first.exitCode).toBe(EXIT_CODES.SUCCESS);

    // A bare `init` here would show the dashboard and stop. An id is an explicit instruction to
    // install *that* configuration, so it must not be diverted.
    const second = await runInit("Second02");

    expect(second.exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(second.output).toContain("Installing 1 skill(s)");

    const config = await readFile(path.join(tempDir, ".claude-src", "config.ts"), "utf8");
    expect(config).toContain(E2E_SKILL.hono.id);
  });
});
