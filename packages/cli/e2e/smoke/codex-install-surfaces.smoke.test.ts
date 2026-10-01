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

/**
 * The four facts about the pinned `@openai/codex` that C4's design is built on, each measured
 * against the binary itself rather than restated from the plan.
 *
 * **These are not tests of our CLI and they cannot be red before it is written.** They are the
 * measurements the design rests on, and the smoke lane is where a fact about a third-party binary
 * belongs. Their value is the day they go red: every one of them is a place where a Codex release
 * would silently change what an install means, with our own suite still green because our own
 * suite only ever asserts what we wrote.
 *
 * Each was re-derived on 0.155.1, 2026-09-22, under a pinned `HOME` and `CODEX_HOME`, before this
 * file was written:
 *
 * 1. **`$CODEX_HOME/skills` is a root Codex reads** — D14's whole justification. `~/.agents/skills`
 *    is also read and is deliberately not ours; `<repo>/skills/` is NOT read, and it is one path
 *    segment away from one that is.
 * 2. **A project skill is a committed file** — `<repo>/.agents/skills/<id>/SKILL.md` reaches the
 *    model in that repository and nowhere else, with no plugin, no marketplace, no trust entry and
 *    no `config.toml` at all. That is why the eject+project placement is a design rather than a
 *    degraded fallback.
 * 3. **Codex reads our `.claude-plugin/` manifests unchanged** — D19's bet. Its own bundled
 *    `plugin-creator` skill documents `.codex-plugin/plugin.json` as the required manifest, so the
 *    path we use is a compatibility shim. This is the tripwire that fails loudly the day it goes.
 * 4. **`codex plugin remove` cannot be trusted for an exit code** — a plugin that was never there,
 *    one that really went and one removed twice are byte-identical on both channels. An uninstall
 *    that reports what it ASKED for therefore reports a removal it did not make, which is why the
 *    outcome comes from the listing taken before the removal.
 *
 * **The global config is reset before every test.** `--sandbox workspace-write` and
 * `danger-full-access` make Codex WRITE `[projects."<path>"] trust_level = "trusted"` into
 * `$CODEX_HOME/config.toml` itself, so the tool under test mutates the independent variable and a
 * later run registers for a reason the experiment never set. That trap already produced two
 * contradictory measurements in this programme. A fresh temp HOME per test makes the reset
 * redundant today and will not the first time a test runs Codex twice.
 *
 * **The machine's own `~/.codex` is checked around every test**, exactly as `codex-lane.smoke.test.ts`
 * does and for the same reason: a door that forgets to pin both variables leaks on its first call.
 *
 * No `skipIf`. Codex is a devDependency at one exact version, so it is present wherever
 * `bun install` ran and a skip would read as a green run.
 */

/** The machine's own Codex state tree. Read before and after every test; never written. */
const MACHINE_CODEX_HOME = codexHome(os.homedir());

/** A skill this CLI compiled into a plugin, and the same id as the plugin holding it. */
const PLUGIN_SKILL_ID = E2E_SKILL.react.id;

/** A name for the ejected copies, distinct from the plugin's so one cannot stand in for the other. */
const EJECTED_SKILL_NAME = "codex-surface-probe";

/**
 * Writes one skill directory under `root` and answers where it went. Its `SKILL.md` carries what
 * Codex needs to list it — a name and a description in the frontmatter — and nothing else.
 */
async function writeProbeSkill(root: string, name: string): Promise<string> {
  const dir = path.join(root, name);
  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, FILES.SKILL_MD),
    renderSkillMd(name, `${name} description`, `body of ${name}`),
  );
  return dir;
}

/** How Codex's skills block names one entry. */
function availableSkillLine(name: string): string {
  return `- ${name}: `;
}

