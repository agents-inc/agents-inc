import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AGENT_NAMES } from "../../types/agents.js";
import { typedKeys } from "../../utils/typed-object.js";
import { bytewise } from "../../utils/string.js";
import { loadMergedAgents } from "../loading/index.js";
import { loadAgentDefs } from "../operations/project/load-agent-defs.js";
import {
  cleanupTestSource,
  createTestSource,
  type TestDirs,
} from "./fixtures/create-test-source.js";
import { DEFAULT_TEST_AGENTS } from "./mock-data/mock-agents.js";
import type { AgentName } from "../../types/index.js";

/** Deliberately not cast to `AgentName`: that union is generated from the CLI's own agents only. */
const MARKETPLACE_ONLY_AGENT = "fixture-marketplace-only-agent";

/** Names only: definitions differ between CLI and marketplace agents; only names reach a union. */
function rosterOf(agents: Partial<Record<AgentName, unknown>>): string[] {
  return typedKeys(agents).sort(bytewise);
}

/**
 * Every producer of the sub-agent unions in `config-types.ts` derives its roster from
 * `loadAgentDefs`, which is CLI-only: partials resolve under the CLI, so a marketplace name could
 * not compile. `config-types-producers-name-one-loader.test.ts` rosters the producers.
 */
describe("every producer of the sub-agent unions in config-types.ts", () => {
  let source: TestDirs;

  beforeAll(async () => {
    source = await createTestSource({
      agents: [
        ...DEFAULT_TEST_AGENTS,
        {
          name: MARKETPLACE_ONLY_AGENT,
          title: "Fixture Marketplace Agent",
          description: "A sub-agent only this marketplace declares",
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanupTestSource(source);
  });

  describe("the one function", () => {
    it("answers CLI-only, so nothing it names is outside AGENT_NAMES", async () => {
      const { agents } = await loadAgentDefs();

      expect(rosterOf(agents)).toStrictEqual([...AGENT_NAMES].sort(bytewise));
    });

    it("leaves out a sub-agent only the marketplace declares", async () => {
      const { agents } = await loadAgentDefs();

      expect(rosterOf(agents)).not.toContain(MARKETPLACE_ONLY_AGENT);
    });
  });

  /**
   * The control: the fixture ships a marketplace agent, the other answer carries it, and it is
   * outside `AgentName`. Without this the assertions above pass on an empty fixture.
   */
  describe("the answer the aligned producers no longer take", () => {
    it("carries the marketplace's own sub-agent", async () => {
      const merged = await loadMergedAgents(source.sourceDir);

      expect(rosterOf(merged)).toContain(MARKETPLACE_ONLY_AGENT);
    });

    it("names a sub-agent AGENT_NAMES does not, which is what makes it uncompilable", () => {
      expect(
        (AGENT_NAMES as readonly string[]).includes(MARKETPLACE_ONLY_AGENT),
        "the generated roster is built from the CLI's own src/agents/ — a marketplace name is not in it",
      ).toBe(false);
    });
  });
});
