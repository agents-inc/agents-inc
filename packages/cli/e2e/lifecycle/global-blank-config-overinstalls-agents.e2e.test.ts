import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  listFiles,
  readTestFile,
  renderMetadataYaml,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";

/**
 * D-264 mechanism #1 — a global config that declares skills but ZERO agents
 * (`agents: []`) must not over-install every built-in agent on `cc compile`.
 *
 * `resolveAgentNames` (src/cli/lib/agents/agent-recompiler.ts) has a priority
 * ladder: explicit agents -> `projectConfig.agents.length` -> `if (outputDir)
 * return typedKeys(allAgents)` -> directory scan. When `config.agents` is `[]`,
 * the length check is falsy and the resolver falls through to the `outputDir`
 * branch, which returns EVERY built-in agent (~23). A global install that
 * declares skills but no agents therefore ends up with the entire agent
 * inventory written to `~/.claude/agents/` instead of none.
 *
 * Running `cc compile` from the home directory (cwd === HOME) yields a single
 * Global pass (project detection is skipped for the home dir, so `hasBoth` is
 * false and `scopeFilter` is undefined) whose `outputDir` is
 * `~/.claude/agents/` — exactly the branch that triggers the over-install.
 */

describe("global blank-agent config on compile", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("compiles zero agents when the global config declares skills but agents: []", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");

    // Global install: a real skill at global scope, but an empty agents list.
    await writeProjectConfig(fakeHome, {
      name: "global-blank-agents",
      skills: [{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }],
      agents: [],
    });
    const skillDir = await createLocalSkill(fakeHome, E2E_SKILL.react.id, {
      description: "Global local skill so the compile pass has a skill to discover",
      metadata: renderMetadataYaml({ contentHash: "hash-blank-agents" }),
    });

    // Setup must be valid — otherwise the compile could no-op for the wrong
    // reason (no config to detect, or no skill so the pass is skipped).
    expect(
      await fileExists(configTsPath(fakeHome)),
      "global config.ts must be written before compile",
    ).toBe(true);
    expect(
      await directoryExists(skillDir),
      "the global local skill must exist so the compile pass is not skipped",
    ).toBe(true);

    const configBefore = await readTestFile(configTsPath(fakeHome));

    // Run compile from the home directory itself (cwd === HOME) so it resolves
    // to a single Global pass targeting ~/.claude/agents/.
    const { exitCode, combined } = await runCLI(["compile"], fakeHome, {
      env: { HOME: fakeHome },
    });

    // The over-install is a successful compile, not a crash — a non-success
    // exit would mean the failure below is a setup/compile error, not the bug.
    expect(exitCode, `compile must succeed; output:\n${combined}`).toBe(EXIT_CODES.SUCCESS);

    // compile must not mutate the config — snapshot both sides of the state.
    expect(await readTestFile(configTsPath(fakeHome)), "compile must not rewrite the config").toBe(
      configBefore,
    );

    // The bug: with agents: [] the resolver falls through to typedKeys(allAgents)
    // and every built-in agent is written to ~/.claude/agents/.
    const compiledAgents = (await listFiles(agentsPath(fakeHome))).filter((f) => f.endsWith(".md"));
    expect(
      compiledAgents,
      "a global config declaring no agents must compile zero agents to ~/.claude/agents/",
    ).toStrictEqual([]);
  });
});
