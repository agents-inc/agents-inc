import { MATRIX_VERSION } from "@workspace/matrix";
import { SEED_VERSION, installableSeedPayloadSchema } from "@workspace/matrix/seed";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { configToSeedPayload } from "./config-to-seed";
import { seedToWizardResult } from "./seed-to-wizard";
import { isScopePairCompatible } from "../configuration/config-generator";
import { initializeMatrix } from "../matrix/matrix-provider";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../consts";
import { buildAgentConfigs, buildProjectConfig } from "../__tests__/factories/config-factories.js";
import { buildSeedExternalSkill } from "../__tests__/factories/seed-factories.js";
import { sa, saUnflagged } from "../__tests__/factories/skill-factories.js";
import { buildSkillConfig } from "../__tests__/helpers/wizard-simulation.js";
import { REACT_HONO_WEB_API_DOMAINS_MATRIX } from "../__tests__/mock-data/mock-matrices.js";
import { TEST_CUSTOM_SOURCE_URL } from "../__tests__/test-constants.js";
import { SKILLS } from "../__tests__/test-fixtures.js";

import type { ContentReading } from "./external-skills";

/**
 * The scope rule is replaceable here and nowhere else, so one spec can stand the mapper's own
 * catalogue-aware check down and see what the wire alone would do with the pair it was guarding.
 * Every other spec in this file runs the real rule straight through the same `vi.fn`.
 */
vi.mock("../configuration/config-generator", async (importOriginal) => {
  const original = await importOriginal<typeof import("../configuration/config-generator")>();
  return { ...original, isScopePairCompatible: vi.fn(original.isScopePairCompatible) };
});

/**
 * The inverse of `seed-to-wizard.ts`: an installed `ProjectConfig` back onto the wire, so the CLI
 * can mint an id rather than only consume one.
 *
 * The round trip is the contract these specs exist for. A payload this module mints and the
 * decoder reads back has to describe the same install — same skills at the same scopes from the
 * same origins, the same sub-agent roster with the same tuning, and the same per-agent curation.
 * Anything the config holds that the wire cannot say has to be refused by name instead, because a
 * silently thinner payload mints an id that installs a configuration nobody chose.
 */

const WEB_DEV = "web-developer";
const API_DEV = "api-developer";
const REACT_CATEGORY = "web-framework";
const HONO_CATEGORY = "api-api";
/** A marketplace that is neither `eject` nor the default public one, as its manifest names it. */
const PRIVATE_MARKETPLACE = "acme-internal";
/** A second one, for the install that reads a different marketplace than a skill came from. */
const OTHER_MARKETPLACE = "beta-internal";
/** The id an added skill is minted under at intake — outside every catalogue, by construction. */
const CARRIED_ID = "external-web-framework-brainstorming";
/** What a config records about itself: a stack's own sentence, saved at install and never its id. */
const SHARED_DESCRIPTION = "Minimal stack for E2E testing";

