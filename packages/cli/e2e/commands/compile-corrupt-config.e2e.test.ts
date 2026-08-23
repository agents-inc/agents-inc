import path from "path";
import { mkdir } from "fs/promises";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  agentsPath,
  cleanupTempDir,
  configTsPath,
  createLocalSkill,
  createTempDir,
  directoryExists,
  ensureBinaryExists,
  fileExists,
  listFiles,
  readTestFile,
  renderMetadataYaml,
  runCLI,
  writeCorruptConfig,
  writeProjectConfig,
} from "../helpers/test-utils.js";
import { EXIT_CODES, STEP_TEXT } from "../pages/constants.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import { metadataFieldsFor } from "../fixtures/project-builder.js";

/**
 * D-273 — a corrupt `.claude-src/config.ts` (a file that exists but cannot be
 * loaded/parsed) must not let `cc compile` run.
 *
 * Before the fix, `loadProjectConfigFromDir` collapsed BOTH "file missing" and
 * "file exists but unparseable" into `null`. `detectInstallationInDir` saw the
 * file on disk (`fileExists` true) plus a null load and built a phantom
 * eject-mode installation. `cc compile` then ran config-less: `compileAgents`
 * resolved EVERY built-in agent (~23) and wrote them to the scope's
 * `.claude/agents/`, resurrecting agents the user had deselected — printing a
 * clean "Global compile complete!" with zero warnings.
 *
 * The fix distinguishes missing (legitimate) from corrupt (an error): a corrupt
 * config makes the loader throw, `detectInstallationInDir` surfaces it, and
 * `cc compile` hard-errors with EXIT_CODES.ERROR naming the config path — and
 * writes no agents.
 */

const SKILL_ID = E2E_SKILL.react.id;

/** Config body with the `export default` removed — a valid-TS file that exports nothing. */
const MISSING_EXPORT_DEFAULT = [
  `const config = {`,
  `  name: "corrupt-repro",`,
  `  skills: [{ id: "${SKILL_ID}", scope: "global", origin: "eject" }],`,
  `  agents: [{ name: "web-developer", scope: "global" }],`,
  `};`,
  `// the \`export default config;\` line was removed to reproduce the corruption`,
].join("\n");

/** A genuine TypeScript syntax error — the loader throws while evaluating it. */
const SYNTAX_ERROR = `export default {{{ not valid typescript`;

/**
 * Seed a valid global install (config + discoverable local skill) under
 * `fakeHome`, then leave the config ready to be corrupted by the caller.
 */
async function seedGlobalInstall(fakeHome: string): Promise<void> {
  await writeProjectConfig(fakeHome, {
    name: "corrupt-config-fixture",
    skills: [{ id: SKILL_ID, scope: "global", origin: "eject" }],
    agents: [{ name: "web-developer", scope: "global" }],
  });
  await createLocalSkill(fakeHome, SKILL_ID, {
    description: "Global local skill so the compile pass has a skill to discover",
    metadata: renderMetadataYaml({
      ...metadataFieldsFor(SKILL_ID),
      contentHash: "hash-corrupt-config",
    }),
  });
}

