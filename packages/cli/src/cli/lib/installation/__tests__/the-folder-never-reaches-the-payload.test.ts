/**
 * The folder an installation is read out of never reaches what `share` posts.
 *
 * Step C2 of `todo/plans/CLI-codex-provider-plan.md` rules that the provider comes from the
 * folder on disk and from `--provider` on `init --from`, and from nowhere else — *"not from
 * `config.ts`, not from the payload, not from the share id"*. That third exclusion is what keeps
 * every share id ever minted installable on either provider, and it is the one an assertion can
 * hold: a payload that carried a provider would make one folder's share id refuse to install into
 * the other.
 *
 * **The plan names this spec as the replacement for a test it deleted.** "config-to-seed of a
 * Codex config equals the Claude one" was about a `target` field ruling 1 removed before it was
 * ever written; what survives is the property that field would have broken, stated over the two
 * FOLDERS instead: *"sharing from either folder gives identical payload bytes"*.
 *
 * **Bytes rather than a deep comparison.** A provider that reached the payload would arrive as a
 * key, and a key whose value is `undefined` is invisible to a deep equality on both sides.
 * `JSON.stringify` is what the CLI actually posts, so comparing what it produces is comparing
 * what a share id is minted from.
 *
 * **Why it lives beside the layout and not beside the mapper.** The claim is about the layout not
 * leaking, and the mapper is the instrument: `config-to-seed.test.ts` is about what the wire can
 * and cannot say, and would have no reason to plant two folders. The two installations are one
 * root's two folders rather than two roots, so nothing about the DIRECTORY differs either — a
 * loader that defaults a missing `name` to the directory's would otherwise supply a difference
 * this spec would then have to excuse.
 *
 * Each folder is read with its provider named outright, through `loadProjectConfigFromDir`, which
 * is the door a caller that knows which installation it wants uses. `providerInUse` is not that
 * door and is not asked here: what a root holding a Codex folder resolves to is
 * `a-codex-folder-resolves-onto-the-codex-host.test.ts`'s subject.
 *
 * The folder names are literals for the reason `install-layout.test.ts` states: they are text on
 * people's disks, and an assertion importing the constant the product joins could never fail.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { buildSkillConfig } from "../../__tests__/helpers/wizard-simulation.js";
import { REACT_HONO_WEB_API_DOMAINS_MATRIX } from "../../__tests__/mock-data/mock-matrices.js";
import { cleanupTempDir, createTempDir } from "../../__tests__/test-fs-utils.js";
import { SKILLS } from "../../__tests__/test-fixtures.js";
import { loadProjectConfigFromDir } from "../../configuration/project-config.js";
import { initializeMatrix } from "../../matrix/matrix-provider.js";
import { configToSeedPayload } from "../../seed/config-to-seed.js";
import { DEFAULT_PUBLIC_SOURCE_NAME, EJECT_SOURCE } from "../../../consts.js";
import type { Provider } from "../../../consts.js";
import type { ProjectConfig } from "../../../types/index.js";
import type { ContentReading } from "../../seed/external-skills.js";
import type { SeedPayload } from "@workspace/matrix/seed";

/** The new layout, per provider, as it is written on disk and shown to a user. */
const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

/** An installation with no added skills: nothing to carry, and nothing it cannot carry. */
const CARRIES_NOTHING: ContentReading = { external: {}, uncarryable: [] };

const WEB_DEVELOPER = "web-developer";

describe("sharing an installation", () => {
  let root: string;

  beforeEach(async () => {
    initializeMatrix(REACT_HONO_WEB_API_DOMAINS_MATRIX);
    root = await createTempDir("cc-share-from-either-folder-");
  });

  afterEach(async () => {
    await cleanupTempDir(root);
  });

  /**
   * The configuration both folders hold, byte for byte. One skill from a marketplace and one
   * ejected, so the payload carries an origin per skill rather than one constant, and a sub-agent
   * so its roster is not empty either.
   */
  function sharedInstallation(): ProjectConfig {
    return buildProjectConfig({
      name: "shared-installation",
      skills: [
        buildSkillConfig(SKILLS.react.id, {
          scope: "global",
          origin: DEFAULT_PUBLIC_SOURCE_NAME,
        }),
        buildSkillConfig(SKILLS.hono.id, { scope: "project", origin: EJECT_SOURCE }),
      ],
      agents: buildAgentConfigs([WEB_DEVELOPER], { scope: "global" }),
    });
  }

  /** The installation in `provider`'s folder, read with that provider named outright. */
  async function payloadFrom(provider: Provider): Promise<SeedPayload> {
    const loaded = await loadProjectConfigFromDir(root, provider);
    if (loaded === null) throw new Error(`no installation was planted for ${provider}`);
    return configToSeedPayload(loaded.config, CARRIES_NOTHING);
  }

  it("posts the same bytes whichever provider's folder it was read out of", async () => {
    await writeTestTsConfig(root, sharedInstallation(), CLAUDE_SOURCE_REL);
    await writeTestTsConfig(root, sharedInstallation(), CODEX_SOURCE_REL);

    expect(
      JSON.stringify(await payloadFrom("codex")),
      "the folder is the only record of a provider and it must stay that way — a payload that carried one would make a share id refuse to install on the other provider",
    ).toStrictEqual(JSON.stringify(await payloadFrom("claude")));
  });

  /**
   * The control the comparison needs. Two reads that both answered the same EMPTY thing would
   * satisfy it for free, and a mapper that had stopped reading the config would answer exactly
   * that — so the payload is required to describe the installation that was planted.
   */
  it("posts a payload that describes the installation, so the comparison has a subject", async () => {
    await writeTestTsConfig(root, sharedInstallation(), CLAUDE_SOURCE_REL);

    expect(Object.keys((await payloadFrom("claude")).skills).sort()).toStrictEqual(
      [SKILLS.hono.id, SKILLS.react.id].sort(),
    );
  });
});
