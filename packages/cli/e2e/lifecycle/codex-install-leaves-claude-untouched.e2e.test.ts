import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  CLAUDE_SOURCE_REL,
  CODEX_SOURCE_REL,
  codexGlobalSkillsDir,
  runInitFromOnCodex,
} from "../fixtures/codex-install.js";
import {
  runInitFrom,
  startSeedConfigStore,
  type SeedConfigStore,
} from "../fixtures/seed-config-store.js";
import { CLI } from "../fixtures/cli.js";
import { E2E_AGENT, E2E_SKILL } from "../fixtures/expected-values.js";
import {
  cleanupFixture,
  cleanupTempDir,
  directoryExists,
  fileExists,
  flattenCliOutput,
  normalizeInstallTree,
  readInstallTree,
  type InstallTree,
} from "../helpers/test-utils.js";
import { cliVersion } from "../../src/cli/lib/agents/agent-provenance.js";
import {
  buildSeedPayload,
  buildSeedSkill,
} from "../../src/cli/lib/__tests__/factories/seed-factories.js";
import { DIRS, EXIT_CODES, FILES, TIMEOUTS } from "../pages/constants.js";

/**
 * What a Codex install writes, where, and the one claim the whole step rests on: **Claude does not
 * move.**
 *
 * **Why the absences are the load-bearing half.** A path that missed the layout funnel does not
 * fail — it writes into `.claude/` or `.agents-inc/claude/` and exits 0, with every assertion
 * about the Codex side still green, because those assertions are about what IS there. The plan
 * calls this "half-routed paths" and names it the risk that ships a broken provider with a green
 * suite. So a Codex run is pinned for what it did NOT create as firmly as for what it did.
 *
 * **Two strengths of the same claim, and the weaker one cannot be dropped.** The first test runs
 * on a machine with no Claude installation at all, so "no `.claude/`" is checkable by existence.
 * The second runs with a Claude global already installed, where existence proves nothing and only
 * the BYTES do — and that is the case a user is actually in. Neither subsumes the other: the first
 * catches a path that creates the folder, the second catches one that writes into a folder that
 * was already there.
 *
 * **`toStrictEqual` over two normalised trees, not a file count.** A count cannot see a swap, and
 * a swap is exactly what a mis-routed write looks like from outside: one file rewritten, the total
 * unchanged. The normalisation is `readInstallTree`'s own — temp roots and the compiled-agent
 * version line — and nothing else, so a byte that moved for any other reason reddens.
 *
 * Every payload here ejects. That is deliberate and not a convenience: an eject needs no `claude`
 * binary and no `codex plugin add`, so both halves of the comparison are this CLI's own writes and
 * the result does not depend on a host binary being on the machine. The plugin placement's own
 * proof lives in `codex-offered-placements.e2e.test.ts`.
 *
 * Written before the `--provider` flag existed, and red on the unknown flag until C4b built it.
 * Green since 2026-09-22.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/**
 * The Claude CLI's record of its own sessions, which nothing in this CLI writes and every run
 * moves. Left unpinned for the reason the golden-tree journeys leave it unpinned.
 */
const CLAUDE_SESSION_STATE = [
  path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_JSON),
  path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_LOCK),
  path.posix.join(DIRS.CLAUDE, DIRS.CLAUDE_BACKUPS),
];

/**
 * Every command a Codex installation reaches after the install, in the order a user meets them.
 *
 * Named as a list rather than written out four times because the claim is one claim per command
 * and a command missing from it is the half-routed path that ships: `compile` writes the agents,
 * `doctor` reads every scope it can find, `edit --from` applies a shared configuration, and
 * `uninstall` removes one. Members rather than a count, and `uninstall` last because it takes the
 * subject away.
 *
 * **`edit --from` refuses here and that is stated rather than hidden.** It applies a shared
 * configuration destructively, so with no terminal to confirm the removals in it stops — which
 * pins that its REFUSAL writes nothing and leaves the approving path to the PTY harness, where a
 * Codex spec does not exist yet.
 */
const LATER_COMMANDS = [
  { label: "compile", argv: ["compile"] },
  { label: "doctor", argv: ["doctor"] },
  { label: "edit --from", argv: ["edit", "--from", "CdxSwp02"] },
  { label: "uninstall", argv: ["uninstall", "--yes"] },
] as const;

/** oclif's refusal for a flag no command declares — what a half-built provider looks like. */
const UNKNOWN_FLAG = "Nonexistent flag";

/**
 * One skill, ejected, with its sub-agent's scope stated beside it.
 *
 * Both scopes are written out rather than defaulted because the pair has to be COHERENT: a
 * project-scoped skill assigned to a sub-agent resting at global scope is a combination the config
 * model cannot express, and an install at the home directory refuses any project-scoped entry
 * outright — "a global installation holds only global-scoped content". Either mismatch fails the
 * run before it reaches the subject, which reads as this step's red and is not.
 */
