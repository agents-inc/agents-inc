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
import { buildSkillConfigs } from "../../src/cli/lib/__tests__/helpers/wizard-simulation.js";
import { EJECT_SOURCE } from "../../src/cli/consts.js";
import { DIRS, EXIT_CODES, STEP_TEXT } from "../pages/constants.js";

/**
 * The placement refusal has to fire where a configuration is READ, not only where one is
 * installed — and it has to leave an offerable Codex configuration alone.
 *
 * **The hole this closes is reachable with `cp`.** Nothing ties a folder's contents to its name
 * and the ruling forbids the `provider` field that would: a user who reads "the folder says the
 * provider" and copies `.agents-inc/claude/` to `.agents-inc/codex/` has a Codex installation
 * holding a configuration that never passed through `init --from --provider codex` and never met
 * its pre-flight. Every later command reads that file. So the refusal is one function called from
 * the config-read path as well, and from EVERY command on it: `compile`, which turns a
 * configuration into files on disk; `edit`, which rewrites it; `update`, which acts on the
 * marketplaces it names; `share`, which publishes it to the store as "what is installed here";
 * and `doctor`, whose whole job is saying whether an installation is healthy.
 *
 * **`share` was absent from that sentence until 2026-09-22 while the sentence said "EVERY
 * command"**, and it was absent from the roster below as well. A list that claims completeness is
 * the thing that stops the next reader counting the commands for themselves, so the claim was
 * doing active harm rather than merely being short. Found by driving the commands, not by reading
 * this file. `uninstall` reads the same configuration and is deliberately NOT owed the refusal:
 * one there would make an unofferable installation unremovable.
 *
 * **Doctor's is a ROW and the other four are refusals, and that difference is the point.** A
 * command that changes nothing must not refuse to LOOK — the state this row reports is exactly the
 * state a user needs to see in order to fix it — so `doctor` prints the finding, finishes the
 * report, and the rows after it still run. Until this row existed, `doctor` pronounced a clean bill
 * of health on a configuration no other command would act on, which is worse than having no
 * diagnostic at all.
 *
 * **Two refusals would be worse than one.** The message a reader gets from `compile` names the
 * same three offered cells as the one `init` gives, because they come off the same host roster;
 * a second spelling written at the read path is a second thing to keep true.
 *
 * **Each refusal is paired with the case it is not, in this file.** A refusal on its own cannot
 * tell a correctly-scoped guard from one that has swallowed the whole provider: a `compile` that
 * refused every Codex installation would satisfy the refusal test exactly as well, and leave
 * Codex with no reachable command at all. So an offerable Codex configuration compiles here, and
 * the same unofferable configuration is NOT refused for its placement on Claude, where the cell
 * exists.
 *
 * **Where the red used to arrive, recorded rather than deleted.** Until C4 this release refused to
 * act on a Codex folder at all — `providerInUse` threw `Refusing to act on the codex installation
 * at …: this release installs onto claude only` — and the fixture writer read its own file back
 * through that same resolver, so the Codex cases reddened in their SETUP rather than on their
 * subject. That refusal is gone, the host it was waiting for exists, and every case here is green.
 * The control was red for a different reason and stayed red after the rest went green: an
 * offerable Codex configuration has to have something to compile, and this file's paragraph about
 * that sits on the case itself. What it needed was the local-skill READ path routed through the
 * layout rather than composing `.claude/skills` for every provider — and then a fixture that
 * plants its ejected skill where that layout puts it.
 */

/** A project name is the one field a configuration cannot be written without. */
const CONFIG_NAME = "read-path-refusal";

/**
 * Every command that ACTS on a configuration it did not just write, and therefore owes the refusal.
 *
 * Named as a list rather than written out once per command because the claim is one claim per
 * command, and a command missing from it is a door the configuration is still reachable through —
 * which is exactly what `share`'s absence was until 2026-09-22. `doctor` is deliberately NOT here:
 * its answer is a row rather than a stop, and it has its own pair below. `uninstall` is not here
 * either, and for a stronger reason: a refusal there would make an unofferable installation
 * unremovable.
 *
 * `share` runs without `--stdin` on purpose. That flag is the branch that reads no directory at
 * all, so a `--stdin` run is the one case this refusal must not reach, and pointing the row at it
 * would assert nothing.
 *
 * The exit code is asserted as "not success" rather than as a number: `edit` and `update` reach
 * this refusal through different endings of their own, and pinning which one would be pinning the
 * order of the guards rather than the refusal.
 */
const READERS_THAT_REFUSE = [
  { label: "compile", argv: ["compile"] },
  { label: "edit", argv: ["edit"] },
  { label: "update", argv: ["update"] },
  { label: "share", argv: ["share"] },
] as const;

