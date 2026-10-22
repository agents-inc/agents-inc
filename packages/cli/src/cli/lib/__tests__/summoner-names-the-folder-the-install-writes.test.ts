/** `agent-summoner`'s compiled prompt must name the source folder a fresh install writes. */

import { afterEach, describe, expect, it } from "vitest";

import { PROJECT_ROOT } from "../../consts.js";
import { compileAgentForHost, createLiquidEngine } from "../compiler.js";
import { sourceFolderInUse } from "../installation/install-layout.js";
import { createMockAgentConfig } from "./factories/agent-factories.js";
import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";
import type { AgentName } from "../../types/index.js";

const SUMMONER = "agent-summoner" satisfies AgentName;

const SUMMONER_PATH = "meta/agent-summoner";

/** A roster, so a prompt naming another provider's folder or an unknown spelling fails visibly. */
const SOURCE_FOLDER_SPELLINGS = [".agents-inc/claude", ".agents-inc/codex"] as const;

const SUMMONER_PLAYBOOK_MARKER = "## The Agent Structure";

async function summonerCompiledFor(installRoot: string): Promise<string> {
  const engine = await createLiquidEngine(installRoot);

  return compileAgentForHost(
    "claude",
    SUMMONER,
    createMockAgentConfig(SUMMONER, [], { path: SUMMONER_PATH, sourceRoot: PROJECT_ROOT }),
    PROJECT_ROOT,
    engine,
  );
}

function foldersNamedIn(compiled: string): string[] {
  return SOURCE_FOLDER_SPELLINGS.filter((spelling) => compiled.includes(spelling));
}

describe("the folder agent-summoner tells an agent to author into", () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it("is the folder a fresh install of this release creates", async () => {
    const installRoot = await createTempDir("summoner-fresh-");
    cleanup = () => cleanupTempDir(installRoot);

    const compiled = await summonerCompiledFor(installRoot);

    expect(
      sourceFolderInUse(installRoot, "claude").relName,
      "a fresh install root no longer resolves to the new folder, so this spec is not about the new layout",
    ).toBe(SOURCE_FOLDER_SPELLINGS[0]);
    expect(
      compiled,
      "the render picked up no agent-summoner playbook, so every folder assertion below is about an empty string",
    ).toContain(SUMMONER_PLAYBOOK_MARKER);
    expect(
      foldersNamedIn(compiled),
      `the compiled agent-summoner names a folder this install does not use — it writes '${sourceFolderInUse(installRoot, "claude").relName}/', and an agent authoring into anything else produces the split install the resolver refuses`,
    ).toStrictEqual([sourceFolderInUse(installRoot, "claude").relName]);
  });
});
