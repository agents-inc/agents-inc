import path from "path";
import { mkdir, rm } from "fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import { CLI } from "../fixtures/cli.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  fileExists,
  readTestFile,
  writeAgentFile,
} from "../helpers/test-utils.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { cliVersion, provenanceMarker } from "../../src/cli/lib/agents/agent-provenance.js";

/**
 * The two halves of one contract, driven through the real binary.
 *
 * `compile` stamps a provenance marker into every agent it writes — a body comment on the
 * first line after the frontmatter, deliberately not a frontmatter key, because Claude Code's
 * tolerance of unknown frontmatter fields is undocumented and the body is free-form by
 * contract. `uninstall` reads it back: once the configuration that named the compiled agents
 * is gone, the marker is the only thing that says which files this CLI produced, so a marked
 * file is provably ours to delete and an unmarked one is the user's to keep.
 */

/** A file the user wrote and dropped in the agents directory — it carries no marker. */
const HAND_WRITTEN_AGENT = "my-custom-agent";

describe("compiled-agent provenance marker", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  /**
   * A project whose config names one agent backed by one local skill, plus a HOME of its own
   * so the run is genuinely project-scoped rather than resolving to a global installation.
   */
  async function compiledProject(): Promise<{ dir: string; home: string; agentFile: string }> {
    const project = await ProjectBuilder.editable({
      skills: [E2E_SKILL.react.id],
      agents: [E2E_AGENT["web-developer"].name],
      domains: ["web"],
      forkedFrom: true,
      stack: {
        [E2E_AGENT["web-developer"].name]: {
          "web-framework": [{ id: E2E_SKILL.react.id, preloaded: true }],
        },
      },
    });
    tempDir = path.dirname(project.dir);

    const home = path.join(tempDir, "home");
    await mkdir(home, { recursive: true });

    const compile = await CLI.run(["compile"], { dir: project.dir }, { env: { HOME: home } });
    expect(compile.exitCode, `compile output:\n${compile.output}`).toBe(EXIT_CODES.SUCCESS);

    return {
      dir: project.dir,
      home,
      agentFile: path.join(agentsPath(project.dir), `${E2E_AGENT["web-developer"].name}.md`),
    };
  }

  /**
   * The marker's position is its contract, so the assertion pins it there: the closing
   * frontmatter fence, then the marker, then the rest. Matching the marker anywhere in the file
   * would pass on a compiler that appended it to the footer.
   */
  it("stamps the marker onto the line after the frontmatter", async () => {
    const { agentFile } = await compiledProject();

    const compiled = await readTestFile(agentFile);

    expect(compiled).toContain(`\n---\n${provenanceMarker(await cliVersion())}\n`);
  });

  /**
   * A second compile re-renders from the same partials and re-stamps the result, so the file it
   * writes must be the one already there — byte for byte. A stamp that appended rather than
   * replaced would grow the file by a line per compile and nothing else would notice.
   */
  it("re-compiles to the same bytes instead of stacking a second marker", async () => {
    const { dir, home, agentFile } = await compiledProject();
    const afterFirstCompile = await readTestFile(agentFile);

    const second = await CLI.run(["compile"], { dir }, { env: { HOME: home } });
    expect(second.exitCode, `compile output:\n${second.output}`).toBe(EXIT_CODES.SUCCESS);

    expect(await readTestFile(agentFile)).toBe(afterFirstCompile);
  });

  /**
   * The whole point of the marker. With `config.ts` deleted, nothing names the compiled agents —
   * and the sweep still tells them apart from the file the user wrote beside them. Both outcomes
   * are stated in the plan the user reads before pressing `y` and in the summary printed after.
   */
  it("sweeps the agents it stamped and keeps the user's own when the config is gone", async () => {
    const { dir, home, agentFile } = await compiledProject();

    await writeAgentFile(dir, HAND_WRITTEN_AGENT, { frontmatter: true });
    const handWrittenFile = path.join(agentsPath(dir), `${HAND_WRITTEN_AGENT}.md`);
    const handWrittenBefore = await readTestFile(handWrittenFile);

    await rm(configTsPath(dir));

    const { exitCode, output } = await CLI.run(
      ["uninstall", "--yes"],
      { dir },
      { env: { HOME: home } },
    );

    expect(exitCode, `uninstall output:\n${output}`).toBe(EXIT_CODES.SUCCESS);
    expect(output).toContain(STEP_TEXT.UNINSTALL_CLI_MANAGED_SECTION);
    expect(output).toContain(STEP_TEXT.UNINSTALL_CLI_COMPILED);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_REASON);
    expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(agentFile)).toBe(false);
    expect(await readTestFile(handWrittenFile)).toBe(handWrittenBefore);
  });
});
