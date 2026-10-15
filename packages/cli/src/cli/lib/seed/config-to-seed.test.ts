import { MATRIX_VERSION } from "@workspace/matrix";
import { SEED_VERSION, installableSeedPayloadSchema } from "@workspace/matrix/seed";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { configToSeedPayload } from "./config-to-seed";
import { seedToInstallSelection } from "./seed-to-selection";
import { isScopePairCompatible } from "../configuration/config-generator";
import { initializeMatrix } from "../matrix/matrix-provider";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../consts";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { buildSeedExternalSkill } from "../__tests__/factories/seed-factories.js";
import { sa, saUnflagged } from "../__tests__/factories/skill-factories.js";
import { buildSkillConfig } from "../__tests__/helpers/skill-config-builders.js";
import { REACT_HONO_WEB_API_DOMAINS_MATRIX } from "../__tests__/mock-data/mock-matrices.js";
import { TEST_CUSTOM_SOURCE_URL } from "../__tests__/test-constants.js";
import { SKILLS } from "../__tests__/test-fixtures.js";

import type { ContentReading } from "./external-skills";

/** Replaceable so one spec can stand the mapper's own check down; the rest run the real rule. */
vi.mock("../configuration/config-generator", async (importOriginal) => {
  const original = await importOriginal<typeof import("../configuration/config-generator")>();
  return { ...original, isScopePairCompatible: vi.fn(original.isScopePairCompatible) };
});

/**
 * The inverse of `seed-to-selection.ts`. A minted payload must decode to the same install, and what
 * the wire cannot say must be refused by name rather than shared thinner.
 */

const WEB_DEV = "web-developer";
const API_DEV = "api-developer";
const REACT_CATEGORY = "web-framework";
const HONO_CATEGORY = "api-api";
const PRIVATE_MARKETPLACE = "acme-internal";
const OTHER_MARKETPLACE = "beta-internal";
/** Outside every catalogue, by construction. */
const CARRIED_ID = "external-web-framework-brainstorming";
const SHARED_DESCRIPTION = "Minimal stack for E2E testing";
const PINNED_CODEX_MODEL = "gpt-5.6-terra";

/** Stated rather than defaulted, so a producer cannot forget the content. */
const CARRIES_NOTHING: ContentReading = { external: {}, uncarryable: [] };

