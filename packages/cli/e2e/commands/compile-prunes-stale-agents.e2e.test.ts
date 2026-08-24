import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  fileExists,
  renderMetadataYaml,
  writeAgentFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";

/**
 * Regression: `cc compile` must prune stale compiled agent files.
 *
 * Bug D-264 mechanism #2 — the compiled-agent write path
 * (writeCompiledAgentsByScope) is additive-only: it writes each resolved agent
 * but never deletes. A built-in agent `.md` left behind by an earlier, larger
 * config survives a recompile even after that agent is dropped from
 * config.agents. The fix must delete CLI-compiled agent files that are absent
 * from config.agents WHILE preserving hand-authored agents (files whose
 * basename is not a built-in CLI agent name).
 */

// Hand-authored agent whose basename is NOT a built-in CLI agent — never pruned.
const HAND_AUTHORED_AGENT = "my-custom-agent";

describe("compile prunes stale compiled agents", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("removes a stale built-in agent absent from config while preserving hand-authored agents", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");

    // Global config lists ONLY web-developer, backed by a real local skill so
    // the compile discovers skills and does not hard-error on an empty pass.
    await writeProjectConfig(fakeHome, {
      name: "global-prune-test",
      skills: [{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
        },
      },
    });

    await createLocalSkill(fakeHome, E2E_SKILL.react.id, {
      description: "Global skill backing web-developer",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor(E2E_SKILL.react.id),
        contentHash: "hash-prune-react",
      }),
    });

    // Pre-seed the agents dir with two files that are NOT in config.agents:
    //  - api-developer.md: a built-in agent left by a prior, larger compile
    //    (simulates a previously-compiled, now-deselected agent).
    //  - my-custom-agent.md: a hand-authored file the CLI never generated.
    await writeAgentFile(fakeHome, E2E_AGENT["api-developer"].name, { frontmatter: true });
    await writeAgentFile(fakeHome, HAND_AUTHORED_AGENT);

    const { exitCode } = await CLI.run(["compile"], { dir: fakeHome }, { env: { HOME: fakeHome } });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Green guard: the config-listed agent is (re)compiled.
    expect(
      await fileExists(path.join(agentsPath(fakeHome), `${E2E_AGENT["web-developer"].name}.md`)),
    ).toBe(true);

    // RED: the stale built-in agent, no longer in config.agents, must be pruned.
    // Today the additive-only write leaves it on disk, so this assertion fails.
    expect(
      await fileExists(path.join(agentsPath(fakeHome), `${E2E_AGENT["api-developer"].name}.md`)),
    ).toBe(false);

    // Green guard: the hand-authored agent must NEVER be pruned.
    expect(await fileExists(path.join(agentsPath(fakeHome), `${HAND_AUTHORED_AGENT}.md`))).toBe(
      true,
    );
  });
});
