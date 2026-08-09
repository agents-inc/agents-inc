import path from "path";
import { readFile, writeFile } from "fs/promises";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { E2E_AGENT } from "../fixtures/expected-values.js";
import { CLI } from "../fixtures/cli.js";
import {
  cleanupTempDir,
  completeWithLocalSources,
  configTsPath,
  configTypesTsPath,
  ensureBinaryExists,
  fileExists,
  getEjectedTemplatePath,
  readCompiledAgents,
  readTestFile,
} from "../helpers/test-utils.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT, TIMEOUTS } from "../pages/constants.js";
import { InitWizard } from "../pages/wizards/init-wizard.js";
import {
  TS_NOT_ASSIGNABLE,
  probeConfigTypesNarrowing,
  typecheckGeneratedConfig,
} from "../helpers/type-check-probe.js";
import "../matchers/setup.js";

/**
 * `eject <type>` exists so the generated output can be customised. The claim it
 * makes is not "files appeared" but "what you changed comes back out of the next
 * compile" — and that claim is only worth anything against an installation the
 * user actually made, because the ejected copy has to win over the source's own
 * template and the CLI's bundled partials at the same time.
 *
 * Both specs here start from nothing: a real `init` through the PTY builds the
 * installation, and every later step is the real binary. The existing
 * template-precedence coverage all begins from a `ProjectBuilder`-written config,
 * which cannot show that the state is reachable.
 *
 * The recompile is asserted on all four surfaces, and the two that are easy to
 * forget carry the weight: `config.ts` must come back byte-identical (a
 * customisation is not a configuration change) and `config-types.ts` must still
 * narrow afterwards (a compile that rewrote it from a customised template must
 * not have degraded the aliases it regenerates on the same pass).
 */

/** Appended to the ejected template — a string nothing else in the pipeline emits. */
const CUSTOM_TEMPLATE_MARKER = "<!-- e2e-ejected-template-customisation -->";

/** Written into an ejected agent partial, for the same reason. */
const CUSTOM_IDENTITY_MARKER = "e2e-ejected-identity-customisation";

/** Where `eject agent-partials` writes the CLI's bundled `web-developer` tree. */
const EJECTED_PARTIAL_CATEGORY = "developer";

/** The aliases a compile regenerates on every pass, and must not collapse. */
const GENERATED_ALIASES = ["SkillId", "AgentName", "Category"] as const;

describe("ejected customisations survive a recompile", () => {
  let wizard: InitWizard | undefined;
  let source: E2ESource | undefined;

  beforeAll(async () => {
    await ensureBinaryExists();
    source = await createE2ESource();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    if (source) await cleanupTempDir(source.tempDir);
  });

  afterEach(async () => {
    await wizard?.destroy();
    wizard = undefined;
  });

  it(
    "compiles every agent through an edited ejected template without touching the configuration",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      // HOME === cwd, so the install, the ejected template and the recompile all
      // address one directory — the shape a user ejecting templates is in.
      wizard = await InitWizard.launchInGlobal({
        ...(source !== undefined && { source }),
      });
      const installDir = wizard.globalHome;

      const install = await completeWithLocalSources(wizard);
      expect(await install.exitCode, `init failed:\n${install.output}`).toBe(EXIT_CODES.SUCCESS);
      await install.destroy();

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

      // Surface 1: every agent came back through the edited template, and the
      // roster is the same one — a customisation must not add or drop an agent.
      const afterCompile = await readCompiledAgents(installDir);
      expect(Object.keys(afterCompile).sort()).toStrictEqual(Object.keys(beforeEject).sort());
      for (const [file, content] of Object.entries(afterCompile)) {
        expect(content, `${file} was not rendered through the ejected template`).toContain(
          CUSTOM_TEMPLATE_MARKER,
        );
      }

      // Surface 3: ejecting and recompiling is not a configuration change.
      expect(
        await readTestFile(configTsPath(installDir)),
        "customising the template must leave config.ts byte-identical",
      ).toBe(configBefore);

      // Surface 4: the pass that rewrote the agents rewrote config-types.ts too,
      // and the aliases it wrote must still reject a value that is not installed.
      const claudeSrcDir = path.dirname(configTypesTsPath(installDir));
      const typecheck = await typecheckGeneratedConfig(claudeSrcDir);
      expect(
        typecheck.exitCode,
        `config.ts must still type-check after the customised compile.\ntsc output:\n${typecheck.output}`,
      ).toBe(EXIT_CODES.SUCCESS);
      const probe = await probeConfigTypesNarrowing(claudeSrcDir, GENERATED_ALIASES);
      expect(
        probe.exitCode,
        `a bogus literal must not type-check after the customised compile.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(probe.output).toContain(TS_NOT_ASSIGNABLE);
    },
  );

  it(
    "compiles an agent through its edited ejected partial",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      wizard = await InitWizard.launchInGlobal({
        ...(source !== undefined && { source }),
      });
      const installDir = wizard.globalHome;

      const install = await completeWithLocalSources(wizard);
      expect(await install.exitCode, `init failed:\n${install.output}`).toBe(EXIT_CODES.SUCCESS);
      await install.destroy();

      const agentName = E2E_AGENT["web-developer"].name;
      const configBefore = await readTestFile(configTsPath(installDir));
      await expect({ dir: installDir }).toHaveCompiledAgentContent(agentName, {
        notContains: [CUSTOM_IDENTITY_MARKER],
      });

      const eject = await CLI.run(["eject", "agent-partials"], { dir: installDir });
      expect(eject.exitCode, eject.output).toBe(EXIT_CODES.SUCCESS);
      expect(eject.output).toContain(STEP_TEXT.EJECT_SUCCESS);

      // `eject agent-partials` writes the CLI's bundled tree, which nests each
      // agent under its category directory.
      const identityPath = path.join(
        installDir,
        DIRS.CLAUDE_SRC,
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

      // Surface 1: the edited partial reached the compiled agent, and the agent
      // is still a valid compiled agent rather than the partial's raw text.
      await expect({ dir: installDir }).toHaveCompiledAgentContent(agentName, {
        contains: [CUSTOM_IDENTITY_MARKER],
      });
      await expect({ dir: installDir }).toHaveAgentFrontmatter(agentName, { name: agentName });

      // Surface 3 and 4, as above: a partial customisation changes neither the
      // configuration nor the type surface it is checked against.
      expect(
        await readTestFile(configTsPath(installDir)),
        "customising a partial must leave config.ts byte-identical",
      ).toBe(configBefore);
      const claudeSrcDir = path.dirname(configTypesTsPath(installDir));
      const probe = await probeConfigTypesNarrowing(claudeSrcDir, GENERATED_ALIASES);
      expect(
        probe.exitCode,
        `a bogus literal must not type-check after the customised compile.\ntsc output:\n${probe.output || "(no diagnostics — the unions accept everything)"}`,
      ).not.toBe(EXIT_CODES.SUCCESS);
      expect(probe.output).toContain(TS_NOT_ASSIGNABLE);
    },
  );
});
