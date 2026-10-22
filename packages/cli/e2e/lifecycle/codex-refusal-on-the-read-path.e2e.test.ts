import path from "path";
import { afterEach, describe, expect, it } from "vitest";

import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  CODEX_OFFERED_CELLS,
  CODEX_REFUSED_CELL,
  codexProjectSkillsDir,
} from "../fixtures/codex-install.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupTempDir,
  createLocalSkillIn,
  directoryExists,
  flattenCliOutput,
  renderMetadataYaml,
  writeProjectConfigIn,
} from "../helpers/test-utils.js";
import { buildProjectConfig } from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/skill-config-builders.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";

/**
 * Refused where a configuration is READ, since a Codex folder can be made with `cp`. Each refusal
 * pairs with an offerable Codex configuration that compiles, and the same placement accepted on
 * Claude.
 */

const CONFIG_NAME = "read-path-refusal";

/**
 * Every command that acts on a configuration it did not just write. `doctor` has its own pair
 * below; `uninstall` is exempt, or an unofferable installation would be unremovable. `share` runs
 * without `--stdin`, which reads no directory. Exit codes are "not success": `edit` and `update`
 * reach the refusal through different endings.
 */
const READERS_THAT_REFUSE = [
  { label: "compile", argv: ["compile"] },
  { label: "edit", argv: ["edit"] },
  { label: "update", argv: ["update"] },
  { label: "share", argv: ["share"] },
] as const;

/** Any non-`eject` origin makes a plugin row; the refusal fires before any marketplace resolves. */
const A_MARKETPLACE = "agents-inc";

/**
 * Port 1 on loopback refuses instantly. `CLI.run` clears `AGENTS_INC_API_URL`, so without this a
 * `share` that stopped refusing would reach the real store.
 */
const NOWHERE = "http://127.0.0.1:1";

const EJECTED_SKILL = {
  category: "web-framework",
  description: "React framework",
  contentHash: "e2e-hash-read-path-react",
} as const;

describe("an unofferable placement in a Codex folder", () => {
  let env: TestEnvironment | undefined;

  afterEach(async () => {
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  async function plantAnUnofferablePlacement(target: TestEnvironment): Promise<void> {
    await writeProjectConfigIn(
      target.projectDir,
      DIRS.SOURCE_CODEX,
      buildProjectConfig({
        name: CONFIG_NAME,
        skills: buildSkillConfigs([E2E_SKILL.react.id], {
          scope: "project",
          origin: A_MARKETPLACE,
        }),
        agents: [],
      }),
    );
  }

  it.each(READERS_THAT_REFUSE)(
    "is refused when $label READS it, naming the three cells Codex does offer",
    async ({ argv }) => {
      env = await createTestEnvironment({ permissions: false });
      await plantAnUnofferablePlacement(env);

      const run = await CLI.run(
        [...argv],
        { dir: env.projectDir, globalHome: env.fakeHome },
        { env: { AGENTS_INC_API_URL: NOWHERE } },
      );
      const said = flattenCliOutput(run.output);

      expect(run.exitCode, said).not.toBe(EXIT_CODES.SUCCESS);
      expect(said).toContain(E2E_SKILL.react.id);
      expect(said).toContain(CODEX_REFUSED_CELL);
      for (const cell of CODEX_OFFERED_CELLS) expect(said).toContain(cell);

      expect(await directoryExists(path.join(env.projectDir, DIRS.CODEX, DIRS.AGENTS))).toBe(false);
      expect(await directoryExists(path.join(env.projectDir, DIRS.CLAUDE))).toBe(false);
    },
  );

  it("is a doctor ROW rather than a stop, and the rows after it still run", async () => {
    env = await createTestEnvironment({ permissions: false });
    await plantAnUnofferablePlacement(env);

    const examined = await CLI.run(["doctor"], {
      dir: env.projectDir,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(examined.output);

    expect(said).toContain(STEP_TEXT.DOCTOR_ROW_PLACEMENTS);
    expect(said).toContain(CODEX_REFUSED_CELL);
    for (const cell of CODEX_OFFERED_CELLS) expect(said).toContain(cell);

    expect(said).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED);
    expect(said).toContain(STEP_TEXT.DOCTOR_SUMMARY);
  });

  /**
   * The control needs something to compile: an empty config reads as no installation, and an
   * eject skill not on disk fails `No skills found`. So the skill is planted where Codex reads it,
   * `<repo>/.agents/skills/`, not `.claude/skills/`.
   */
  it("does not stop compile reading an offerable Codex configuration in the same folder", async () => {
    env = await createTestEnvironment({ permissions: false });
    await writeProjectConfigIn(
      env.projectDir,
      DIRS.SOURCE_CODEX,
      buildProjectConfig({
        name: CONFIG_NAME,
        skills: buildSkillConfigs([E2E_SKILL.react.id], {
          scope: "project",
          origin: "eject",
        }),
        agents: [],
      }),
    );
    await createLocalSkillIn(codexProjectSkillsDir(env.projectDir), E2E_SKILL.react.id, {
      description: EJECTED_SKILL.description,
      metadata: renderMetadataYaml({
        displayName: E2E_SKILL.react.display,
        category: EJECTED_SKILL.category,
        slug: E2E_SKILL.react.slug,
        contentHash: EJECTED_SKILL.contentHash,
      }),
    });

    const compiled = await CLI.run(["compile"], {
      dir: env.projectDir,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(compiled.output);

    expect(compiled.exitCode, said).toBe(EXIT_CODES.SUCCESS);
    expect(said).not.toContain(CODEX_REFUSED_CELL);

    // The wording is owned by codex-compile-reports-what-it-cannot-express.
    expect(said.toLowerCase()).toContain("codex");
    // No sub-agent is declared, so no role file is owed.
    expect(await directoryExists(path.join(env.projectDir, DIRS.CODEX, DIRS.AGENTS))).toBe(false);
    expect(await directoryExists(path.join(env.projectDir, DIRS.CLAUDE))).toBe(false);
  });

  it("is not refused for its placement on Claude, where the cell exists", async () => {
    env = await createTestEnvironment({ permissions: false });
    await writeProjectConfigIn(
      env.projectDir,
      DIRS.SOURCE_CLAUDE,
      buildProjectConfig({
        name: CONFIG_NAME,
        skills: buildSkillConfigs([E2E_SKILL.react.id], {
          scope: "project",
          origin: A_MARKETPLACE,
        }),
        agents: [],
      }),
    );

    const compiled = await CLI.run(["compile"], {
      dir: env.projectDir,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(compiled.output);

    // Success is not the claim; only that nothing refuses it for where it asked to be placed.
    expect(said).not.toContain(CODEX_REFUSED_CELL);
    for (const cell of CODEX_OFFERED_CELLS) expect(said).not.toContain(cell);
  });
});
