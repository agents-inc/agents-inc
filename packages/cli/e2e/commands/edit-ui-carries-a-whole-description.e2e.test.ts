import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { cleanupTempDir, createTempDir, readTestFile, skillsPath } from "../helpers/test-utils.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  runEditUi,
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { PINNED_WIRE_VERSION, ejectedGlobalSkill } from "../fixtures/seed-wire-contract.js";
import { EXIT_CODES, FILES } from "../pages/constants.js";
import {
  UPSTREAM_SKILL_NAME,
  buildSeedExternalSkill,
  buildSeedPayload,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { firstElement } from "../../src/cli/lib/__tests__/helpers/element-at.js";
import { renderSkillMd } from "../../src/cli/lib/__tests__/content-generators.js";

import type { SeedExternalSkill } from "@workspace/matrix/seed";

/**
 * A skill added in the editor keeps its whole description through a carry-back.
 *
 * Installing a carried skill writes a `metadata.yaml` whose `cliDescription` is a SHORT label —
 * cut to the length `doctor` accepts — beside the SKILL.md that states the description whole. A
 * re-mint reads the directory back into the entry it arrived as, and the description it sends is
 * what the next receiver installs the skill with. Sent from the label, every round trip would cut
 * the skill's own description to the label's length.
 *
 * `edit --ui` is the mint that reaches it: `share` refuses an installation holding ejected skills,
 * and a carried skill is always one.
 */

/** A skill added in the editor from outside the catalogue, in a non-exclusive category. */
const EXTERNAL_ID = "external-web-tooling-systematic-debugging";
/** Longer than the label `doctor` accepts, so the install cuts the label it writes. */
const LONG_DESCRIPTION =
  "Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes";

function externalEntry(): SeedExternalSkill {
  return buildSeedExternalSkill({
    displayName: "Systematic Debugging",
    description: LONG_DESCRIPTION,
    categoryId: "web-tooling",
    repo: "obra/superpowers",
    path: "skills/systematic-debugging",
    files: { [FILES.SKILL_MD]: renderSkillMd(UPSTREAM_SKILL_NAME, LONG_DESCRIPTION) },
  });
}

/** What the store received as the mint, parsed — the body `edit --ui` posted. */
type PostedPayload = { external?: Record<string, SeedExternalSkill> };

describe("edit --ui carries an added skill's whole description", () => {
  let store: SeedConfigStore;
  let origin: string | undefined;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  afterEach(async () => {
    store.reset();
    if (origin) await cleanupTempDir(origin);
    origin = undefined;
  });

  it("sends the description its SKILL.md states, not the label the install cut", async () => {
    origin = await createTempDir();
    store.publish(
      "LongDesc1",
      buildSeedPayload({
        v: PINNED_WIRE_VERSION,
        skills: { [EXTERNAL_ID]: ejectedGlobalSkill() },
        external: { [EXTERNAL_ID]: externalEntry() },
      }),
    );
    const installed = await runInitFrom(store, "LongDesc1", { dir: origin }, E2E_SOURCE.sourceDir);
    expect(installed.exitCode, `install failed: ${installed.output}`).toBe(EXIT_CODES.SUCCESS);
    store.reset();

    // The subject guard, both halves: the label the install wrote for the wizard is cut, and the
    // skill's own manifest still states the description whole.
    const skillDir = path.join(skillsPath(origin), EXTERNAL_ID);
    expect(await readTestFile(path.join(skillDir, FILES.METADATA_YAML))).not.toContain(
      LONG_DESCRIPTION,
    );
    expect(await readTestFile(path.join(skillDir, FILES.SKILL_MD))).toContain(LONG_DESCRIPTION);

    const opened = await runEditUi(store, { dir: origin });

    expect(opened.exitCode, `edit --ui failed: ${opened.output}`).toBe(EXIT_CODES.SUCCESS);
    const posted: PostedPayload = JSON.parse(
      firstElement(store.requests.filter((request) => request.method === "POST")).body,
    );
    expect(
      posted.external?.[EXTERNAL_ID]?.description,
      "a re-mint must send the carried skill's own description, not the shortened wizard label",
    ).toBe(LONG_DESCRIPTION);
  });
});
