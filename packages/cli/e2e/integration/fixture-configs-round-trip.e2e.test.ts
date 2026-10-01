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
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { saUnflagged } from "../../src/cli/lib/__tests__/factories/skill-factories.js";

/** A skill the catalogue declares under `web-e2e`, which is the category the control files it in. */
const CYPRESS_E2E_SKILL = "web-testing-cypress-e2e";

/**
 * Every configuration a fixture writes must be one the CLI would have written.
 *
 * Rendering through `generateConfigSource` proves the FORM; this proves the CONTENT is reachable.
 * The writer emits whatever it is handed, so a fixture can still describe a state the product
 * refuses — and reading it back is what asks that question, because the loader normalises. A
 * config the CLI would have written comes back byte-identical; one it would not either DRIFTS or
 * makes the writer THROW.
 *
 * This was an env-gated diagnostic (`CONFIG_ROUNDTRIP_PROBE`) while four files failed it. They
 * filed a skill under a stack category the catalogue contradicts — `"web-testing"` for a skill
 * whose declared category is `"web-e2e"` — derived from the id's prefix, which is the derivation
 * `packages/cli/CLAUDE.md` forbids in fixtures as well as in product code. It was invisible
 * because `normalizeStackRecord` relocates the assignment on LOAD, so nothing read the key that
 * was written; and two of those relocations collided in an exclusive category, which means one
 * spec asserted a compiled sub-agent body no CLI-written configuration can produce.
 */
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

  /** The control: a fixture built from the catalogue's own categories must pass trivially. */
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
