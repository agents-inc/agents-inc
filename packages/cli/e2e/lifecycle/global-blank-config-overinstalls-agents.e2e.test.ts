import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createTempDir,
  directoryExists,
  fileExists,
  listFiles,
  readTestFile,
  renderMetadataYaml,
  runCLI,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";

describe("global blank-agent config on compile", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("compiles zero agents when the global config declares skills but agents: []", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");

    await writeProjectConfig(fakeHome, {
      name: "global-blank-agents",
      skills: [{ id: E2E_SKILL.react.id, scope: "global", origin: "eject" }],
      agents: [],
    });
    const skillDir = await createLocalSkill(fakeHome, E2E_SKILL.react.id, {
      description: "Global local skill so the compile pass has a skill to discover",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor(E2E_SKILL.react.id),
        contentHash: "hash-blank-agents",
      }),
    });

    // Setup must be valid, or the compile could no-op for the wrong reason.
    expect(
      await fileExists(configTsPath(fakeHome)),
      "global config.ts must be written before compile",
    ).toBe(true);
    expect(
      await directoryExists(skillDir),
      "the global local skill must exist so the compile pass is not skipped",
    ).toBe(true);

    const configBefore = await readTestFile(configTsPath(fakeHome));

    // From HOME itself, so it resolves to a single Global pass.
    const { exitCode, combined } = await runCLI(["compile"], fakeHome, {
      env: { HOME: fakeHome },
    });

    // The over-install is a successful compile, so a failure exit is a setup error.
    expect(exitCode, `compile must succeed; output:\n${combined}`).toBe(EXIT_CODES.SUCCESS);

    expect(await readTestFile(configTsPath(fakeHome)), "compile must not rewrite the config").toBe(
      configBefore,
    );

    const compiledAgents = (await listFiles(agentsPath(fakeHome))).filter((f) => f.endsWith(".md"));
    expect(
      compiledAgents,
      "a global config declaring no agents must compile zero agents to ~/.claude/agents/",
    ).toStrictEqual([]);
  });
});