function ejected(skillScope: "global" | "project", agentScope: "global" | "project") {
  return buildSeedPayload({
    skills: {
      [E2E_SKILL.react.id]: buildSeedSkill({
        install: "eject",
        scope: skillScope,
        assignments: { [WEB_DEV]: "lazy" },
      }),
    },
    agents: { [WEB_DEV]: { scope: agentScope } },
  });
}

describe("a Codex install and the Claude side of the machine", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
  }, TIMEOUTS.SETUP);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it(
    "writes its config pair under .agents-inc/codex/ at each scope in play, and creates no Claude folder anywhere",
    { timeout: TIMEOUTS.LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });
      store.publish("CdxWrt01", ejected("global", "project"));

      const { exitCode, output } = await runInitFromOnCodex(
        store,
        "CdxWrt01",
        { dir: env.projectDir, globalHome: env.fakeHome },
        source.sourceDir,
      );
      expect(exitCode, flattenCliOutput(output)).toBe(EXIT_CODES.SUCCESS);

      // The folder IS the provider: it is the only record that this installation is a Codex one,
      // so both scopes in play carry their own pair and neither is inferred from the other.
      for (const root of [env.fakeHome, env.projectDir]) {
        expect(
          await fileExists(path.join(root, CODEX_SOURCE_REL, FILES.CONFIG_TS)),
          `no Codex config pair under ${root}`,
        ).toBe(true);
      }

      // The skill went to the global Codex root, not to a Claude one.
      expect(
        await fileExists(
          path.join(codexGlobalSkillsDir(env.fakeHome), E2E_SKILL.react.id, FILES.SKILL_MD),
        ),
      ).toBe(true);

      // Nothing Claude-shaped exists, at either scope. This is the check that catches a path that
      // bypassed the layout funnel — it writes somewhere plausible and exits 0.
      for (const root of [env.fakeHome, env.projectDir]) {
        expect(await directoryExists(path.join(root, DIRS.CLAUDE)), `${root}/.claude`).toBe(false);
        expect(
          await directoryExists(path.join(root, CLAUDE_SOURCE_REL)),
          `${root}/${CLAUDE_SOURCE_REL}`,
        ).toBe(false);
      }
    },
  );

  it(
    "leaves an existing Claude installation byte-identical, at both scopes",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });

      // A Claude global first, the way a user already on Claude has one.
      store.publish("ClaBase1", ejected("global", "global"));
      const claudeInstall = await runInitFrom(
        store,
        "ClaBase1",
        { dir: env.fakeHome, globalHome: env.fakeHome },
        source.sourceDir,
      );
      expect(claudeInstall.exitCode, flattenCliOutput(claudeInstall.output)).toBe(
        EXIT_CODES.SUCCESS,
      );
      expect(await fileExists(path.join(env.fakeHome, CLAUDE_SOURCE_REL, FILES.CONFIG_TS))).toBe(
        true,
      );

      const before = await claudeSideOf(env);

      // Then a Codex install in a project underneath it. A Codex project inherits from and
      // propagates to the Codex global alone, so nothing here has any business touching the
      // Claude pair — not even to register the project in its `projects[]` list.
      store.publish("CdxBesd1", ejected("project", "project"));
      const codexInstall = await runInitFromOnCodex(
        store,
        "CdxBesd1",
        { dir: env.projectDir, globalHome: env.fakeHome },
        source.sourceDir,
      );
      expect(codexInstall.exitCode, flattenCliOutput(codexInstall.output)).toBe(EXIT_CODES.SUCCESS);

      // Subject guard: the Codex run really did install something. Without it this test passes
      // for a run that refused at the first line, which is the same green as a run that behaved.
      expect(await fileExists(path.join(env.projectDir, CODEX_SOURCE_REL, FILES.CONFIG_TS))).toBe(
        true,
      );

      expect(await claudeSideOf(env)).toStrictEqual(before);
      // And the project it ran in grew no Claude half either.
      expect(await directoryExists(path.join(env.projectDir, CLAUDE_SOURCE_REL))).toBe(false);
      expect(await directoryExists(path.join(env.projectDir, DIRS.CLAUDE))).toBe(false);
    },
  );

  it(
    "keeps it byte-identical through every later command a Codex installation reaches",
    { timeout: TIMEOUTS.EXTENDED_LIFECYCLE },
    async () => {
      env = await createTestEnvironment({ permissions: false });

      store.publish("ClaBase2", ejected("global", "global"));
      const claudeInstall = await runInitFrom(
        store,
        "ClaBase2",
        { dir: env.fakeHome, globalHome: env.fakeHome },
        source.sourceDir,
      );
      expect(claudeInstall.exitCode, flattenCliOutput(claudeInstall.output)).toBe(
        EXIT_CODES.SUCCESS,
      );

      store.publish("CdxSwp01", ejected("project", "project"));
      store.publish("CdxSwp02", ejected("project", "project"));
      const codexInstall = await runInitFromOnCodex(
        store,
        "CdxSwp01",
        { dir: env.projectDir, globalHome: env.fakeHome },
        source.sourceDir,
      );
      expect(codexInstall.exitCode, flattenCliOutput(codexInstall.output)).toBe(EXIT_CODES.SUCCESS);

      // The baseline is taken AFTER the install, because the install's own effect on the Claude
      // side is the test above. What this one measures is every command a user runs afterwards.
      const before = await claudeSideOf(env);

      for (const { label, argv } of LATER_COMMANDS) {
        const run = await CLI.run(
          [...argv],
          { dir: env.projectDir, globalHome: env.fakeHome },
          { env: { AGENTS_INC_API_URL: store.url } },
        );
        const said = flattenCliOutput(run.output);

        // The exit code is not the claim and is deliberately unasserted: `doctor` answers whether
        // the installation is healthy, and `edit --from` refuses outright where there is no
        // terminal to confirm its removals in. What every one of them owes is the same thing —
        // a Codex installation's command does not touch the Claude side of the machine.
        expect(await claudeSideOf(env), `${label} moved the Claude side`).toStrictEqual(before);
        expect(
          await directoryExists(path.join(env.projectDir, CLAUDE_SOURCE_REL)),
          `${label} created ${CLAUDE_SOURCE_REL} in the project`,
        ).toBe(false);
        expect(
          await directoryExists(path.join(env.projectDir, DIRS.CLAUDE)),
          `${label} created ${DIRS.CLAUDE} in the project`,
        ).toBe(false);
        expect(
          said,
          `${label} does not know the flag this installation was made with`,
        ).not.toContain(UNKNOWN_FLAG);
      }

      // Subject guard for the whole loop: the sweep really did reach a command that acts. Without
      // it every assertion above is satisfied by four commands that each refused at their first
      // line, which is the same green as four commands that behaved.
      expect(
        await directoryExists(path.join(env.projectDir, CODEX_SOURCE_REL)),
        "the uninstall at the end of the sweep left the Codex pair behind",
      ).toBe(false);
    },
  );
});

