/**
 * Sharing from either provider's folder posts identical payload bytes, so a share id installs on
 * either provider. Compared as `JSON.stringify` output, since an `undefined` key is invisible to a
 * deep equality.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../__tests__/factories/config-factories.js";
import { writeTestTsConfig } from "../../__tests__/helpers/config-io.js";
import { buildSkillConfig } from "../../__tests__/helpers/skill-config-builders.js";
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

const CLAUDE_SOURCE_REL = ".agents-inc/claude";
const CODEX_SOURCE_REL = ".agents-inc/codex";

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

  it("posts a payload that describes the installation, so the comparison has a subject", async () => {
    await writeTestTsConfig(root, sharedInstallation(), CLAUDE_SOURCE_REL);

    expect(Object.keys((await payloadFrom("claude")).skills).sort()).toStrictEqual(
      [SKILLS.hono.id, SKILLS.react.id].sort(),
    );
  });
});
