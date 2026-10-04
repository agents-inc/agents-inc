/**
 * `agent-summoner` tells an agent where to author a new sub-agent, and the folder it names is a
 * folder this CLI decides. So the compiled prompt has to name the one the install it was compiled
 * for actually writes — and nothing in this repository checked that.
 *
 * **Why nothing did.** The programme's only automatic check on installed output is the Claude
 * golden trees, and they compile the two agents the e2e fixture stack selects. `agent-summoner` is
 * in none of the three:
 *
 * ```
 * grep -c agent-summoner packages/cli/e2e/fixtures/claude-golden-trees/*.json   # 0, 0, 0
 * ```
 *
 * The failure that gap allows is the expensive one for the rename. `agent.liquid` inlines
 * `{{ playbook }}` and `{{ output }}` verbatim, so an installed `agent-summoner.md` carries
 * whatever those files say — and after the flip that is a folder the CLI no longer writes. An
 * agent following it authors into one folder while the CLI reads another, which is the split
 * install the resolver has to refuse. The bytes are shipped rather than cosmetic.
 *
 * A prompt compiled for a fresh install must name the folder it writes.
 *
 * The compiled prompt is RENDERED through the production path — `createLiquidEngine` over the
 * install root, then `compileAgentForHost` — rather than scanned off the partials on disk, for
 * the reason `agent-partials.test.ts` gives: the template and its partials are separate surfaces
 * and only a render puts them in one string.
 *
 * The spellings are literals here. They are text an installed prompt carries, and an assertion
 * importing the constant the product writes would move with it and could never fail. The one thing
 * imported is `sourceFolderInUse` — which is the subject: the claim is that the two surfaces
 * agree, so one side has to come from the resolver.
 */

import { afterEach, describe, expect, it } from "vitest";

import { PROJECT_ROOT } from "../../consts.js";
import { compileAgentForHost, createLiquidEngine } from "../compiler.js";
import { sourceFolderInUse } from "../installation/install-layout.js";
import { createMockAgentConfig } from "./factories/agent-factories.js";
import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";
import type { AgentName } from "../../types/index.js";

/** The one agent whose own text names the source folder. */
const SUMMONER = "agent-summoner" satisfies AgentName;

/** Where its partials live under the CLI's bundled agent tree. */
const SUMMONER_PATH = "meta/agent-summoner";

/**
 * Every folder an installation's source can live in, as an installed prompt would spell one.
 *
 * A roster rather than a single assertion: the compiled prompt is filtered through it, so a
 * prompt naming another provider's folder fails by listing it, and a prompt naming a spelling
 * outside the roster fails by listing none.
 */
const SOURCE_FOLDER_SPELLINGS = [".agents-inc/claude", ".agents-inc/codex"] as const;

/**
 * A sentence from the playbook that has nothing to do with the folder.
 *
 * The subject guard for everything below: a render that picked up no playbook at all, or picked up
 * a different agent's, would name no folder and the filtered roster would simply come back empty
 * with a message about the wrong thing.
 */
const SUMMONER_PLAYBOOK_MARKER = "## The Agent Structure";

/** `agent-summoner` compiled for an install rooted at `installRoot`, through the write path. */
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

/** The source folders the compiled prompt names, in roster order. */
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

    // Subject guard: a fresh install really is on the current layout.
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
