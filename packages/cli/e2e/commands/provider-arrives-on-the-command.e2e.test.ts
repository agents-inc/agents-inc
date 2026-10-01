import path from "path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { createE2ESource, type E2ESource } from "../helpers/create-e2e-source.js";
import { createTestEnvironment, type TestEnvironment } from "../fixtures/dual-scope-helpers.js";
import {
  CLAUDE_SOURCE_REL,
  CODEX_SOURCE_REL,
  PROVIDER_CLAUDE,
  PROVIDER_CODEX,
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
import { parseRefusal } from "../../src/cli/lib/__tests__/helpers/cli-runner.js";
import { DIRS, EXIT_CODES, FILES, STEP_TEXT } from "../pages/constants.js";

/**
 * `--provider` is a LOCATION parameter on one command, and after the install the folder answers
 * the question instead.
 *
 * **Three claims, and each one is a refusal paired with the case it is not.**
 *
 * 1. The flag is meaningless without `--from`. The provider is chosen in the web app, so the only
 *    run that can be told one is the run that installs what the app produced; a wizard walked to
 *    the end and then refused would have spent the user's time before saying so, and there is no
 *    wizard step to choose it in. D15: exit INVALID_ARGS, naming `--from` and the editor.
 * 2. The flag names a provider rather than switching Codex on — `--provider claude` is the
 *    default written out, and it must install exactly what no flag installs. Without that half,
 *    "the flag decides which folder this run creates" is indistinguishable from "the flag means
 *    Codex".
 * 3. Once two installations share a scope, no later command may pick one silently. The folder is
 *    the only record of a provider, so a scope holding `.agents-inc/claude/` and
 *    `.agents-inc/codex/` has two answers and every command that resolved the first one it found
 *    would act on a user's other installation with nothing on screen to say so.
 *
 * **Nothing here reads a config to find the provider.** There is no `provider` field in
 * `config.ts`, nothing in a shared payload carries one and the share id does not encode one —
 * which is what keeps one saved configuration installable onto either provider and every existing
 * id working. The assertions are therefore about FOLDERS.
 *
 * Written before the flag existed: every test was red on oclif's `Nonexistent flag: --provider`,
 * which named what C4 had to add. Green since 2026-09-22, and green throughout C4-C6 while the
 * flag carried `hidden: true` — hidden is not disabled, so oclif parsed it here exactly as it does
 * anywhere. **Which is why nothing in this file moved when C7b took the hiding off**, and why the
 * release claim needed a file of its own: `provider-is-on-every-help-screen.e2e.test.ts` is the
 * only surface that can tell a shipped flag from an undiscoverable one.
 */

const WEB_DEV = E2E_AGENT["web-developer"].name;

/**
 * oclif's refusal for a flag no command declares — the red this file started from. Built by the
 * shared helper, because both assertions reading it are negatives and a hand-spelled refusal the
 * parser can never print would leave them unable to fail.
 */
const NO_SUCH_FLAG = parseRefusal("--provider");

/** A provider nobody ships, to prove the flag is a closed roster rather than a free string. */
const NOT_A_PROVIDER = "gemini";

/** One ejected skill at global scope with its sub-agent beside it — no host binary needed. */
function ejectedGlobally() {
  return buildSeedPayload({
    skills: {
      [E2E_SKILL.react.id]: buildSeedSkill({
        install: "eject",
        scope: "global",
        assignments: { [WEB_DEV]: "lazy" },
      }),
    },
    agents: { [WEB_DEV]: { scope: "global" } },
  });
}

describe("the provider arrives on the command", () => {
  let source: E2ESource;
  let store: SeedConfigStore;
  let env: TestEnvironment | undefined;

  beforeAll(async () => {
    source = await createE2ESource();
    store = await startSeedConfigStore();
  }, 120_000);

  afterAll(async () => {
    await store.close();
    await cleanupFixture(source);
  });

  afterEach(async () => {
    store.reset();
    if (env) await cleanupTempDir(env.tempDir);
    env = undefined;
  });

  it("refuses --provider with no --from, naming both the flag it needs and the editor", async () => {
    env = await createTestEnvironment({ permissions: false });

    const refused = await CLI.run(["init", ...PROVIDER_CODEX], {
      dir: env.projectDir,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(refused.output);

    expect(refused.exitCode, said).toBe(EXIT_CODES.INVALID_ARGS);
    expect(said).toContain("--from");
    // The editor with its `/editor` segment, because the apex is a landing page that knows
    // nothing about `?fromId=` and a user sent there has no way to produce the id they were
    // just told they need.
    expect(said).toContain(STEP_TEXT.EDITOR_URL);

    // A refusal before anything is written, at both scopes — an installation half-created by a
    // run that then refused is the state every later command has to guess about.
    for (const root of [env.projectDir, env.fakeHome]) {
      expect(await directoryExists(path.join(root, DIRS.SOURCE_ROOT)), root).toBe(false);
    }
  });

  it("takes the same flag beside --from, which is what makes the refusal above about --from", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("PrvWith1", ejectedGlobally());

    const installed = await runInitFromOnCodex(
      store,
      "PrvWith1",
      { dir: env.projectDir, globalHome: env.fakeHome },
      source.sourceDir,
    );

    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    expect(await fileExists(path.join(env.fakeHome, CODEX_SOURCE_REL, FILES.CONFIG_TS))).toBe(true);
  });

  it("installs onto Claude when the default provider is named out loud", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("PrvClau1", ejectedGlobally());

    const installed = await CLI.run(
      ["init", "--from", "PrvClau1", "--marketplace", source.sourceDir, ...PROVIDER_CLAUDE],
      { dir: env.projectDir, globalHome: env.fakeHome },
      { env: { AGENTS_INC_API_URL: store.url } },
    );

    expect(installed.exitCode, flattenCliOutput(installed.output)).toBe(EXIT_CODES.SUCCESS);
    // The flag chose a location, not a feature: naming the default writes the Claude pair and no
    // Codex folder anywhere.
    expect(await fileExists(path.join(env.fakeHome, CLAUDE_SOURCE_REL, FILES.CONFIG_TS))).toBe(
      true,
    );
    expect(await directoryExists(path.join(env.fakeHome, CODEX_SOURCE_REL))).toBe(false);
  });

  /**
   * The control the whole flag rests on, and the strongest form of it: BYTES.
   *
   * The case above says naming the default creates the Claude pair and no Codex folder, which a
   * flag that quietly changed something else inside that pair would satisfy exactly as well. Two
   * installs of one configuration — one naming `claude`, one naming nothing — compared as whole
   * normalised trees is what says the flag decided a LOCATION and nothing else. A count could not:
   * a swap leaves it unchanged, and a swap is what a flag that diverges looks like from outside.
   *
   * Two environments rather than two runs in one, because `init --from` refuses a directory that
   * already holds an installation — and the normaliser is what makes trees from two temp roots
   * comparable at all.
   */
  it("installs the same BYTES as no flag at all, which is what makes it a location and not a feature", async () => {
    store.publish("PrvSame1", ejectedGlobally());

    const withNoFlag = await createTestEnvironment({ permissions: false });
    const namingTheDefault = await createTestEnvironment({ permissions: false });

    try {
      const bare = await runInitFrom(
        store,
        "PrvSame1",
        { dir: withNoFlag.projectDir, globalHome: withNoFlag.fakeHome },
        source.sourceDir,
      );
      expect(bare.exitCode, flattenCliOutput(bare.output)).toBe(EXIT_CODES.SUCCESS);

      const named = await CLI.run(
        ["init", "--from", "PrvSame1", "--marketplace", source.sourceDir, ...PROVIDER_CLAUDE],
        { dir: namingTheDefault.projectDir, globalHome: namingTheDefault.fakeHome },
        { env: { AGENTS_INC_API_URL: store.url } },
      );
      expect(named.exitCode, flattenCliOutput(named.output)).toBe(EXIT_CODES.SUCCESS);

      // Subject guard: both runs really installed. Two empty trees compare equal for free.
      const installedBare = await installedTreeOf(withNoFlag.fakeHome);
      expect(Object.keys(installedBare.files).length).toBeGreaterThan(0);

      expect(await installedTreeOf(namingTheDefault.fakeHome)).toStrictEqual(installedBare);
    } finally {
      await cleanupTempDir(withNoFlag.tempDir);
      await cleanupTempDir(namingTheDefault.tempDir);
    }
  });

  it("refuses a provider nobody ships, naming the ones it has", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("PrvBad01", ejectedGlobally());

    const refused = await CLI.run(
      [
        "init",
        "--from",
        "PrvBad01",
        "--marketplace",
        source.sourceDir,
        "--provider",
        NOT_A_PROVIDER,
      ],
      { dir: env.projectDir, globalHome: env.fakeHome },
      { env: { AGENTS_INC_API_URL: store.url } },
    );
    const said = flattenCliOutput(refused.output);

    expect(refused.exitCode, said).toBe(EXIT_CODES.INVALID_ARGS);
    // Both names, because a message that only says "invalid" leaves the user guessing at the
    // spelling of the one they wanted.
    expect(said).toContain("claude");
    expect(said).toContain("codex");
    expect(await directoryExists(path.join(env.fakeHome, DIRS.SOURCE_ROOT))).toBe(false);
  });

  /**
   * The state every ambiguity claim in this file is read against: one scope, two installations.
   *
   * It ends with the subject guard rather than leaving it to each caller — without it a refusal
   * could be a command that refuses whenever a Codex folder exists, and an assertion about a state
   * the setup never reached reads exactly like one about a state it did.
   */
  async function installBothProvidersAt(home: string): Promise<void> {
    const at = { dir: home, globalHome: home };
    store.publish("PrvTwoCl", ejectedGlobally());
    store.publish("PrvTwoCd", ejectedGlobally());

    const claude = await runInitFrom(store, "PrvTwoCl", at, source.sourceDir);
    expect(claude.exitCode, flattenCliOutput(claude.output)).toBe(EXIT_CODES.SUCCESS);

    const codex = await runInitFromOnCodex(store, "PrvTwoCd", at, source.sourceDir);
    expect(codex.exitCode, flattenCliOutput(codex.output)).toBe(EXIT_CODES.SUCCESS);

    for (const folder of [CLAUDE_SOURCE_REL, CODEX_SOURCE_REL]) {
      expect(await fileExists(path.join(home, folder, FILES.CONFIG_TS)), folder).toBe(true);
    }
  }

  it("refuses to guess which installation to uninstall when a scope holds two, and names the flag", async () => {
    env = await createTestEnvironment({ permissions: false });
    await installBothProvidersAt(env.fakeHome);

    const ambiguous = await CLI.run(["uninstall", "--yes"], {
      dir: env.fakeHome,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(ambiguous.output);

    // No TTY here, so there is nobody to prompt: the run has to stop and say how to answer.
    expect(ambiguous.exitCode, said).toBe(EXIT_CODES.INVALID_ARGS);
    expect(said).toContain("--provider");

    // And it destroyed nothing on the way to saying so. Both pairs are still there, which is the
    // half that separates "refused" from "acted on whichever it found first".
    for (const folder of [CLAUDE_SOURCE_REL, CODEX_SOURCE_REL]) {
      expect(await fileExists(path.join(env.fakeHome, folder, FILES.CONFIG_TS)), folder).toBe(true);
    }
  });

  /**
   * Every other command that ACTS on exactly one installation, and therefore owes the same
   * refusal.
   *
   * `uninstall` has its own pair above because it is the destructive one and its allowed case has
   * to prove the removal really happened. These three are asserted together because the claim is
   * one claim per command and a command missing from the list is one that would silently pick: the
   * folder is the only record of a provider, so a scope holding two has two answers and resolving
   * them by roster order acts on a user's other installation with nothing on screen to say so.
   *
   * `edit` and `eject` are given arguments that stop them for their OWN reasons afterwards — there
   * is no terminal for a wizard and `agent-partials` is a real eject type — because what is pinned
   * is the refusal that comes first, not what the command would have done next.
   */
  const ACTS_ON_ONE_INSTALLATION = [
    { label: "edit", argv: ["edit"] },
    { label: "share", argv: ["share"] },
    { label: "eject", argv: ["eject", "agent-partials"] },
  ] as const;

  it.each(ACTS_ON_ONE_INSTALLATION)(
    "refuses to guess which installation $label is about, and names the flag",
    async ({ argv }) => {
      env = await createTestEnvironment({ permissions: false });
      await installBothProvidersAt(env.fakeHome);

      const ambiguous = await CLI.run([...argv], {
        dir: env.fakeHome,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(ambiguous.output);

      expect(ambiguous.exitCode, said).toBe(EXIT_CODES.INVALID_ARGS);
      expect(said).toContain("--provider");
      // Both names, because "there is more than one" leaves the user to go and look.
      for (const provider of [PROVIDER_CLAUDE[1], PROVIDER_CODEX[1]]) {
        expect(said, provider).toContain(provider);
      }

      // And nothing moved on the way to saying so.
      for (const folder of [CLAUDE_SOURCE_REL, CODEX_SOURCE_REL]) {
        expect(await fileExists(path.join(env.fakeHome, folder, FILES.CONFIG_TS)), folder).toBe(
          true,
        );
      }
    },
  );

  it.each(ACTS_ON_ONE_INSTALLATION)(
    "lets --provider pick one for $label, which is what makes the refusal above actionable",
    async ({ argv }) => {
      env = await createTestEnvironment({ permissions: false });
      await installBothProvidersAt(env.fakeHome);

      const chosen = await CLI.run([...argv, ...PROVIDER_CODEX], {
        dir: env.fakeHome,
        globalHome: env.fakeHome,
      });
      const said = flattenCliOutput(chosen.output);

      // What each command does next is its own business and is not the claim — `edit` has no
      // terminal to render a wizard in, and `share` needs the network. The claim is that the flag
      // SELECTED: no refusal about which installation, and no refusal about the flag itself.
      expect(
        said,
        "the flag it was told to use is one this command does not declare",
      ).not.toContain(NO_SUCH_FLAG);
      expect(said).not.toContain("--provider <");
    },
  );

  it("uninstalls without the flag when the scope holds one, which is what the refusal is against", async () => {
    env = await createTestEnvironment({ permissions: false });
    store.publish("PrvOne01", ejectedGlobally());

    const codex = await runInitFromOnCodex(
      store,
      "PrvOne01",
      { dir: env.fakeHome, globalHome: env.fakeHome },
      source.sourceDir,
    );
    expect(codex.exitCode, flattenCliOutput(codex.output)).toBe(EXIT_CODES.SUCCESS);

    const uninstalled = await CLI.run(["uninstall", "--yes"], {
      dir: env.fakeHome,
      globalHome: env.fakeHome,
    });
    const said = flattenCliOutput(uninstalled.output);

    expect(uninstalled.exitCode, said).toBe(EXIT_CODES.SUCCESS);
    expect(said).not.toContain(NO_SUCH_FLAG);
    expect(await directoryExists(path.join(env.fakeHome, CODEX_SOURCE_REL))).toBe(false);
  });
});

/**
 * Everything one install wrote under a HOME, normalised so two temp roots compare.
 *
 * The Claude CLI's own session state is left out for the reason the golden-tree journeys leave it
 * out: nothing in this CLI writes it and every run moves it.
 */
async function installedTreeOf(home: string): Promise<InstallTree> {
  const tree = await readInstallTree(home, {
    skip: [
      path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_JSON),
      path.posix.join(DIRS.CLAUDE, FILES.CLAUDE_SESSION_LOCK),
      path.posix.join(DIRS.CLAUDE, DIRS.CLAUDE_BACKUPS),
    ],
  });
  return normalizeInstallTree(tree, { roots: { home: [home] }, cliVersion: await cliVersion() });
}
