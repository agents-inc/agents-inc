import path from "path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import {
  E2E_MARKETPLACE_NAME,
  E2E_SKILL,
  E2E_SKILL_IDS,
  e2eSkillId,
} from "../fixtures/expected-values.js";
import { cleanupFixture, ensureBinaryExists, readMarketplaceJson } from "../helpers/test-utils.js";
import { E2E_MARKETPLACE_PREFIX, FILES, SOURCE_PATHS, TIMEOUTS } from "../pages/constants.js";
import { DEFAULT_PUBLIC_SOURCE_NAME } from "../../src/cli/consts.js";
import { validateKebabCaseName } from "../../src/cli/lib/validate-kebab-name.js";

/**
 * The identity an E2E fixture marketplace publishes under, and the namespace its
 * skill ids are built in.
 *
 * A marketplace's name and its skills' id prefix are the same string, so the name
 * cannot vary per run: a timestamped one makes every id unassertable and every
 * fixture's published identity unnameable. Nothing pinned that before this spec —
 * every assertion on the published name read the value back off the fixture object,
 * which a timestamp satisfies as readily as a constant.
 *
 * The three constant-only checks are the contract the name has with surfaces that
 * cannot see it: the stale-registration sweep in `e2e/global-setup.ts`, the public
 * catalogue whose namespace a fixture must never claim, and `build marketplace`'s
 * own name validator.
 */

describe("E2E fixture marketplace namespace", () => {
  describe("the name the fixtures publish under", () => {
    it("carries the prefix the stale-registration sweep matches", () => {
      expect(
        E2E_MARKETPLACE_NAME.startsWith(E2E_MARKETPLACE_PREFIX),
        "global-setup removes stale Claude registrations by this prefix — a name outside it leaks",
      ).toBe(true);
    });

    it("is not the public marketplace's own name", () => {
      expect(
        E2E_MARKETPLACE_NAME,
        "the public catalogue owns its namespace; a fixture claiming it collides with every catalogue id",
      ).not.toBe(DEFAULT_PUBLIC_SOURCE_NAME);
    });

    it("is a name build marketplace accepts", () => {
      expect(validateKebabCaseName(E2E_MARKETPLACE_NAME, "Marketplace")).toBeNull();
    });
  });

  describe("the id builder", () => {
    it("composes a bare id into the fixture marketplace's namespace", () => {
      expect(e2eSkillId(E2E_SKILL.react.slug)).toBe(
        `${E2E_MARKETPLACE_NAME}-${E2E_SKILL.react.slug}`,
      );
    });
  });

  describe("a published fixture", () => {
    let fixture: E2EPluginSource;

    beforeAll(async () => {
      await ensureBinaryExists();
      fixture = await createE2EPluginSource();
    }, TIMEOUTS.SETUP);

    afterAll(async () => {
      await cleanupFixture(fixture);
    });

    it("publishes under the shared name rather than a per-run one", () => {
      expect(fixture.marketplaceName).toBe(E2E_MARKETPLACE_NAME);
    });

    it("writes that name into the marketplace it generates", async () => {
      const marketplace = await readMarketplaceJson(
        path.join(fixture.sourceDir, SOURCE_PATHS.PLUGIN_MANIFEST_DIR, FILES.MARKETPLACE_JSON),
      );
      expect(marketplace.name).toBe(E2E_MARKETPLACE_NAME);
      expect(
        marketplace.plugins.map((plugin) => plugin.name).sort(),
        "the published marketplace must list every skill the fixture ships",
      ).toStrictEqual([...E2E_SKILL_IDS].sort());
    });
  });
});
