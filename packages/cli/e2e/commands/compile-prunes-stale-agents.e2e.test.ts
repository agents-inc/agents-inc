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

/** `compile` prunes compiled agents no longer in config.agents and keeps hand-authored files. */

// Not a built-in agent's basename, so never pruned.
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

    // Backed by a real local skill so compile does not refuse an empty pass.
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

    // Neither file is in config.agents: a built-in left by an earlier compile, and a hand-authored
    // one.
    await writeAgentFile(fakeHome, E2E_AGENT["api-developer"].name, { frontmatter: true });
    await writeAgentFile(fakeHome, HAND_AUTHORED_AGENT);

    const { exitCode } = await CLI.run(["compile"], { dir: fakeHome }, { env: { HOME: fakeHome } });
    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    expect(
      await fileExists(path.join(agentsPath(fakeHome), `${E2E_AGENT["web-developer"].name}.md`)),
    ).toBe(true);

    expect(
      await fileExists(path.join(agentsPath(fakeHome), `${E2E_AGENT["api-developer"].name}.md`)),
    ).toBe(false);

    expect(await fileExists(path.join(agentsPath(fakeHome), `${HAND_AUTHORED_AGENT}.md`))).toBe(
      true,
    );
  });
});
