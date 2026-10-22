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
import { EXIT_CODES, REMOVED_MARKER, STEP_TEXT, panelRow } from "../pages/constants.js";

/**
 * `compile` stamps a provenance marker on the first body line after the frontmatter (not a
 * frontmatter key, whose tolerance is undocumented), and `uninstall` uses it to tell its own agents
 * from the user's once the config is gone.
 */

/** No marker: the user's own file. */
const HAND_WRITTEN_AGENT = "my-custom-agent";

describe("compiled-agent provenance marker", () => {
  let tempDir: string;

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
      tempDir = undefined!;
    }
  });

  /** A HOME of its own, so the run is project-scoped. */
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

  /** Position is the contract: fence, marker, then the rest. */
  it("stamps the marker onto the line after the frontmatter", async () => {
    const { agentFile } = await compiledProject();

    const compiled = await readTestFile(agentFile);

    expect(compiled).toContain(`\n---\n${STEP_TEXT.PROVENANCE_MARKER}\n`);
  });

  /** A stamp that appended would grow the file each compile. */
  it("re-compiles to the same bytes instead of stacking a second marker", async () => {
    const { dir, home, agentFile } = await compiledProject();
    const afterFirstCompile = await readTestFile(agentFile);

    const second = await CLI.run(["compile"], { dir }, { env: { HOME: home } });
    expect(second.exitCode, `compile output:\n${second.output}`).toBe(EXIT_CODES.SUCCESS);

    expect(await readTestFile(agentFile)).toBe(afterFirstCompile);
  });

  /** Both outcomes are stated in the plan and in the summary. */
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
    expect(output).toContain(panelRow(REMOVED_MARKER, E2E_AGENT["web-developer"].name));
    expect(output).not.toContain(panelRow(REMOVED_MARKER, HAND_WRITTEN_AGENT));
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_ONE);
    expect(output).toContain(STEP_TEXT.UNINSTALL_AGENTS_KEPT_REASON);
    expect(output).toContain(STEP_TEXT.UNINSTALL_SUCCESS);

    expect(await fileExists(agentFile)).toBe(false);
    expect(await readTestFile(handWrittenFile)).toBe(handWrittenBefore);
  });
});
