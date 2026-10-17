import path from "path";
import { readFile, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import { e2eStackPayload, installFromSeed } from "../fixtures/e2e-stack-seed.js";
import { startSeedConfigStore, type SeedConfigStore } from "../fixtures/seed-config-store.js";
import {
  cleanupTempDir,
  configTsPath,
  configTypesTsPath,
  fileExists,
  getEjectedTemplatePath,
  readCompiledAgents,
  readTestFile,
  sourceFolderIn,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import "../matchers/setup.js";

// An ejected customisation must survive the next compile on a real `init --from` installation, with
// config.ts byte-identical and config-types.ts still narrowing afterwards.

/** A string nothing else in the pipeline emits. */
const CUSTOM_TEMPLATE_MARKER = "<!-- e2e-ejected-template-customisation -->";

const CUSTOM_IDENTITY_MARKER = "e2e-ejected-identity-customisation";

const EJECTED_PARTIAL_CATEGORY = "developer";

const GENERATED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

describe("ejected customisations survive a recompile", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  /** HOME === cwd, so install, ejected copy and recompile all address one directory. */
  async function installAtHome(): Promise<string> {
    env = await createTestEnvironment();
    const home = env.fakeHome;
    await installFromSeed(
      store,
      "EjectHome1",
      e2eStackPayload(),
      { dir: home, home },
      source.sourceDir,
    );
    return home;
  }

  it(
    "compiles every agent through an edited ejected template without touching the configuration",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const installDir = await installAtHome();

      const beforeEject = await readCompiledAgents(installDir);
      expect(
        Object.keys(beforeEject).length,
        "the install must have compiled agents, or the marker assertions below are vacuous",
      ).toBeGreaterThan(0);
      for (const [file, content] of Object.entries(beforeEject)) {
        expect(
          content,
          `${file} already carried the marker before any customisation`,
        ).not.toContain(CUSTOM_TEMPLATE_MARKER);
      }
      const configBefore = await readTestFile(configTsPath(installDir));

      const eject = await CLI.run(["eject", "templates"], { dir: installDir });
      expect(eject.exitCode, eject.output).toBe(EXIT_CODES.SUCCESS);
      expect(eject.output).toContain(STEP_TEXT.EJECT_SUCCESS);
      await expect({ dir: installDir }).toHaveEjectedTemplate();

      const templatePath = getEjectedTemplatePath(installDir);
      await writeFile(
        templatePath,
        `${await readFile(templatePath, "utf-8")}\n${CUSTOM_TEMPLATE_MARKER}\n`,
      );

      const compile = await CLI.run(["compile"], { dir: installDir });
      expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
      expect(compile.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

      const afterCompile = await readCompiledAgents(installDir);
      expect(Object.keys(afterCompile).sort()).toStrictEqual(Object.keys(beforeEject).sort());
      for (const [file, content] of Object.entries(afterCompile)) {
        expect(content, `${file} was not rendered through the ejected template`).toContain(
          CUSTOM_TEMPLATE_MARKER,
        );
      }

      expect(
        await readTestFile(configTsPath(installDir)),
        "customising the template must leave config.ts byte-identical",
      ).toBe(configBefore);

      const sourceFolder = path.dirname(configTypesTsPath(installDir));
      const typecheck = await typecheckGeneratedConfig(sourceFolder);
      expect(
        typecheck.exitCode,
        `config.ts must still type-check after the customised compile.\ntsc output:\n${typecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      const probe = await probeConfigTypesNarrowing(sourceFolder, GENERATED_ALIASES);
      expect(
        probe.exitCode,
        `a bogus literal must not type-check after the customised compile.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(probe.output).toContain(TS_NOT_ASSIGNABLE);
      // Each alias, since one rejecting can mask others collapsed to `string`.
      expect(
        probe.rejected,
        `every generated alias must still reject its bogus literal after the customised compile.\ntsc output:\n${probe.output}`,
      ).toStrictEqual([...GENERATED_ALIASES]);
    },
  );

  it(
    "compiles an agent through its edited ejected partial",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      const installDir = await installAtHome();

      const agentName = E2E_AGENT["web-developer"].name;
      const configBefore = await readTestFile(configTsPath(installDir));
      await expect({ dir: installDir }).toHaveCompiledAgentContent(agentName, {
        notContains: [CUSTOM_IDENTITY_MARKER],
      });

      const eject = await CLI.run(["eject", "agent-partials"], { dir: installDir });
      expect(eject.exitCode, eject.output).toBe(EXIT_CODES.SUCCESS);
      expect(eject.output).toContain(STEP_TEXT.EJECT_SUCCESS);

      const identityPath = path.join(
        sourceFolderIn(installDir),
        DIRS.AGENTS,
        EJECTED_PARTIAL_CATEGORY,
        agentName,
        FILES.IDENTITY_MD,
      );
      expect(await fileExists(identityPath)).toBe(true);
      await writeFile(identityPath, `# Customised ${agentName}\n\n${CUSTOM_IDENTITY_MARKER}\n`);

      const compile = await CLI.run(["compile"], { dir: installDir });
      expect(compile.exitCode, compile.output).toBe(EXIT_CODES.SUCCESS);
      expect(compile.output).toContain(STEP_TEXT.CONFIG_TYPES_REFRESHED);

      await expect({ dir: installDir }).toHaveCompiledAgentContent(agentName, {
        contains: [CUSTOM_IDENTITY_MARKER],
      });
      await expect({ dir: installDir }).toHaveAgentFrontmatter(agentName, { name: agentName });

      expect(
        await readTestFile(configTsPath(installDir)),
        "customising a partial must leave config.ts byte-identical",
      ).toBe(configBefore);
      const sourceFolder = path.dirname(configTypesTsPath(installDir));
      const probe = await probeConfigTypesNarrowing(sourceFolder, GENERATED_ALIASES);
      expect(
        probe.exitCode,
        `a bogus literal must not type-check after the customised compile.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(probe.output).toContain(TS_NOT_ASSIGNABLE);
      // Each alias, since one rejecting can mask others collapsed to `string`.
      expect(
        probe.rejected,
        `every generated alias must still reject its bogus literal after the customised compile.\ntsc output:\n${probe.output}`,
      ).toStrictEqual([...GENERATED_ALIASES]);
    },
  );
});