describe("configToSeedPayload", () => {
  beforeEach(() => {
    initializeMatrix(REACT_HONO_WEB_API_DOMAINS_MATRIX);
  });

  describe("round trip against the decoder", () => {
    it("mints a payload the decoder reads back as the same install", () => {
      const config = buildProjectConfig({
        skills: [
          buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE }),
          buildSkillConfig(SKILLS.hono.id, {
            scope: "global",
            origin: DEFAULT_PUBLIC_SOURCE_NAME,
          }),
        ],
        agents: buildAgentConfigs([WEB_DEV], {
          scope: "global",
          model: "haiku",
          effort: "xhigh",
        }),
        stack: {
          [WEB_DEV]: {
            [REACT_CATEGORY]: [sa(SKILLS.react.id, true)],
            [HONO_CATEGORY]: [sa(SKILLS.hono.id)],
          },
        },
      });

      const { result } = seedToInstallSelection(
        configToSeedPayload(config, CARRIES_NOTHING),
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
      );

      // Every field the install pipeline reads, tuning included.
      expect(result.skills).toStrictEqual(config.skills);
      expect(result.agentConfigs).toStrictEqual(config.agents);
      expect(result.assignedStack).toStrictEqual(config.stack);
    });

    it("carries a sub-agent's Codex model pin there and back", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], {
          scope: "global",
          model: "haiku",
          codexModel: PINNED_CODEX_MODEL,
          effort: "xhigh",
        }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      const payload = configToSeedPayload(config, CARRIES_NOTHING);
      const { result } = seedToInstallSelection(payload, REACT_HONO_WEB_API_DOMAINS_MATRIX);

      expect(payload.agents[WEB_DEV]).toStrictEqual({
        on: true,
        scope: "global",
        model: "haiku",
        codexModel: PINNED_CODEX_MODEL,
        effort: "xhigh",
      });
      expect(result.agentConfigs).toStrictEqual(config.agents);
    });

    it("carries a sub-agent that owns no skill, which only the agents map can do", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: [
          ...buildAgentConfigs([WEB_DEV], { scope: "global" }),
          ...buildAgentConfigs([API_DEV], { scope: "global" }),
        ],
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      const { result } = seedToInstallSelection(
        configToSeedPayload(config, CARRIES_NOTHING),
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
      );

      // Sorted: a skill-less sub-agent's roster position is not part of the contract.
      expect([...result.selectedAgents].sort()).toStrictEqual([API_DEV, WEB_DEV]);
    });

    it("normalises an unflagged assignment to the lazy load state it already meant", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        // The writer emits `preloaded` only where true, so its absence is the curated lazy.
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [saUnflagged(SKILLS.react.id)] } },
      });

      const { result } = seedToInstallSelection(
        configToSeedPayload(config, CARRIES_NOTHING),
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
      );

      // `{ id }` and `{ id, preloaded: false }` are the same install: the one non-byte-exact spot.
      expect(result.assignedStack).toStrictEqual({
        [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] },
      });
    });
  });

  describe("the envelope", () => {
    it("mints a payload the store's own POST schema accepts", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // The installable schema the worker's POST declares; the CLI is a minting client.
      const parsed = installableSeedPayloadSchema.safeParse(
        configToSeedPayload(config, CARRIES_NOTHING),
      );

      expect(parsed.success).toBe(true);
      expect(parsed.data?.v).toBe(SEED_VERSION);
      expect(parsed.data?.matrixVersion).toBe(MATRIX_VERSION);
    });

    it("names no stack, because a saved config records a stack's expansion and never its id", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // An id would make the receiver overlay a stack's preload flags over this curation.
      expect(configToSeedPayload(config, CARRIES_NOTHING).stackId).toBeNull();
    });

    it("carries the description the config records, which is all a resolvable stack id supplied", () => {
      const config = buildProjectConfig({
        description: SHARED_DESCRIPTION,
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // The description was the only thing a `stackId` added that the assignments do not carry.
      expect(configToSeedPayload(config, CARRIES_NOTHING).description).toBe(SHARED_DESCRIPTION);
    });

    it("leaves the description off a config that describes itself with nothing", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // Absent rather than empty: an id is the hash of its body.
      expect(configToSeedPayload(config, CARRIES_NOTHING)).not.toHaveProperty("description");
    });

    it("names the marketplace its plugin skills are fetched from", () => {
      const config = buildProjectConfig({
        marketplace: TEST_CUSTOM_SOURCE_URL,
        marketplaceName: PRIVATE_MARKETPLACE,
        skills: [
          buildSkillConfig(SKILLS.react.id, { scope: "global", origin: PRIVATE_MARKETPLACE }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // The ref, not the name: the id's prefix already says whose skill it is.
      expect(configToSeedPayload(config, CARRIES_NOTHING).marketplace).toBe(TEST_CUSTOM_SOURCE_URL);
    });

    it("carries the content it was handed, keyed by the same id the skill row names", () => {
      const carried = buildSeedExternalSkill();
      // A catalogue id, so no fabricated id is cast into a union it is not in.
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      });

      const payload = configToSeedPayload(config, {
        external: { [SKILLS.react.id]: carried },
        uncarryable: [],
      });

      // `skills` selects; `external` only holds bytes for ids no catalogue resolves.
      expect(payload.external).toStrictEqual({ [SKILLS.react.id]: carried });
      expect(Object.keys(payload.skills)).toStrictEqual([SKILLS.react.id]);
    });

    it("names no marketplace when nothing installed here came from one", () => {
      const config = buildProjectConfig({
        marketplace: TEST_CUSTOM_SOURCE_URL,
        skills: [
          buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE }),
          buildSkillConfig(SKILLS.hono.id, {
            scope: "global",
            origin: DEFAULT_PUBLIC_SOURCE_NAME,
          }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: {
          [WEB_DEV]: {
            [REACT_CATEGORY]: [sa(SKILLS.react.id)],
            [HONO_CATEGORY]: [sa(SKILLS.hono.id)],
          },
        },
      });

      // An ejected copy travels with the project and absent means the public catalogue.
      expect(configToSeedPayload(config, CARRIES_NOTHING)).not.toHaveProperty("marketplace");
    });

    it("carries no content key at all when this installation added nothing", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // Absent rather than empty: an id is the hash of its body.
      expect(configToSeedPayload(config, CARRIES_NOTHING)).not.toHaveProperty("external");
    });
  });

  describe("what does not travel", () => {
    it("leaves an excluded skill and an excluded sub-agent at home", () => {
      const config = buildProjectConfig({
        skills: [
          buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE }),
          buildSkillConfig(SKILLS.hono.id, {
            scope: "global",
            origin: EJECT_SOURCE,
            excluded: true,
          }),
        ],
        agents: [
          ...buildAgentConfigs([WEB_DEV], { scope: "global" }),
          ...buildAgentConfigs([API_DEV], { scope: "global", excluded: true }),
        ],
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      const payload = configToSeedPayload(config, CARRIES_NOTHING);

      // A tombstone is not an install, and `--from` is greenfield.
      expect(Object.keys(payload.skills)).toStrictEqual([SKILLS.react.id]);
      expect(Object.keys(payload.agents)).toStrictEqual([WEB_DEV]);
    });

    it("drops a stack row naming a skill this configuration does not install", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: {
          [WEB_DEV]: {
            [REACT_CATEGORY]: [sa(SKILLS.react.id)],
            // A stale row `compile` already drops.
            [HONO_CATEGORY]: [sa(SKILLS.hono.id)],
          },
        },
      });

      const payload = configToSeedPayload(config, CARRIES_NOTHING);

      expect(Object.keys(payload.skills)).toStrictEqual([SKILLS.react.id]);
      expect(payload.skills[SKILLS.react.id]?.assignments).toStrictEqual({ [WEB_DEV]: "lazy" });
    });

    it("drops a stack row naming a sub-agent this configuration does not install", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: {
          [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] },
          [API_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] },
        },
      });

      const payload = configToSeedPayload(config, CARRIES_NOTHING);

      expect(payload.skills[SKILLS.react.id]?.assignments).toStrictEqual({ [WEB_DEV]: "lazy" });
      expect(Object.keys(payload.agents)).toStrictEqual([WEB_DEV]);
    });
  });

  describe("refusing what the contract cannot say", () => {
    it("refuses a skill from a marketplace this installation records no location for", () => {
      const config = buildProjectConfig({
        // No `marketplace` ref, so nothing says where the skill's marketplace is.
        marketplaceName: PRIVATE_MARKETPLACE,
        skills: [
          buildSkillConfig(SKILLS.react.id, { scope: "global", origin: PRIVATE_MARKETPLACE }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // `install: "plugin"` alone would install a different repository's skill under the same id.
      expect(() => configToSeedPayload(config, CARRIES_NOTHING)).toThrow(
        new RegExp(`${SKILLS.react.id}[\\s\\S]*${PRIVATE_MARKETPLACE}`),
      );
    });

    it("refuses a skill from a marketplace other than the one this installation reads", () => {
      const config = buildProjectConfig({
        marketplace: TEST_CUSTOM_SOURCE_URL,
        marketplaceName: PRIVATE_MARKETPLACE,
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: OTHER_MARKETPLACE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // An install reads one marketplace, so a second one's skill would be silently swapped.
      expect(() => configToSeedPayload(config, CARRIES_NOTHING)).toThrow(
        new RegExp(`${SKILLS.react.id}[\\s\\S]*${OTHER_MARKETPLACE}`),
      );
    });

    it("refuses a sub-agent pinned to a model the contract has no word for", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        // `inherit` differs from absence, which keeps the metadata's own choice.
        agents: buildAgentConfigs([WEB_DEV], { scope: "global", model: "inherit" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      expect(() => configToSeedPayload(config, CARRIES_NOTHING)).toThrow(
        new RegExp(`${WEB_DEV}[\\s\\S]*inherit`),
      );
    });

    it("refuses a project-scoped skill assigned to a sub-agent at global scope", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "project", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // The decoder refuses this pair, so minting it would produce an uninstallable id. The wording
      // is asserted: the schema names the same two, but only this message names both remedies.
      expect(() => configToSeedPayload(config, CARRIES_NOTHING)).toThrow(
        new RegExp(
          `cannot be shared as it stands[\\s\\S]*` +
            `${SKILLS.react.id} -> ${WEB_DEV}: a project-scoped skill never reaches`,
        ),
      );
    });

    it("refuses the pair on the wire's own terms when the catalogue-aware rule stops seeing it", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "project", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // With the mapper's rule stood down, the store's installable schema is the last guard.
      vi.mocked(isScopePairCompatible).mockReturnValueOnce(true);

      expect(() => configToSeedPayload(config, CARRIES_NOTHING)).toThrow(
        new RegExp(`"${SKILLS.react.id}"[\\s\\S]*"assignments"[\\s\\S]*"${WEB_DEV}"`),
      );
    });

    it("names content this installation cannot carry beside everything else it cannot say", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global", model: "inherit" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // The reader's own reasons share the sentence, so one message names everything.
      expect(() =>
        configToSeedPayload(config, {
          external: {},
          uncarryable: [`${CARRIED_ID} travels inside a shared configuration, and it is too big`],
        }),
      ).toThrow(new RegExp(`${WEB_DEV}[\\s\\S]*inherit[\\s\\S]*${CARRIED_ID}`));
    });

    it("names every unshareable thing at once, not just the first", () => {
      const config = buildProjectConfig({
        skills: [
          buildSkillConfig(SKILLS.react.id, { scope: "global", origin: PRIVATE_MARKETPLACE }),
          buildSkillConfig(SKILLS.hono.id, { scope: "global", origin: PRIVATE_MARKETPLACE }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global", model: "inherit" }),
        stack: {
          [WEB_DEV]: {
            [REACT_CATEGORY]: [sa(SKILLS.react.id)],
            [HONO_CATEGORY]: [sa(SKILLS.hono.id)],
          },
        },
      });

      expect(() => configToSeedPayload(config, CARRIES_NOTHING)).toThrow(
        new RegExp(
          `${SKILLS.react.id}[\\s\\S]*${SKILLS.hono.id}[\\s\\S]*${WEB_DEV}[\\s\\S]*inherit`,
        ),
      );
    });
  });
});
