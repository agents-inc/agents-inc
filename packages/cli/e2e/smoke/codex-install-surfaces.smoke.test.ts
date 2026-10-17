import { lstat, mkdir, readdir, writeFile } from "fs/promises";
import os from "os";
import path from "path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  createE2EPluginSource,
  type E2EPluginSource,
} from "../helpers/create-e2e-plugin-source.js";
import { readCodexPrompt, resetCodexGlobalConfig, runCodex } from "../fixtures/codex.js";
import { codexGlobalSkillsDir, codexProjectSkillsDir } from "../fixtures/codex-install.js";
import { E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  codexHome,
  createTempDir,
  directoryExists,
  fileExists,
  renderSkillMd,
} from "../helpers/test-utils.js";
import { buildMarketplacePluginRef } from "../../src/cli/lib/plugins/plugin-ref.js";
import { EXIT_CODES, FILES } from "../pages/constants.js";

// Facts about the pinned `@openai/codex` that the Codex install design rests on, measured against
// the binary so a Codex release that changes them goes red here. No `skipIf`: Codex is a pinned
// devDependency, so a skip would read as green.

/** Read before and after every test; never written. */
const MACHINE_CODEX_HOME = codexHome(os.homedir());

const PLUGIN_SKILL_ID = E2E_SKILL.react.id;

/** Distinct from the plugin's id, so one cannot stand in for the other. */
const EJECTED_SKILL_NAME = "codex-surface-probe";

async function writeProbeSkill(root: string, name: string): Promise<string> {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, FILES.SKILL_MD),
    renderSkillMd(name, `${name} description`, `body of ${name}`),
  );
  return dir;
}

function availableSkillLine(name: string): string {
  return `- ${name}: `;
}

async function modificationTimesUnder(dir: string): Promise<Record<string, number>> {
  if (!(await directoryExists(dir))) return {};

  const entries = [".", ...(await readdir(dir, { recursive: true }))];
  const stamped = await Promise.all(
    entries.map(async (entry) => [entry, (await lstat(path.join(dir, entry))).mtimeMs] as const),
  );
  return Object.fromEntries(stamped);
}

