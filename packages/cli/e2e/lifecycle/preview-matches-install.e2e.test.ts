import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { generateConfigSource } from "@workspace/compile/config-source";
import { generateConfigTypesSource } from "@workspace/compile/config-types-source";
import { splitConfigByScope } from "@workspace/compile/seed-to-config";

import { initGlobalWithEject, setupDualScopeWithEject } from "../fixtures/dual-scope-helpers.js";
import { E2E_STACK_AGENTS } from "../fixtures/expected-values.js";
import { E2E_SOURCE } from "../helpers/create-e2e-source.js";
import {
  cleanupTempDir,
  createTempDir,
  loadConfigOrFail,
  readCompiledAgents,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";
import { loadSkillsMatrixFromSource } from "../../src/cli/lib/loading/index.js";
import { AGENT_NAMES } from "../../src/cli/types/agents.js";
import { CORPUS_CLI_VERSION } from "@workspace/compile/corpus";
import { provenanceMarker } from "@workspace/compile/agent-source";

/**
 * The output preview is worth building only if it draws the bytes an install actually writes,
 * and there is exactly one way to know that: install, then re-render the same configuration
 * through the shared package and compare against what is on disk.
 *
 * This is the CLI's half of the emission contract. `packages/compile`'s own runner
 * (`src/contract/emission-scenarios.test.ts`) holds the renderers to a set of pinned bytes; that
 * catches a renderer that changed, and cannot catch a WRITE PATH that stopped using them —
 * a surviving private copy in `config-writer.ts`, an option the gate passes that the preview
 * does not, a canonicalisation applied on the way to disk and nowhere else. All three leave
 * the pinned scenarios green and the preview wrong.
 *
 * Both writers are exercised, because they emit materially different bytes: a global root takes
 * the standalone writer, and a project root takes the one that inlines the global entries and
 * reorders its own `export default`. A spec that installed only globally would pass while the
 * project half drew a file nobody writes.
 *
 * The matrix is loaded from the same source the install read, rather than taken from the
 * built-in catalogue. That is the point of it being a parameter: the bytes depend on category
 * declaration order and on which categories are exclusive, and an install against a marketplace
 * sees a merged catalogue the built-in one is only part of.
 */
describe("the bytes the shared renderer draws", () => {
  let globalHome: string;
  let projectDir: string;

  // Both directories are allocated per attempt rather than per file: the suite runs at
  // `retry: 1` and both are directories the run INSTALLS into, so a carried-over first attempt
  // would put the wizard on the dashboard and the timeout would be the error a reader sees
  // first.
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
      const install = await initGlobalWithEject(E2E_SOURCE, globalHome);
      expect(install.exitCode, `the global install failed: ${install.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const { matrix } = await loadSkillsMatrixFromSource({
        sourceFlag: E2E_SOURCE.sourceDir,
        projectDir: globalHome,
      });
      const config = await loadConfigOrFail(globalHome);

      const configPath = path.join(globalHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TS);
      const typesPath = path.join(globalHome, DIRS.CLAUDE_SRC, FILES.CONFIG_TYPES_TS);

      const [onDiskConfig, onDiskTypes] = await Promise.all([
        readFile(configPath, "utf8"),
        readFile(typesPath, "utf8"),
      ]);

      // Subject guard. An empty file would satisfy a comparison against a renderer that also
      // produced nothing, and the whole claim here is about bytes.
      expect(onDiskConfig.length, "the install wrote an empty config.ts").toBeGreaterThan(0);

      expect(
        generateConfigSource(config, matrix),
        "the shared renderer draws a global config.ts that differs from the one the install wrote",
      ).toStrictEqual(onDiskConfig);

      // `agentNames` and `customAgentNames` reproduce what the write path hands the types
      // writer: the CLI's OWN sub-agent roster, deliberately not the marketplace's, and no
      // custom entries because none of the shipped metadata.yaml files declares `custom`.
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
      await setupDualScopeWithEject(E2E_SOURCE, globalHome, projectDir);

      const { matrix } = await loadSkillsMatrixFromSource({
        sourceFlag: E2E_SOURCE.sourceDir,
        projectDir,
      });
      const [inlinedProjectConfig, globalConfig] = await Promise.all([
        loadConfigOrFail(projectDir),
        loadConfigOrFail(globalHome),
      ]);

      // The inlining writer's first argument is the project's SPLIT — the rows the project
      // owns — and its second is the effective global it inlines beside them:
      // `writeProjectConfigPair(projectDir, reconciledSplit, effectiveGlobal, ...)` in
      // `config-gate/propagate.ts`. What is on disk is the writer's OUTPUT, so it already
      // carries the global rows; handing that back as the split inlines every one of them a
      // second time and the comparison fails for a reason the write path cannot produce.
      // `splitConfigByScope` is the same function `config-gate/index.ts` derives the split
      // with, so this reconstructs the writer's input rather than approximating it.
      const { project: projectSplit } = splitConfigByScope(inlinedProjectConfig);

      const onDiskConfig = await readFile(
        path.join(projectDir, DIRS.CLAUDE_SRC, FILES.CONFIG_TS),
        "utf8",
      );

      // Subject guard: the inlining writer is only in play when there is a global config with
      // something in it to inline, and a global root that installed nothing would send this
      // through the standalone writer on both sides and agree for the wrong reason.
      expect(
        globalConfig.skills.map((skill) => skill.id),
        "the global root installed no skills, so nothing would be inlined and the writer under test never runs",
      ).not.toStrictEqual([]);

      // Subject guard: the split really removed the inlined global rows. A split that returned
      // the whole file would double-inline exactly as passing the loaded config did, and a
      // split that returned nothing would emit a project section the install never wrote —
      // both are silent, so the two halves are named rather than counted.
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

      // KNOWN GAP, named rather than left as an absence: the project `config-types.ts` is not
      // compared here AT ALL — not one line of it, not only its import specifier.
      //
      // The specifier is why the gap was opened. It is
      // `path.relative(<project>/.claude-src, $HOME/.claude-src)`, produced by
      // `computeGlobalTypesImportPath` — which stays in the CLI with the rest of the
      // disk-probing half and is deliberately NOT part of the shared package, because a
      // browser has no disk to probe and the preview renders a placeholder for that one line.
      // Comparing THAT line here would pin the CLI's own private function rather than
      // anything the preview can draw.
      //
      // What the gap ACTUALLY excludes is the whole file, and the rest of it is drawable. The
      // project half goes through `generateProjectConfigTypesSource`, which this suite never
      // calls — its sibling runner `packages/compile/src/contract/emission-scenarios.test.ts`
      // renders every scenario's types half with the STANDALONE
      // `generateConfigTypesSource`, including the project-root one, so neither side of the
      // bilateral contract exercises the project types writer. Every alias that writer emits
      // therefore sits inside this gap unchecked — the import block, `SkillId`, `AgentName`,
      // `SelectedAgentName`, `ProjectAgentName`, `Domain` and `Category` — and only ONE line
      // of the file, the import specifier, is a thing the preview cannot know.
      //
      // One of them was measurably wrong in the preview and this comment is why nobody saw it.
      // `SelectedAgentName` is derived by `regenerateConfigTypes` (`config-types-io.ts`) from
      // the inlined config it has just written — global rows and project rows together — while
      // the preview derived it from the project split alone, so every inherited global
      // sub-agent was missing from a union whose sibling `config.ts` still named those agents.
      // Fixed 2026-08-26 in `apps/editor/src/features/configure/lib/output-preview.ts`.
      //
      // NOTHING MECHANICALLY CHECKS THAT FIX. The two derivations still live on opposite sides
      // of the repository and can drift again in silence. Closing the gap needs one comparison
      // that runs BOTH — the preview's `projectPair` and a real install — over one
      // configuration, and neither suite can reach the other today: `buildOutputPreview` seats
      // the browser catalogue through `@/stores/catalog-store`, and this file installs from
      // the E2E fixture marketplace.
    },
  );

  it(
    "stamp the version every compiled sub-agent on disk carries",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const install = await initGlobalWithEject(E2E_SOURCE, globalHome);
      expect(install.exitCode, `the global install failed: ${install.output}`).toBe(
        EXIT_CODES.SUCCESS,
      );

      const compiled = await readCompiledAgents(globalHome);

      // `readCompiledAgents` answers `{}` for a directory that is not there, so an install that
      // compiled nothing would satisfy the loop below for free. The roster is named rather than
      // counted for the usual reason: a count cannot see a swap.
      expect(
        Object.keys(compiled).sort(),
        "the install compiled nothing, so the assertion below has no subject",
      ).toStrictEqual(E2E_STACK_AGENTS.map((name) => `${name}.md`));

      // A browser cannot read the CLI's manifest, so the preview stamps the version the corpus
      // was vendored at. If that is not the version the CLI writes, the first body line of
      // every compiled sub-agent in the preview is wrong — which is the most visible line in
      // the whole dialog.
      for (const [file, body] of Object.entries(compiled)) {
        expect(body, `${file} does not carry the version the preview would stamp`).toContain(
          provenanceMarker(CORPUS_CLI_VERSION),
        );
      }
    },
  );
});
