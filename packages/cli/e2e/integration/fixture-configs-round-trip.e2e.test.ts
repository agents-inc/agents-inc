import { describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { generateConfigSource } from "../../src/cli/lib/configuration/config-writer.js";
import { matrix } from "../../src/cli/lib/matrix/matrix-provider.js";
import { loadInstalledConfig } from "../../src/cli/lib/configuration/project-config.js";
import {
  cleanupTempDir,
  configTsPath,
  createTempDir,
  readTestFile,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { ProjectBuilder } from "../fixtures/project-builder.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { saUnflagged } from "../../src/cli/lib/__tests__/factories/skill-factories.js";

/** Declared under `web-e2e`, the category the control files it in. */
const CYPRESS_E2E_SKILL = "web-testing-cypress-e2e";

// A fixture's config must be one the CLI would write: loading and re-writing it must be byte-identical
// (the loader normalises, so a state the product refuses drifts or throws).
describe("a fixture's config survives the product's own load-then-write cycle", () => {
  it("round-trips ProjectBuilder.dualScope's two configs byte for byte", async () => {
    const { project, globalHome } = await ProjectBuilder.dualScope();

    for (const dir of [project.dir, globalHome.dir]) {
      const reread = await loadInstalledConfig(dir);
      expect(reread, `no config at ${dir}`).not.toBeNull();
      if (!reread) continue;

      const rewritten = generateConfigSource(reread.config, matrix);
      expect(
        rewritten,
        `${dir} holds a configuration the CLI would not have written — the fixture and the product disagree about it`,
      ).toBe(await readTestFile(configTsPath(dir)));
    }

    await cleanupTempDir(project.dir);
  });

  it("round-trips a config whose stack names each skill's declared category", async () => {
    const dir = await createTempDir();
    await writeProjectConfig(
      dir,
      buildProjectConfig({
        name: "declared-categories",
        skills: buildSkillConfigs([CYPRESS_E2E_SKILL], { scope: "project", origin: "eject" }),
        agents: buildAgentConfigs(["web-developer"], { scope: "project" }),
        stack: { "web-developer": { "web-e2e": [saUnflagged(CYPRESS_E2E_SKILL)] } },
      }),
    );

    const reread = await loadInstalledConfig(dir);
    expect(reread).not.toBeNull();
    if (reread)
      expect(generateConfigSource(reread.config, matrix)).toBe(
        await readTestFile(configTsPath(dir)),
      );

    await cleanupTempDir(dir);
  });
});
