import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { flattenCliOutput } from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  createLocalSkill,
  createTempDir,
  ensureBinaryExists,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import "../matchers/setup.js";

/**
 * `config.ts` is the hand-editable half of the pair — the documented workflow is
 * "edit config.ts, then compile" — so it can name a pair the scope rule forbids:
 * a GLOBAL sub-agent whose stack carries a PROJECT-scoped skill.
 *
 * The compile-time filter in `buildCompileAgents` drops that reference on the way
 * to the resolver, and `compile` rewrites nothing in `config.ts`, so the illegal
 * row survives and is dropped again on every future run. The recompile summary
 * reports a clean pass over an agent that no longer carries what its own config
 * says it does — exactly the state `warnUnresolvedStackSkills` exists to stop
 * being silent about, one layer over.
 */
describe("compile over a hand-edited stack pair the scope rule forbids", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  it("names the agent and the skill whose assignment it dropped", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const fakeHome = path.join(tempDir, "fake-home");

    // The illegal pair, written the way a hand edit would leave it: the skill is
    // installed and project-scoped, the sub-agent carrying it is global-scoped.
    await writeProjectConfig(projectDir, {
      name: "scope-dropped-pair",
      skills: [{ id: E2E_SKILL.react.id, scope: "project", source: "eject" }],
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
        displayName: E2E_SKILL.react.id,
        category: "web-framework",
        slug: E2E_SKILL.react.slug,
        contentHash: "hash-dropped-pair",
      }),
    });

    const { exitCode, output } = await CLI.run(
      ["compile"],
      { dir: projectDir },
      { env: { HOME: fakeHome } },
    );

    expect(exitCode).toBe(EXIT_CODES.SUCCESS);

    // Proof the drop actually happened: the compiled agent does NOT carry the
    // skill its own config assigns to it. Without this the warning assertion
    // could pass on a run where the pair was honoured after all.
    await expect({ dir: projectDir }).toHaveCompiledAgentContent(E2E_AGENT["web-developer"].name, {
      notContains: [E2E_SKILL.react.id],
    });

    // The skill IS installed, so the existing unresolved-stack-skill warning has
    // nothing to say about it — this line is the only one that could.
    expect(output).not.toContain(STEP_TEXT.SKILL_NOT_FOUND_WARNING);

    // Flattened: oclif wraps warning text at the terminal width and prefixes each
    // continuation with ` › `, so the phrase straddles a line break in the
    // captured output. Asserting a shorter fragment would just move the
    // brittleness onto a message that had been truncated.
    const flattened = flattenCliOutput(output);
    expect(flattened).toContain(STEP_TEXT.STACK_PAIR_DROPPED_BY_SCOPE);
    expect(flattened).toContain(E2E_AGENT["web-developer"].name);
    expect(flattened).toContain(E2E_SKILL.react.id);
  });
});