/**
 * An installation with no added skills: nothing to carry, and nothing it cannot carry.
 *
 * What one carries is read off the disk this mapper never touches, so it arrives as an argument.
 * Stated rather than defaulted: the whole of the defect this parameter closed was a producer that
 * forgot the content, and a default would let the next one forget it again.
 */
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

      const { result } = seedToWizardResult(
        configToSeedPayload(config, CARRIES_NOTHING),
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
      );

      // Every field the install pipeline reads, not a sample of them: a round trip that agrees
      // about the skills and drops the tuning is exactly the failure this pins.
      expect(result.skills).toStrictEqual(config.skills);
      expect(result.agentConfigs).toStrictEqual(config.agents);
      expect(result.assignedStack).toStrictEqual(config.stack);
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

      const { result } = seedToWizardResult(
        configToSeedPayload(config, CARRIES_NOTHING),
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
      );

      // Sorted rather than positional: where a skill-less sub-agent lands in the roster is not
      // part of the contract, that it is IN the roster is.
      expect([...result.selectedAgents].sort()).toStrictEqual([API_DEV, WEB_DEV]);
    });

    it("normalises an unflagged assignment to the lazy load state it already meant", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        // The shape a saved config carries for a lazy skill: the writer emits `preloaded` only
        // where it is true, so the key's absence is the user's curated lazy.
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [saUnflagged(SKILLS.react.id)] } },
      });

      const { result } = seedToWizardResult(
        configToSeedPayload(config, CARRIES_NOTHING),
        REACT_HONO_WEB_API_DOMAINS_MATRIX,
      );

      // `{ id }` and `{ id, preloaded: false }` are the same install — the writer drops a false
      // flag on the way back to disk — so this is the one place the round trip is not byte-exact,
      // and it is stated rather than asserted away.
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

      // The INSTALLABLE half, which is what the worker's POST route declares. Held against the
      // lenient one this would pass for a payload the store would refuse — and the CLI is a
      // minting client, so what it can hand over is the only question worth asking of it.
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

      // Naming an id the config never stored would make the receiver overlay a stack's own
      // preload flags over the curation this payload carries in full.
      expect(configToSeedPayload(config, CARRIES_NOTHING).stackId).toBeNull();
    });

    it("carries the description the config records, which is all a resolvable stack id supplied", () => {
      const config = buildProjectConfig({
        description: SHARED_DESCRIPTION,
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // The description and the stack's `preloaded` overlay are the only two things a resolvable
      // `stackId` did on the receiving side, and the assignments above already carry the second.
      // Carrying the first directly is what leaves nothing for the id to add.
      expect(configToSeedPayload(config, CARRIES_NOTHING).description).toBe(SHARED_DESCRIPTION);
    });

    it("leaves the description off a config that describes itself with nothing", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // Absent rather than empty, for the reason the marketplace ref is: an id is the hash of its
      // body, so a key meaning what its absence already means would remint every ordinary payload.
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

      // The REF, not the name. An id already carries whose skill it is — its marketplace's own
      // prefix — and what it cannot carry is where that marketplace is fetched from.
      expect(configToSeedPayload(config, CARRIES_NOTHING).marketplace).toBe(TEST_CUSTOM_SOURCE_URL);
    });

    it("carries the content it was handed, keyed by the same id the skill row names", () => {
      const carried = buildSeedExternalSkill();
      // A catalogue id rather than a minted one: this mapper never asks what an id resolves to —
      // the reading handed to it already did — so keying the content by a real member says the
      // same thing without casting a fabricated id into a union it is not in.
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
      });

      const payload = configToSeedPayload(config, {
        external: { [SKILLS.react.id]: carried },
        uncarryable: [],
      });

      // One map read whichever kind of skill a selection names: `skills` is still what selects,
      // and `external` is only where the bytes of the ones no catalogue resolves are.
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

      // A ref this install happens to record is not a ref the payload needs: an ejected copy
      // travels with the project and the public catalogue is what absent already means. Emitting
      // one anyway would make two identical selections mint two different ids.
      expect(configToSeedPayload(config, CARRIES_NOTHING)).not.toHaveProperty("marketplace");
    });

    it("carries no content key at all when this installation added nothing", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // Absent rather than empty, for the reason the marketplace ref is: the id is the hash of
      // the body, so an `external: {}` nobody asked for would remint every ordinary payload under
      // a new id and mean exactly what its absence already means.
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

      // A tombstone is not an install. Presence is selection on the wire, so an excluded entry
      // has nothing to say — and `--from` is greenfield, so there is no install for it to mask.
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
            // A stale row: `compile` already warns about it and drops it, so it is no part of
            // what is installed here and carrying it would share more than this project has.
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
        // No `marketplace` ref: the skill names a marketplace and nothing here says where it is.
        marketplaceName: PRIVATE_MARKETPLACE,
        skills: [
          buildSkillConfig(SKILLS.react.id, { scope: "global", origin: PRIVATE_MARKETPLACE }),
        ],
        agents: buildAgentConfigs([WEB_DEV], { scope: "global" }),
        stack: { [WEB_DEV]: { [REACT_CATEGORY]: [sa(SKILLS.react.id)] } },
      });

      // Both halves: `install: "plugin"` says nothing about WHICH marketplace, so a payload that
      // cannot name one has the receiver install a different repository's skill under the same id.
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

      // One ref for the payload, because an install reads one marketplace. A skill from a second
      // one would be fetched from the first under its own id, which is the same silent swap.
      expect(() => configToSeedPayload(config, CARRIES_NOTHING)).toThrow(
        new RegExp(`${SKILLS.react.id}[\\s\\S]*${OTHER_MARKETPLACE}`),
      );
    });

    it("refuses a sub-agent pinned to a model the contract has no word for", () => {
      const config = buildProjectConfig({
        skills: [buildSkillConfig(SKILLS.react.id, { scope: "global", origin: EJECT_SOURCE })],
        // `inherit` overrides the sub-agent's own metadata down to the parent model, which an
        // absent key does not — absence keeps the metadata's own choice.
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

      // The decoder refuses this same pair on the way in. Minting it anyway would produce an id
      // that cannot be installed, which is the one outcome a share must never have.
      //
      // The wording is asserted, not just the two names: the schema below refuses the same pair
      // and names the same two, so a test happy with either message could not tell which one
      // reached the sharer — and only this one names both remedies.
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

      // The mapper's own rule stood down, which is the drift the shared contract exists to make
      // impossible: with it gone, the only thing between this config and a minted id is the
      // schema the store's POST route declares — so that is the schema this parses against.
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

      // The reader that rebuilds an added skill from disk finds its own reasons a directory
      // cannot travel, and they belong in the same sentence as the rest: a sharer who fixes one
      // only to be refused for the next learns nothing the first message could not have told them.
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

      // A sharer who fixes one only to be refused for the next learns nothing the first message
      // could not have told them.
      expect(() => configToSeedPayload(config, CARRIES_NOTHING)).toThrow(
        new RegExp(
          `${SKILLS.react.id}[\\s\\S]*${SKILLS.hono.id}[\\s\\S]*${WEB_DEV}[\\s\\S]*inherit`,
        ),
      );
    });
  });
});
