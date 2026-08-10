import { realpathSync } from "fs";
import { mkdir } from "fs/promises";
import path from "path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

import "../matchers/setup.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import { EXIT_CODES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createPermissionsFile,
  createTempDir,
  ensureBinaryExists,
  readTestFile,
  renderMetadataYaml,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import {
  buildAgentConfigs,
  buildProjectConfig,
} from "../../src/cli/lib/__tests__/factories/config-factories.js";
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";

/**
 * A `compile` at the home directory fans the global config out to every
 * registered project, rewriting each project's `config.ts` from the values
 * already on that project's disk. Nothing about those values changes, so the
 * file must come back byte-for-byte identical — the invariant
 * `reference/config/config-writer.md` states as
 * "byte-identical-for-unaffected-projects", and the reason `writeIfChanged` can
 * skip a write at all.
 *
 * Running the same fan-out twice is the smallest way to state it: the second
 * run's input is the first run's own output, so a writer whose field order
 * depends on how the in-memory object was assembled — rather than on what the
 * config says — hands the user a diff on a project it never touched.
 *
 * Which assertion carries the red: the project's `config.ts` differing between
 * the two runs. The compiled-agent assertions do NOT go red before the fix — a
 * project's stack is propagated verbatim, so its agents really are unchanged
 * either way. They are here as the filesystem half of the state check, and as
 * the guard that a fix which canonicalises emission does not start churning
 * compiled agents instead.
 *
 * Everything is arranged inside the `it` rather than in a `beforeAll`: the run
 * MUTATES the project it reads, so a retry against state a previous attempt
 * already rewrote would compare a second fan-out with a third.
 */

/** The skill installed at the home directory and inherited by the project. */
const GLOBAL_SKILL = E2E_SKILL.react;

/** The skill the project owns at project scope, and the agent that carries it. */
const PROJECT_SKILL = E2E_SKILL.vitest;
const PROJECT_AGENT = E2E_AGENT["api-developer"];
const GLOBAL_AGENT = E2E_AGENT["web-developer"];

/** `source` recorded for skills a fixture installs as local copies. */
const EJECT_SOURCE = "eject";

/** The one scalar the project's own config carries; the global config carries three. */
const SHARED_AUTHOR = "@owner";

describe("a global fan-out re-emits an unaffected project's config byte-identically", () => {
  let tempDir: string | undefined;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) await cleanupTempDir(tempDir);
    tempDir = undefined;
  });

  it(
    "leaves the project's config.ts and compiled agents untouched on a second identical fan-out",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      tempDir = await createTempDir();
      const globalHome = path.join(tempDir, "home");
      const projectDir = path.join(tempDir, "registered-project");
      for (const dir of [globalHome, projectDir]) {
        await mkdir(dir, { recursive: true });
        await createPermissionsFile(dir);
      }

      // The global install: one global skill on one global agent, plus three
      // scalars. The project below carries only ONE of those scalars, so the two
      // halves of the inlined snapshot are genuinely asymmetric — which is the
      // state a first emission leaves behind, since it writes every global
      // scalar into the project's own file.
      await writeProjectConfig(
        globalHome,
        buildProjectConfig({
          name: "byte-stable-global",
          description: "Global install",
          skills: buildSkillConfigs([GLOBAL_SKILL.id], { scope: "global", source: EJECT_SOURCE }),
          agents: buildAgentConfigs([GLOBAL_AGENT.name], { scope: "global" }),
          selectedDomains: ["web"],
          stack: { [GLOBAL_AGENT.name]: { "web-framework": [{ id: GLOBAL_SKILL.id }] } },
          marketplace: "byte-stable-marketplace",
          author: SHARED_AUTHOR,
          projects: [realpathSync(projectDir)],
        }),
      );
      await createLocalSkill(globalHome, GLOBAL_SKILL.id, {
        description: "Global skill inherited by the registered project",
        metadata: renderMetadataYaml({
          displayName: GLOBAL_SKILL.display,
          category: "web-framework",
          slug: GLOBAL_SKILL.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "hash-global",
        }),
      });

      await writeProjectConfig(
        projectDir,
        buildProjectConfig({
          name: "byte-stable-project",
          skills: [
            ...buildSkillConfigs([GLOBAL_SKILL.id], { scope: "global", source: EJECT_SOURCE }),
            ...buildSkillConfigs([PROJECT_SKILL.id], { scope: "project", source: EJECT_SOURCE }),
          ],
          agents: buildAgentConfigs([PROJECT_AGENT.name], { scope: "project" }),
          stack: { [PROJECT_AGENT.name]: { "web-testing": [{ id: PROJECT_SKILL.id }] } },
          author: SHARED_AUTHOR,
        }),
      );
      await createLocalSkill(projectDir, PROJECT_SKILL.id, {
        description: "Project-owned skill compiled into the project's own agent",
        metadata: renderMetadataYaml({
          displayName: PROJECT_SKILL.display,
          category: "web-testing",
          slug: PROJECT_SKILL.slug,
          cliDescription: "E2E test skill",
          usageGuidance: "Use when testing E2E scenarios",
          contentHash: "hash-project",
        }),
      });

      const projectAgentMd = path.join(agentsPath(projectDir), `${PROJECT_AGENT.name}.md`);

      const firstRun = await CLI.run(
        ["compile"],
        { dir: globalHome },
        { env: { HOME: globalHome } },
      );
      expect(firstRun.exitCode, `First compile at HOME failed: ${firstRun.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );
      // Proof of execution: the fan-out actually reached the registered project,
      // so the comparison below is between two writer outputs and not between
      // two files nothing ever wrote.
      expect(firstRun.output, "the fan-out must have reached the registered project").toContain(
        STEP_TEXT.PROPAGATED_RECOMPILE_ONE,
      );

      const configAfterFirst = await readTestFile(configTsPath(projectDir));
      const agentAfterFirst = await readTestFile(projectAgentMd);
      expect(
        configAfterFirst,
        "the re-emitted project config must inline the global scalars",
      ).toContain(`"author": "${SHARED_AUTHOR}"`);
      expect(agentAfterFirst, "the project's own agent must carry its project skill").toContain(
        PROJECT_SKILL.id,
      );

      // Nothing changed between the runs — same configs, same skills on disk.
      const secondRun = await CLI.run(
        ["compile"],
        { dir: globalHome },
        { env: { HOME: globalHome } },
      );
      expect(secondRun.exitCode, `Second compile at HOME failed: ${secondRun.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      expect(
        await readTestFile(configTsPath(projectDir)),
        "a fan-out that changes no value must not move a byte of the project's config.ts",
      ).toBe(configAfterFirst);
      expect(
        await readTestFile(projectAgentMd),
        "a fan-out that changes no value must not rewrite the project's compiled agent",
      ).toBe(agentAfterFirst);
      expect(
        secondRun.output,
        "the second fan-out must report the project's agents as unchanged",
      ).toContain(
        `${STEP_TEXT.PROPAGATED_RECOMPILE} 0 registered projects, 1 ${STEP_TEXT.UNCHANGED}`,
      );
    },
  );
});
