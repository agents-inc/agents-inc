import path from "path";
import { mkdir, writeFile } from "fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { removeCompiledAgents } from "./remove-compiled-agents";
import { CLAUDE_DIR, STANDARD_DIRS } from "../../../consts.js";
import { renderAgentMd } from "../../__tests__/content-generators.js";
import {
  cleanupTempDir,
  createTempDir,
  directoryExists,
  fileExists,
} from "../../__tests__/test-fs-utils.js";
import type { AgentName } from "../../../types/index.js";

/**
 * One operation owns compiled-agent removal AND the tidiness of the directory
 * it removes from. A scope's `.claude/agents/` is an artefact of what it holds,
 * so the removal that empties it takes it too — and emptiness here is FILESYSTEM
 * emptiness, never roster emptiness: anything at all still on disk keeps the
 * directory alive whatever a config says.
 *
 * `.claude/` above it is uninstall's decision, never a removal path's.
 */

const REMOVED_AGENT: AgentName = "api-developer";
const SURVIVING_AGENT: AgentName = "web-developer";
// Basename outside the AgentName union — a file the CLI never compiled.
const HAND_AUTHORED_AGENT = "my-custom-agent";
// A file that is not an agent at all — emptiness is measured on the filesystem.
const UNRELATED_FILE = "notes.txt";

describe("removeCompiledAgents", () => {
  let tempDir: string;
  let claudeDir: string;
  let agentsDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("cc-remove-compiled-agents-");
    claudeDir = path.join(tempDir, CLAUDE_DIR);
    agentsDir = path.join(claudeDir, STANDARD_DIRS.AGENTS);
    await mkdir(agentsDir, { recursive: true });
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  const seedAgentFile = async (name: string): Promise<void> => {
    await writeFile(path.join(agentsDir, `${name}.md`), renderAgentMd(name));
  };

  it("deletes the named compiled agent from the directory", async () => {
    await seedAgentFile(REMOVED_AGENT);
    await seedAgentFile(SURVIVING_AGENT);

    await removeCompiledAgents({ agentsDir, agents: [REMOVED_AGENT] });

    expect(
      await fileExists(path.join(agentsDir, `${REMOVED_AGENT}.md`)),
      "the named agent's compiled file must be deleted",
    ).toBe(false);
  });

  it("leaves an unnamed compiled agent untouched", async () => {
    await seedAgentFile(REMOVED_AGENT);
    await seedAgentFile(SURVIVING_AGENT);

    await removeCompiledAgents({ agentsDir, agents: [REMOVED_AGENT] });

    expect(
      await fileExists(path.join(agentsDir, `${SURVIVING_AGENT}.md`)),
      "removal is surgical — an agent nobody named must survive",
    ).toBe(true);
    expect(
      await directoryExists(agentsDir),
      "a directory that still holds a compiled agent must never be deleted",
    ).toBe(true);
  });

  it("removes the agents directory when the removal empties it", async () => {
    await seedAgentFile(REMOVED_AGENT);

    await removeCompiledAgents({ agentsDir, agents: [REMOVED_AGENT] });

    expect(
      await directoryExists(agentsDir),
      "an agents directory the removal emptied must not survive it",
    ).toBe(false);
  });

  it("leaves the .claude directory in place when the agents directory goes", async () => {
    await seedAgentFile(REMOVED_AGENT);

    await removeCompiledAgents({ agentsDir, agents: [REMOVED_AGENT] });

    expect(
      await directoryExists(claudeDir),
      ".claude itself is uninstall's decision — a removal path must leave it alone",
    ).toBe(true);
  });

  it("keeps the agents directory while a hand-authored agent is still in it", async () => {
    await seedAgentFile(REMOVED_AGENT);
    await seedAgentFile(HAND_AUTHORED_AGENT);

    await removeCompiledAgents({ agentsDir, agents: [REMOVED_AGENT] });

    expect(
      await fileExists(path.join(agentsDir, `${HAND_AUTHORED_AGENT}.md`)),
      "a hand-authored agent is never removed",
    ).toBe(true);
    expect(
      await directoryExists(agentsDir),
      "emptiness is filesystem emptiness — a hand-authored agent keeps the directory alive",
    ).toBe(true);
  });

  it("keeps the agents directory while any unrelated file is still in it", async () => {
    await seedAgentFile(REMOVED_AGENT);
    await writeFile(path.join(agentsDir, UNRELATED_FILE), "user-owned content\n");

    await removeCompiledAgents({ agentsDir, agents: [REMOVED_AGENT] });

    expect(
      await fileExists(path.join(agentsDir, UNRELATED_FILE)),
      "a user-owned file that is not an agent is never removed",
    ).toBe(true);
    expect(
      await directoryExists(agentsDir),
      "any surviving file keeps the directory alive, agent or not",
    ).toBe(true);
  });

  it("removes every named agent in one call", async () => {
    await seedAgentFile(REMOVED_AGENT);
    await seedAgentFile(SURVIVING_AGENT);

    await removeCompiledAgents({ agentsDir, agents: [REMOVED_AGENT, SURVIVING_AGENT] });

    expect(await fileExists(path.join(agentsDir, `${REMOVED_AGENT}.md`))).toBe(false);
    expect(await fileExists(path.join(agentsDir, `${SURVIVING_AGENT}.md`))).toBe(false);
    expect(
      await directoryExists(agentsDir),
      "removing the last compiled agent takes the directory with it",
    ).toBe(false);
  });

  it("treats a named agent with no file on disk as a no-op", async () => {
    await seedAgentFile(SURVIVING_AGENT);

    await expect(
      removeCompiledAgents({ agentsDir, agents: [REMOVED_AGENT] }),
    ).resolves.not.toThrow();

    expect(
      await fileExists(path.join(agentsDir, `${SURVIVING_AGENT}.md`)),
      "an absent file is nothing to do, not a reason to touch anything else",
    ).toBe(true);
    expect(await directoryExists(agentsDir)).toBe(true);
  });
});
