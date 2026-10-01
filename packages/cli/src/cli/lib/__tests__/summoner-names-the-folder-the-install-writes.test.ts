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
 * **Two states, in one file, because either alone is satisfied by a lie.** A prompt compiled for
 * an install on the new layout must name the new folder; a prompt compiled for an install still on
 * the old one must name the old folder. Assert only the first and the whole fix reads as
 * "s/one literal/the other literal/", which is green here and wrong on every existing install.
 * Assert only the second and the flip never has to land at all.
 *
 * The compiled prompt is RENDERED through the production path — `createLiquidEngine` over the
 * install root, then `compileAgentForHost` — rather than scanned off the partials on disk, for
 * the reason `agent-partials.test.ts` gives: the template and its partials are separate surfaces
 * and only a render puts them in one string.
 *
 * Both spellings are literals here. They are text an installed prompt carries, and an assertion
 * importing the constant the product writes would move with it and could never fail. The one thing
 * imported is `sourceFolderInUse` — which is the subject: the claim is that the two surfaces
 * agree, so one side has to come from the resolver.
 */

import { afterEach, describe, expect, it } from "vitest";

import { PROJECT_ROOT } from "../../consts.js";
import { compileAgentForHost, createLiquidEngine } from "../compiler.js";
import { sourceFolderInUse } from "../installation/install-layout.js";
import { createMockAgentConfig } from "./factories/agent-factories.js";
import { writeTestTsConfig } from "./helpers/config-io.js";
import { cleanupTempDir, createTempDir } from "./test-fs-utils.js";
import type { AgentName } from "../../types/index.js";

/** The one agent whose own text names the source folder. */
const SUMMONER = "agent-summoner" satisfies AgentName;

/** Where its partials live under the CLI's bundled agent tree. */
const SUMMONER_PATH = "meta/agent-summoner";

/**
 * Every folder an installation's source can live in, as an installed prompt would spell one.
 *
 * A roster rather than a pair of assertions: the compiled prompt is filtered through it, so a
 * prompt naming BOTH — the half-applied fix — fails by listing both, and a prompt naming a third
 * spelling fails by listing none.
 */
const SOURCE_FOLDER_SPELLINGS = [".claude-src", ".agents-inc/claude"] as const;

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

    // Subject guard, the twin of the one below: a fresh install really is on the new layout. A
    // resolver that answered the old name for an empty root would otherwise turn this spec into a
    // second copy of the legacy one, and the pair would stop being two states.
    expect(
      sourceFolderInUse(installRoot, "claude").relName,
      "a fresh install root no longer resolves to the new folder, so this spec is not about the new layout",
    ).toBe(SOURCE_FOLDER_SPELLINGS[1]);
    expect(
      compiled,
      "the render picked up no agent-summoner playbook, so every folder assertion below is about an empty string",
    ).toContain(SUMMONER_PLAYBOOK_MARKER);
    expect(
      foldersNamedIn(compiled),
      `the compiled agent-summoner names a folder this install does not use — it writes '${sourceFolderInUse(installRoot, "claude").relName}/', and an agent authoring into anything else produces the split install the resolver refuses`,
    ).toStrictEqual([sourceFolderInUse(installRoot, "claude").relName]);
  });

  /**
   * The state that makes the one above a claim about RESOLUTION rather than about a literal.
   *
   * Every installation made before the rename keeps its folder, is read there and written there,
   * and nothing in the CLI moves one. A prompt that swapped one hard-coded name for another is
   * green above and wrong here.
   */
  it("is the folder an install made before the rename still keeps", async () => {
    const installRoot = await createTempDir("summoner-legacy-");
    cleanup = () => cleanupTempDir(installRoot);

    await writeTestTsConfig(installRoot, {}, SOURCE_FOLDER_SPELLINGS[0]);

    const compiled = await summonerCompiledFor(installRoot);

    // Subject guard: the fixture really did put this install on the old layout. Without it, a
    // resolver that ignored the folder on disk would satisfy the assertion below for free.
    expect(
      sourceFolderInUse(installRoot, "claude").relName,
      "the fixture did not put this install on the folder it was written to test",
    ).toBe(SOURCE_FOLDER_SPELLINGS[0]);
    expect(
      foldersNamedIn(compiled),
      "the compiled agent-summoner names the new folder to an install that is still on the old one — the name was swapped for another literal rather than resolved",
    ).toStrictEqual([SOURCE_FOLDER_SPELLINGS[0]]);
  });
});
