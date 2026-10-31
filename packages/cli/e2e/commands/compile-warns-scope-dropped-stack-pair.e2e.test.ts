import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { flattenCliOutput } from "../helpers/test-utils.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { buildSkillConfig } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import "../matchers/setup.js";

/**
 * A hand-edited config pairing a global sub-agent with a project skill: compile drops the pair and
 * must warn rather than report a clean pass.
 */
describe("compile over a hand-edited stack pair the scope rule forbids", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  async function compileOverADroppedPair(recordedName?: string) {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const fakeHome = path.join(tempDir, "fake-home");

    await writeProjectConfig(projectDir, {
      name: "scope-dropped-pair",
      skills: [
        buildSkillConfig(E2E_SKILL.react.id, {
          scope: "project",
          origin: "eject",
          ...(recordedName !== undefined && { displayName: recordedName }),
        }),
      ],
      agents: [{ name: E2E_AGENT["web-developer"].name, scope: "global" }],
      selectedDomains: ["web"],
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
        },
      },
    });

    await createLocalSkill(projectDir, E2E_SKILL.react.id, {
      description: "React skill for the dropped-pair guard",
      metadata: renderMetadataYaml({
        displayName: E2E_SKILL.react.display,
        category: "web-framework",
        slug: E2E_SKILL.react.slug,
        contentHash: "hash-dropped-pair",
      }),
    });

    const run = await CLI.run(["compile"], { dir: projectDir }, { env: { HOME: fakeHome } });
    return { ...run, projectDir };
  }

  it("names the agent and the skill whose assignment it dropped", async () => {
    const { exitCode, output, projectDir } = await compileOverADroppedPair();

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Proof the drop happened, so the warning cannot pass on an honoured pair.
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      notContains: [E2E_SKILL.react.id],
    });

    // The skill is installed, so only the new warning can name it.
    expect(output).not.toContain(STEP_TEXT.SKILL_NOT_FOUND_WARNING);

    // Flattened: oclif wraps warnings with ` › `.
    expect(flattenCliOutput(output)).toContain(
      `'${E2E_AGENT["web-developer"].name}' ${STEP_TEXT.STACK_PAIR_DROPPED_BY_SCOPE} '${E2E_SKILL.react.display}'`,
    );
  });

  it("names the skill by the name its install recorded, over the catalogue's", async () => {
    const recordedName = "House React";

    const { exitCode, output } = await compileOverADroppedPair(recordedName);

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);
    expect(flattenCliOutput(output)).toContain(
      `'${E2E_AGENT["web-developer"].name}' ${STEP_TEXT.STACK_PAIR_DROPPED_BY_SCOPE} '${recordedName}'`,
    );
  });
});
