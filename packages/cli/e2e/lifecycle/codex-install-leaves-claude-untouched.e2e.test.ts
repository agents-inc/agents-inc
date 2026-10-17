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
 * A Codex install, and every later command on it, leaves Claude untouched: no `.claude/` on a
 * machine without Claude, and byte-identical Claude trees on one with it. Every payload ejects, so
 * no host binary is involved.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/** The Claude CLI's own session records: nothing here writes them, every run moves them. */
const CLAUDE_SESSION_STATE = [
  path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_JSON),
  path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_LOCK),
  path.posix.join(DIRS.CLAUDE, DIRS.CLAUDE_BACKUPS),
];

/**
 * Every command a Codex installation reaches after install, `uninstall` last. `eject` passes
 * `--force` because the project already holds that folder. `edit --from` refuses with no terminal,
 * which pins that its refusal writes nothing.
 */
const LATER_COMMANDS = [
  { label: "compile", argv: ["compile"] },
  { label: "doctor", argv: ["doctor"] },
  { label: "edit --from", argv: ["edit", "--from", "CdxSwp02"] },
  { label: "eject skills", argv: ["eject", "skills", "--force"] },
  { label: "uninstall", argv: ["uninstall", "--yes"] },
] as const;

/** oclif's refusal for an undeclared flag: what a half-built provider looks like. */
const UNKNOWN_FLAG = "Nonexistent flag";

/**
 * Both scopes stated: a project skill on a global sub-agent, or any project-scoped entry at home,
 * fails before reaching the subject.
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

      // The folder is the provider's only record, so each scope carries its own pair.
      for (const root of [env.fakeHome, env.projectDir]) {
        expect(
          await fileExists(path.join(root, CODEX_SOURCE_REL, FILES.CONFIG_TS)),
          `no Codex config pair under ${root}`,
        ).toBe(true);
      }

      expect(
        await fileExists(
          path.join(codexGlobalSkillsDir(env.fakeHome), E2E_SKILL.react.id, FILES.SKILL_MD),
        ),
      ).toBe(true);

      // Catches a path that bypassed the layout funnel and wrote somewhere plausible.
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

      // A Codex project relates only to the Codex global, so it must not register in Claude's.
      store.publish("CdxBesd1", ejected("project", "project"));
      const codexInstall = await runInitFromOnCodex(
        store,
        "CdxBesd1",
        { dir: env.projectDir, globalHome: env.fakeHome },
        source.sourceDir,
      );
      expect(codexInstall.exitCode, flattenCliOutput(codexInstall.output)).toBe(EXIT_CODES.SUCCESS);

      // Subject guard: a run that refused at once would also leave Claude untouched.
      expect(await fileExists(path.join(env.projectDir, CODEX_SOURCE_REL, FILES.CONFIG_TS))).toBe(
        true,
      );

      expect(await claudeSideOf(env)).toStrictEqual(before);
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

      // Taken after the install, whose own effect is the test above.
      const before = await claudeSideOf(env);

      for (const { label, argv } of LATER_COMMANDS) {
        const run = await CLI.run(
          [...argv],
          { dir: env.projectDir, globalHome: env.fakeHome },
          { env: { AGENTS_INC_API_URL: store.url } },
        );
        const said = flattenCliOutput(run.output);

        // Exit codes are not the claim: `doctor` reports; `edit --from` refuses without a TTY.
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

      // Subject guard: the sweep reached a command that acts.
      expect(
        await directoryExists(path.join(env.projectDir, CODEX_SOURCE_REL)),
        "the uninstall at the end of the sweep left the Codex pair behind",
      ).toBe(false);
    },
  );
});

/** `.agents` whole: uninstall leaves the emptied parent behind, which is still the Codex side. */
const CODEX_SIDE_OF_A_SCOPE = [
  DIRS.CODEX,
  path.posix.join(DIRS.SOURCE_ROOT, "codex"),
  ".agents",
] as const;

type ClaudeSide = { home: InstallTree; project: InstallTree };

/**
 * Everything Claude's, read per scope root so an unexpected sibling fails, with the Codex side
 * excluded by name. Two trees because the project sits inside HOME here and its Codex config
 * would otherwise count as a change.
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