/** Every entry under `dir` with its modification time — `{}` when `dir` is absent. */
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
    // One path segment away from `<repo>/.agents/skills`, and not a root.
    await writeProbeSkill(path.join(project, "skills"), `${EJECTED_SKILL_NAME}-unread`);

    const prompt = await readCodexPrompt(home, project);

    // The root by its absolute path, never by its `rN` index: Codex numbers roots in whatever
    // order they appear, and the same root took two numbers in two runs an hour apart.
    expect(prompt).toContain(`= \`${globalSkills}\``);
    expect(prompt).toContain(availableSkillLine(EJECTED_SKILL_NAME));
    expect(prompt).not.toContain(availableSkillLine(`${EJECTED_SKILL_NAME}-unread`));
  });

  it("reads <repo>/.agents/skills in that repo and nowhere else, with no config file at all", async () => {
    await writeProbeSkill(codexProjectSkillsDir(project), EJECTED_SKILL_NAME);

    const insideTheRepo = await readCodexPrompt(home, project);
    expect(insideTheRepo).toContain(availableSkillLine(EJECTED_SKILL_NAME));

    // No plugin, no marketplace, no trust entry — and the file that would hold any of them is not
    // there. This is what makes eject+project Codex's own mechanism rather than our workaround.
    expect(await fileExists(path.join(codexHome(home), "config.toml"))).toBe(false);

    const outsideTheRepo = await readCodexPrompt(home, home);
    expect(outsideTheRepo).not.toContain(availableSkillLine(EJECTED_SKILL_NAME));
  });

  it("finds a project skill from a subfolder only where the repository is a git repository", async () => {
    await writeProbeSkill(codexProjectSkillsDir(project), EJECTED_SKILL_NAME);
    const subfolder = path.join(project, "nested", "deeper");
    await mkdir(subfolder, { recursive: true });

    // Codex walks up from the cwd to the GIT root, not to the nearest `.agents/skills`. In a
    // directory tree that is not a repository there is nothing to walk up to, so the skills a
    // user committed are invisible the moment they `cd` one level in — silently, with no warning
    // anywhere. That is a property of the REPOSITORY rather than of the install, which is why it
    // becomes a doctor row and not a refusal.
    expect(await directoryExists(path.join(project, ".git"))).toBe(false);
    expect(await readCodexPrompt(home, subfolder)).not.toContain(
      availableSkillLine(EJECTED_SKILL_NAME),
    );

    // The control, and the half that makes the sentence above about `.git` rather than about
    // subfolders: the same subfolder, the same skill, once the tree is a repository. Built by
    // writing the directory rather than by running git — the suite runs no git command.
    await mkdir(path.join(project, ".git"), { recursive: true });
    expect(await readCodexPrompt(home, subfolder)).toContain(
      availableSkillLine(EJECTED_SKILL_NAME),
    );
  });

  it("accepts a marketplace whose only manifests are .claude-plugin ones, and serves its skill", async () => {
    const ref = buildMarketplacePluginRef(PLUGIN_SKILL_ID, fixture.marketplaceName);

    // Registered straight from the product's own build output — a hand-written imitation would
    // pass this tripwire on the day the real manifests stopped being accepted.
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

    // A plugin's skill reaches the model as `<plugin>:<skill>`, which is the form an install
    // assertion has to look for — never the plain name an ejected copy carries.
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

    // Same exit code for all three. `reject: false` on the runner means a non-zero one would show
    // up here rather than as a thrown error, so this really is comparing three outcomes.
    expect([
      removedNothing.exitCode,
      removedSomething.exitCode,
      removedItAgain.exitCode,
    ]).toStrictEqual([EXIT_CODES.SUCCESS, EXIT_CODES.SUCCESS, EXIT_CODES.SUCCESS]);
    // And the same document, modulo the id it echoes back. Nothing in it says whether anything
    // went — so the only thing that can is a listing taken BEFORE the removal.
    expect(removedSomething.json).toStrictEqual(removedItAgain.json);
    expect(JSON.stringify(removedNothing.json)).toContain(absent);

    const listed = await runCodex(home, ["plugin", "list"], project);
    expect(listed.json).toStrictEqual([{ installed: [], available: [] }]);
  });
});