/**
 * The marketplace an `origin` names when a skill is installed as a plugin.
 *
 * Any non-`eject` origin makes the row a plugin row, which is all this file needs: the refusal is
 * about the mode/scope cell, and it fires before anything resolves a marketplace.
 */
const A_MARKETPLACE = "agents-inc";

/**
 * A store address nothing answers on, for the one row that would otherwise publish.
 *
 * Port 1 on the loopback: a connection refused in under a millisecond, and no route off this
 * machine. `CLI.run` clears `AGENTS_INC_API_URL` from the inherited environment, so without this
 * a `share` that stopped refusing would reach the real `api.agentsinc.sh`.
 */
const NOWHERE = "http://127.0.0.1:1";

/**
 * The ejected skill the control plants, as its own `metadata.yaml` states it.
 *
 * `category` and `slug` are STATED rather than read off the id: `packages/cli/CLAUDE.md` forbids
 * deriving either from a skill id or a directory path in fixtures as much as in product code, and
 * a wrong category is the one field that makes a skill unreachable rather than merely mislabelled.
 * Both are `E2E_SKILL.react`'s, and the display name comes off that entry.
 */
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

  /** The unofferable configuration every refusal in this file is read against. */
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
        // A `share` that stopped refusing would POST to the real store. Every row carries the
        // dead address so a regression fails here rather than on somebody's network, and the
        // three rows that never read it are unaffected.
        { env: { AGENTS_INC_API_URL: NOWHERE } },
      );
      const said = flattenCliOutput(run.output);

      expect(run.exitCode, said).not.toBe(EXIT_CODES.SUCCESS);
      expect(said).toContain(E2E_SKILL.react.id);
      expect(said).toContain(CODEX_REFUSED_CELL);
      for (const cell of CODEX_OFFERED_CELLS) expect(said).toContain(cell);

      // And it wrote nothing on the way to refusing — not the Codex agents directory a compile
      // would have written into, and not a Claude one beside it.
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

    // The same sentence the three refusals above print, under a row of its own.
    expect(said).toContain(STEP_TEXT.DOCTOR_ROW_PLACEMENTS);
    expect(said).toContain(CODEX_REFUSED_CELL);
    for (const cell of CODEX_OFFERED_CELLS) expect(said).toContain(cell);

    // It REPORTED rather than stopped: a row this report prints after the placements one is still
    // there, which is the difference between a diagnostic and a fourth refusal. Without it a
    // `doctor` that threw at the first read would satisfy every assertion above.
    expect(said).toContain(STEP_TEXT.DOCTOR_ROW_SKILLS_RESOLVED);
    expect(said).toContain(STEP_TEXT.DOCTOR_SUMMARY);
  });

  /**
   * The control, and its fixture has been wrong twice — recorded rather than quietly corrected,
   * because both times were the same mistake and the second reddened for a reason nobody could
   * attribute.
   *
   * **First** it declared `skills: []` and `agents: []`, which `declaresNoContent` in
   * `lib/installation/installation.ts` reads as no installation at all, so `compile` refused it
   * with `No installation found` — at both providers alike.
   *
   * **Then** it named one eject-mode skill and never put that skill on disk. Discovery answers
   * zero whichever directory it reads; `runCompilePasses` in `commands/compile.ts` hard-errors
   * `No skills found` once no pass found any, and the run exits 1 — **at both providers alike,
   * again.** The identical configuration under `.agents-inc/claude/` fails with the same message,
   * which is what says the red was never about Codex and never about the renderer that landed
   * between the two readings.
   *
   * A control that cannot succeed asserts nothing, so the skill is planted where THIS host reads
   * it — `<repo>/.agents/skills/` on Codex, not `.claude/skills/` — and the run has something to
   * compile. Reaching for `createLocalSkill` here reproduces the second failure exactly, which is
   * why {@link createLocalSkillIn} takes the directory.
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
          origin: EJECT_SOURCE,
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

    // It says which provider it is talking about, so a user can tell which installation the run
    // was about. The WORDING is deliberately not pinned here — `codex-compile-reports-what-it-
    // cannot-express.e2e.test.ts` owns those sentences, and a second spelling is a second thing
    // to keep true.
    expect(said.toLowerCase()).toContain("codex");
    // This configuration declares no sub-agent, so no role file is owed — which is what makes the
    // absence a claim about the run rather than about the provider.
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

    // Whether this run succeeds is not the claim — a plugin skill with no plugin installed has
    // its own report, and it is the same one it has always had. The claim is that nothing
    // refuses it for WHERE it asked to be placed, which is the only difference between the two
    // configurations in this file.
    expect(said).not.toContain(CODEX_REFUSED_CELL);
    for (const cell of CODEX_OFFERED_CELLS) expect(said).not.toContain(cell);
  });
});