describe("compile with a corrupt config", () => {
  let tempDir: string;

  beforeAll(ensureBinaryExists);

  afterEach(async () => {
    if (tempDir) {
      await cleanupTempDir(tempDir);
    }
  });

  it("hard-errors naming the config path when the global config is corrupt (missing export default)", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");
    await seedGlobalInstall(fakeHome);
    await writeCorruptConfig(fakeHome, MISSING_EXPORT_DEFAULT);

    // Run from HOME itself so detection resolves to a single Global pass.
    const { exitCode, combined } = await runCLI(["compile"], fakeHome, {
      env: { HOME: fakeHome },
    });

    expect(exitCode, `compile must reject a corrupt config; output:\n${combined}`).toBe(
      EXIT_CODES.ERROR,
    );
    // The error must name the offending file so the user can fix it.
    expect(combined).toContain(configTsPath(fakeHome));
    expect(combined).toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
    // It must NOT claim success.
    expect(combined).not.toContain(STEP_TEXT.COMPILE_COMPLETE);
  });

  it("writes no agents and leaves config untouched when the config is corrupt", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");
    await seedGlobalInstall(fakeHome);
    await writeCorruptConfig(fakeHome, MISSING_EXPORT_DEFAULT);

    const agentsBefore = await listFiles(agentsPath(fakeHome));
    const configBefore = await readTestFile(configTsPath(fakeHome));

    const { exitCode } = await runCLI(["compile"], fakeHome, { env: { HOME: fakeHome } });
    expect(exitCode).toBe(EXIT_CODES.ERROR);

    // The bug wrote ~23 built-in agents here; the fix must write none.
    expect(
      (await listFiles(agentsPath(fakeHome))).sort(),
      "a corrupt config must not resurrect any agents",
    ).toStrictEqual(agentsBefore.sort());
    // Compile must not rewrite the config.
    expect(await readTestFile(configTsPath(fakeHome))).toBe(configBefore);
  });

  it("hard-errors when a project-scope config is corrupt (syntax error)", async () => {
    tempDir = await createTempDir();
    const projectDir = path.join(tempDir, "project");
    const cleanHome = path.join(tempDir, "clean-home");
    await mkdir(cleanHome, { recursive: true });
    await seedGlobalInstall(projectDir);
    await writeCorruptConfig(projectDir, SYNTAX_ERROR);

    // cwd is the project (distinct from HOME) so the corrupt config is detected
    // in the PROJECT context, not the global one.
    const { exitCode, combined } = await runCLI(["compile"], projectDir, {
      env: { HOME: cleanHome },
    });

    expect(exitCode, `compile must reject a corrupt project config; output:\n${combined}`).toBe(
      EXIT_CODES.ERROR,
    );
    expect(combined).toContain(configTsPath(projectDir));
    expect(combined).not.toContain(STEP_TEXT.COMPILE_COMPLETE);

    // No agents written to the project scope.
    expect(await listFiles(agentsPath(projectDir))).toStrictEqual([]);
  });

  it("still compiles when the config is intact (green guard)", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");
    await seedGlobalInstall(fakeHome);

    const { exitCode, combined } = await runCLI(["compile"], fakeHome, {
      env: { HOME: fakeHome },
    });

    expect(exitCode, `intact config must compile; output:\n${combined}`).toBe(EXIT_CODES.SUCCESS);
    expect(combined).toContain(STEP_TEXT.COMPILE_COMPLETE);
    await expect(fileExists(path.join(agentsPath(fakeHome), "web-developer.md"))).resolves.toBe(
      true,
    );
  });

  it("keeps the existing no-installation behavior when no config file exists (green guard)", async () => {
    tempDir = await createTempDir();
    const fakeHome = path.join(tempDir, "global-home");
    // A discoverable skill on disk but NO config file anywhere: missing config is
    // NOT corrupt, so compile must fall back to its existing no-installation
    // error rather than the corrupt-config error — and must not resurrect agents.
    await createLocalSkill(fakeHome, SKILL_ID, {
      description: "Local skill with no config present",
      metadata: renderMetadataYaml({
        ...metadataFieldsFor(SKILL_ID),
        contentHash: "hash-no-config",
      }),
    });

    const { exitCode, combined } = await runCLI(["compile"], fakeHome, {
      env: { HOME: fakeHome },
    });

    expect(exitCode).toBe(EXIT_CODES.ERROR);
    expect(combined).toContain(STEP_TEXT.NO_INSTALLATION);
    expect(combined).not.toContain(STEP_TEXT.CONFIG_LOAD_FAILED);
    expect(await directoryExists(agentsPath(fakeHome))).toBe(false);
  });
});