/**
 * What a Codex run is SUPPOSED to write under one scope root, named relative to it.
 *
 * `.agents` whole rather than `.agents/skills`: it is the namespace Codex reads a project's
 * committed skills out of, this CLI is the only thing that writes under it, and an uninstall
 * leaves the emptied parent behind — so naming the child excludes the content and leaves the
 * directory itself reading as a Claude-side change. Both are the Codex side.
 */
const CODEX_SIDE_OF_A_SCOPE = [
  DIRS.CODEX,
  path.posix.join(DIRS.SOURCE_ROOT, "codex"),
  ".agents",
] as const;

/** The Claude side of the machine: the HOME's own scope, and the project's, as two trees. */
type ClaudeSide = { home: InstallTree; project: InstallTree };

/**
 * Everything on the machine that belongs to Claude, as one normalised value.
 *
 * Read from each SCOPE ROOT rather than from each folder separately: a write that lands in a
 * directory neither of the two named folders covers — a half-routed `~/.agents-inc/` — has to
 * show up somewhere, and reading the whole scope root is what makes an
 * unexpected sibling a failure rather than an omission. The Codex side is excluded by name at
 * each of them, because it is what the run under test is supposed to be writing.
 *
 * **Two trees rather than one, because the project sits INSIDE the HOME here.** A single read of
 * the HOME cannot express this claim at all: `<home>/project/.agents-inc/codex/config.ts` is the
 * file the test beside this one REQUIRES the run to write, and a skip relative to the HOME does
 * not reach it — while `project/` itself flips from an empty directory to a populated one on the
 * strength of exactly that write, which no skip can undo because `readInstallTree` counts a
 * directory's real children. Reading the project as its own root keeps every Claude-side claim,
 * and drops only the fact that the fixture nests the two.
 */
async function claudeSideOf(env: TestEnvironment): Promise<ClaudeSide> {
  const context = { roots: { home: [env.fakeHome] }, cliVersion: await cliVersion() };
  const projectUnderHome = path.relative(env.fakeHome, env.projectDir).split(path.sep).join("/");

  const home = await readInstallTree(env.fakeHome, {
    skip: [...CLAUDE_SESSION_STATE, ...CODEX_SIDE_OF_A_SCOPE, projectUnderHome],
  });
  const project = await readInstallTree(env.projectDir, { skip: [...CODEX_SIDE_OF_A_SCOPE] });

  return {
    home: normalizeInstallTree(home, context),
    project: normalizeInstallTree(project, context),
  };
}