describe("the surfaces a Codex install writes to, measured on the pinned binary", () => {
  let fixture: E2EPluginSource;
  let home: string;
  let project: string;
  let machineCodexBefore: Record<string, number>;

  beforeAll(async () => {
    fixture = await createE2EPluginSource();
  }, 120_000);

  afterAll(async () => {
    await cleanupFixture(fixture);
  });

  beforeEach(async () => {
    machineCodexBefore = await modificationTimesUnder(MACHINE_CODEX_HOME);
    home = await createTempDir();
    project = path.join(home, "project");
    await mkdir(project, { recursive: true });
    await resetCodexGlobalConfig(home);
  });

  afterEach(async () => {
    await cleanupTempDir(home);

    expect(
      await modificationTimesUnder(MACHINE_CODEX_HOME),
      "the machine's own ~/.codex moved during this test — Codex was started without HOME and CODEX_HOME pinned, or a Codex session outside the suite wrote to it meanwhile",
    ).toStrictEqual(machineCodexBefore);
  });

  it("reads $CODEX_HOME/skills, and does not read <repo>/skills", async () => {
    const globalSkills = codexGlobalSkillsDir(home);
    await writeProbeSkill(globalSkills, EJECTED_SKILL_NAME);
    // Not a root, though one path segment from `<repo>/.agents/skills`.
    await writeProbeSkill(path.join(project, "skills"), `${EJECTED_SKILL_NAME}-unread`);

    const prompt = await readCodexPrompt(home, project);

    // By absolute path: Codex's `rN` root indices are not stable between runs.
    expect(prompt).toContain(`= \`${globalSkills}\``);
    expect(prompt).toContain(availableSkillLine(EJECTED_SKILL_NAME));
    expect(prompt).not.toContain(availableSkillLine(`${EJECTED_SKILL_NAME}-unread`));
  });

  it("reads <repo>/.agents/skills in that repo and nowhere else, with no config file at all", async () => {
    await writeProbeSkill(codexProjectSkillsDir(project), EJECTED_SKILL_NAME);

    const insideTheRepo = await readCodexPrompt(home, project);
    expect(insideTheRepo).toContain(availableSkillLine(EJECTED_SKILL_NAME));

    expect(await fileExists(path.join(codexHome(home), "config.toml"))).toBe(false);

    const outsideTheRepo = await readCodexPrompt(home, home);
    expect(outsideTheRepo).not.toContain(availableSkillLine(EJECTED_SKILL_NAME));
  });

  it("finds a project skill from a subfolder only where the repository is a git repository", async () => {
    await writeProbeSkill(codexProjectSkillsDir(project), EJECTED_SKILL_NAME);
    const subfolder = path.join(project, "nested", "deeper");
    await mkdir(subfolder, { recursive: true });

    // Codex walks up to the git root, so outside a repository a subfolder sees no project skills.
    expect(await directoryExists(path.join(project, ".git"))).toBe(false);
    expect(await readCodexPrompt(home, subfolder)).not.toContain(
      availableSkillLine(EJECTED_SKILL_NAME),
    );

    // Control: same subfolder once the tree is a repository (directory written; the suite runs no git).
    await mkdir(path.join(project, ".git"), { recursive: true });
    expect(await readCodexPrompt(home, subfolder)).toContain(
      availableSkillLine(EJECTED_SKILL_NAME),
    );
  });

  it("accepts a marketplace whose only manifests are .claude-plugin ones, and serves its skill", async () => {
    const ref = buildMarketplacePluginRef(PLUGIN_SKILL_ID, fixture.marketplaceName);

    // The product's real build output, not a hand-written imitation.
    expect(
      await fileExists(path.join(fixture.sourceDir, ".claude-plugin", FILES.MARKETPLACE_JSON)),
    ).toBe(true);
    expect(await directoryExists(path.join(fixture.sourceDir, ".codex-plugin"))).toBe(false);

    const added = await runCodex(
      home,
      ["plugin", "marketplace", "add", fixture.sourceDir],
      project,
    );
    expect(added.exitCode, added.stderr).toBe(EXIT_CODES.SUCCESS);

    const installed = await runCodex(home, ["plugin", "add", ref], project);
    expect(installed.exitCode, installed.stderr).toBe(EXIT_CODES.SUCCESS);

    // A plugin skill is listed as `<plugin>:<skill>`.
    const prompt = await readCodexPrompt(home, project);
    expect(prompt).toContain(availableSkillLine(`${PLUGIN_SKILL_ID}:${PLUGIN_SKILL_ID}`));
  });

  it("answers a removal identically whether there was anything to remove or not", async () => {
    const ref = buildMarketplacePluginRef(PLUGIN_SKILL_ID, fixture.marketplaceName);
    const absent = buildMarketplacePluginRef("never-installed", fixture.marketplaceName);

    await runCodex(home, ["plugin", "marketplace", "add", fixture.sourceDir], project);
    const installed = await runCodex(home, ["plugin", "add", ref], project);
    expect(installed.exitCode, installed.stderr).toBe(EXIT_CODES.SUCCESS);

    const removedNothing = await runCodex(home, ["plugin", "remove", absent], project);
    const removedSomething = await runCodex(home, ["plugin", "remove", ref], project);
    const removedItAgain = await runCodex(home, ["plugin", "remove", ref], project);

    expect([
      removedNothing.exitCode,
      removedSomething.exitCode,
      removedItAgain.exitCode,
    ]).toStrictEqual([EXIT_CODES.SUCCESS, EXIT_CODES.SUCCESS, EXIT_CODES.SUCCESS]);
    // Same document too, so only a listing taken before the removal can say whether anything went.
    expect(removedSomething.json).toStrictEqual(removedItAgain.json);
    expect(JSON.stringify(removedNothing.json)).toContain(absent);

    const listed = await runCodex(home, ["plugin", "list"], project);
    expect(listed.json).toStrictEqual([{ installed: [], available: [] }]);
  });
});
