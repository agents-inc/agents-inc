import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { generateConfigSource } from "@workspace/compile/config-source";
import { generateConfigTypesSource } from "@workspace/compile/config-types-source";
import { splitConfigByScope } from "@workspace/compile/seed-to-config";

import { installE2EStackDualScope, installE2EStackGlobally } from "../fixtures/e2e-stack-seed.js";
import { E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createTempDir,
  loadConfigOrFail,
  readCompiledAgents,
  sourceFolderIn,
} from "../helpers/test-utils.js";
import { FILES, TIMEOUTS } from "../pages/constants.js";
import { loadSkillsMatrixFromSource } from "../../src/cli/lib/loading/index.js";
import { AGENT_NAMES } from "../../src/cli/types/agents.js";
import { CORPUS_CLI_VERSION } from "@workspace/compile/corpus";
import { provenanceMarker } from "@workspace/compile/agent-source";

/**
 * The matrix is loaded from the source the install read, since the bytes depend on its categories.
 *
 * KNOWN GAP: nothing here builds the `AgentConfig` a compiled agent's body renders from; the
 * install (`resolveAgents`) and the preview (`compileAgents`) construct it independently.
 */
describe("the bytes the shared renderer draws", () => {
  let store: SeedConfigStore;
  let globalHome: string;
  let projectDir: string;

  beforeAll(async () => {
    store = await startSeedConfigStore();
  });

  afterAll(async () => {
    await store.close();
  });

  // Per attempt, not per file: under `retry: 1` a first attempt's install would be installed over.
  beforeEach(async () => {
    globalHome = await createTempDir();
    projectDir = await createTempDir();
  });

  afterEach(async () => {
    await Promise.all([globalHome, projectDir].map(cleanupTempDir));
  });

  it(
    "are the bytes a global install has on disk",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      await installE2EStackGlobally(store, globalHome);

      const { matrix } = await loadSkillsMatrixFromSource({
        sourceFlag: E2E_SOURCE.sourceDir,
        projectDir: globalHome,
      });
      const config = await loadConfigOrFail(globalHome);

      const configPath = path.join(sourceFolderIn(globalHome), FILES.CONFIG_TS);
      const typesPath = path.join(sourceFolderIn(globalHome), FILES.CONFIG_TYPES_TS);

      const [onDiskConfig, onDiskTypes] = await Promise.all([
        readFile(configPath, "utf8"),
        readFile(typesPath, "utf8"),
      ]);

      expect(onDiskConfig.length, "the install wrote an empty config.ts").toBeGreaterThan(0);

      expect(
        generateConfigSource(config, matrix),
        "the shared renderer draws a global config.ts that differs from the one the install wrote",
      ).toStrictEqual(onDiskConfig);

      // The CLI's own sub-agent roster, not the marketplace's, and no custom entries: none of the
      // shipped metadata.yaml files declares `custom`.
      expect(
        generateConfigTypesSource(matrix, [...AGENT_NAMES], [], undefined, config),
        "the shared renderer draws a global config-types.ts that differs from the one the install wrote",
      ).toStrictEqual(onDiskTypes);
    },
  );

  it(
    "are the bytes a project install has on disk, through the inlining writer",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      await installE2EStackDualScope(store, { fakeHome: globalHome, projectDir });

      const { matrix } = await loadSkillsMatrixFromSource({
        sourceFlag: E2E_SOURCE.sourceDir,
        projectDir,
      });
      const [inlinedProjectConfig, globalConfig] = await Promise.all([
        loadConfigOrFail(projectDir),
        loadConfigOrFail(globalHome),
      ]);

      // The writer's input is the project's split plus the effective global; the on-disk file is
      // its output, so passing it back as the split would inline the global rows twice.
      const { project: projectSplit } = splitConfigByScope(inlinedProjectConfig);

      const onDiskConfig = await readFile(
        path.join(sourceFolderIn(projectDir), FILES.CONFIG_TS),
        "utf8",
      );

      expect(
        globalConfig.skills.map((skill) => skill.id),
        "the global root installed no skills, so nothing would be inlined and the writer under test never runs",
      ).not.toStrictEqual([]);

      expect(
        projectSplit.skills.map((skill) => skill.id),
        "splitting the project config off disk left it holding every row, so it is still the writer's output rather than its input",
      ).not.toStrictEqual(inlinedProjectConfig.skills.map((skill) => skill.id));
      expect(
        projectSplit.skills.map((skill) => skill.id),
        "splitting the project config off disk left nothing the project owns, so the project section under test is empty",
      ).not.toStrictEqual([]);

      expect(
        generateConfigSource(projectSplit, matrix, { isProjectConfig: true, globalConfig }),
        "the shared renderer draws a project config.ts that differs from the one the install wrote",
      ).toStrictEqual(onDiskConfig);

      // KNOWN GAP: the project `config-types.ts` is not compared at all. Only its import specifier
      // (from the CLI-only `computeGlobalTypesImportPath`) is undrawable by the preview; the rest,
      // `SelectedAgentName` included, can drift between preview and install unchecked.
    },
  );

  it(
    "stamp the version every compiled sub-agent on disk carries",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      await installE2EStackGlobally(store, globalHome);

      const compiled = await readCompiledAgents(globalHome);

      // `readCompiledAgents` answers `{}` for a missing directory, so name the roster.
      expect(
        Object.keys(compiled).sort(),
        "the install compiled nothing, so the assertion below has no subject",
      ).toStrictEqual(E2E_STACK_AGENTS.map((name) => `${name}.md`));

      // `provenanceMarker()` is version-free, so it only proves this CLI wrote the file. The
      // version is in the `Compiled by` line, where the preview stamps `CORPUS_CLI_VERSION`.
      for (const [file, body] of Object.entries(compiled)) {
        expect(body, `${file} does not carry this CLI's own provenance marker`).toContain(
          provenanceMarker(),
        );
        expect(
          body,
          `${file} stamps a version other than CORPUS_CLI_VERSION, so the preview's vendored corpus has drifted from this CLI's own version`,
        ).toContain(`Compiled by ${CORPUS_CLI_VERSION}.`);
      }
    },
  );
});
